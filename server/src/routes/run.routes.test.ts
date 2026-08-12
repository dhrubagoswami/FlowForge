// Route-level tests for /api/runs — mocks run.service.ts, which already has its own unit test
// coverage for pagination/cursor/timestamp logic. This file only proves request parsing, status
// codes, and error-code mapping.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-support/build-test-app.ts';
import { AppError } from '../lib/app-error.ts';

const listRecentRunsMock = vi.fn();
const getRunMock = vi.fn();
const getRunLogsMock = vi.fn();

vi.mock('../services/run.service.ts', () => ({
  listRecentRuns: (...args: unknown[]) => listRecentRunsMock(...args),
  getRun: (...args: unknown[]) => getRunMock(...args),
  getRunLogs: (...args: unknown[]) => getRunLogsMock(...args),
}));

const { registerRunRoutes } = await import('./run.routes.ts');

function runSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    jobId: 'competitor-pricing-scrape',
    jobName: 'Competitor Pricing Scrape',
    status: 'succeeded' as const,
    triggerSource: 'schedule' as const,
    attempt: 1,
    maxAttempts: 3,
    workerId: 'worker-01',
    durationMs: 1200,
    queuedAt: '2026-08-12T00:00:00.000Z',
    startedAt: '2026-08-12T00:00:01.000Z',
    finishedAt: '2026-08-12T00:00:02.200Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/runs', () => {
  it('returns 200 with the recent run list on the happy path', async () => {
    listRecentRunsMock.mockResolvedValue([runSummary()]);
    const app = await buildTestApp(registerRunRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/runs' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([runSummary()]);
    expect(listRecentRunsMock).toHaveBeenCalledWith({ limit: undefined, status: undefined });
  });

  it('passes limit and status through to the service', async () => {
    listRecentRunsMock.mockResolvedValue([]);
    const app = await buildTestApp(registerRunRoutes);

    await app.inject({ method: 'GET', url: '/api/runs?limit=10&status=failed' });

    expect(listRecentRunsMock).toHaveBeenCalledWith({ limit: 10, status: 'failed' });
  });

  it('returns a 400 validation error when limit exceeds the max', async () => {
    const app = await buildTestApp(registerRunRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/runs?limit=101' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(listRecentRunsMock).not.toHaveBeenCalled();
  });

  it('returns a 400 validation error for an unrecognized status value', async () => {
    const app = await buildTestApp(registerRunRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/runs?status=not-a-real-status' });

    expect(res.statusCode).toBe(400);
    expect(listRecentRunsMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/runs/:id', () => {
  it('returns 200 with the run on the happy path', async () => {
    getRunMock.mockResolvedValue(runSummary());
    const app = await buildTestApp(registerRunRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/runs/run-1' });

    expect(res.statusCode).toBe(200);
    expect(getRunMock).toHaveBeenCalledWith('run-1');
  });

  it('returns 404 with RUN_NOT_FOUND when the service throws it', async () => {
    getRunMock.mockRejectedValue(new AppError({ code: 'RUN_NOT_FOUND', message: 'No run with id "ghost" was found.', statusCode: 404 }));
    const app = await buildTestApp(registerRunRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/runs/ghost' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('RUN_NOT_FOUND');
  });
});

describe('GET /api/runs/:id/logs', () => {
  it('returns 200 with the log lines on the happy path', async () => {
    getRunLogsMock.mockResolvedValue([{ id: 1, ts: '2026-08-12T00:00:00.000Z', level: 'info', message: 'started' }]);
    const app = await buildTestApp(registerRunRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/runs/run-1/logs' });

    expect(res.statusCode).toBe(200);
    expect(getRunLogsMock).toHaveBeenCalledWith({ runId: 'run-1', since: undefined });
  });

  it('passes the since query param through to the service', async () => {
    getRunLogsMock.mockResolvedValue([]);
    const app = await buildTestApp(registerRunRoutes);

    await app.inject({ method: 'GET', url: '/api/runs/run-1/logs?since=2026-08-12T00:00:00.000Z' });

    expect(getRunLogsMock).toHaveBeenCalledWith({ runId: 'run-1', since: '2026-08-12T00:00:00.000Z' });
  });

  it('returns a 400 with INVALID_SINCE when the service rejects a malformed timestamp', async () => {
    getRunLogsMock.mockRejectedValue(new AppError({ code: 'INVALID_SINCE', message: 'bad timestamp', statusCode: 400 }));
    const app = await buildTestApp(registerRunRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/runs/run-1/logs?since=not-a-date' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_SINCE');
  });
});
