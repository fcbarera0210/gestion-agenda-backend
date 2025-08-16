import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { db, authenticate, ensureProfessional, timestamp } from './utils';

export const inviteNewUser = functions.https.onCall(async (request) => {
  const { professionalId, email } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const user = await admin.auth().createUser({ email });
  const transporter = nodemailer.createTransport({ sendmail: true });
  await transporter.sendMail({
    to: email,
    from: 'noreply@example.com',
    subject: 'Invitación a equipo',
    text: 'Has sido invitado a un equipo de trabajo.',
  });
  return { uid: user.uid };
});

export const getTeamMembers = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('professionals')
    .where('teamId', '==', professionalId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

export const updateMemberRole = functions.https.onCall(async (request) => {
  const { professionalId, memberId, role } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const memberRef = db.collection('professionals').doc(memberId);
  const doc = await memberRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Miembro no encontrado');
  }
  if (doc.data()!.teamId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  await memberRef.update({ role, updatedAt: timestamp() });
  return { success: true };
});

export const deleteTeamMember = functions.https.onCall(async (request) => {
  const { professionalId, memberId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const memberRef = db.collection('professionals').doc(memberId);
  const doc = await memberRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Miembro no encontrado');
  }
  if (doc.data()!.teamId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  await memberRef.delete();
  try {
    await admin.auth().deleteUser(memberId);
  } catch (e) {
    // ignore if user does not exist
  }
  return { success: true };
});
