// Route-level tests: request parsing, status codes, and error-code mapping for every /api/jobs
// endpoint. Mocks the service layer (not repositories) — job.service.ts/enqueue.service.ts/
// run.service.ts already have their own unit tests covering the business logic inside them; this
// file only proves a request reaches the right service call and the response/error is shaped
// correctly, which is what actually varies at the route layer.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-support/build-test-app.ts';
import { AppError } from '../lib/app-error.ts';

const listJobsMock = vi.fn();
const getJobDetailMock = vi.fn();
const createJobMock = vi.fn();
const updateJobMock = vi.fn();
const pauseJobMock = vi.fn();
const resumeJobMock = vi.fn();
const deleteJobMock = vi.fn();
const triggerJobMock = vi.fn();
const listRunsForJobMock = vi.fn();

vi.mock('../services/job.service.ts', () => ({
  listJobs: (...args: unknown[]) => listJobsMock(...args),
  getJobDetail: (...args: unknown[]) => getJobDetailMock(...args),
  createJob: (...args: unknown[]) => createJobMock(...args),
  updateJob: (...args: unknown[]) => updateJobMock(...args),
  pauseJob: (...args: unknown[]) => pauseJobMock(...args),
  resumeJob: (...args: unknown[]) => resumeJobMock(...args),
  deleteJob: (...args: unknown[]) => deleteJobMock(...args),
}));
vi.mock('../services/enqueue.service.ts', () => ({ triggerJob: (...args: unknown[]) => triggerJobMock(...args) }));
vi.mock('../services/run.service.ts', () => ({ listRunsForJob: (...args: unknown[]) => listRunsForJobMock(...args) }));

const { registerJobRoutes } = await import('./job.routes.ts');

function jobSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'competitor-pricing-scrape',
    name: 'Competitor Pricing Scrape',
    description: null,
    triggerType: 'cron' as const,
    schedLabel: 'Daily at 9am UTC',
    status: 'active' as const,
    health: 'healthy' as const,
    successRatePct: 100,
    lastRunAt: null,
    nextRunAt: null,
    avgDurationMs: null,
    ...overrides,
  };
}

