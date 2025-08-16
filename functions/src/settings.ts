import * as functions from 'firebase-functions';
import { db, authenticate, ensureProfessional, timestamp } from './utils';

export const getProfessionalProfile = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const doc = await db.collection('professionals').doc(professionalId).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Profesional no encontrado');
  }
  return { id: doc.id, ...doc.data() };
});

export const updateWorkSchedule = functions.https.onCall(async (request) => {
  const { professionalId, schedule } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  await db
    .collection('professionals')
    .doc(professionalId)
    .update({ workSchedule: schedule, updatedAt: timestamp() });
  return { success: true };
});

export const updateProfile = functions.https.onCall(async (request) => {
  const { professionalId, profile } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  await db
    .collection('professionals')
    .doc(professionalId)
    .update({ ...profile, updatedAt: timestamp() });
  return { success: true };
});
