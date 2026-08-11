// Business rules for jobs: schedule labelling, next-run computation, create/update/pause/resume/
// delete, and assembling the API-facing job shapes from repository rows. Health derivation itself
// lives in @flowforge/shared (job-health.rule.ts).
import { deriveJobHealth, jobConfigSchema, JOB_HEALTH_SAMPLE_SIZE, SUCCESS_RATE_COUNTED_STATUSES, SUCCESS_RATE_SUCCESS_STATUSES } from '@flowforge/shared';
import type { JobConfig, JobDetail, JobSummary, RunStatus, UpdateJobRequest } from '@flowforge/shared';
import { AppError } from '../lib/app-error.ts';
import { cronToLabel } from '../lib/cron-label.util.ts';
import { nextCronOccurrence } from '../lib/cron-next-run.util.ts';
import { findAllJobs, findJobById, insertJob, softDeleteJob, updateJob as updateJobRow, type JobRow, type NewJobRow } from '../repositories/job.repository.ts';
import { findLastNRunStatusesByJobId, findRunsByJobId } from '../repositories/run.repository.ts';
import { reconcileJob } from '../queue/scheduler.ts';

const SUCCESS_STATUSES: ReadonlySet<RunStatus> = new Set(SUCCESS_RATE_SUCCESS_STATUSES);
const COUNTED_STATUSES: ReadonlySet<RunStatus> = new Set(SUCCESS_RATE_COUNTED_STATUSES);

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

function fromJobConfig(config: JobConfig, createdBy: string): NewJobRow {
  return {
    id: config.name,
    name: config.name,
    description: config.description ?? null,
    triggerType: config.trigger.type,
    cronExpr: config.trigger.expr ?? null,
    timezone: config.trigger.tz,
    taskType: config.task.type,
    taskInput: config.task.input,
    timeoutMs: config.timeoutMs,
    retryAttempts: config.retry.attempts,
    retryBackoff: config.retry.backoff,
    retryBaseMs: config.retry.baseMs,
    idempotencyKeyTemplate: config.idempotency.keyTemplate,
    idempotencyTtlSeconds: config.idempotency.ttlSeconds,
    alertAfterConsecutiveFailures: config.alert.afterConsecutiveFailures,
    alertChannel: config.alert.channel ?? null,
    createdBy,
  };
}

/** Deep-merges an UpdateJobRequest patch onto an existing job's config — only fields present in the patch (at any nesting level) override the current value. */
function mergeJobConfig(current: JobConfig, patch: UpdateJobRequest): JobConfig {
  return {
    name: current.name,
    description: patch.description ?? current.description,
    trigger: { ...current.trigger, ...patch.trigger },
    task: { ...current.task, ...patch.task },
    timeoutMs: patch.timeoutMs ?? current.timeoutMs,
    retry: { ...current.retry, ...patch.retry },
    idempotency: { ...current.idempotency, ...patch.idempotency },
    alert: { ...current.alert, ...patch.alert },
  };
}

export async function createJob(config: JobConfig): Promise<JobDetail> {
  const existing = await findJobById(config.name);
  if (existing) {
    throw new AppError({ code: 'JOB_ALREADY_EXISTS', message: `A job with id "${config.name}" already exists.`, statusCode: 409 });
  }

  const row = await insertJob(fromJobConfig(config, 'user'));
  await reconcileJob(row);
  return getJobDetail(row.id);
}

export async function updateJob(id: string, patch: UpdateJobRequest): Promise<JobDetail> {
  const existing = await findJobById(id);
  if (!existing) {
    throw new AppError({ code: 'JOB_NOT_FOUND', message: `No job with id "${id}" was found.`, statusCode: 404 });
  }

  const mergedConfig = mergeJobConfig(toJobConfig(existing), patch);
  const validated = jobConfigSchema.parse({ ...mergedConfig, name: existing.id });

  const row = await updateJobRow(id, fromJobConfig(validated, existing.createdBy));
  if (!row) {
    throw new AppError({ code: 'JOB_NOT_FOUND', message: `No job with id "${id}" was found.`, statusCode: 404 });
  }
  await reconcileJob(row);
  return getJobDetail(row.id);
}

async function setJobStatus(id: string, status: 'active' | 'paused'): Promise<JobDetail> {
  const existing = await findJobById(id);
  if (!existing) {
    throw new AppError({ code: 'JOB_NOT_FOUND', message: `No job with id "${id}" was found.`, statusCode: 404 });
  }

  const row = await updateJobRow(id, { status });
  if (!row) {
    throw new AppError({ code: 'JOB_NOT_FOUND', message: `No job with id "${id}" was found.`, statusCode: 404 });
  }
  await reconcileJob(row);
  return getJobDetail(row.id);
}

export const pauseJob = (id: string): Promise<JobDetail> => setJobStatus(id, 'paused');
export const resumeJob = (id: string): Promise<JobDetail> => setJobStatus(id, 'active');

export async function deleteJob(id: string): Promise<void> {
  const existing = await findJobById(id);
  if (!existing) {
    throw new AppError({ code: 'JOB_NOT_FOUND', message: `No job with id "${id}" was found.`, statusCode: 404 });
  }

  const row = await softDeleteJob(id);
  if (!row) {
    throw new AppError({ code: 'JOB_NOT_FOUND', message: `No job with id "${id}" was found.`, statusCode: 404 });
  }
  // Existing queued/running runs finish naturally — the job row itself is a tombstone
  // (deleted_at set, never hard-deleted), so a worker mid-run can still read its task config.
  await reconcileJob(row);
}
