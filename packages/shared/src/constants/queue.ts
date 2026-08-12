// The BullMQ queue name and job payload shape — shared so the server (which enqueues) and the worker (which dequeues) agree on both.
// BullMQ queue names may not contain ':' (it uses that as a Redis key separator internally).
export const JOB_QUEUE_NAME = 'flowforge-jobs';

export interface JobQueuePayload {
  runId: string;
  jobId: string;
}

// A separate, server-only queue: BullMQ's Job Scheduler fires a tick here on each cron slot, and an
// in-server consumer turns that tick into a real run row + a JOB_QUEUE_NAME enqueue (see
// schedule-tick.service.ts). The worker package never touches this queue — a worker picking up a
// tick job it doesn't know how to handle would be a real failure mode, not just a layering violation.
export const SCHEDULE_TICK_QUEUE_NAME = 'flowforge-schedule-ticks';

export interface ScheduleTickPayload {
  jobId: string;
}

// Redis command budget: idle BullMQ polling (blocking pop cycles + stalled-job sweeps) is a
// standing cost multiplied by every Worker instance that exists, so these are tuned down from
// BullMQ's defaults rather than left at them. See DECISIONS.md for the full incident writeup.
//
// QUEUE_DRAIN_DELAY_SECONDS's real effect is smaller than its name suggests — read this before
// changing it. BullMQ's Worker.getBlockTimeout() (bullmq/dist/.../classes/worker.js) only honors
// `drainDelay` when a queue has ZERO delayed/scheduled jobs pending. The instant any delayed job
// exists — which is permanently true here, since every cron job is a BullMQ Job Scheduler that
// always has a "next slot" delayed job queued — BullMQ switches branches and computes the BZPOPMIN
// block timeout as `Math.min(blockDelay / 1000, maximumBlockTimeout)`, where `maximumBlockTimeout`
// is a hardcoded, non-configurable module constant equal to 10 (their own comment: "10 seconds is
// the maximum time a BZPOPMIN can block... to avoid blocking the connection for too long in the
// case of reconnections", referencing taskforcesh/bullmq#1658). `drainDelay` is never read in that
// branch. So on both queues in this app (job queue: retry-backoff delays; schedule-tick queue: its
// permanent next-cron-slot delayed job), the real idle BZPOPMIN cadence is BullMQ's fixed 10s
// ceiling, not this constant — confirmed against bullmq@5.81.3's own source, not assumed. Still set
// above BullMQ's own un-capped default (5s) in case a queue is ever genuinely delayed-job-free, but
// do not expect it to move the idle command floor below what a 10s BZPOPMIN cycle produces.
export const QUEUE_DRAIN_DELAY_SECONDS = 60;
export const QUEUE_STALLED_INTERVAL_MS = 120000;
export const QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
} as const;
