import * as functions from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

initializeApp();
export const db = getFirestore();

export async function authenticate(request: functions.https.CallableRequest<any>) {
  const authHeader = request.rawRequest?.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'No se proporcionó token de autenticación');
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    return await getAuth().verifyIdToken(idToken);
  } catch (err) {
    throw new functions.https.HttpsError('unauthenticated', 'Token inválido');
  }
}

export function ensureProfessional(decoded: DecodedIdToken, professionalId: string) {
  const tokenProfessionalId = (decoded as any).professionalId || decoded.uid;
  if (tokenProfessionalId !== professionalId) {
    throw new functions.https.HttpsError('permission-denied', 'El profesional no coincide con el token');
  }
}

export const timestamp = () => FieldValue.serverTimestamp();

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

export async function invalidateCacheForDocument(
  data: FirebaseFirestore.DocumentData | undefined
) {
  if (!data) return;
  const { professionalId, serviceId, start } = data as any;
  if (professionalId && serviceId && start) {
    const startDate = start.toDate ? start.toDate() : new Date(start);
    await invalidateAvailabilityCache(professionalId, serviceId, startDate);
  }
}
