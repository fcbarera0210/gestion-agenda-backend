import * as functions from 'firebase-functions';
import { db, authenticate, ensureProfessional, timestamp } from './utils';

export const getTimeBlocks = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('timeBlocks')
    .where('professionalId', '==', professionalId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

export const addTimeBlock = functions.https.onCall(async (request) => {
  const { professionalId, block } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const docRef = await db.collection('timeBlocks').add({
    ...block,
    professionalId,
    createdAt: timestamp(),
  });
  return { id: docRef.id };
});

export const updateTimeBlock = functions.https.onCall(async (request) => {
  const { professionalId, blockId, updates } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const blockRef = db.collection('timeBlocks').doc(blockId);
  const doc = await blockRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Bloque no encontrado');
  }
  if (doc.data()!.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  await blockRef.update({ ...updates, updatedAt: timestamp() });
  return { success: true };
});

export const deleteTimeBlock = functions.https.onCall(async (request) => {
  const { professionalId, blockId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const blockRef = db.collection('timeBlocks').doc(blockId);
  const doc = await blockRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Bloque no encontrado');
  }
  if (doc.data()!.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  await blockRef.delete();
  return { success: true };
});
