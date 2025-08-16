import * as functions from 'firebase-functions';
import {
  getServices,
  addService,
  updateService,
  deleteService,
  getServiceHistory,
} from '../src/services';
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

describe('services auth', () => {
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
    ['getServices', getServices, { professionalId: 'p1' }],
    [
      'addService',
      addService,
      { professionalId: 'p1', service: { name: 's' } },
    ],
    [
      'updateService',
      updateService,
      { professionalId: 'p1', serviceId: 's1', updates: { name: 'x' } },
    ],
    ['deleteService', deleteService, { professionalId: 'p1', serviceId: 's1' }],
    [
      'getServiceHistory',
      getServiceHistory,
      { professionalId: 'p1', serviceId: 's1' },
    ],
  ])('%s denies mismatched professional', async (_, fn, data) => {
    await expect((fn as any).run({ ...baseReq, data })).rejects.toThrow(permError);
  });
});
