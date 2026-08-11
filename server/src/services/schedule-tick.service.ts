// Turns one BullMQ Job Scheduler tick into a real run: looks up the job, works out the slot's
// intended fire time, and hands off to enqueueRun — the same insert-and-enqueue path a manual
// trigger uses. trigger_source and scheduled_at are the only differences from a manual trigger.
import { findJobById } from '../repositories/job.repository.ts';
import { logger } from '../lib/logger.ts';
import { enqueueRun } from './enqueue.service.ts';

// BullMQ's Job Scheduler names each fired job "repeat:<jobSchedulerId>:<slotTimestampMs>" — the
// canonical, documented way to recover the exact slot a given firing belongs to. job.timestamp is
// when the job was *created* (enqueue time), not the cron slot it represents, so it isn't usable
// for the idempotency key: two ticks racing under load could otherwise get different keys for what
// should be the same logical slot.
const SCHEDULER_JOB_ID_PATTERN = /^repeat:.+:(\d+)$/;

export function slotTimeFromSchedulerJobId(jobId: string | undefined, fallback: Date): Date {
  const match = jobId ? SCHEDULER_JOB_ID_PATTERN.exec(jobId) : null;
  if (!match) return fallback;
  return new Date(Number(match[1]));
}

export async function handleScheduleTick(params: { jobId: string; schedulerJobId: string | undefined; firedAt: Date }): Promise<void> {
  // findJobById already excludes soft-deleted rows, so a deleted job's straggling tick lands here too.
  const job = await findJobById(params.jobId);
  if (!job) {
    logger.warn({ jobId: params.jobId }, 'Schedule tick fired for a job that no longer exists or is deleted — dropping');
    return;
  }
  if (job.status !== 'active') {
    logger.info({ jobId: params.jobId, status: job.status }, 'Schedule tick fired for a non-active job — skipping');
    return;
  }

  const scheduledAt = slotTimeFromSchedulerJobId(params.schedulerJobId, params.firedAt);
  const run = await enqueueRun(job, { triggerSource: 'schedule', scheduledAt });
  logger.info({ jobId: job.id, runId: run.id, scheduledAt: scheduledAt.toISOString() }, 'Schedule tick enqueued a run');
}
