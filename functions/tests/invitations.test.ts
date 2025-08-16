import * as functions from 'firebase-functions';
import {
  createInvitationCode,
  validateAndUseCode,
  getPendingInvitations,
} from '../src/invitations';
import * as utils from '../src/utils';

const invitationRef = {} as any;

jest.mock('../src/utils', () => {
  const actual = jest.requireActual('../src/utils');
  return {
    ...actual,
    authenticate: jest.fn().mockResolvedValue({ uid: 'uid' }),
    ensureProfessional: jest.fn(),
    db: {
      collection: jest.fn(() => ({ doc: jest.fn(() => invitationRef) })),
      runTransaction: jest.fn(),
    },
  };
});

const baseReq = { rawRequest: { headers: { authorization: 'Bearer token' } } } as any;

describe('invitations auth', () => {
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
    ['createInvitationCode', createInvitationCode, { professionalId: 'p1' }],
    ['getPendingInvitations', getPendingInvitations, { professionalId: 'p1' }],
  ])('%s denies mismatched professional', async (_, fn, data) => {
    await expect((fn as any).run({ ...baseReq, data })).rejects.toThrow(permError);
  });
});

describe('validateAndUseCode', () => {
  it('throws when code not found', async () => {
    (utils.db.runTransaction as jest.Mock).mockImplementation(async (fn) => {
      const tx = {
        get: jest.fn().mockResolvedValue({ exists: false }),
        update: jest.fn(),
      };
      return fn(tx);
    });
    await expect(
      (validateAndUseCode as any).run({ data: { code: 'abc', userEmail: 'a@b.c' }, rawRequest: {} })
    ).rejects.toThrow('Código inválido');
  });
});
