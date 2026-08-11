// In-process pub/sub: anything in the server that produces an SSE event publishes here, and the
// SSE handler subscribes to fan events out to connected clients. Server-originated events (e.g.
// run.queued) publish directly; worker-originated events arrive via redis-subscriber.ts republishing here.
import { EventEmitter } from 'node:events';
import type { SseEvent } from '@flowforge/shared';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const CHANNEL = 'sse-event';

export function publishEvent(event: SseEvent): void {
  emitter.emit(CHANNEL, event);
}

export function subscribeToEvents(listener: (event: SseEvent) => void): () => void {
  emitter.on(CHANNEL, listener);
  return () => emitter.off(CHANNEL, listener);
}
