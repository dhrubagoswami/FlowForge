// The BullMQ Worker: claims a queued run, guards it against duplicate execution, runs its task,
// and records the outcome — retrying with growing backoff (BullMQ's own attempts/backoff, driven
// by each job's retryAttempts/retryBackoff/retryBaseMs) up to dead-letter on the final attempt.
import { eq } from 'drizzle-orm';
import { JOB_QUEUE_NAME, QUEUE_DRAIN_DELAY_SECONDS, QUEUE_STALLED_INTERVAL_MS, type JobQueuePayload, jobsTable, runsTable } from '@flowforge/shared';
import { Worker } from 'bullmq';
import { env } from './config/env.ts';
import { db } from './db/client.ts';
import { InflightCounter } from './heartbeat.ts';
import { fireConsecutiveFailureAlertIfDue } from './lib/alerting.ts';
import { recomputeJobHealth } from './lib/health-recompute.ts';
import { attemptInfo, nextRetryDelayMs } from './lib/retry-math.ts';
import { createTaskLogger } from './lib/task-logger.ts';
import { logger } from './lib/logger.ts';
import { publishRealtimeEvent } from './lib/realtime-publisher.ts';
import { toRunSummary } from './lib/run-summary.util.ts';
import { tryClaimIdempotencyKey } from './repositories/idempotency.repository.ts';
import { redisConnection } from './queue-connection.ts';
import { runTask } from './task-registry.ts';
import { SimulatedTaskError } from './tasks/simulate.task.ts';

class TimeoutError extends Error {}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`task exceeded its ${(timeoutMs / 1000).toFixed(1)}s timeout`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function processRun(payload: JobQueuePayload, workerId: string, attemptsMade: number, maxAttempts: number): Promise<void> {
  const { runId, jobId } = payload;

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
  if (!job) throw new Error(`processRun: job "${jobId}" no longer exists`);

  const [run] = await db.select().from(runsTable).where(eq(runsTable.id, runId)).limit(1);
  if (!run) throw new Error(`processRun: run "${runId}" no longer exists`);

  const log = createTaskLogger(runId);
  const { currentAttempt, isFinalAttempt } = attemptInfo(attemptsMade, maxAttempts);

  await log('info', `claimed by ${workerId} (attempt ${currentAttempt}/${maxAttempts})`);

  // Idempotency: a single INSERT ... ON CONFLICT, never read-then-write. Only the run that wins
  // the claim proceeds; every other run sharing this key (e.g. two overlapping cron fires that
  // both legitimately reached the queue) is marked skipped_duplicate and never executes. This
  // check happens once, on the first attempt only — a run that's already retrying already holds
  // its claim from attempt 1, so re-checking on attempt 2+ would just re-confirm the same thing.
  if (currentAttempt === 1) {
    const claimed = await tryClaimIdempotencyKey({ key: run.idempotencyKey, runId, ttlSeconds: job.idempotencyTtlSeconds });
    if (!claimed) {
      await log('info', `duplicate run skipped · key ${run.idempotencyKey}`);
      await db.update(runsTable).set({ status: 'skipped_duplicate', updatedAt: new Date() }).where(eq(runsTable.id, runId));
      return;
    }
    await log('info', `idempotency lock acquired · key ${run.idempotencyKey}`);
  }

  const startedAt = new Date();
  const [startedRun] = await db
    .update(runsTable)
    .set({ status: 'running', startedAt, attempt: currentAttempt, workerId, updatedAt: startedAt })
    .where(eq(runsTable.id, runId))
    .returning();
  await log('info', `attempt ${currentAttempt}/${maxAttempts} starting`);
  if (startedRun) publishRealtimeEvent({ event: 'run.started', data: { run: toRunSummary(startedRun, job.name) } });

  try {
    const output = await runWithTimeout(runTask(job.taskType, job.taskInput, log), job.timeoutMs);

    const finishedAt = new Date();
    await log('ok', `run succeeded in ${formatSeconds(finishedAt.getTime() - startedAt.getTime())}`);
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const [finishedRun] = await db
      .update(runsTable)
      .set({ status: 'succeeded', finishedAt, durationMs, output, updatedAt: finishedAt })
      .where(eq(runsTable.id, runId))
      .returning();
    if (finishedRun) publishRealtimeEvent({ event: 'run.finished', data: { run: toRunSummary(finishedRun, job.name) } });

    await recomputeJobHealth(jobId);
  } catch (err) {
    const finishedAt = new Date();
    const errorType = err instanceof SimulatedTaskError ? err.errorType : err instanceof TimeoutError ? 'timeout' : 'crash';
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Logging an error line is the failing layer's own job, not this wrapper's — task handlers
    // already log their own failures before throwing. The one error this wrapper itself produces
    // is a timeout, which has no handler to log it, so that's the one case logged here.
    if (err instanceof TimeoutError) {
      await log('error', errorMessage);
    }

    if (isFinalAttempt) {
      await log('error', `attempt ${currentAttempt}/${maxAttempts} failed, dead-lettered`);
      const [deadLetteredRun] = await db
        .update(runsTable)
        .set({ status: 'dead_letter', finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), errorType, errorMessage, updatedAt: finishedAt })
        .where(eq(runsTable.id, runId))
        .returning();
      if (deadLetteredRun) publishRealtimeEvent({ event: 'run.finished', data: { run: toRunSummary(deadLetteredRun, job.name) } });

      await recomputeJobHealth(jobId);
      await fireConsecutiveFailureAlertIfDue(jobId, log);
    } else {
      const nextDelayMs = nextRetryDelayMs(job.retryBackoff, job.retryBaseMs, currentAttempt);
      await log('warn', `attempt ${currentAttempt}/${maxAttempts} failed, retrying in ${formatSeconds(nextDelayMs)}`);
      await db
        .update(runsTable)
        .set({ status: 'retrying', finishedAt: null, errorType, errorMessage, updatedAt: finishedAt })
        .where(eq(runsTable.id, runId));
    }

    // Rethrow so BullMQ sees a real failure: it decides (via job.opts.attempts/backoff, already
    // configured at enqueue time) whether to schedule a retry or move the job to its failed set.
    // We don't ask BullMQ to skip retrying on the final attempt — we've already recorded
    // dead_letter above, and BullMQ's own bookkeeping (attemptsMade, its failed set) is allowed
    // to also consider this job "failed"; the run row is the single source of truth we read from.
    throw err;
  }
}

export function startWorker(workerId: string, inflight: InflightCounter): Worker<JobQueuePayload> {
  const worker = new Worker<JobQueuePayload>(
    JOB_QUEUE_NAME,
    async (job) => {
      await processRun(job.data, workerId, job.attemptsMade, job.opts.attempts ?? 1);
    },
    {
      connection: redisConnection,
      concurrency: env.WORKER_CONCURRENCY,
      drainDelay: QUEUE_DRAIN_DELAY_SECONDS,
      stalledInterval: QUEUE_STALLED_INTERVAL_MS,
    },
  );

  worker.on('active', () => inflight.increment());
  worker.on('completed', () => inflight.decrement());
  worker.on('failed', (job, err) => {
    inflight.decrement();
    logger.error({ err, runId: job?.data.runId }, 'Worker job processing threw — the run row may not reflect this');
  });

  return worker;
}
