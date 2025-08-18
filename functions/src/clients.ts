import * as functions from 'firebase-functions';
import { db, authenticate, ensureProfessional, timestamp } from './utils';

export const getClients = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('clients')
    .where('professionalId', '==', professionalId)
    .get();
  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
});

export const getClientByEmail = functions.https.onCall(async (request) => {
  const { professionalId, email } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('clients')
    .where('professionalId', '==', professionalId)
    .where('email', '==', email)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
  }
  const doc = snap.docs[0];
  const { history, ...data } = doc.data() as any;
  return { id: doc.id, ...data };
});

export const addClient = functions.https.onCall(async (request) => {
  const { professionalId, client } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const clientRef = db.collection('clients').doc();
  const historyRef = clientRef.collection('history').doc();
  const batch = db.batch();
  batch.set(clientRef, {
    ...client,
    professionalId,
    createdAt: timestamp(),
  });
  batch.set(historyRef, {
    timestamp: timestamp(),
    userId: professionalId,
    action: 'Creación',
    changes: client,
  });
  await batch.commit();
  return { id: clientRef.id };
});

export const updateClient = functions.https.onCall(async (request) => {
  const { professionalId, clientId, updates } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const clientRef = db.collection('clients').doc(clientId);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const doc = await tx.get(clientRef);
    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
    }
    const clientData = doc.data()!;
    if (clientData.professionalId !== professionalId) {
      throw new functions.https.HttpsError('permission-denied', 'No autorizado');
    }
    const changes: Record<string, { before: any; after: any }> = {};
    Object.keys(updates).forEach((key) => {
      if (clientData[key] !== updates[key]) {
        changes[key] = { before: clientData[key], after: updates[key] };
      }
    });
    tx.update(clientRef, { ...updates, updatedAt: timestamp() });
    const historyRef = clientRef.collection('history').doc();
    tx.set(historyRef, {
      timestamp: timestamp(),
      userId: professionalId,
      action: 'Actualización',
      changes,
    });
  });
  return { success: true };
});

export const deleteClient = functions.https.onCall(async (request) => {
  const { professionalId, clientId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const clientRef = db.collection('clients').doc(clientId);
  const doc = await clientRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
  }
  if (doc.data()!.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  await clientRef.delete();
  return { success: true };
});

export const getClientHistory = functions.https.onCall(async (request) => {
  const { professionalId, clientId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const clientRef = db.collection('clients').doc(clientId);
  const doc = await clientRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
  }
  if (doc.data()!.professionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'No autorizado');
  }
  const snap = await clientRef
    .collection('history')
    .orderBy('timestamp', 'desc')
    .get();
  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
});
