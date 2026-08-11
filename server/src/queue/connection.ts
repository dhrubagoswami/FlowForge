// The one Redis connection BullMQ uses. Nothing else in server/ constructs an ioredis client.
import { Redis } from 'ioredis';
import { env } from '../config/env.ts';

export const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
