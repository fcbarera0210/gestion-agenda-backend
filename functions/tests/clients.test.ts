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
  ])('%s denies mismatched professional', async (_, fn, data) => {
    await expect((fn as any).run({ ...baseReq, data })).rejects.toThrow(permError);
  });
});

describe('getClientByEmail', () => {
  it('returns only id, email, name and phone', async () => {
    const mockDoc = {
      id: 'c1',
      data: () => ({
        email: 'c1@example.com',
        name: 'Client 1',
        phone: '123456789',
        professionalId: 'p1',
        extra: 'should not appear',
      }),
    } as any;
    const mockGet = jest.fn().mockResolvedValue({ empty: false, docs: [mockDoc] });
    const mockLimit = jest.fn().mockReturnValue({ get: mockGet });
    const mockWhereEmail = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockWhereProf = jest.fn().mockReturnValue({ where: mockWhereEmail });
    const collectionSpy = jest
      .spyOn(utils.db, 'collection')
      .mockReturnValue({ where: mockWhereProf } as any);

    const res = await (getClientByEmail as any).run({
      data: { professionalId: 'p1', email: 'c1@example.com' },
      rawRequest: {},
    });

    expect(res).toEqual({
      id: 'c1',
      email: 'c1@example.com',
      name: 'Client 1',
      phone: '123456789',
    });
    collectionSpy.mockRestore();
  });

  it('requires professionalId and email', async () => {
    await expect(
      (getClientByEmail as any).run({
        data: { professionalId: 'p1' },
        rawRequest: {},
      })
    ).rejects.toThrow('professionalId y email son requeridos');
    await expect(
      (getClientByEmail as any).run({
        data: { email: 'c1@example.com' },
        rawRequest: {},
      })
    ).rejects.toThrow('professionalId y email son requeridos');
  });
});
