import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { db, authenticate, ensureProfessional, timestamp } from './utils';

export const getAppointments = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('appointments')
    .where('professionalId', '==', professionalId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

export const getAppointmentsForClient = functions.https.onCall(async (request) => {
  const { professionalId, clientId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('appointments')
    .where('professionalId', '==', professionalId)
    .where('clientId', '==', clientId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

export const addAppointment = functions.https.onCall(async (request) => {
  const { professionalId, appointment } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  if (!appointment || !appointment.clientId || !appointment.start || !appointment.end || !appointment.serviceId || !appointment.type) {
    throw new functions.https.HttpsError('invalid-argument', 'Datos insuficientes para crear la cita');
  }
  const docRef = await db.collection('appointments').add({
    ...appointment,
    professionalId,
    createdAt: timestamp(),
  });
  return { id: docRef.id };
});

export const updateAppointment = functions.https.onCall(async (request) => {
  const { appointmentId, data: updateData, professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const docRef = db.collection('appointments').doc(appointmentId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Cita no encontrada');
  }
  const appointment = snap.data()!;
  if (appointment.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  if (
    updateData.type &&
    !['presencial', 'online'].includes(updateData.type)
  ) {
    throw new functions.https.HttpsError('invalid-argument', 'Tipo de cita inválido');
  }
  await docRef.update({ ...updateData, updatedAt: timestamp() });
  return { success: true };
});

export const deleteAppointment = functions.https.onCall(async (request) => {
  const { appointmentId, professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const docRef = db.collection('appointments').doc(appointmentId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Cita no encontrada');
  }
  if (snap.data()!.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  await docRef.delete();
  return { success: true };
});

export const sendConfirmationEmail = functions.https.onCall(async (request) => {
  const { appointmentId, professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const appointmentSnap = await db.collection('appointments').doc(appointmentId).get();
  if (!appointmentSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Cita no encontrada');
  }
  const appointment = appointmentSnap.data()!;
  if (appointment.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  const clientSnap = await db.collection('clients').doc(appointment.clientId).get();
  if (!clientSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
  }
  const client = clientSnap.data()!;
  const transporter = nodemailer.createTransport({ sendmail: true });
  await transporter.sendMail({
    to: client.email,
    from: 'noreply@example.com',
    subject: 'Confirmación de cita',
    text: `Tu cita "${appointment.title}" está programada para ${appointment.start.toDate?.().toString()}`,
  });
  return { success: true };
});

export const createBooking = functions.https.onCall(async (request) => {
  const {
    professionalId,
    serviceId,
    selectedSlot,
    clientName,
    clientEmail,
    clientPhone,
    serviceName,
    serviceDuration,
    type,
  } = request.data;
  if (
    !professionalId ||
    !serviceId ||
    !selectedSlot ||
    !clientName ||
    !clientEmail ||
    !serviceName ||
    !serviceDuration ||
    !type
  ) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Faltan datos esenciales para crear la reserva.'
    );
  }
  const slotDate = new Date(selectedSlot);
  try {
    let clientId: string;
    const clientsRef = db.collection('clients');
    const q = clientsRef
      .where('email', '==', clientEmail.toLowerCase())
      .where('professionalId', '==', professionalId)
      .limit(1);
    const querySnapshot = await q.get();
    if (querySnapshot.empty) {
      const batch = db.batch();
      const newClientRef = clientsRef.doc();
      clientId = newClientRef.id;
      const historyRef = newClientRef.collection('history').doc();
      batch.set(newClientRef, {
        professionalId,
        name: clientName,
        email: clientEmail.toLowerCase(),
        phone: clientPhone || '',
        notes: 'Cliente registrado desde el portal público.',
        createdAt: timestamp(),
      });
      batch.set(historyRef, {
        timestamp: timestamp(),
        userId: professionalId,
        action: 'Creación',
        changes: 'Cliente registrado en el sistema.',
      });
      await batch.commit();
    } else {
      clientId = querySnapshot.docs[0].id;
    }
    const appointmentsRef = db.collection('appointments');
    const slotEndDate = new Date(slotDate.getTime() + serviceDuration * 60000);
    await appointmentsRef.add({
      professionalId,
      serviceId,
      clientId,
      start: admin.firestore.Timestamp.fromDate(slotDate),
      end: admin.firestore.Timestamp.fromDate(slotEndDate),
      title: serviceName,
      status: 'pending',
      notes: '',
      color: { primary: '#ffc107', secondary: '#FFF3CD' },
      type,
    });
    return { success: true, message: 'Reserva creada exitosamente.' };
  } catch (error) {
    throw new functions.https.HttpsError(
      'internal',
      'Ocurrió un error al procesar la reserva.',
      error as Error
    );
  }
});
