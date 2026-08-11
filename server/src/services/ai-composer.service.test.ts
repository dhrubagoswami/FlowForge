// §15 + §9.3: cache hit skips Gemini entirely; a validation failure retries once with the issues
// appended, and a second failure gives up cleanly without ever saving anything. Gemini itself is
// always mocked — never call the real API from a test.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCachedAiResponseMock = vi.fn();
const setCachedAiResponseMock = vi.fn();
const generateJsonMock = vi.fn();

vi.mock('../ai/ai-cache.ts', () => ({
  hashAiInput: (kind: string, input: string) => `${kind}:${input}`,
  getCachedAiResponse: (...args: unknown[]) => getCachedAiResponseMock(...args),
  setCachedAiResponse: (...args: unknown[]) => setCachedAiResponseMock(...args),
}));
vi.mock('../ai/gemini.client.ts', () => ({ generateJson: (...args: unknown[]) => generateJsonMock(...args) }));
vi.mock('../config/env.ts', () => ({ env: { GEMINI_MODEL: 'gemini-3.5-flash-lite' } }));

const { composeJob } = await import('./ai-composer.service.ts');

const VALID_CONFIG = {
  name: 'nightly-backup',
  trigger: { type: 'cron', expr: '0 2 * * *', tz: 'UTC' },
  task: { type: 'simulate', input: { durationMs: 1000 } },
  timeoutMs: 120000,
  retry: { attempts: 3, backoff: 'exponential', baseMs: 30000 },
  idempotency: { keyTemplate: '{{job}}:{{scheduled_at}}', ttlSeconds: 86400 },
  alert: { afterConsecutiveFailures: 3 },
};

describe('composeJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the cached response and never calls Gemini on a cache hit', async () => {
    const cached = { config: VALID_CONFIG, yaml: 'name: nightly-backup', validation: { ok: true } };
    getCachedAiResponseMock.mockResolvedValueOnce(cached);

    const result = await composeJob('back up nightly');

    expect(result).toBe(cached);
    expect(generateJsonMock).not.toHaveBeenCalled();
  });

  it('returns a valid config on the first attempt and caches it', async () => {
    getCachedAiResponseMock.mockResolvedValueOnce(null);
    generateJsonMock.mockResolvedValueOnce(JSON.stringify(VALID_CONFIG));

    const result = await composeJob('back up nightly');

    expect(generateJsonMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ validation: { ok: true } });
    expect(setCachedAiResponseMock).toHaveBeenCalledTimes(1);
  });

  it('retries once with the validation issues appended when the first attempt is invalid, then succeeds', async () => {
    getCachedAiResponseMock.mockResolvedValueOnce(null);
    generateJsonMock.mockResolvedValueOnce(JSON.stringify({ ...VALID_CONFIG, task: { type: 'made.up', input: {} } }));
    generateJsonMock.mockResolvedValueOnce(JSON.stringify(VALID_CONFIG));

    const result = await composeJob('back up nightly');

    expect(generateJsonMock).toHaveBeenCalledTimes(2);
    // The retry prompt must contain the first attempt's issues, not just repeat the original ask.
    expect(generateJsonMock.mock.calls[1][0].prompt).toContain('Your previous attempt was invalid');
    expect(result).toMatchObject({ validation: { ok: true } });
  });

  it('gives up cleanly after a second invalid attempt and never caches or saves anything', async () => {
    getCachedAiResponseMock.mockResolvedValueOnce(null);
    generateJsonMock.mockResolvedValueOnce(JSON.stringify({ ...VALID_CONFIG, task: { type: 'made.up', input: {} } }));
    generateJsonMock.mockResolvedValueOnce(JSON.stringify({ ...VALID_CONFIG, timeoutMs: 999999999 }));

    const result = await composeJob('back up nightly');

    expect(generateJsonMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ validation: { ok: false } });
    expect(setCachedAiResponseMock).not.toHaveBeenCalled();
  });

  it('does not retry a transport-level failure — it propagates immediately', async () => {
    getCachedAiResponseMock.mockResolvedValueOnce(null);
    generateJsonMock.mockRejectedValueOnce(new Error('Gemini API unreachable'));

    await expect(composeJob('back up nightly')).rejects.toThrow('Gemini API unreachable');
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
  });
});
