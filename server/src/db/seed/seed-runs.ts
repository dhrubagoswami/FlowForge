// Builds the full 30-day run history (with attached log lines and idempotency records) for one seeded job.
import { randomUUID } from 'node:crypto';
import type { RunStatus } from '@flowforge/shared';
import { expandCronOccurrences } from './seed-schedule.ts';
import { decideOutcome } from './seed-outcome.ts';
import { buildRunLogs, failureMessage, type SeedLogLine } from './seed-logs.ts';
import { distributeAcrossHours } from './seed-volume.ts';
import { jitter, pick, type makeRng } from './seed-random.ts';
import type { SeedJobDef } from './seed-jobs.ts';
import type { SeedWorkerDef } from './seed-workers.ts';

export interface BuiltRun {
  id: string;
  jobId: string;
  status: RunStatus;
  triggerSource: 'schedule' | 'webhook';
  attempt: number;
  maxAttempts: number;
  queuedAt: Date;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  waitMs: number;
  workerId: string;
  idempotencyKey: string;
  errorMessage: string | null;
  errorType: string | null;
  scheduledAt: Date;
  logs: { ts: Date; level: SeedLogLine['level']; message: string }[];
}

export interface BuiltIdempotencyRecord {
  key: string;
  runId: string;
  expiresAt: Date;
}

const NON_TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(['retrying', 'failed']);

function buildOneRun(params: {
  job: SeedJobDef;
  scheduledAt: Date;
  daysAgo: number;
  windowDays: number;
  triggerSource: 'schedule' | 'webhook';
  rng: ReturnType<typeof makeRng>;
  workers: SeedWorkerDef[];
  forceDuplicate: boolean;
  isInFlight: boolean;
}): { run: BuiltRun; idempotencyRecord: BuiltIdempotencyRecord | null } {
  const { job, scheduledAt, daysAgo, windowDays, triggerSource, rng, workers, forceDuplicate, isInFlight } = params;

  const worker = pick(rng, workers);
  const outcome = decideOutcome({ job, daysAgo, windowDays, rng, isDuplicateDelivery: forceDuplicate, isInFlight });
  const isTerminal = !NON_TERMINAL_STATUSES.has(outcome.finalStatus);

  const waitMs = Math.max(5, Math.round(jitter(rng, 400, 0.6)));
  const queuedAt = scheduledAt;
  const startedAt = new Date(queuedAt.getTime() + waitMs);

  const perAttemptDuration = Math.max(50, Math.round(jitter(rng, job.taskInput.durationMs, 0.15)));
  const totalDurationMs = outcome.finalStatus === 'skipped_duplicate' ? 20 : perAttemptDuration * outcome.attemptsUsed;
  const finishedAt = isTerminal ? new Date(startedAt.getTime() + totalDurationMs) : null;

  const runId = randomUUID();
  const runIdShort = runId.slice(0, 6);
  const scheduledAtIso = scheduledAt.toISOString();

  const logLines = buildRunLogs({
    jobId: job.id,
    jobName: job.name,
    workerId: worker.id,
    scheduledAtIso,
    attempt: outcome.attemptsUsed,
    maxAttempts: job.retryAttempts,
    durationMs: totalDurationMs,
    outcome: outcome.finalStatus,
    failureMode: outcome.failureMode,
    runIdShort,
  });

  const idempotencyKey = job.idempotencyKeyTemplate
    .replace('{{job}}', job.id)
    .replace('{{scheduled_at}}', scheduledAtIso)
    .replace('{{input_hash}}', runIdShort);

  const isFailureStatus = outcome.finalStatus === 'dead_letter' || outcome.finalStatus === 'failed' || outcome.finalStatus === 'retrying';
  const errorDetail = isFailureStatus ? failureMessage(outcome.failureMode, outcome.attemptsUsed, job.retryAttempts) : null;

  const run: BuiltRun = {
    id: runId,
    jobId: job.id,
    status: outcome.finalStatus,
    triggerSource,
    attempt: outcome.attemptsUsed,
    maxAttempts: job.retryAttempts,
    queuedAt,
    startedAt,
    finishedAt,
    durationMs: isTerminal ? totalDurationMs : null,
    waitMs,
    workerId: worker.id,
    idempotencyKey,
    errorMessage:
      outcome.finalStatus === 'dead_letter' && errorDetail ? `${errorDetail.message} · dead-lettered after ${outcome.attemptsUsed} attempts` : errorDetail?.message ?? null,
    errorType: errorDetail?.errorType ?? null,
    scheduledAt,
    logs: logLines.map((l) => ({ ts: new Date(startedAt.getTime() + l.offsetMs), level: l.level, message: l.message })),
  };

  const idempotencyRecord: BuiltIdempotencyRecord | null =
    outcome.finalStatus === 'skipped_duplicate' && finishedAt
      ? { key: idempotencyKey, runId, expiresAt: new Date(finishedAt.getTime() + job.idempotencyTtlSeconds * 1000) }
      : null;

  return { run, idempotencyRecord };
}

