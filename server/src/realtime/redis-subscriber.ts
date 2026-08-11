// Bridges worker-originated events (published on Redis, since the worker is a separate process
// with no other channel back to the server) onto this process's in-process event bus.
import { Redis } from 'ioredis';
import { SSE_REDIS_CHANNEL, type SseEvent } from '@flowforge/shared';
import { env } from '../config/env.ts';
import { logger } from '../lib/logger.ts';
import { publishEvent } from './event-bus.ts';

export function startRedisEventSubscriber(): { stop: () => Promise<void> } {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  subscriber.subscribe(SSE_REDIS_CHANNEL).catch((err: unknown) => {
    logger.error({ err }, 'Failed to subscribe to the realtime Redis channel');
  });

  subscriber.on('message', (_channel, raw) => {
    try {
      const event = JSON.parse(raw) as SseEvent;
      publishEvent(event);
    } catch (err) {
      logger.error({ err }, 'Received an unparseable realtime event from Redis');
    }
  });

  return { stop: () => subscriber.quit().then(() => undefined) };
}
