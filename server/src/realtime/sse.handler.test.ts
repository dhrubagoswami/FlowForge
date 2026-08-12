// Unit test for the SSE handler, scoped specifically to what broke this project's SSE path twice
// this session (see DECISIONS.md): headers not merged from reply.getHeaders() into the raw
// writeHead call, and no immediate write forcing the headers to flush. A third, earlier bug
// (startStatsTick never called) was a wiring gap at the process-boot level, not inside this
// handler — this file covers the piece that lives here: the subscriber is actually registered on
// connect and cleaned up on disconnect, so a future "built but never wired" regression at this
// specific call site would be caught.
//
// reply.raw/request.raw are mocked as plain objects with vi.fn() for the handful of methods this
// handler actually calls (writeHead, write, on) — not a real Node http.ServerResponse. This stays
// honest because the handler only ever touches those specific methods; a broader mock simulating
// Node's full response lifecycle would risk testing the mock's behavior instead of the code's.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeToEventsMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock('./event-bus.ts', () => ({ subscribeToEvents: (...args: unknown[]) => subscribeToEventsMock(...args) }));

const { handleSseConnection } = await import('./sse.handler.ts');

function fakeReply(getHeaders: Record<string, string> = {}) {
  const rawListeners = new Map<string, () => void>();
  return {
    getHeaders: () => getHeaders,
    raw: {
      writeHead: vi.fn(),
      write: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => rawListeners.set(event, cb)),
      __listeners: rawListeners,
    },
  };
}

function fakeRequest() {
  const rawListeners = new Map<string, () => void>();
  return {
    raw: {
      on: vi.fn((event: string, cb: () => void) => rawListeners.set(event, cb)),
      __listeners: rawListeners,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  subscribeToEventsMock.mockReturnValue(unsubscribeMock);
});

describe('handleSseConnection', () => {
  it('calls writeHead with reply.getHeaders() merged in, not overwritten, plus the SSE-specific headers', () => {
    const reply = fakeReply({ 'access-control-allow-origin': 'http://localhost:5173', vary: 'origin' });
    const request = fakeRequest();

    handleSseConnection(request as never, reply as never);

    expect(reply.raw.writeHead).toHaveBeenCalledWith(200, {
      'access-control-allow-origin': 'http://localhost:5173',
      vary: 'origin',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
  });

  it('content-type is text/event-stream', () => {
    const reply = fakeReply();
    const request = fakeRequest();

    handleSseConnection(request as never, reply as never);

    const [, headers] = reply.raw.writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(headers['Content-Type']).toBe('text/event-stream');
  });

  it('writes an initial line immediately after writeHead, before any event or heartbeat fires', () => {
    const reply = fakeReply();
    const request = fakeRequest();

    handleSseConnection(request as never, reply as never);

    expect(reply.raw.write).toHaveBeenCalledWith(': connected\n\n');
    // The initial write must be the very first write — this is what forces the headers to flush
    // instead of sitting buffered until the heartbeat interval eventually fires (see DECISIONS.md).
    expect(reply.raw.write).toHaveBeenNthCalledWith(1, ': connected\n\n');
  });

  it('registers a subscriber with the event bus on connect — this is the wiring the M8 bug lacked', () => {
    const reply = fakeReply();
    const request = fakeRequest();

    handleSseConnection(request as never, reply as never);

    expect(subscribeToEventsMock).toHaveBeenCalledTimes(1);
    expect(subscribeToEventsMock).toHaveBeenCalledWith(expect.any(Function));
  });

  it('forwards a published event to the client as an SSE frame', () => {
    const reply = fakeReply();
    const request = fakeRequest();

    handleSseConnection(request as never, reply as never);

    const listener = subscribeToEventsMock.mock.calls[0][0] as (event: unknown) => void;
    listener({ event: 'run.queued', data: { run: { id: 'run-1' } } });

    expect(reply.raw.write).toHaveBeenCalledWith('event: run.queued\ndata: {"run":{"id":"run-1"}}\n\n');
  });

  it('unsubscribes from the event bus when the connection closes', () => {
    const reply = fakeReply();
    const request = fakeRequest();

    handleSseConnection(request as never, reply as never);

    const closeHandler = reply.raw.__listeners.get('close');
    expect(closeHandler).toBeDefined();
    closeHandler?.();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('registers close cleanup on both request.raw and reply.raw', () => {
    const reply = fakeReply();
    const request = fakeRequest();

    handleSseConnection(request as never, reply as never);

    expect(request.raw.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(reply.raw.on).toHaveBeenCalledWith('close', expect.any(Function));
  });
});
