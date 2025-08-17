import * as functions from 'firebase-functions';
import {
  getClients,
  getClientByEmail,
  addClient,
  updateClient,
  deleteClient,
  getClientHistory,
} from '../src/clients';
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

describe('clients auth', () => {
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
    ['getClients', getClients, { professionalId: 'p1' }],
    [
      'addClient',
      addClient,
      { professionalId: 'p1', client: { name: 'c1' } },
    ],
    [
      'updateClient',
      updateClient,
      { professionalId: 'p1', clientId: 'c1', updates: { name: 'x' } },
    ],
    ['deleteClient', deleteClient, { professionalId: 'p1', clientId: 'c1' }],
    [
      'getClientHistory',
      getClientHistory,
      { professionalId: 'p1', clientId: 'c1' },
    ],
    [
      'getClientByEmail',
      getClientByEmail,
      { professionalId: 'p1', email: 'c1@example.com' },
    ],
  ])('%s denies mismatched professional', async (_, fn, data) => {
    await expect((fn as any).run({ ...baseReq, data })).rejects.toThrow(permError);
  });
});
