// Magic numbers and strings used across the server, named once here per §12.3.
// The §5 health rule and its thresholds/status sets live in @flowforge/shared (job-health.rule.ts)
// — the worker and the seed script need the exact same rule, not a server-only copy.

export const WORKER_OFFLINE_AFTER_SECONDS = 15;

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const STATS_ACTIVITY_WINDOW_HOURS = 24;
export const FAILURE_CLUSTER_DEFAULT_WINDOW_HOURS = 24;

export const SSE_HEARTBEAT_MS = 20000;
export const STATS_TICK_INTERVAL_MS = 3000;
