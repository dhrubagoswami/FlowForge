import { describe, expect, it } from 'vitest';
import { countConsecutiveFailures } from './alerting.ts';

describe('countConsecutiveFailures', () => {
  it('counts consecutive dead_letter runs from the most recent', () => {
    expect(countConsecutiveFailures(['dead_letter', 'dead_letter', 'dead_letter'])).toBe(3);
  });

  it('resets to 0 when the most recent run succeeded', () => {
    expect(countConsecutiveFailures(['succeeded', 'dead_letter', 'dead_letter'])).toBe(0);
  });

  it('stops counting at the first success walking backward', () => {
    expect(countConsecutiveFailures(['dead_letter', 'dead_letter', 'succeeded', 'dead_letter', 'dead_letter'])).toBe(2);
  });

  it('skips non-terminal statuses (queued, running, retrying) without breaking the streak', () => {
    expect(countConsecutiveFailures(['dead_letter', 'retrying', 'running', 'queued', 'dead_letter'])).toBe(2);
  });

  it('skips skipped_duplicate without breaking the streak', () => {
    expect(countConsecutiveFailures(['dead_letter', 'skipped_duplicate', 'dead_letter'])).toBe(2);
  });

  it('is 0 for an empty history', () => {
    expect(countConsecutiveFailures([])).toBe(0);
  });

  it('is 0 when the only terminal runs are non-terminal/skipped (no outcome yet)', () => {
    expect(countConsecutiveFailures(['queued', 'skipped_duplicate'])).toBe(0);
  });
});
