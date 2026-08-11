import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobConfig } from '@flowforge/shared';
import { AppError } from '../lib/app-error.ts';

const findJobByIdMock = vi.fn();
const findAllJobsMock = vi.fn();
const insertJobMock = vi.fn();
const updateJobRowMock = vi.fn();
const softDeleteJobMock = vi.fn();
const findLastNRunStatusesByJobIdMock = vi.fn();
const findRunsByJobIdMock = vi.fn();
const reconcileJobMock = vi.fn();

vi.mock('../repositories/job.repository.ts', () => ({
  findJobById: (...args: unknown[]) => findJobByIdMock(...args),
  findAllJobs: (...args: unknown[]) => findAllJobsMock(...args),
  insertJob: (...args: unknown[]) => insertJobMock(...args),
  updateJob: (...args: unknown[]) => updateJobRowMock(...args),
  softDeleteJob: (...args: unknown[]) => softDeleteJobMock(...args),
}));
vi.mock('../repositories/run.repository.ts', () => ({
  findLastNRunStatusesByJobId: (...args: unknown[]) => findLastNRunStatusesByJobIdMock(...args),
  findRunsByJobId: (...args: unknown[]) => findRunsByJobIdMock(...args),
}));
vi.mock('../queue/scheduler.ts', () => ({ reconcileJob: (...args: unknown[]) => reconcileJobMock(...args) }));

const { createJob, updateJob, pauseJob, resumeJob, deleteJob } = await import('./job.service.ts');

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'nightly-backup',
    name: 'Nightly Backup',
    description: null,
    triggerType: 'cron' as const,
    cronExpr: '0 2 * * *',
    timezone: 'UTC',
    taskType: 'simulate' as const,
    taskInput: { durationMs: 1000, failureMode: 'none' },
    status: 'active' as const,
    health: 'healthy' as const,
    timeoutMs: 120000,
    retryAttempts: 3,
    retryBackoff: 'exponential' as const,
    retryBaseMs: 30000,
    idempotencyKeyTemplate: '{{job}}:{{scheduled_at}}',
    idempotencyTtlSeconds: 86400,
    alertAfterConsecutiveFailures: 3,
    alertChannel: null,
    createdBy: 'user',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function validConfig(overrides: Partial<JobConfig> = {}): JobConfig {
  return {
    name: 'nightly-backup',
    trigger: { type: 'cron', expr: '0 2 * * *', tz: 'UTC' },
    task: { type: 'simulate', input: { durationMs: 1000, failureMode: 'none' } },
    timeoutMs: 120000,
    retry: { attempts: 3, backoff: 'exponential', baseMs: 30000 },
    idempotency: { keyTemplate: '{{job}}:{{scheduled_at}}', ttlSeconds: 86400 },
    alert: { afterConsecutiveFailures: 3 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findLastNRunStatusesByJobIdMock.mockResolvedValue([]);
  findRunsByJobIdMock.mockResolvedValue([]);
});

describe('createJob', () => {
  it('throws JOB_ALREADY_EXISTS (409) when a job with the same id already exists', async () => {
    findJobByIdMock.mockResolvedValue(jobRow());
    await expect(createJob(validConfig())).rejects.toMatchObject({ code: 'JOB_ALREADY_EXISTS', statusCode: 409 } satisfies Partial<AppError>);
    expect(insertJobMock).not.toHaveBeenCalled();
  });

  it('inserts the job and reconciles its schedule', async () => {
    findJobByIdMock.mockResolvedValueOnce(null).mockResolvedValueOnce(jobRow());
    insertJobMock.mockResolvedValue(jobRow());
    findLastNRunStatusesByJobIdMock.mockResolvedValue([]);
    findRunsByJobIdMock.mockResolvedValue([]);

    const result = await createJob(validConfig());

    expect(insertJobMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'nightly-backup', createdBy: 'user' }));
    expect(reconcileJobMock).toHaveBeenCalledWith(jobRow());
    expect(result.id).toBe('nightly-backup');
  });
});

