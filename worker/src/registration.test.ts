import { describe, expect, it } from 'vitest';
import { lowestUnusedWorkerNumber } from './registration.ts';

describe('lowestUnusedWorkerNumber', () => {
  it('returns 9 when worker-01..worker-08 are taken (the seed data)', () => {
    const seeded = Array.from({ length: 8 }, (_, i) => `worker-${String(i + 1).padStart(2, '0')}`);
    expect(lowestUnusedWorkerNumber(seeded)).toBe(9);
  });

  it('returns 1 when nothing is registered yet', () => {
    expect(lowestUnusedWorkerNumber([])).toBe(1);
  });

  it('fills a gap rather than always appending', () => {
    expect(lowestUnusedWorkerNumber(['worker-01', 'worker-03'])).toBe(2);
  });

  it('ignores ids that do not match the worker-NN pattern', () => {
    expect(lowestUnusedWorkerNumber(['worker-01', 'worker-abcdef12', 'not-a-worker'])).toBe(2);
  });
});
