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
