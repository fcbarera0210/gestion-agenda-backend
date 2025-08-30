import * as functions from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './utils';

export const cleanAvailabilityCache = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
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
