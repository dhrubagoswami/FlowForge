// Business rules for turning a job into a queued run: writes the run row and enqueues it onto
// BullMQ. Shared by both entry points that can start a run — a manual trigger (POST .../trigger)
// and a schedule tick (schedule-tick.service.ts) — so trigger_source and scheduled_at are the only
// differences between them, not two copies of the same insert-and-enqueue logic.
import type { RunSummary, RunTriggerSource } from '@flowforge/shared';
import { AppError } from '../lib/app-error.ts';
import { buildIdempotencyKey } from '../lib/idempotency-key.util.ts';
import { findJobById, type JobRow } from '../repositories/job.repository.ts';
import { insertQueuedRun } from '../repositories/run.repository.ts';
import { jobQueue } from '../queue/job.queue.ts';
import { publishEvent } from '../realtime/event-bus.ts';

function toRunSummary(run: Awaited<ReturnType<typeof insertQueuedRun>>, jobName: string): RunSummary {
  return {
    id: run.id,
    jobId: run.jobId,
    jobName,
    status: run.status,
    triggerSource: run.triggerSource,
    attempt: run.attempt,
    maxAttempts: run.maxAttempts,
    workerId: run.workerId,
    durationMs: run.durationMs,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: null,
    finishedAt: null,
  };
}

/** Inserts a queued run row for an already-fetched, already-validated job and enqueues it onto BullMQ. The one place both the manual-trigger and schedule-tick paths create work. */
export async function enqueueRun(job: JobRow, params: { triggerSource: RunTriggerSource; scheduledAt: Date | null }): Promise<RunSummary> {
  const idempotencyKey = buildIdempotencyKey({
    keyTemplate: job.idempotencyKeyTemplate,
    jobId: job.id,
    scheduledAt: params.scheduledAt,
    input: job.taskInput,
  });

  const run = await insertQueuedRun({
    jobId: job.id,
    triggerSource: params.triggerSource,
    maxAttempts: job.retryAttempts,
    idempotencyKey,
    scheduledAt: params.scheduledAt,
  });

  await jobQueue.add(
    job.id,
    { runId: run.id, jobId: job.id },
    {
      jobId: run.id,
      attempts: job.retryAttempts,
      backoff: { type: job.retryBackoff, delay: job.retryBaseMs },
    },
  );

  const summary = toRunSummary(run, job.name);
  publishEvent({ event: 'run.queued', data: { run: summary } });
  return summary;
}

export async function triggerJob(jobId: string): Promise<RunSummary> {
  const job = await findJobById(jobId);
  if (!job) {
    throw new AppError({ code: 'JOB_NOT_FOUND', message: `No job with id "${jobId}" was found.`, statusCode: 404 });
  }
  if (job.status === 'paused') {
    throw new AppError({
      code: 'JOB_PAUSED',
      message: `${jobId} is paused — resume it before triggering a run.`,
      statusCode: 409,
    });
  }

  return enqueueRun(job, { triggerSource: 'manual', scheduledAt: null });
}
