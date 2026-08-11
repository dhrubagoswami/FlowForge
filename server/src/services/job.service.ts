// Business rules for jobs: health derivation, schedule labelling, next-run computation, and assembling the API-facing job shapes from repository rows.
import type { JobConfig, JobDetail, JobHealth, JobSummary, RunStatus } from '@flowforge/shared';
import {
  JOB_HEALTH_DEGRADED_THRESHOLD,
  JOB_HEALTH_FAILING_THRESHOLD,
  JOB_HEALTH_MIN_SAMPLE_SIZE,
  JOB_HEALTH_SAMPLE_SIZE,
  SUCCESS_RATE_COUNTED_STATUSES,
  SUCCESS_RATE_SUCCESS_STATUSES,
} from '../config/constants.ts';
import { AppError } from '../lib/app-error.ts';
import { cronToLabel } from '../lib/cron-label.util.ts';
import { nextCronOccurrence } from '../lib/cron-next-run.util.ts';
import { findAllJobs, findJobById, type JobRow } from '../repositories/job.repository.ts';
import { findLastNRunStatusesByJobId, findRunsByJobId } from '../repositories/run.repository.ts';

const SUCCESS_STATUSES: ReadonlySet<RunStatus> = new Set(SUCCESS_RATE_SUCCESS_STATUSES);
const COUNTED_STATUSES: ReadonlySet<RunStatus> = new Set(SUCCESS_RATE_COUNTED_STATUSES);

/** The §5 health rule: derived from a job's most recent run outcomes. Used by both the seed script and the read API so there is exactly one implementation. */
export function deriveJobHealth(status: 'active' | 'paused', recentStatusesNewestFirst: RunStatus[]): JobHealth {
  if (status === 'paused') return 'paused';

  const counted = recentStatusesNewestFirst.filter((s) => COUNTED_STATUSES.has(s)).slice(0, JOB_HEALTH_SAMPLE_SIZE);
  if (counted.length < JOB_HEALTH_MIN_SAMPLE_SIZE) return 'healthy';

  const successRate = counted.filter((s) => SUCCESS_STATUSES.has(s)).length / counted.length;
  if (successRate < JOB_HEALTH_FAILING_THRESHOLD) return 'failing';
  if (successRate < JOB_HEALTH_DEGRADED_THRESHOLD) return 'degraded';
  return 'healthy';
}

function computeScheduleFields(job: JobRow): { schedLabel: string; nextRunAt: string | null } {
  if (job.triggerType === 'webhook') return { schedLabel: 'On delivery', nextRunAt: null };
  if (job.triggerType === 'manual') return { schedLabel: 'Manual', nextRunAt: null };

  // Cron trigger.
  if (!job.cronExpr) return { schedLabel: 'Cron (unconfigured)', nextRunAt: null };
  const schedLabel = cronToLabel(job.cronExpr, job.timezone);
  const nextRunAt = job.status === 'active' ? nextCronOccurrence(job.cronExpr, job.timezone) : null;
  return { schedLabel, nextRunAt: nextRunAt ? nextRunAt.toISOString() : null };
}

async function toJobSummary(job: JobRow): Promise<JobSummary> {
  const recentStatuses = await findLastNRunStatusesByJobId(job.id, JOB_HEALTH_SAMPLE_SIZE);
  const health = deriveJobHealth(job.status, recentStatuses);
  const { schedLabel, nextRunAt } = computeScheduleFields(job);

  const counted = recentStatuses.filter((s) => COUNTED_STATUSES.has(s));
  const successRatePct = counted.length > 0 ? Number(((counted.filter((s) => SUCCESS_STATUSES.has(s)).length / counted.length) * 100).toFixed(1)) : 100;

  const recentRuns = await findRunsByJobId({ jobId: job.id, limit: 1, cursor: null });
  const lastRun = recentRuns[0] ?? null;

  return {
    id: job.id,
    name: job.name,
    description: job.description,
    triggerType: job.triggerType,
    schedLabel,
    status: job.status,
    health,
    successRatePct,
    lastRunAt: lastRun?.queuedAt.toISOString() ?? null,
    nextRunAt,
    avgDurationMs: lastRun?.durationMs ? Math.round(lastRun.durationMs) : null,
  };
}

function toJobConfig(job: JobRow): JobConfig {
  return {
    name: job.id,
    description: job.description ?? undefined,
    trigger: { type: job.triggerType, expr: job.cronExpr ?? undefined, tz: job.timezone },
    task: { type: job.taskType, input: job.taskInput as Record<string, unknown> },
    timeoutMs: job.timeoutMs,
    retry: { attempts: job.retryAttempts, backoff: job.retryBackoff, baseMs: job.retryBaseMs },
    idempotency: { keyTemplate: job.idempotencyKeyTemplate, ttlSeconds: job.idempotencyTtlSeconds },
    alert: { afterConsecutiveFailures: job.alertAfterConsecutiveFailures, channel: job.alertChannel ?? undefined },
  };
}

export async function listJobs(filter?: { status?: 'active' | 'paused' }): Promise<JobSummary[]> {
  const jobs = await findAllJobs(filter);
  return Promise.all(jobs.map(toJobSummary));
}

export async function getJobDetail(id: string): Promise<JobDetail> {
  const job = await findJobById(id);
  if (!job) {
    throw new AppError({ code: 'JOB_NOT_FOUND', message: `No job with id "${id}" was found.`, statusCode: 404 });
  }
  const summary = await toJobSummary(job);
  return { ...summary, config: toJobConfig(job) };
}
