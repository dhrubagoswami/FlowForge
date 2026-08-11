import { describe, expect, it } from 'vitest';
import { attemptInfo, nextRetryDelayMs } from './retry-math.ts';

describe('attemptInfo', () => {
  it('is attempt 1/N and not final on the first call (attemptsMade=0)', () => {
    expect(attemptInfo(0, 3)).toEqual({ currentAttempt: 1, isFinalAttempt: false });
  });

  it('is attempt 2/N and not final on the second call (attemptsMade=1)', () => {
    expect(attemptInfo(1, 3)).toEqual({ currentAttempt: 2, isFinalAttempt: false });
  });

  it('is the final attempt when currentAttempt reaches maxAttempts', () => {
    expect(attemptInfo(2, 3)).toEqual({ currentAttempt: 3, isFinalAttempt: true });
  });

  it('is final on the very first attempt when maxAttempts is 1', () => {
    expect(attemptInfo(0, 1)).toEqual({ currentAttempt: 1, isFinalAttempt: true });
  });
});

describe('nextRetryDelayMs', () => {
  it('doubles each attempt for exponential backoff, matching BullMQ\'s own formula', () => {
    // Math.round(2^(attempt-1) * base)
    expect(nextRetryDelayMs('exponential', 1000, 1)).toBe(1000);
    expect(nextRetryDelayMs('exponential', 1000, 2)).toBe(2000);
    expect(nextRetryDelayMs('exponential', 1000, 3)).toBe(4000);
    expect(nextRetryDelayMs('exponential', 1000, 4)).toBe(8000);
  });

  it('stays constant for fixed backoff regardless of attempt number', () => {
    expect(nextRetryDelayMs('fixed', 5000, 1)).toBe(5000);
    expect(nextRetryDelayMs('fixed', 5000, 4)).toBe(5000);
  });
});
