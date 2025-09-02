import * as functions from 'firebase-functions';
import {
  db,
  authenticate,
  ensureProfessional,
  timestamp,
  invalidateAvailabilityCache,
} from './utils';

export const getTimeBlocks = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('timeBlocks')
    .where('professionalId', '==', professionalId)
    .get();
  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
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
  if (block.serviceId && block.start) {
    const startDate = block.start?.toDate
      ? block.start.toDate()
      : new Date(block.start);
    await invalidateAvailabilityCache(
      professionalId,
      block.serviceId,
      startDate
    );
  }
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
  const block = doc.data()!;
  await blockRef.update({ ...updates, updatedAt: timestamp() });
  if (block.serviceId && block.start) {
    const originalDate = block.start?.toDate
      ? block.start.toDate()
      : new Date(block.start);
    await invalidateAvailabilityCache(
      professionalId,
      block.serviceId,
      originalDate
    );
  }
  if (updates.start || updates.serviceId) {
    const newDate = updates.start?.toDate
      ? updates.start.toDate()
      : new Date(updates.start ?? block.start);
    const newService = updates.serviceId || block.serviceId;
    if (newService && newDate) {
      await invalidateAvailabilityCache(professionalId, newService, newDate);
    }
  }
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
  const block = doc.data()!;
  await blockRef.delete();
  if (block.serviceId && block.start) {
    const startDate = block.start?.toDate
      ? block.start.toDate()
      : new Date(block.start);
    await invalidateAvailabilityCache(
      professionalId,
      block.serviceId,
      startDate
    );
  }
  return { success: true };
});
