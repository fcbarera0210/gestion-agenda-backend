import * as functions from 'firebase-functions';
import {
  getTimeBlocks,
  addTimeBlock,
  updateTimeBlock,
  deleteTimeBlock,
} from '../src/timeBlocks';
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

describe('timeBlocks auth', () => {
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
    ['getTimeBlocks', getTimeBlocks, { professionalId: 'p1' }],
    [
      'addTimeBlock',
      addTimeBlock,
      { professionalId: 'p1', block: { start: 's', end: 'e' } },
    ],
    [
      'updateTimeBlock',
      updateTimeBlock,
      { professionalId: 'p1', blockId: 'b1', data: { title: 'x' } },
    ],
    ['deleteTimeBlock', deleteTimeBlock, { professionalId: 'p1', blockId: 'b1' }],
  ])('%s denies mismatched professional', async (_, fn, data) => {
    await expect((fn as any).run({ ...baseReq, data })).rejects.toThrow(permError);
  });
});
