import { addAppointment, deleteAppointment } from '../src/appointments';
import { addTimeBlock, deleteTimeBlock } from '../src/timeBlocks';
import * as utils from '../src/utils';

jest.mock('../src/utils', () => {
  const db = { collection: jest.fn() };
  return {
    db,
    authenticate: jest.fn().mockResolvedValue({ uid: 'uid' }),
    ensureProfessional: jest.fn(),
    timestamp: jest.fn(),
    invalidateAvailabilityCache: async (
      professionalId: string,
      serviceId: string,
      date: Date | string
    ) => {
      const cacheDate = new Date(date).toISOString().split('T')[0];
      await db
        .collection('availabilityCache')
        .doc(`${professionalId}_${serviceId}_${cacheDate}`)
        .delete();
    },
  };
});

const baseReq = {
  rawRequest: { headers: { authorization: 'Bearer token' } },
} as any;

describe('availability cache invalidation', () => {
  let availabilityCache: Record<string, any>;

  beforeEach(() => {
    availabilityCache = { 'p1_s1_2024-01-01': { slots: [] } };
    jest.clearAllMocks();
  });

  test('deletes cache on addAppointment', async () => {
    (utils.db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'appointments') {
        return { add: jest.fn().mockResolvedValue({ id: 'a1' }) } as any;
      }
      if (name === 'availabilityCache') {
        return {
          doc: (id: string) => ({
            delete: jest.fn(() => {
              delete availabilityCache[id];
              return Promise.resolve();
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    await (addAppointment as any).run({
      ...baseReq,
      data: {
        professionalId: 'p1',
        appointment: {
          clientId: 'c1',
          start: '2024-01-01T10:00:00Z',
          end: '2024-01-01T10:30:00Z',
          serviceId: 's1',
          type: 'online',
        },
      },
    });

    expect(availabilityCache['p1_s1_2024-01-01']).toBeUndefined();
  });

  test('deletes cache on deleteAppointment', async () => {
    (utils.db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'appointments') {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                professionalId: 'p1',
                serviceId: 's1',
                start: '2024-01-01T10:00:00Z',
              }),
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          }),
        } as any;
      }
      if (name === 'availabilityCache') {
        return {
          doc: (id: string) => ({
            delete: jest.fn(() => {
              delete availabilityCache[id];
              return Promise.resolve();
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    await (deleteAppointment as any).run({
      ...baseReq,
      data: { appointmentId: 'a1', professionalId: 'p1' },
    });

    expect(availabilityCache['p1_s1_2024-01-01']).toBeUndefined();
  });

  test('deletes cache on addTimeBlock', async () => {
    (utils.db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'timeBlocks') {
        return { add: jest.fn().mockResolvedValue({ id: 'tb1' }) } as any;
      }
      if (name === 'availabilityCache') {
        return {
          doc: (id: string) => ({
            delete: jest.fn(() => {
              delete availabilityCache[id];
              return Promise.resolve();
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    await (addTimeBlock as any).run({
      ...baseReq,
      data: {
        professionalId: 'p1',
        block: {
          start: '2024-01-01T09:00:00Z',
          end: '2024-01-01T10:00:00Z',
          serviceId: 's1',
        },
      },
    });

    expect(availabilityCache['p1_s1_2024-01-01']).toBeUndefined();
  });

  test('deletes cache on deleteTimeBlock', async () => {
    (utils.db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'timeBlocks') {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                professionalId: 'p1',
                start: '2024-01-01T09:00:00Z',
                serviceId: 's1',
              }),
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          }),
        } as any;
      }
      if (name === 'availabilityCache') {
        return {
          doc: (id: string) => ({
            delete: jest.fn(() => {
              delete availabilityCache[id];
              return Promise.resolve();
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    await (deleteTimeBlock as any).run({
      ...baseReq,
      data: { professionalId: 'p1', blockId: 'tb1' },
    });

    expect(availabilityCache['p1_s1_2024-01-01']).toBeUndefined();
  });
});
