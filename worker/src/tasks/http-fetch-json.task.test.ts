import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHttpFetchJson } from './http-fetch-json.task.ts';

function noopLog() {
  return vi.fn().mockResolvedValue(undefined);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('runHttpFetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed body when there is no assertion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    const result = await runHttpFetchJson({ url: 'https://example.com' }, noopLog());
    expect(result).toEqual({ body: { ok: true } });
  });

  it('throws when the response is not ok, and logs the error itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    const log = noopLog();
    await expect(runHttpFetchJson({ url: 'https://example.com' }, log)).rejects.toThrow(/status 404/);
    expect(log).toHaveBeenCalledWith('error', expect.stringMatching(/status 404/));
  });

  it('passes when assertPath matches assertEquals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { count: 5 } })));
    const result = await runHttpFetchJson({ url: 'https://example.com', assertPath: 'data.count', assertEquals: 5 }, noopLog());
    expect(result).toEqual({ body: { data: { count: 5 } } });
  });

  it('throws when assertPath does not match assertEquals, and logs the error itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { count: 5 } })));
    const log = noopLog();
    await expect(runHttpFetchJson({ url: 'https://example.com', assertPath: 'data.count', assertEquals: 6 }, log)).rejects.toThrow(/assertion failed/);
    expect(log).toHaveBeenCalledWith('error', expect.stringMatching(/assertion failed/));
  });
});