describe('updateJob', () => {
  it('throws JOB_NOT_FOUND (404) when the job does not exist', async () => {
    findJobByIdMock.mockResolvedValue(null);
    await expect(updateJob('missing', { timeoutMs: 5000 })).rejects.toMatchObject({ code: 'JOB_NOT_FOUND', statusCode: 404 } satisfies Partial<AppError>);
  });

  it('merges only the patched fields, leaving everything else at its current value', async () => {
    const existing = jobRow();
    findJobByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(jobRow({ timeoutMs: 5000 }));
    updateJobRowMock.mockResolvedValue(jobRow({ timeoutMs: 5000 }));

    await updateJob('nightly-backup', { timeoutMs: 5000 });

    expect(updateJobRowMock).toHaveBeenCalledWith(
      'nightly-backup',
      expect.objectContaining({
        timeoutMs: 5000,
        // unrelated fields carried through unchanged from the existing row
        retryAttempts: 3,
        idempotencyKeyTemplate: '{{job}}:{{scheduled_at}}',
      }),
    );
  });

  it('deep-merges a partial nested object (e.g. only retry.baseMs) without dropping its siblings', async () => {
    const existing = jobRow();
    findJobByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(jobRow({ retryBaseMs: 90000 }));
    updateJobRowMock.mockResolvedValue(jobRow({ retryBaseMs: 90000 }));

    await updateJob('nightly-backup', { retry: { baseMs: 90000 } });

    expect(updateJobRowMock).toHaveBeenCalledWith(
      'nightly-backup',
      expect.objectContaining({ retryBaseMs: 90000, retryAttempts: 3, retryBackoff: 'exponential' }),
    );
  });

  it('rejects a merged whole that fails full JobConfig validation (e.g. timeoutMs out of bounds)', async () => {
    findJobByIdMock.mockResolvedValue(jobRow());
    await expect(updateJob('nightly-backup', { timeoutMs: 999999999 })).rejects.toThrow();
    expect(updateJobRowMock).not.toHaveBeenCalled();
  });

  it('reconciles the schedule after a successful update', async () => {
    findJobByIdMock.mockResolvedValueOnce(jobRow()).mockResolvedValueOnce(jobRow());
    updateJobRowMock.mockResolvedValue(jobRow());

    await updateJob('nightly-backup', { description: 'updated' });

    expect(reconcileJobMock).toHaveBeenCalledWith(jobRow());
  });
});

describe('pauseJob / resumeJob', () => {
  it('pauseJob sets status to paused and reconciles (removing the schedule)', async () => {
    findJobByIdMock.mockResolvedValueOnce(jobRow()).mockResolvedValueOnce(jobRow({ status: 'paused' }));
    updateJobRowMock.mockResolvedValue(jobRow({ status: 'paused' }));

    await pauseJob('nightly-backup');

    expect(updateJobRowMock).toHaveBeenCalledWith('nightly-backup', { status: 'paused' });
    expect(reconcileJobMock).toHaveBeenCalledWith(jobRow({ status: 'paused' }));
  });

  it('resumeJob sets status to active and reconciles (re-adding the schedule)', async () => {
    findJobByIdMock.mockResolvedValueOnce(jobRow({ status: 'paused' })).mockResolvedValueOnce(jobRow({ status: 'active' }));
    updateJobRowMock.mockResolvedValue(jobRow({ status: 'active' }));

    await resumeJob('nightly-backup');

    expect(updateJobRowMock).toHaveBeenCalledWith('nightly-backup', { status: 'active' });
    expect(reconcileJobMock).toHaveBeenCalledWith(jobRow({ status: 'active' }));
  });
});

describe('deleteJob', () => {
  it('throws JOB_NOT_FOUND (404) when the job does not exist', async () => {
    findJobByIdMock.mockResolvedValue(null);
    await expect(deleteJob('missing')).rejects.toMatchObject({ code: 'JOB_NOT_FOUND', statusCode: 404 } satisfies Partial<AppError>);
  });

  it('soft-deletes (never hard-deletes) and reconciles the schedule away', async () => {
    const deletedRow = jobRow({ deletedAt: new Date('2026-08-11T00:00:00.000Z') });
    findJobByIdMock.mockResolvedValue(jobRow());
    softDeleteJobMock.mockResolvedValue(deletedRow);

    await deleteJob('nightly-backup');

    expect(softDeleteJobMock).toHaveBeenCalledWith('nightly-backup');
    expect(reconcileJobMock).toHaveBeenCalledWith(deletedRow);
  });
});
