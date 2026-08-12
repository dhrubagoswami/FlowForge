import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-support/build-test-app.ts';

const getFailureClustersMock = vi.fn();

vi.mock('../services/failure-cluster.service.ts', () => ({ getFailureClusters: (...args: unknown[]) => getFailureClustersMock(...args) }));

const { registerFailureRoutes } = await import('./failure.routes.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/failures/clusters', () => {
  it('returns 200 with clusters on the happy path, using the default windowHours', async () => {
    getFailureClustersMock.mockResolvedValue([{ errorType: 'rate_limit', count: 5, sampleMessage: 'too many requests', jobIds: ['a'] }]);
    const app = await buildTestApp(registerFailureRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/failures/clusters' });

    expect(res.statusCode).toBe(200);
    expect(getFailureClustersMock).toHaveBeenCalledWith({ windowHours: undefined, jobId: undefined });
  });

  it('passes windowHours and jobId through to the service', async () => {
    getFailureClustersMock.mockResolvedValue([]);
    const app = await buildTestApp(registerFailureRoutes);

    await app.inject({ method: 'GET', url: '/api/failures/clusters?windowHours=168&jobId=docs-embedding-index' });

    expect(getFailureClustersMock).toHaveBeenCalledWith({ windowHours: 168, jobId: 'docs-embedding-index' });
  });

  it('returns a 400 validation error when windowHours exceeds the 720 cap', async () => {
    const app = await buildTestApp(registerFailureRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/failures/clusters?windowHours=721' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(getFailureClustersMock).not.toHaveBeenCalled();
  });

  it('returns a 400 validation error when windowHours is below the minimum', async () => {
    const app = await buildTestApp(registerFailureRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/failures/clusters?windowHours=0' });

    expect(res.statusCode).toBe(400);
    expect(getFailureClustersMock).not.toHaveBeenCalled();
  });
});
