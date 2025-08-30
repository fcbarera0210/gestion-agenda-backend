process.env.TZ = 'UTC';

jest.mock('../src/utils', () => ({
  db: { collection: jest.fn() },
}));

import { availability } from '../src/availability';
import { db } from '../src/utils';

describe('availability', () => {
  let professionalData: any;
  let serviceData: any;

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
    const result = await (availability as any).run({
      data: { date: date.toISOString(), professionalId: 'p1', serviceId: 's1' },
    });
    expect(result).toContain('2024-01-01T10:15:00.000Z');
  });

  it('ignores past slots when professional timezone differs', async () => {
    professionalData.timeZone = 'America/Los_Angeles';
    professionalData.workSchedule.lunes.workHours = {
      start: '00:00',
      end: '03:00',
    };
    const date = new Date('2024-01-01T08:00:00Z');
    const result = await (availability as any).run({
      data: { date: date.toISOString(), professionalId: 'p1', serviceId: 's1' },
    });
    expect(result).toContain('2024-01-01T10:15:00.000Z');
    expect(result).not.toContain('2024-01-01T08:00:00.000Z');
  });
});
