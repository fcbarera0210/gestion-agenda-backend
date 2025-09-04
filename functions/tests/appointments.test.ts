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

jest.mock('../src/utils', () => ({
  db: { collection: jest.fn(), batch: jest.fn() },
  timestamp: jest.fn(() => new Date()),
  invalidateAvailabilityCache: jest.fn(),
  authenticate: jest.fn().mockResolvedValue({ uid: 'uid' }),
  ensureProfessional: jest.fn(),
}));

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

  it('rejects double booking for same slot', async () => {
    jest.clearAllMocks();
    const appointments: any[] = [];
    (utils.db.batch as jest.Mock).mockReturnValue({
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    });

    (utils.db.collection as jest.Mock).mockImplementation(
      (name: string) => {
        if (name === 'clients') {
          return {
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest
              .fn()
              .mockResolvedValue({ empty: true, docs: [] }),
            doc: jest.fn(() => ({
              id: 'c1',
              collection: () => ({ doc: jest.fn(() => ({ id: 'h1' })) }),
            })),
          } as any;
        }
        if (name === 'appointments') {
          return {
            docs: appointments,
            filters: [] as any[],
            where(this: any, field: string, op: string, value: any) {
              this.filters.push({ field, op, value });
              return this;
            },
            async get(this: any) {
              const professional = this.filters.find(
                (f: any) => f.field === 'professionalId'
              )?.value;
              const startBefore = this.filters.find(
                (f: any) => f.field === 'start'
              )?.value;
              const endAfter = this.filters.find(
                (f: any) => f.field === 'end'
              )?.value;
              const docs = this.docs.filter((d: any) =>
                d.professionalId === professional &&
                d.start.toMillis() < startBefore.toMillis() &&
                d.end.toMillis() > endAfter.toMillis()
              );
              this.filters = [];
              return {
                empty: docs.length === 0,
                docs: docs.map((d: any) => ({ data: () => d })),
              };
            },
            async add(this: any, data: any) {
              this.docs.push(data);
              return { id: `a${this.docs.length}` };
            },
          } as any;
        }
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        } as any;
      }
    );

    const data = {
      professionalId: 'p1',
      serviceId: 's1',
      selectedSlot: '2024-01-01T10:00:00.000Z',
      clientName: 'John Doe',
      clientEmail: 'john@example.com',
      serviceName: 'Consulta',
      serviceDuration: 30,
      type: 'online',
    };

    await (createBooking as any).run({ data, rawRequest: {} });
    await expect(
      (createBooking as any).run({ data, rawRequest: {} })
    ).rejects.toMatchObject({ code: 'already-exists' });
  });
});
