process.env.TZ = 'UTC';

jest.mock('../src/utils', () => ({
  db: { collection: jest.fn() },
}));

import { availability } from '../src/availability';
import { db } from '../src/utils';

describe('availability', () => {
  let professionalData: any;
  let serviceData: any;
  let availabilityCache: Record<string, any>;
  let appointmentsGetMock: jest.Mock;
  let timeBlocksGetMock: jest.Mock;
  let availabilitySetMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T10:00:00Z'));
    professionalData = {
      workSchedule: {
        lunes: {
          isActive: true,
          workHours: { start: '09:00', end: '12:00' },
        },
      },
    };
    serviceData = { duration: 30 };
    availabilityCache = {};
    appointmentsGetMock = jest.fn().mockResolvedValue({ docs: [] });
    timeBlocksGetMock = jest.fn().mockResolvedValue({ docs: [] });
    (db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'professionals') {
        return {
          doc: () => ({
            get: () =>
              Promise.resolve({
                exists: true,
                data: () => professionalData,
              }),
          }),
        } as any;
      }
      if (name === 'services') {
        return {
          doc: () => ({
            get: () =>
              Promise.resolve({
                exists: true,
                data: () => serviceData,
              }),
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

  it('returns slots later than now for current day', async () => {
    const date = new Date('2024-01-01T00:00:00Z');
    const result = await availability({
      data: { date: date.toISOString(), professionalId: 'p1', serviceId: 's1' },
    } as any);
    expect(result).toContain('2024-01-01T10:15:00.000Z');
  });

  it('ignores past slots when professional timezone differs', async () => {
    professionalData.timeZone = 'America/Los_Angeles';
    professionalData.workSchedule.lunes.workHours = {
      start: '00:00',
      end: '03:00',
    };
    const date = new Date('2024-01-01T08:00:00Z');
    const result = await availability({
      data: { date: date.toISOString(), professionalId: 'p1', serviceId: 's1' },
    } as any);
    expect(result).toContain('2024-01-01T10:15:00.000Z');
    expect(result).not.toContain('2024-01-01T08:00:00.000Z');
  });

  it('returns cached availability when present for future day', async () => {
    availabilityCache['p1_s1_2024-01-02'] = {
      slots: ['2024-01-02T12:00:00.000Z'],
    };
    const date = new Date('2024-01-02T00:00:00Z');
    const result = await availability({
      data: { date: date.toISOString(), professionalId: 'p1', serviceId: 's1' },
    } as any);
    expect(result).toEqual(['2024-01-02T12:00:00.000Z']);
    expect(appointmentsGetMock).not.toHaveBeenCalled();
    expect(timeBlocksGetMock).not.toHaveBeenCalled();
  });

  it('recalculates availability for same day ignoring cache', async () => {
    availabilityCache['p1_s1_2024-01-01'] = {
      slots: ['2024-01-01T12:00:00.000Z'],
    };
    const date = new Date('2024-01-01T00:00:00Z');
    const result = await availability({
      data: { date: date.toISOString(), professionalId: 'p1', serviceId: 's1' },
    } as any);
    expect(result).toContain('2024-01-01T10:15:00.000Z');
    expect(result).not.toEqual(['2024-01-01T12:00:00.000Z']);
    expect(appointmentsGetMock).toHaveBeenCalled();
    expect(timeBlocksGetMock).toHaveBeenCalled();
    expect(availabilitySetMock).not.toHaveBeenCalled();
  });
});
