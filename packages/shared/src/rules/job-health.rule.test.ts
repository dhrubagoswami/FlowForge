import { describe, expect, it } from 'vitest';
import type { RunStatus } from '../constants/enums.ts';
import { deriveJobHealth } from './job-health.rule.ts';

function statuses(...s: RunStatus[]): RunStatus[] {
  return s;
}

describe('deriveJobHealth', () => {
  it('is paused when the job status is paused, regardless of run history', () => {
    expect(deriveJobHealth('paused', statuses('succeeded', 'succeeded'))).toBe('paused');
    expect(deriveJobHealth('paused', statuses('dead_letter', 'dead_letter', 'dead_letter', 'dead_letter', 'dead_letter'))).toBe('paused');
  });

  it('is healthy with fewer than 5 counted runs, regardless of outcome', () => {
    expect(deriveJobHealth('active', statuses('dead_letter', 'dead_letter', 'dead_letter', 'dead_letter'))).toBe('healthy');
  });

  it('is healthy at or above a 98% success rate', () => {
    const runs = statuses(...Array(20).fill('succeeded') as RunStatus[]);
    expect(deriveJobHealth('active', runs)).toBe('healthy');
  });

  it('is degraded between 85% and 98% success (exclusive of healthy boundary)', () => {
    // 18/20 = 90% — below 98%, at/above 85%.
    const runs = statuses(...Array(18).fill('succeeded') as RunStatus[], 'failed', 'failed');
    expect(deriveJobHealth('active', runs)).toBe('degraded');
  });

  it('is failing below 85% success', () => {
    // 15/20 = 75% — below 85%.
    const runs = statuses(...Array(15).fill('succeeded') as RunStatus[], 'failed', 'failed', 'failed', 'failed', 'failed');
    expect(deriveJobHealth('active', runs)).toBe('failing');
  });

  it('excludes skipped_duplicate from the counted sample', () => {
    // 5 succeeded + 10 skipped_duplicate — skipped_duplicate doesn't count, so only 5 are counted (min sample met, 100% success).
    const runs = statuses(...Array(5).fill('succeeded') as RunStatus[], ...Array(10).fill('skipped_duplicate') as RunStatus[]);
    expect(deriveJobHealth('active', runs)).toBe('healthy');
  });

  it('excludes non-terminal statuses (queued, running, retrying) from the counted sample', () => {
    const runs = statuses('queued', 'running', 'retrying', 'succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded');
    expect(deriveJobHealth('active', runs)).toBe('healthy');
  });

  it('only looks at the most recent JOB_HEALTH_SAMPLE_SIZE (20) counted runs', () => {
    // 20 recent failures, then 100 older successes — only the 20 most recent count.
    const runs = statuses(...Array(20).fill('dead_letter') as RunStatus[], ...Array(100).fill('succeeded') as RunStatus[]);
    expect(deriveJobHealth('active', runs)).toBe('failing');
  });
});
