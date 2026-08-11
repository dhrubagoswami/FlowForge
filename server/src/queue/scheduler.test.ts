import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldBeScheduled } from './scheduler.ts';

describe('shouldBeScheduled', () => {
  const base = { status: 'active' as const, triggerType: 'cron' as const, cronExpr: '* * * * *', deletedAt: null };

  it('is true for an active, non-deleted cron job with a cron expression', () => {
    expect(shouldBeScheduled(base)).toBe(true);
  });

  it('is false when the job is paused', () => {
    expect(shouldBeScheduled({ ...base, status: 'paused' })).toBe(false);
  });

  it('is false when the job is soft-deleted, regardless of status', () => {
    expect(shouldBeScheduled({ ...base, deletedAt: new Date() })).toBe(false);
  });

  it('is false for a webhook-triggered job', () => {
    expect(shouldBeScheduled({ ...base, triggerType: 'webhook', cronExpr: null })).toBe(false);
  });

  it('is false for a manual-triggered job', () => {
    expect(shouldBeScheduled({ ...base, triggerType: 'manual', cronExpr: null })).toBe(false);
  });

  it('is false for a cron-type job with no cron expression set', () => {
    expect(shouldBeScheduled({ ...base, cronExpr: null })).toBe(false);
  });
});

const removeJobSchedulerMock = vi.fn();
const upsertJobSchedulerMock = vi.fn();
const getJobSchedulersMock = vi.fn();
const findAllJobsMock = vi.fn();

vi.mock('./schedule-tick.queue.ts', () => ({
  scheduleTickQueue: {
    removeJobScheduler: (...args: unknown[]) => removeJobSchedulerMock(...args),
    upsertJobScheduler: (...args: unknown[]) => upsertJobSchedulerMock(...args),
    getJobSchedulers: (...args: unknown[]) => getJobSchedulersMock(...args),
  },
}));
vi.mock('../repositories/job.repository.ts', () => ({ findAllJobs: (...args: unknown[]) => findAllJobsMock(...args) }));
vi.mock('../lib/logger.ts', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { reconcileJob, reconcileAllSchedules } = await import('./scheduler.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

function cronJob(overrides: Record<string, unknown> = {}) {
  return { id: 'nightly-backup', status: 'active' as const, triggerType: 'cron' as const, cronExpr: '0 2 * * *', timezone: 'UTC', deletedAt: null as Date | null, ...overrides };
}

describe('reconcileJob', () => {
  it('always removes first, then re-adds only if the job should still be scheduled (remove-then-upsert, not diff-first)', async () => {
    await reconcileJob(cronJob());
    expect(removeJobSchedulerMock).toHaveBeenCalledWith('nightly-backup');
    expect(upsertJobSchedulerMock).toHaveBeenCalledWith('nightly-backup', { pattern: '0 2 * * *', tz: 'UTC' }, expect.objectContaining({ data: { jobId: 'nightly-backup' } }));
  });

  it('removes but does not re-add for a paused job', async () => {
    await reconcileJob(cronJob({ status: 'paused' }));
    expect(removeJobSchedulerMock).toHaveBeenCalledWith('nightly-backup');
    expect(upsertJobSchedulerMock).not.toHaveBeenCalled();
  });

  it('removes but does not re-add for a soft-deleted job', async () => {
    await reconcileJob(cronJob({ deletedAt: new Date() }));
    expect(upsertJobSchedulerMock).not.toHaveBeenCalled();
  });
});

describe('reconcileAllSchedules', () => {
  it('removes a scheduler whose job is no longer active/cron/undeleted, and adds one for a desired job missing a scheduler', async () => {
    findAllJobsMock.mockResolvedValue([cronJob({ id: 'wants-schedule' })]);
    getJobSchedulersMock.mockResolvedValue([{ id: 'stale-job', key: 'stale-job' }]);

    const result = await reconcileAllSchedules();

    expect(removeJobSchedulerMock).toHaveBeenCalledWith('stale-job');
    expect(upsertJobSchedulerMock).toHaveBeenCalledWith('wants-schedule', expect.anything(), expect.anything());
    expect(result).toEqual({ added: 1, removed: 1, unchanged: 0 });
  });

  it('reports a job whose scheduler already existed as unchanged, not added', async () => {
    findAllJobsMock.mockResolvedValue([cronJob({ id: 'already-scheduled' })]);
    getJobSchedulersMock.mockResolvedValue([{ id: 'already-scheduled', key: 'already-scheduled' }]);

    const result = await reconcileAllSchedules();

    expect(result).toEqual({ added: 0, removed: 0, unchanged: 1 });
  });
});
