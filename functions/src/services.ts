import * as functions from 'firebase-functions';
import { db, authenticate, ensureProfessional, timestamp } from './utils';

export const getServices = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('services')
    .where('professionalId', '==', professionalId)
    .get();
  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
});

export const addService = functions.https.onCall(async (request) => {
  const { professionalId, service } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const serviceRef = db.collection('services').doc();
  const historyRef = serviceRef.collection('history').doc();
  const batch = db.batch();
  batch.set(serviceRef, {
    ...service,
    professionalId,
    createdAt: timestamp(),
  });
  batch.set(historyRef, {
    timestamp: timestamp(),
    userId: professionalId,
    action: 'Creación',
    changes: service,
  });
  await batch.commit();
  return { id: serviceRef.id };
});

export const updateService = functions.https.onCall(async (request) => {
  const { professionalId, serviceId, updates } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const serviceRef = db.collection('services').doc(serviceId);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const doc = await tx.get(serviceRef);
    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
    }
    const serviceData = doc.data()!;
    if (serviceData.professionalId !== professionalId) {
      throw new functions.https.HttpsError('permission-denied', 'No autorizado');
    }
    const changes: Record<string, { before: any; after: any }> = {};
    Object.keys(updates).forEach((key) => {
      if (serviceData[key] !== updates[key]) {
        changes[key] = { before: serviceData[key], after: updates[key] };
      }
    });
    tx.update(serviceRef, { ...updates, updatedAt: timestamp() });
    const historyRef = serviceRef.collection('history').doc();
    tx.set(historyRef, {
      timestamp: timestamp(),
      userId: professionalId,
      action: 'Actualización',
      changes,
    });
  });
  return { success: true };
});

export const deleteService = functions.https.onCall(async (request) => {
  const { professionalId, serviceId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const serviceRef = db.collection('services').doc(serviceId);
  const doc = await serviceRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
  }
  if (doc.data()!.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  await serviceRef.delete();
  return { success: true };
});

export const getServiceHistory = functions.https.onCall(async (request) => {
  const { professionalId, serviceId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const serviceRef = db.collection('services').doc(serviceId);
  const doc = await serviceRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
  }
  if (doc.data()!.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  const snap = await serviceRef
    .collection('history')
    .orderBy('timestamp', 'desc')
    .get();
  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
});
