// The BullMQ queue instance jobs are enqueued onto. Name and payload type are shared with the worker via @flowforge/shared.
import { JOB_QUEUE_NAME, QUEUE_DEFAULT_JOB_OPTIONS, type JobQueuePayload } from '@flowforge/shared';
import { Queue } from 'bullmq';
import { redisConnection } from './connection.ts';

export const jobQueue = new Queue<JobQueuePayload>(JOB_QUEUE_NAME, { connection: redisConnection, defaultJobOptions: QUEUE_DEFAULT_JOB_OPTIONS });
