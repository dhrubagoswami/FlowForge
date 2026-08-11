// The in-server consumer for scheduleTickQueue. Deliberately not in worker/ — creating a run row
// and enqueueing it is a database+queue operation, not task execution, and letting every worker
// replica also consume this queue would fire each cron slot once per replica instead of once total.
import { SCHEDULE_TICK_QUEUE_NAME, type ScheduleTickPayload } from '@flowforge/shared';
import { Worker } from 'bullmq';
import { redisConnection } from './connection.ts';
import { logger } from '../lib/logger.ts';
import { handleScheduleTick } from '../services/schedule-tick.service.ts';

export function startScheduleTickWorker(): Worker<ScheduleTickPayload> {
  const worker = new Worker<ScheduleTickPayload>(
    SCHEDULE_TICK_QUEUE_NAME,
    async (job) => {
      await handleScheduleTick({ jobId: job.data.jobId, schedulerJobId: job.id, firedAt: new Date(job.timestamp) });
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.data.jobId }, 'Schedule tick processing threw');
  });

  return worker;
}
