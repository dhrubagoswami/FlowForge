import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error.ts';
import { slotTimeFromSchedulerJobId } from './schedule-tick.service.ts';

const findJobByIdMock = vi.fn();
const enqueueRunMock = vi.fn();

vi.mock('../repositories/job.repository.ts', () => ({ findJobById: (...args: unknown[]) => findJobByIdMock(...args) }));
vi.mock('./enqueue.service.ts', () => ({ enqueueRun: (...args: unknown[]) => enqueueRunMock(...args) }));
vi.mock('../lib/logger.ts', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { handleScheduleTick } = await import('./schedule-tick.service.ts');

describe('slotTimeFromSchedulerJobId', () => {
  it('recovers the slot timestamp from a BullMQ scheduler job id', () => {
    const result = slotTimeFromSchedulerJobId('repeat:postgres-nightly-backup:1786439600000', new Date(0));
    expect(result.getTime()).toBe(1786439600000);
  });

  it('handles a scheduler id whose key itself contains colons', () => {
    const result = slotTimeFromSchedulerJobId('repeat:some:weird:key:1700000000000', new Date(0));
    expect(result.getTime()).toBe(1700000000000);
  });

  it('falls back when the id does not match the expected shape', () => {
    const fallback = new Date('2026-01-01T00:00:00.000Z');
    expect(slotTimeFromSchedulerJobId('not-a-scheduler-id', fallback)).toBe(fallback);
    expect(slotTimeFromSchedulerJobId(undefined, fallback)).toBe(fallback);
  });
});

describe('handleScheduleTick', () => {
  it('drops the tick when the job no longer exists (or is soft-deleted, since findJobById already excludes those)', async () => {
    findJobByIdMock.mockResolvedValue(null);
    await handleScheduleTick({ jobId: 'gone', schedulerJobId: 'repeat:gone:123', firedAt: new Date() });
    expect(enqueueRunMock).not.toHaveBeenCalled();
  });

  it('skips the tick when the job is not active (e.g. paused between the schedule firing and this tick being processed)', async () => {
    findJobByIdMock.mockResolvedValue({ id: 'job-1', status: 'paused' });
    await handleScheduleTick({ jobId: 'job-1', schedulerJobId: 'repeat:job-1:123', firedAt: new Date() });
    expect(enqueueRunMock).not.toHaveBeenCalled();
  });

  it('enqueues a scheduled run using the slot time recovered from the scheduler job id, not firedAt', async () => {
    findJobByIdMock.mockResolvedValue({ id: 'job-1', status: 'active' });
    enqueueRunMock.mockResolvedValue({ id: 'run-1' });

    await handleScheduleTick({ jobId: 'job-1', schedulerJobId: 'repeat:job-1:1786439600000', firedAt: new Date('2099-01-01T00:00:00.000Z') });

    expect(enqueueRunMock).toHaveBeenCalledWith(
      { id: 'job-1', status: 'active' },
      { triggerSource: 'schedule', scheduledAt: new Date(1786439600000) },
    );
  });

  it('re-throws so BullMQ retries the tick if enqueueing fails (e.g. a transient DB error)', async () => {
    findJobByIdMock.mockResolvedValue({ id: 'job-1', status: 'active' });
    enqueueRunMock.mockRejectedValue(new AppError({ code: 'BOOM', message: 'db down', statusCode: 500 }));

    await expect(handleScheduleTick({ jobId: 'job-1', schedulerJobId: 'repeat:job-1:123', firedAt: new Date() })).rejects.toThrow('db down');
  });
});
