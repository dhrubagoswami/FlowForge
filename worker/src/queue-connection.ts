// The one Redis connection BullMQ uses in the worker process. Nothing else in worker/ constructs an ioredis client.
import { Redis } from 'ioredis';
import { env } from './config/env.ts';

export const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
