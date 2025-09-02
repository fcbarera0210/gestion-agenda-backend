import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
export const db = admin.firestore();

export async function authenticate(request: functions.https.CallableRequest<any>) {
  const authHeader = request.rawRequest?.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'No se proporcionó token de autenticación');
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    throw new functions.https.HttpsError('unauthenticated', 'Token inválido');
  }
}

export function ensureProfessional(decoded: admin.auth.DecodedIdToken, professionalId: string) {
  const tokenProfessionalId = (decoded as any).professionalId || decoded.uid;
  if (tokenProfessionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'El profesional no coincide con el token');
  }
}

export const timestamp = admin.firestore.FieldValue.serverTimestamp;

export async function invalidateAvailabilityCache(
  professionalId: string,
  serviceId: string,
  date: Date | string
) {
  const cacheDate = new Date(date).toISOString().split('T')[0];
  await db
    .collection('availabilityCache')
    .doc(`${professionalId}_${serviceId}_${cacheDate}`)
    .delete();
}