function validJobConfig(overrides: Record<string, unknown> = {}) {
  return {
    name: 'competitor-pricing-scrape',
    trigger: { type: 'cron', expr: '0 9 * * *', tz: 'UTC' },
    task: { type: 'http.check', input: { url: 'https://example.com' } },
    timeoutMs: 120000,
    retry: { attempts: 3, backoff: 'exponential', baseMs: 30000 },
    idempotency: { keyTemplate: '{{job}}:{{scheduled_at}}', ttlSeconds: 86400 },
    alert: { afterConsecutiveFailures: 3, channel: 'slack#ops' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/jobs', () => {
  it('returns 200 with the job list on the happy path', async () => {
    listJobsMock.mockResolvedValue([jobSummary()]);
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/jobs' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([jobSummary()]);
    expect(listJobsMock).toHaveBeenCalledWith(undefined);
  });

  it('passes a status filter through to the service', async () => {
    listJobsMock.mockResolvedValue([]);
    const app = await buildTestApp(registerJobRoutes);

    await app.inject({ method: 'GET', url: '/api/jobs?status=paused' });

    expect(listJobsMock).toHaveBeenCalledWith({ status: 'paused' });
  });

  it('returns a 400 validation error for an invalid status value', async () => {
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/jobs?status=not-a-real-status' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(listJobsMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns 200 with the job detail on the happy path', async () => {
    getJobDetailMock.mockResolvedValue({ ...jobSummary(), config: validJobConfig() });
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/jobs/competitor-pricing-scrape' });

    expect(res.statusCode).toBe(200);
    expect(getJobDetailMock).toHaveBeenCalledWith('competitor-pricing-scrape');
  });

  it('returns 404 with JOB_NOT_FOUND when the service throws it', async () => {
    getJobDetailMock.mockRejectedValue(new AppError({ code: 'JOB_NOT_FOUND', message: 'No job with id "ghost" was found.', statusCode: 404 }));
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/jobs/ghost' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('JOB_NOT_FOUND');
  });
});

describe('GET /api/jobs/:id/runs', () => {
  it('returns 200 with a paged run list on the happy path', async () => {
    listRunsForJobMock.mockResolvedValue({ runs: [], nextCursor: null });
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/jobs/competitor-pricing-scrape/runs' });

    expect(res.statusCode).toBe(200);
    expect(listRunsForJobMock).toHaveBeenCalledWith({ jobId: 'competitor-pricing-scrape', limit: undefined, cursor: undefined });
  });

  it('passes limit and cursor through to the service', async () => {
    listRunsForJobMock.mockResolvedValue({ runs: [], nextCursor: null });
    const app = await buildTestApp(registerJobRoutes);

    await app.inject({ method: 'GET', url: '/api/jobs/competitor-pricing-scrape/runs?limit=5&cursor=abc' });

    expect(listRunsForJobMock).toHaveBeenCalledWith({ jobId: 'competitor-pricing-scrape', limit: 5, cursor: 'abc' });
  });

  it('returns a 400 validation error when limit is out of bounds', async () => {
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/jobs/competitor-pricing-scrape/runs?limit=101' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/jobs/:id/trigger', () => {
  it('returns 202 with the created run on the happy path', async () => {
    triggerJobMock.mockResolvedValue({ id: 'run-1', jobId: 'competitor-pricing-scrape', status: 'queued' });
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs/competitor-pricing-scrape/trigger' });

    expect(res.statusCode).toBe(202);
    expect(triggerJobMock).toHaveBeenCalledWith('competitor-pricing-scrape');
  });

  it('returns 409 with JOB_PAUSED when triggering a paused job', async () => {
    triggerJobMock.mockRejectedValue(new AppError({ code: 'JOB_PAUSED', message: 'paused', statusCode: 409 }));
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs/paused-job/trigger' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('JOB_PAUSED');
  });

  it('returns 404 with JOB_NOT_FOUND when the job does not exist', async () => {
    triggerJobMock.mockRejectedValue(new AppError({ code: 'JOB_NOT_FOUND', message: 'not found', statusCode: 404 }));
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs/ghost/trigger' });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/jobs', () => {
  it('returns 201 with the created job on the happy path', async () => {
    createJobMock.mockResolvedValue({ ...jobSummary(), config: validJobConfig() });
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: validJobConfig() });

    expect(res.statusCode).toBe(201);
    expect(createJobMock).toHaveBeenCalledWith(validJobConfig());
  });

  it('returns 409 with JOB_ALREADY_EXISTS for a duplicate id', async () => {
    createJobMock.mockRejectedValue(new AppError({ code: 'JOB_ALREADY_EXISTS', message: 'exists', statusCode: 409 }));
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: validJobConfig() });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('JOB_ALREADY_EXISTS');
  });

  it('returns a 400 validation error for a malformed config (missing required field)', async () => {
    const app = await buildTestApp(registerJobRoutes);
    const { trigger: _trigger, ...invalidConfig } = validJobConfig() as Record<string, unknown>;

    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: invalidConfig });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(createJobMock).not.toHaveBeenCalled();
  });

  it('returns a 400 validation error for a non-kebab-case name', async () => {
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: validJobConfig({ name: 'Not Kebab Case' }) });

    expect(res.statusCode).toBe(400);
    expect(createJobMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/jobs/:id', () => {
  it('returns 200 with the updated job on the happy path', async () => {
    updateJobMock.mockResolvedValue({ ...jobSummary(), config: validJobConfig() });
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'PATCH', url: '/api/jobs/competitor-pricing-scrape', payload: { timeoutMs: 60000 } });

    expect(res.statusCode).toBe(200);
    expect(updateJobMock).toHaveBeenCalledWith('competitor-pricing-scrape', { timeoutMs: 60000 });
  });

  it('returns 404 with JOB_NOT_FOUND for a nonexistent job', async () => {
    updateJobMock.mockRejectedValue(new AppError({ code: 'JOB_NOT_FOUND', message: 'not found', statusCode: 404 }));
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'PATCH', url: '/api/jobs/ghost', payload: { timeoutMs: 60000 } });

    expect(res.statusCode).toBe(404);
  });

  it('returns a 400 validation error for an unknown field (strict schema)', async () => {
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'PATCH', url: '/api/jobs/competitor-pricing-scrape', payload: { notARealField: true } });

    expect(res.statusCode).toBe(400);
    expect(updateJobMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/jobs/:id/pause', () => {
  it('returns 200 with the paused job on the happy path', async () => {
    pauseJobMock.mockResolvedValue({ ...jobSummary({ status: 'paused' }), config: validJobConfig() });
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs/competitor-pricing-scrape/pause' });

    expect(res.statusCode).toBe(200);
    expect(pauseJobMock).toHaveBeenCalledWith('competitor-pricing-scrape');
  });

  it('returns 404 with JOB_NOT_FOUND for a nonexistent job', async () => {
    pauseJobMock.mockRejectedValue(new AppError({ code: 'JOB_NOT_FOUND', message: 'not found', statusCode: 404 }));
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs/ghost/pause' });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/jobs/:id/resume', () => {
  it('returns 200 with the resumed job on the happy path', async () => {
    resumeJobMock.mockResolvedValue({ ...jobSummary(), config: validJobConfig() });
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs/competitor-pricing-scrape/resume' });

    expect(res.statusCode).toBe(200);
    expect(resumeJobMock).toHaveBeenCalledWith('competitor-pricing-scrape');
  });

  it('returns 404 with JOB_NOT_FOUND for a nonexistent job', async () => {
    resumeJobMock.mockRejectedValue(new AppError({ code: 'JOB_NOT_FOUND', message: 'not found', statusCode: 404 }));
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/jobs/ghost/resume' });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/jobs/:id', () => {
  it('returns 204 with no body on the happy path', async () => {
    deleteJobMock.mockResolvedValue(undefined);
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'DELETE', url: '/api/jobs/competitor-pricing-scrape' });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(deleteJobMock).toHaveBeenCalledWith('competitor-pricing-scrape');
  });

  it('returns 404 with JOB_NOT_FOUND for a nonexistent job', async () => {
    deleteJobMock.mockRejectedValue(new AppError({ code: 'JOB_NOT_FOUND', message: 'not found', statusCode: 404 }));
    const app = await buildTestApp(registerJobRoutes);

    const res = await app.inject({ method: 'DELETE', url: '/api/jobs/ghost' });

    expect(res.statusCode).toBe(404);
  });
});
