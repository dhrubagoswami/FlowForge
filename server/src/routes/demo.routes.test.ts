// Route-level tests for /api/demo/*. Mocks demoModeGuard (has its own dedicated test at
// middleware/demo-mode-guard.test.ts) and demoRateLimit (a real per-IP in-memory limiter,
// module-level state that a file with several requests could otherwise trip) as pass-throughs,
// plus demo.service.ts, which already has its own unit test coverage.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-support/build-test-app.ts';
import { AppError } from '../lib/app-error.ts';

const demoTriggerMock = vi.fn();
const demoBreakMock = vi.fn();
const demoKillWorkerMock = vi.fn();
const demoResetMock = vi.fn();

vi.mock('../middleware/demo-mode-guard.ts', () => ({ demoModeGuard: async () => {} }));
vi.mock('../middleware/rate-limit.ts', () => ({ demoRateLimit: async () => {} }));
vi.mock('../services/demo.service.ts', () => ({
  demoTrigger: (...args: unknown[]) => demoTriggerMock(...args),
  demoBreak: (...args: unknown[]) => demoBreakMock(...args),
  demoKillWorker: (...args: unknown[]) => demoKillWorkerMock(...args),
  demoReset: (...args: unknown[]) => demoResetMock(...args),
}));

const { registerDemoRoutes } = await import('./demo.routes.ts');

function runSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    jobId: 'competitor-pricing-scrape',
    jobName: 'Competitor Pricing Scrape',
    status: 'queued' as const,
    triggerSource: 'demo' as const,
    attempt: 1,
    maxAttempts: 3,
    workerId: null,
    durationMs: null,
    queuedAt: '2026-08-12T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/demo/trigger', () => {
  it('returns 200 with the queued run on the happy path', async () => {
    demoTriggerMock.mockResolvedValue(runSummary());
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/trigger' });

    expect(res.statusCode).toBe(200);
    expect(demoTriggerMock).toHaveBeenCalledTimes(1);
  });

  it('returns 409 with DEMO_JOB_MISSING when the target job is missing', async () => {
    demoTriggerMock.mockRejectedValue(new AppError({ code: 'DEMO_JOB_MISSING', message: 'missing', statusCode: 409 }));
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/trigger' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DEMO_JOB_MISSING');
  });
});

describe('POST /api/demo/break', () => {
  it('returns 200 with the queued run on the happy path', async () => {
    demoBreakMock.mockResolvedValue(runSummary({ jobId: 'stripe-webhook-reconcile', jobName: 'Stripe Webhook Reconcile' }));
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/break' });

    expect(res.statusCode).toBe(200);
    expect(demoBreakMock).toHaveBeenCalledTimes(1);
  });

  it('returns 409 with DEMO_JOB_MISSING when the target job is missing', async () => {
    demoBreakMock.mockRejectedValue(new AppError({ code: 'DEMO_JOB_MISSING', message: 'missing', statusCode: 409 }));
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/break' });

    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/demo/kill-worker', () => {
  it('returns 200 with the drained worker on the happy path', async () => {
    demoKillWorkerMock.mockResolvedValue({
      id: 'worker-01',
      hostname: 'worker-01',
      status: 'draining',
      concurrency: 4,
      inflight: 2,
      lastHeartbeatAt: '2026-08-12T00:00:00.000Z',
    });
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/kill-worker' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('draining');
  });

  it('returns 409 with NO_ONLINE_WORKER when no worker is available to kill', async () => {
    demoKillWorkerMock.mockRejectedValue(new AppError({ code: 'NO_ONLINE_WORKER', message: 'none online', statusCode: 409 }));
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/kill-worker' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NO_ONLINE_WORKER');
  });

  it('returns 404 with WORKER_NOT_FOUND if the picked worker vanished mid-request', async () => {
    demoKillWorkerMock.mockRejectedValue(new AppError({ code: 'WORKER_NOT_FOUND', message: 'gone', statusCode: 404 }));
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/kill-worker' });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/demo/reset', () => {
  it('returns 200 with restoredWorkerIds and the fresh worker list on the happy path', async () => {
    demoResetMock.mockResolvedValue({ restoredWorkerIds: ['worker-01'], workers: [] });
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/reset' });

    expect(res.statusCode).toBe(200);
    expect(res.json().restoredWorkerIds).toEqual(['worker-01']);
  });

  it('returns 200 with an empty restoredWorkerIds when the fleet was already clean', async () => {
    demoResetMock.mockResolvedValue({ restoredWorkerIds: [], workers: [] });
    const app = await buildTestApp(registerDemoRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/demo/reset' });

    expect(res.statusCode).toBe(200);
    expect(res.json().restoredWorkerIds).toEqual([]);
  });
});
