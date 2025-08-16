import * as functions from 'firebase-functions';
import { db, authenticate, ensureProfessional, timestamp } from './utils';

function generateCode(): string {
  return Math.random().toString(36).substring(2, 10);
}

export const createInvitationCode = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const profDoc = await db.collection('professionals').doc(professionalId).get();
  const teamId = profDoc.exists ? (profDoc.data()!.teamId || professionalId) : professionalId;
  const code = generateCode();
  await db.collection('invitations').doc(code).set({
    code,
    createdAt: timestamp(),
    used: false,
    usedBy: null,
    createdBy: professionalId,
    teamId,
  });
  return { code };
});

export const validateAndUseCode = functions.https.onCall(async (request) => {
  const { code, userEmail } = request.data;
  const invitationRef = db.collection('invitations').doc(code);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(invitationRef);
    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'Código inválido');
    }
    const invitation = doc.data()!;
    if (invitation.used) {
      throw new functions.https.HttpsError('failed-precondition', 'Código ya utilizado');
    }
    tx.update(invitationRef, { used: true, usedBy: userEmail, usedAt: timestamp() });
    return { createdBy: invitation.createdBy, teamId: invitation.teamId };
  });
});

export const getPendingInvitations = functions.https.onCall(async (request) => {
  const { professionalId } = request.data;
  const decoded = await authenticate(request);
  ensureProfessional(decoded, professionalId);
  const snap = await db
    .collection('invitations')
    .where('createdBy', '==', professionalId)
    .where('used', '==', false)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});
