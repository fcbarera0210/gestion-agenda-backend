import * as functions from 'firebase-functions';
import {
  getProfessionalProfile,
  updateWorkSchedule,
  updateProfile,
} from '../src/settings';
import * as utils from '../src/utils';

jest.mock('../src/utils', () => {
  const actual = jest.requireActual('../src/utils');
  return {
    ...actual,
    authenticate: jest.fn().mockResolvedValue({ uid: 'uid' }),
    ensureProfessional: jest.fn(),
  };
});

const baseReq = { rawRequest: { headers: { authorization: 'Bearer token' } } } as any;

describe('settings auth', () => {
  const permError = new functions.https.HttpsError(
    'permission-denied',
    'El profesional no coincide con el token'
  );

  beforeEach(() => {
    (utils.ensureProfessional as jest.Mock).mockImplementation(() => {
      throw permError;
    });
  });

  test.each<[string, any, any]>([
    ['getProfessionalProfile', getProfessionalProfile, { professionalId: 'p1' }],
    [
      'updateWorkSchedule',
      updateWorkSchedule,
      { professionalId: 'p1', schedule: {} },
    ],
    [
      'updateProfile',
      updateProfile,
      { professionalId: 'p1', profile: { displayName: 'x' } },
    ],
  ])('%s denies mismatched professional', async (_, fn, data) => {
    await expect((fn as any).run({ ...baseReq, data })).rejects.toThrow(permError);
  });
});
