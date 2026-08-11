// Magic numbers and strings used across the server, named once here per §12.3.
import type { RunStatus } from '@flowforge/shared';

export const WORKER_OFFLINE_AFTER_SECONDS = 15;

export const JOB_HEALTH_SAMPLE_SIZE = 20;
export const JOB_HEALTH_MIN_SAMPLE_SIZE = 5;
export const JOB_HEALTH_FAILING_THRESHOLD = 0.85;
export const JOB_HEALTH_DEGRADED_THRESHOLD = 0.98;

/**
 * Which run statuses count toward a success-rate calculation, and which of those count as a
 * success. skipped_duplicate is deliberately excluded — a correctly deduplicated run is neither
 * a success nor a failure, so it shouldn't move a success rate in either direction. Non-terminal
 * statuses (queued, running, retrying) are excluded too — a run isn't a data point until it has
 * settled. Used by job.service.ts (per-job health/success rate) and stats.repository.ts (the
 * Overview success rate) so there is exactly one definition of "counted".
 */
export const SUCCESS_RATE_COUNTED_STATUSES: readonly RunStatus[] = ['succeeded', 'failed', 'dead_letter'];
export const SUCCESS_RATE_SUCCESS_STATUSES: readonly RunStatus[] = ['succeeded'];

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const STATS_ACTIVITY_WINDOW_HOURS = 24;
export const FAILURE_CLUSTER_DEFAULT_WINDOW_HOURS = 24;

export const REDIS_NOT_WIRED_REASON = 'not wired until M5'; // TODO(M5): remove once queue/connection.ts exists.
