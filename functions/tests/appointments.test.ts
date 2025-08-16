import * as functions from 'firebase-functions';
import {
  getAppointments,
  getAppointmentsForClient,
  addAppointment,
  updateAppointment,
  deleteAppointment,
  sendConfirmationEmail,
  createBooking,
} from '../src/appointments';
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

describe('appointments auth', () => {
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
    ['getAppointments', getAppointments, { professionalId: 'p1' }],
    [
      'getAppointmentsForClient',
      getAppointmentsForClient,
      { professionalId: 'p1', clientId: 'c1' },
    ],
    [
      'addAppointment',
      addAppointment,
      {
        professionalId: 'p1',
        appointment: {
          clientId: 'c1',
          start: '2020-01-01',
          end: '2020-01-01',
          serviceId: 's1',
          type: 'online',
        },
      },
    ],
    [
      'updateAppointment',
      updateAppointment,
      { professionalId: 'p1', appointmentId: 'a1', data: { type: 'online' } },
    ],
    ['deleteAppointment', deleteAppointment, { professionalId: 'p1', appointmentId: 'a1' }],
    [
      'sendConfirmationEmail',
      sendConfirmationEmail,
      { professionalId: 'p1', appointmentId: 'a1' },
    ],
  ])('%s denies mismatched professional', async (_, fn, data) => {
    await expect((fn as any).run({ ...baseReq, data })).rejects.toThrow(permError);
  });
});

describe('createBooking', () => {
  it('requires essential data', async () => {
    await expect(
      (createBooking as any).run({ data: {}, rawRequest: {} })
    ).rejects.toThrow('Faltan datos esenciales');
  });
});
