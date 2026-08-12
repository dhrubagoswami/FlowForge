// Route-level tests for /api/ai/compose and /api/ai/diagnose. Mocks the AI rate-limit preHandler
// (a real per-IP in-memory limiter, module-level state shared across every test that imports it —
// mocked out here as a pass-through so this file's own request count can't trip it, same reasoning
// as demo.routes.test.ts) and the two AI services, which already have their own unit test coverage.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-support/build-test-app.ts';

const composeJobMock = vi.fn();
const diagnoseFailuresMock = vi.fn();

vi.mock('../middleware/rate-limit.ts', () => ({ aiRateLimit: async () => {} }));
vi.mock('../services/ai-composer.service.ts', () => ({ composeJob: (...args: unknown[]) => composeJobMock(...args) }));
vi.mock('../services/ai-diagnosis.service.ts', () => ({ diagnoseFailures: (...args: unknown[]) => diagnoseFailuresMock(...args) }));

const { registerAiRoutes } = await import('./ai.routes.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/ai/compose', () => {
  it('returns 200 with the composed config on a valid result', async () => {
    composeJobMock.mockResolvedValue({ config: { name: 'demo-job' } });
    const app = await buildTestApp(registerAiRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/ai/compose', payload: { prompt: 'check example.com every morning' } });

    expect(res.statusCode).toBe(200);
    expect(composeJobMock).toHaveBeenCalledWith('check example.com every morning');
  });

  it('returns 422 when the service reports a failed validation result', async () => {
    composeJobMock.mockResolvedValue({ error: 'model output invalid', validation: { ok: false, issues: ['bad task type'] } });
    const app = await buildTestApp(registerAiRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/ai/compose', payload: { prompt: 'do something vague' } });

    expect(res.statusCode).toBe(422);
  });

  it('returns a 400 validation error for an empty prompt', async () => {
    const app = await buildTestApp(registerAiRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/ai/compose', payload: { prompt: '' } });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(composeJobMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/diagnose', () => {
  it('returns 200 with the diagnosis on a valid result', async () => {
    diagnoseFailuresMock.mockResolvedValue({ summary: 'x', findings: [], fixes: [], clusters: [] });
    const app = await buildTestApp(registerAiRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/ai/diagnose', payload: { windowHours: 168 } });

    expect(res.statusCode).toBe(200);
    expect(diagnoseFailuresMock).toHaveBeenCalledWith({ windowHours: 168, jobId: undefined });
  });

  it('defaults to an empty body (no windowHours/jobId required)', async () => {
    diagnoseFailuresMock.mockResolvedValue({ summary: 'x', findings: [], fixes: [], clusters: [] });
    const app = await buildTestApp(registerAiRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/ai/diagnose' });

    expect(res.statusCode).toBe(200);
    expect(diagnoseFailuresMock).toHaveBeenCalledWith({ windowHours: undefined, jobId: undefined });
  });

  it('returns 422 when the service reports a failed validation result', async () => {
    diagnoseFailuresMock.mockResolvedValue({ error: 'model output invalid', validation: { ok: false, issues: [] } });
    const app = await buildTestApp(registerAiRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/ai/diagnose', payload: {} });

    expect(res.statusCode).toBe(422);
  });

  it('returns a 400 validation error when windowHours exceeds the cap', async () => {
    const app = await buildTestApp(registerAiRoutes);

    const res = await app.inject({ method: 'POST', url: '/api/ai/diagnose', payload: { windowHours: 721 } });

    expect(res.statusCode).toBe(400);
    expect(diagnoseFailuresMock).not.toHaveBeenCalled();
  });
});
