// Entry point: seeds 30 days of realistic history for the six demo jobs, eight workers, and their idempotency records. Run with `pnpm db:seed`.
import { jobConfigSchema } from '@flowforge/shared';
import { db } from '../client.ts';
import { aiCacheTable, idempotencyTable, jobsTable, runLogsTable, runsTable, workersTable } from '../schema/index.ts';
import { deriveJobHealth } from '@flowforge/shared';
import { SEED_JOBS } from './seed-jobs.ts';
import { makeRng } from './seed-random.ts';
import { buildRunsForJob } from './seed-runs.ts';
import { SEED_WORKERS } from './seed-workers.ts';

const WINDOW_DAYS = 30;
const SEED = 20260811;

function toJobConfig(job: (typeof SEED_JOBS)[number]) {
  return {
    name: job.id,
    description: job.description,
    trigger: { type: job.triggerType, expr: job.cronExpr ?? undefined, tz: job.timezone },
    task: { type: job.taskType, input: job.taskInput },
    timeoutMs: job.timeoutMs,
    retry: { attempts: job.retryAttempts, backoff: job.retryBackoff, baseMs: job.retryBaseMs },
    idempotency: { keyTemplate: job.idempotencyKeyTemplate, ttlSeconds: job.idempotencyTtlSeconds },
    alert: { afterConsecutiveFailures: job.alertAfterConsecutiveFailures, channel: job.alertChannel ?? undefined },
  };
}

async function main() {
  const rng = makeRng(SEED);
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  console.log('Validating seed job definitions against jobConfigSchema...');
  for (const job of SEED_JOBS) {
    const result = jobConfigSchema.safeParse(toJobConfig(job));
    if (!result.success) {
      console.error(`Seed job "${job.id}" does not satisfy jobConfigSchema:`, result.error.issues);
      process.exit(1);
    }
  }

  // Idempotent by design: truncate-then-insert inside one transaction, so re-running this
  // script always leaves exactly one seeded copy of the data, and a crash midway rolls back
  // to whatever was there before rather than leaving a half-seeded database.
  let totalRuns = 0;
  let totalLogLines = 0;
  let totalIdempotencyRecords = 0;
  const healthResults: { id: string; intended: string; actual: string }[] = [];

  await db.transaction(async (tx) => {
    console.log('Clearing existing seed data...');
    await tx.delete(runLogsTable);
    await tx.delete(idempotencyTable);
    await tx.delete(runsTable);
    await tx.delete(aiCacheTable);
    await tx.delete(jobsTable);
    await tx.delete(workersTable);

    console.log('Inserting workers...');
    await tx.insert(workersTable).values(
      SEED_WORKERS.map((w) => ({
        id: w.id,
        hostname: w.hostname,
        status: 'online' as const,
        concurrency: w.concurrency,
        inflight: w.inflight,
        lastHeartbeatAt: new Date(windowEnd.getTime() - w.heartbeatAgeSeconds * 1000),
        startedAt: new Date(windowEnd.getTime() - 4 * 24 * 60 * 60 * 1000 - 11 * 60 * 60 * 1000),
        version: w.version,
      })),
    );

    for (const job of SEED_JOBS) {
      console.log(`Building run history for ${job.id}...`);

      const { runs, idempotencyRecords } = buildRunsForJob({
        job,
        windowStart,
        windowEnd,
        windowDays: WINDOW_DAYS,
        workers: SEED_WORKERS,
        rng,
        duplicateEveryN: job.id === 'stripe-webhook-reconcile' ? 37 : 0,
      });

      const health = deriveJobHealth(
        job.status,
        [...runs]
          .sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime())
          .map((r) => r.status),
      );
      healthResults.push({ id: job.id, intended: job.intendedHealth, actual: health });

      await tx.insert(jobsTable).values({
        id: job.id,
        name: job.name,
        description: job.description,
        triggerType: job.triggerType,
        cronExpr: job.cronExpr,
        timezone: job.timezone,
        taskType: job.taskType,
        taskInput: job.taskInput,
        status: job.status,
        health,
        timeoutMs: job.timeoutMs,
        retryAttempts: job.retryAttempts,
        retryBackoff: job.retryBackoff,
        retryBaseMs: job.retryBaseMs,
        idempotencyKeyTemplate: job.idempotencyKeyTemplate,
        idempotencyTtlSeconds: job.idempotencyTtlSeconds,
        alertAfterConsecutiveFailures: job.alertAfterConsecutiveFailures,
        alertChannel: job.alertChannel,
        createdBy: job.createdBy,
      });

      if (runs.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < runs.length; i += BATCH) {
          await tx.insert(runsTable).values(
            runs.slice(i, i + BATCH).map((r) => ({
              id: r.id,
              jobId: r.jobId,
              status: r.status,
              triggerSource: r.triggerSource,
              attempt: r.attempt,
              maxAttempts: r.maxAttempts,
              queuedAt: r.queuedAt,
              startedAt: r.startedAt,
              finishedAt: r.finishedAt,
              durationMs: r.durationMs,
              waitMs: r.waitMs,
              workerId: r.workerId,
              idempotencyKey: r.idempotencyKey,
              errorMessage: r.errorMessage,
              errorType: r.errorType,
              scheduledAt: r.scheduledAt,
            })),
          );
        }

        const allLogs = runs.flatMap((r) => r.logs.map((l) => ({ runId: r.id, ts: l.ts, level: l.level, message: l.message })));
        for (let i = 0; i < allLogs.length; i += BATCH) {
          await tx.insert(runLogsTable).values(allLogs.slice(i, i + BATCH));
        }
        totalLogLines += allLogs.length;
      }

      if (idempotencyRecords.length > 0) {
        await tx.insert(idempotencyTable).values(idempotencyRecords);
      }

      totalRuns += runs.length;
      totalIdempotencyRecords += idempotencyRecords.length;
    }
  });

  console.log(`Seed complete: ${SEED_JOBS.length} jobs, ${SEED_WORKERS.length} workers, ${totalRuns} runs, ${totalLogLines} log lines, ${totalIdempotencyRecords} idempotency records.`);

  console.log('Verifying every job landed on its intended health...');
  const mismatches = healthResults.filter((r) => r.intended !== r.actual);
  for (const r of healthResults) {
    console.log(`  ${r.id}: intended=${r.intended} actual=${r.actual}${r.intended !== r.actual ? '  <-- MISMATCH' : ''}`);
  }
  if (mismatches.length > 0) {
    console.error(
      `\nSeed health assertion FAILED: ${mismatches.length} of ${SEED_JOBS.length} jobs did not land on their intended health. The data was still written — fix the degradation story in seed-outcome.ts/seed-jobs.ts and re-run.`,
    );
    process.exit(1);
  }
  console.log('All six jobs matched their intended health.');

  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
