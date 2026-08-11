import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error.ts';

const findJobByIdMock = vi.fn();
const insertQueuedRunMock = vi.fn();
const queueAddMock = vi.fn();

vi.mock('../repositories/job.repository.ts', () => ({ findJobById: (...args: unknown[]) => findJobByIdMock(...args) }));
vi.mock('../repositories/run.repository.ts', () => ({ insertQueuedRun: (...args: unknown[]) => insertQueuedRunMock(...args) }));
vi.mock('../queue/job.queue.ts', () => ({ jobQueue: { add: (...args: unknown[]) => queueAddMock(...args) } }));

const { triggerJob } = await import('./enqueue.service.ts');

function activeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'competitor-pricing-scrape',
    name: 'Competitor Pricing Scrape',
    status: 'active',
    retryAttempts: 3,
    retryBackoff: 'exponential',
    retryBaseMs: 30000,
    idempotencyKeyTemplate: '{{job}}:{{scheduled_at}}',
    taskInput: {},
    ...overrides,
  };
}

describe('triggerJob', () => {
  it('throws JOB_NOT_FOUND (404) when the job does not exist', async () => {
    findJobByIdMock.mockResolvedValue(null);
    await expect(triggerJob('nonexistent')).rejects.toMatchObject({ code: 'JOB_NOT_FOUND', statusCode: 404 } satisfies Partial<AppError>);
  });

  it('throws JOB_PAUSED (409) when the job is paused', async () => {
    findJobByIdMock.mockResolvedValue(activeJob({ status: 'paused' }));
    await expect(triggerJob('churn-model-retrain')).rejects.toMatchObject({ code: 'JOB_PAUSED', statusCode: 409 } satisfies Partial<AppError>);
    expect(insertQueuedRunMock).not.toHaveBeenCalled();
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('inserts a queued run and enqueues it for an active job', async () => {
    findJobByIdMock.mockResolvedValue(activeJob());
    insertQueuedRunMock.mockResolvedValue({
      id: 'run-1',
      jobId: 'competitor-pricing-scrape',
      status: 'queued',
      triggerSource: 'manual',
      attempt: 1,
      maxAttempts: 3,
      workerId: null,
      durationMs: null,
      queuedAt: new Date('2026-08-11T00:00:00.000Z'),
    });

    const result = await triggerJob('competitor-pricing-scrape');

    expect(insertQueuedRunMock).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'competitor-pricing-scrape', triggerSource: 'manual' }));
    expect(queueAddMock).toHaveBeenCalledWith(
      'competitor-pricing-scrape',
      { runId: 'run-1', jobId: 'competitor-pricing-scrape' },
      { jobId: 'run-1', attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
    );
    expect(result).toMatchObject({ id: 'run-1', jobId: 'competitor-pricing-scrape', status: 'queued' });
  });
});