export function buildRunsForJob(params: {
  job: SeedJobDef;
  windowStart: Date;
  windowEnd: Date;
  windowDays: number;
  workers: SeedWorkerDef[];
  rng: ReturnType<typeof makeRng>;
  duplicateEveryN: number;
}): { runs: BuiltRun[]; idempotencyRecords: BuiltIdempotencyRecord[] } {
  const { job, windowStart, windowEnd, windowDays, workers, rng, duplicateEveryN } = params;
  const runs: BuiltRun[] = [];
  const idempotencyRecords: BuiltIdempotencyRecord[] = [];
  let occurrenceCount = 0;

  const scheduledOccurrences: Date[] =
    job.triggerType === 'cron' && job.cronExpr
      ? expandCronOccurrences(job.cronExpr, job.timezone, windowStart, windowEnd)
      : buildWebhookOccurrences(job, windowStart, windowEnd, rng);

  // Runs scheduled within the last 15 minutes of the window are eligible to still look "in
  // flight" (retrying/failed rather than a settled terminal status) — enough of a tail that
  // high-frequency jobs get a couple of live-looking rows, without touching the bulk history.
  const inFlightCutoff = windowEnd.getTime() - 15 * 60 * 1000;

  for (const [, scheduledAt] of scheduledOccurrences.entries()) {
    occurrenceCount += 1;
    const daysAgo = (windowEnd.getTime() - scheduledAt.getTime()) / (1000 * 60 * 60 * 24);
    const forceDuplicate = job.triggerType === 'webhook' && duplicateEveryN > 0 && occurrenceCount % duplicateEveryN === 0;
    const isInFlight = scheduledAt.getTime() >= inFlightCutoff;

    const { run, idempotencyRecord } = buildOneRun({
      job,
      scheduledAt,
      daysAgo,
      windowDays,
      triggerSource: job.triggerType === 'webhook' ? 'webhook' : 'schedule',
      rng,
      workers,
      forceDuplicate,
      isInFlight,
    });

    runs.push(run);
    if (idempotencyRecord) idempotencyRecords.push(idempotencyRecord);
  }

  return { runs, idempotencyRecords };
}

function buildWebhookOccurrences(job: SeedJobDef, windowStart: Date, windowEnd: Date, rng: ReturnType<typeof makeRng>): Date[] {
  const occurrences: Date[] = [];
  const totalDays = Math.round((windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24));

  for (let day = 0; day < totalDays; day++) {
    const dayStart = new Date(windowStart.getTime() + day * 24 * 60 * 60 * 1000);
    const perHour = distributeAcrossHours(job.dailyRunTarget, dayStart.getDay(), rng);
    for (let hour = 0; hour < 24; hour++) {
      for (let n = 0; n < perHour[hour]; n++) {
        const minute = Math.floor(rng() * 60);
        const second = Math.floor(rng() * 60);
        occurrences.push(new Date(dayStart.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000 + second * 1000));
      }
    }
  }

  return occurrences.filter((d) => d <= windowEnd);
}
