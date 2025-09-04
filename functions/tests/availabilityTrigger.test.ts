import { availability } from '../src/availability';
import { invalidateCacheOnAppointmentWrite } from '../src/index';
import { db } from '../src/utils';
import { addMinutes } from 'date-fns';

jest.mock('../src/utils', () => {
  const db = { collection: jest.fn() };
  const invalidateAvailabilityCache = async (
    professionalId: string,
    serviceId: string,
    date: Date | string
  ) => {
    const cacheDate = new Date(date).toISOString().split('T')[0];
    await db
      .collection('availabilityCache')
      .doc(`${professionalId}_${serviceId}_${cacheDate}`)
      .delete();
  };
  const invalidateCacheForDocument = async (
    data: any
  ) => {
    if (!data) return;
    const { professionalId, serviceId, start } = data;
    if (professionalId && serviceId && start) {
      const startDate = start.toDate ? start.toDate() : new Date(start);
      await invalidateAvailabilityCache(
        professionalId,
        serviceId,
        startDate
      );
    }
  };
  return { db, invalidateAvailabilityCache, invalidateCacheForDocument };
});

describe('appointment write invalidates availability cache', () => {
  let professionalData: any;
  let serviceData: any;
  let availabilityCache: Record<string, any>;
  let appointmentsDocs: any[];
  let appointmentsGetMock: jest.Mock;
  let timeBlocksGetMock: jest.Mock;
  let availabilitySetMock: jest.Mock;

  beforeEach(() => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2024-01-01T10:00:00Z'));
    professionalData = {
      workSchedule: {
        martes: {
          isActive: true,
          workHours: { start: '09:00', end: '18:00' },
        },
      },
    };
    serviceData = { duration: 30 };
    availabilityCache = {};
    appointmentsDocs = [];
    appointmentsGetMock = jest
      .fn()
      .mockImplementation(() => Promise.resolve({ docs: appointmentsDocs }));
    timeBlocksGetMock = jest
      .fn()
      .mockImplementation(() => Promise.resolve({ docs: [] }));

    (db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'professionals') {
        return {
          doc: () => ({
            get: () =>
              Promise.resolve({ exists: true, data: () => professionalData }),
          }),
        } as any;
      }
      if (name === 'services') {
        return {
          doc: () => ({
            get: () => Promise.resolve({ exists: true, data: () => serviceData }),
          }),
        } as any;
      }
      if (name === 'availabilityCache') {
        return {
          doc: (id: string) => ({
            get: jest.fn(() =>
              Promise.resolve(
                availabilityCache[id]
                  ? { exists: true, data: () => availabilityCache[id] }
                  : { exists: false }
              )
            ),
            set: (availabilitySetMock = jest.fn((data: any) => {
              availabilityCache[id] = data;
              return Promise.resolve();
            })),
            delete: jest.fn(() => {
              delete availabilityCache[id];
              return Promise.resolve();
            }),
          }),
        } as any;
      }
      if (name === 'appointments') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          get: appointmentsGetMock,
        } as any;
      }
      if (name === 'timeBlocks') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          get: timeBlocksGetMock,
        } as any;
      }
      return {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      } as any;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('slot removed after appointment creation', async () => {
    const date = '2024-01-02';
    const cacheKey = `p1_s1_${date}`;
    const initialSlots = await availability({
      data: { date, professionalId: 'p1', serviceId: 's1' },
    } as any);
    const slot = initialSlots[0];
    expect(availabilityCache[cacheKey]).toBeDefined();

    appointmentsDocs.push({
      data: () => ({
        start: { toDate: () => new Date(slot) },
        end: { toDate: () => addMinutes(new Date(slot), 30) },
        status: 'confirmed',
      }),
    });

    await (invalidateCacheOnAppointmentWrite as any).run({
      data: {
        after: {
          data: () => ({
            professionalId: 'p1',
            serviceId: 's1',
            start: slot,
          }),
        },
        before: { data: () => null },
      },
    });

    expect(availabilityCache[cacheKey]).toBeUndefined();

    const newSlots = await availability({
      data: { date, professionalId: 'p1', serviceId: 's1' },
    } as any);
    expect(newSlots).not.toContain(slot);
  });
});

