// Publishes an SSE event onto the Redis channel the server subscribes to. Fire-and-forget by
// design: a live-update notification is never allowed to fail or slow down a run.
import { SSE_REDIS_CHANNEL, type SseEvent } from '@flowforge/shared';
import { logger } from './logger.ts';
import { redisConnection } from '../queue-connection.ts';

export function publishRealtimeEvent(event: SseEvent): void {
  redisConnection.publish(SSE_REDIS_CHANNEL, JSON.stringify(event)).catch((err: unknown) => {
    logger.error({ err, event: event.event }, 'Failed to publish realtime event — run/worker processing is unaffected');
  });
}
