// The BullMQ queue that cron schedules fire onto. Server-only — the worker package never imports this.
import { QUEUE_DEFAULT_JOB_OPTIONS, SCHEDULE_TICK_QUEUE_NAME, type ScheduleTickPayload } from '@flowforge/shared';
import { Queue } from 'bullmq';
import { redisConnection } from './connection.ts';

export const scheduleTickQueue = new Queue<ScheduleTickPayload>(SCHEDULE_TICK_QUEUE_NAME, { connection: redisConnection, defaultJobOptions: QUEUE_DEFAULT_JOB_OPTIONS });
