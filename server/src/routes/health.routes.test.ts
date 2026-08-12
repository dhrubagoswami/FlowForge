import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-support/build-test-app.ts';

const getHealthStatusMock = vi.fn();

vi.mock('../services/health.service.ts', () => ({ getHealthStatus: (...args: unknown[]) => getHealthStatusMock(...args) }));

const { registerHealthRoutes } = await import('./health.routes.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('returns 200 when db and redis are both healthy', async () => {
    getHealthStatusMock.mockResolvedValue({ ok: true, db: { ok: true }, redis: { ok: true } });
    const app = await buildTestApp(registerHealthRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('returns 503 when the database is unreachable', async () => {
    getHealthStatusMock.mockResolvedValue({ ok: false, db: { ok: false, error: 'connection refused' }, redis: { ok: true } });
    const app = await buildTestApp(registerHealthRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(503);
    expect(res.json().db.ok).toBe(false);
  });
});
