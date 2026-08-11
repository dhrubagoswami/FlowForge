import { afterEach, describe, expect, it, vi } from 'vitest';
import { runNotifyWebhook } from './notify-webhook.task.ts';

function noopLog() {
  return vi.fn().mockResolvedValue(undefined);
}

describe('runNotifyWebhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the payload as JSON and succeeds on a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runNotifyWebhook({ url: 'https://example.com/hook', payload: { hello: 'world' } }, noopLog());

    expect(result).toEqual({ status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ hello: 'world' }) }),
    );
  });

  it('throws when the webhook responds with a non-2xx status, and logs the error itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const log = noopLog();
    await expect(runNotifyWebhook({ url: 'https://example.com/hook', payload: {} }, log)).rejects.toThrow(/status 500/);
    expect(log).toHaveBeenCalledWith('error', expect.stringMatching(/status 500/));
  });
});
