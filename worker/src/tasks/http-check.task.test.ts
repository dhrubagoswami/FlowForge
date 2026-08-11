import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHttpCheck } from './http-check.task.ts';

function noopLog() {
  return vi.fn().mockResolvedValue(undefined);
}

describe('runHttpCheck', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('succeeds when the status matches expectStatus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
    const result = await runHttpCheck({ url: 'https://example.com' }, noopLog());
    expect(result).toEqual({ status: 200 });
  });

  it('throws when the status does not match expectStatus, and logs the error itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    const log = noopLog();
    await expect(runHttpCheck({ url: 'https://example.com', expectStatus: 200 }, log)).rejects.toThrow(/expected status 200, got 500/);
    expect(log).toHaveBeenCalledWith('error', expect.stringMatching(/expected status 200, got 500/));
  });

  it('throws when expectContains does not appear in the body, and logs the error itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('hello world', { status: 200 })));
    const log = noopLog();
    await expect(runHttpCheck({ url: 'https://example.com', expectContains: 'goodbye' }, log)).rejects.toThrow(/did not contain/);
    expect(log).toHaveBeenCalledWith('error', expect.stringMatching(/did not contain/));
  });

  it('succeeds when expectContains does appear in the body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('hello world', { status: 200 })));
    const result = await runHttpCheck({ url: 'https://example.com', expectContains: 'hello' }, noopLog());
    expect(result).toEqual({ status: 200 });
  });
});
