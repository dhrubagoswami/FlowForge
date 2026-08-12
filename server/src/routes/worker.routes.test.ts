import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-support/build-test-app.ts';

const listWorkersMock = vi.fn();

vi.mock('../services/worker.service.ts', () => ({ listWorkers: (...args: unknown[]) => listWorkersMock(...args) }));

const { registerWorkerRoutes } = await import('./worker.routes.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/workers', () => {
  it('returns 200 with the worker list on the happy path', async () => {
    listWorkersMock.mockResolvedValue([
      { id: 'worker-01', hostname: 'worker-01', status: 'online', concurrency: 4, inflight: 1, lastHeartbeatAt: '2026-08-12T00:00:00.000Z' },
    ]);
    const app = await buildTestApp(registerWorkerRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/workers' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('returns 200 with an empty list when no workers exist', async () => {
    listWorkersMock.mockResolvedValue([]);
    const app = await buildTestApp(registerWorkerRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/workers' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
