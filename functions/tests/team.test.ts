import * as functions from 'firebase-functions';
import {
  inviteNewUser,
  getTeamMembers,
  updateMemberRole,
  deleteTeamMember,
} from '../src/team';
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

describe('team auth', () => {
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
    ['inviteNewUser', inviteNewUser, { professionalId: 'p1', email: 'a@b.c' }],
    ['getTeamMembers', getTeamMembers, { professionalId: 'p1' }],
    [
      'updateMemberRole',
      updateMemberRole,
      { professionalId: 'p1', memberId: 'm1', role: 'admin' },
    ],
    [
      'deleteTeamMember',
      deleteTeamMember,
      { professionalId: 'p1', memberId: 'm1' },
    ],
  ])('%s denies mismatched professional', async (_, fn, data) => {
    await expect((fn as any).run({ ...baseReq, data })).rejects.toThrow(permError);
  });
});
