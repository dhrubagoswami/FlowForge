// Entry point: boot the server, reconcile schedules, listen, handle shutdown. Nothing else.
import { INSTANCE_LOCK_REFRESH_INTERVAL_MS, QUEUE_DRAIN_DELAY_SECONDS, QUEUE_STALLED_INTERVAL_MS } from '@flowforge/shared';
import { buildApp } from './app.ts';
import { env } from './config/env.ts';
import {
  acquireScheduleTickLock,
  countLiveWorkerInstances,
  InstanceLockConflictError,
  refreshScheduleTickLock,
  releaseScheduleTickLock,
} from './lib/instance-lock.ts';
import { logger } from './lib/logger.ts';
import { redisConnection } from './queue/connection.ts';
import { reconcileAllSchedules } from './queue/scheduler.ts';
import { startScheduleTickWorker } from './queue/schedule-tick.worker.ts';
import { startRedisEventSubscriber } from './realtime/redis-subscriber.ts';

const HARD_EXIT_TIMEOUT_MS = 10000;

// A visible floor on this process's idle Redis command rate — so a duplicate/orphaned process
// (the actual cause of a real command-budget incident on 2026-08-11, see DECISIONS.md) shows up
// immediately in the logs instead of silently multiplying the fleet's command spend. Also reports
// how many live worker instances the instance-lock registry currently sees — a worker binds no
// port, so this count (not a port check) is what actually catches an unexpected duplicate.
async function logRedisClientCensus(): Promise<void> {
  const liveWorkerInstances = await countLiveWorkerInstances();

  logger.info(
    {
      liveWorkerInstances,
      redisConnectingClients: [
        {
          name: 'bullmq-schedule-tick-worker',
          concurrency: 1,
          configuredDrainDelaySeconds: QUEUE_DRAIN_DELAY_SECONDS,
          effectiveBzpopminIntervalSeconds: 10,
          effectiveIntervalNote: 'BullMQ hardcodes a 10s BZPOPMIN ceiling whenever a delayed job exists — always true here (permanent next-cron-slot job) — so drainDelay is not the real idle cadence; see packages/shared/src/constants/queue.ts',
          stalledIntervalMs: QUEUE_STALLED_INTERVAL_MS,
        },
        { name: 'bullmq-job-queue', role: 'enqueue-only, no polling' },
        { name: 'bullmq-schedule-tick-queue', role: 'enqueue-only, no polling' },
        { name: 'redis-event-subscriber', role: 'pub/sub subscribe, reactive only — no polling' },
        { name: 'instance-lock', role: 'SET NX PX on boot, refreshed roughly once a minute — see lib/instance-lock.ts. The server is a designed scheduling singleton, so more than one live instance is always unexpected, not just informational.' },
      ],
    },
    'Redis client census for this process (each duplicate process running this list multiplies idle command spend)',
  );
}

function startScheduleTickLockRefresh(): { stop: () => void } {
  const interval = setInterval(() => {
    refreshScheduleTickLock()
      .then((stillHeld) => {
        if (!stillHeld) logger.error('Schedule-tick instance lock refresh found the lock no longer held by this process — another instance may have claimed it');
      })
      .catch((err: unknown) => logger.error({ err }, 'Schedule-tick instance lock refresh failed — will retry next cycle'));
  }, INSTANCE_LOCK_REFRESH_INTERVAL_MS);
  return { stop: () => clearInterval(interval) };
}

async function main() {
  try {
    await acquireScheduleTickLock();
  } catch (err) {
    if (err instanceof InstanceLockConflictError) {
      logger.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const lockRefresh = startScheduleTickLockRefresh();

  await logRedisClientCensus();
  const app = await buildApp();

  await reconcileAllSchedules();
  const scheduleTickWorker = startScheduleTickWorker();
  // Bridges worker-originated events (run.started/run.log/run.finished/worker.updated, published
  // by the worker process onto Redis since it has no other channel back here) onto this server's
  // SSE stream. One subscriber per process, shared by every connected browser tab — never one per
  // SSE connection (see realtime/sse.handler.ts, which only touches the in-process event bus).
  const redisEventSubscriber = startRedisEventSubscriber();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info(`FlowForge server listening on port ${env.PORT}`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    // Whatever else happens below, this process must not still be alive HARD_EXIT_TIMEOUT_MS after
    // a shutdown signal — an orphaned instance is exactly the failure mode this whole lock
    // mechanism exists to prevent, so shutdown itself must not be the thing that produces one.
    const hardExitTimer = setTimeout(() => {
      logger.error(`Shutdown did not complete within ${HARD_EXIT_TIMEOUT_MS}ms — force-exiting to avoid an orphaned process.`);
      process.exit(1);
    }, HARD_EXIT_TIMEOUT_MS);
    hardExitTimer.unref();

    logger.info(`Received ${signal}, shutting down...`);
    lockRefresh.stop();
    await scheduleTickWorker.close();
    await redisEventSubscriber.stop();
    await app.close();

    // Release the instance lock before closing the connection that holds it — releaseScheduleTickLock
    // needs a live connection to run its check-and-delete script.
    await releaseScheduleTickLock().catch((err: unknown) => logger.error({ err }, 'Failed to release schedule-tick instance lock — it will expire on its own via TTL'));
    await redisConnection.quit().catch((err: unknown) => logger.error({ err }, 'Failed to close Redis connection cleanly'));

    clearTimeout(hardExitTimer);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
