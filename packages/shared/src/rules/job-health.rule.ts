// The §5 health rule: derived from a job's most recent run outcomes. Pure — no DB, no HTTP — so
// the server (read API), the worker (recomputes after each run), and the seed script can all
// call the exact same implementation instead of three hand-matched copies.
import type { JobHealth, RunStatus } from '../constants/enums.ts';

export const JOB_HEALTH_SAMPLE_SIZE = 20;
export const JOB_HEALTH_MIN_SAMPLE_SIZE = 5;
export const JOB_HEALTH_FAILING_THRESHOLD = 0.85;
export const JOB_HEALTH_DEGRADED_THRESHOLD = 0.98;

/**
 * Which run statuses count toward a success-rate calculation, and which of those count as a
 * success. skipped_duplicate is deliberately excluded — a correctly deduplicated run is neither
 * a success nor a failure, so it shouldn't move a success rate in either direction. Non-terminal
 * statuses (queued, running, retrying) are excluded too — a run isn't a data point until it has
 * settled.
 */
export const SUCCESS_RATE_COUNTED_STATUSES: readonly RunStatus[] = ['succeeded', 'failed', 'dead_letter'];
export const SUCCESS_RATE_SUCCESS_STATUSES: readonly RunStatus[] = ['succeeded'];

const COUNTED_STATUSES: ReadonlySet<RunStatus> = new Set(SUCCESS_RATE_COUNTED_STATUSES);
const SUCCESS_STATUSES: ReadonlySet<RunStatus> = new Set(SUCCESS_RATE_SUCCESS_STATUSES);

export function deriveJobHealth(status: 'active' | 'paused', recentStatusesNewestFirst: RunStatus[]): JobHealth {
  if (status === 'paused') return 'paused';

  const counted = recentStatusesNewestFirst.filter((s) => COUNTED_STATUSES.has(s)).slice(0, JOB_HEALTH_SAMPLE_SIZE);
  if (counted.length < JOB_HEALTH_MIN_SAMPLE_SIZE) return 'healthy';

  const successRate = counted.filter((s) => SUCCESS_STATUSES.has(s)).length / counted.length;
  if (successRate < JOB_HEALTH_FAILING_THRESHOLD) return 'failing';
  if (successRate < JOB_HEALTH_DEGRADED_THRESHOLD) return 'degraded';
  return 'healthy';
}
