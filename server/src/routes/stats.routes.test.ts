import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-support/build-test-app.ts';

const getStatsOverviewMock = vi.fn();

vi.mock('../services/stats.service.ts', () => ({ getStatsOverview: (...args: unknown[]) => getStatsOverviewMock(...args) }));

const { registerStatsRoutes } = await import('./stats.routes.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/stats/overview', () => {
  it('returns 200 with the overview payload on the happy path', async () => {
    const overview = { runsLast24h: 100, successRatePct: 95.5, queueDepth: 2, p95WaitMs: 500, activity: [], topWorkers: [], recentRuns: [] };
    getStatsOverviewMock.mockResolvedValue(overview);
    const app = await buildTestApp(registerStatsRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/stats/overview' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(overview);
    expect(getStatsOverviewMock).toHaveBeenCalledTimes(1);
  });
});
