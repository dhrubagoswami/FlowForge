// The BullMQ queue that cron schedules fire onto. Server-only — the worker package never imports this.
import { SCHEDULE_TICK_QUEUE_NAME, type ScheduleTickPayload } from '@flowforge/shared';
import { Queue } from 'bullmq';
import { redisConnection } from './connection.ts';

export const scheduleTickQueue = new Queue<ScheduleTickPayload>(SCHEDULE_TICK_QUEUE_NAME, { connection: redisConnection });
