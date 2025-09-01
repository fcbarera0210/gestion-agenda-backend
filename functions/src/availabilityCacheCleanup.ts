import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './utils';

export const cleanAvailabilityCache = onSchedule('every 24 hours', async () => {
  const cutoff = Timestamp.fromDate(
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
  const snapshot = await db
    .collection('availabilityCache')
    .where('createdAt', '<', cutoff)
    .get();
  const batch = db.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
});