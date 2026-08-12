// Entry point: boot the worker, register its identity, start heartbeating and processing, handle shutdown.
import { QUEUE_DRAIN_DELAY_SECONDS, QUEUE_STALLED_INTERVAL_MS } from '@flowforge/shared';
import { InflightCounter, startHeartbeat } from './heartbeat.ts';
import { env } from './config/env.ts';
import { acquireInstanceLock, countLiveWorkerInstances, InstanceLockConflictError } from './instance-lock.ts';
import { logger } from './lib/logger.ts';
import { registerWorker, resolveWorkerId } from './registration.ts';
import { registerShutdownHandlers } from './shutdown.ts';
import { startWorker } from './worker.ts';

// A visible floor on this process's idle Redis command rate — so a duplicate/orphaned process
// (the actual cause of a real command-budget incident on 2026-08-11, see DECISIONS.md) shows up
// immediately in the logs instead of silently multiplying the fleet's command spend. Also reports
// how many live worker instances the instance-lock registry currently sees — a worker binds no
// port, so this count (not a port check) is what actually catches an unexpected duplicate.
async function logRedisClientCensus(): Promise<void> {
  const liveWorkerInstances = await countLiveWorkerInstances();
  const logLevel = liveWorkerInstances > env.EXPECTED_WORKER_FLEET_SIZE ? 'warn' : 'info';

  logger[logLevel](
    {
      liveWorkerInstances,
      expectedWorkerFleetSize: env.EXPECTED_WORKER_FLEET_SIZE,
      redisConnectingClients: [
        {
          name: 'bullmq-job-worker',
          concurrency: env.WORKER_CONCURRENCY,
          configuredDrainDelaySeconds: QUEUE_DRAIN_DELAY_SECONDS,
          effectiveBzpopminIntervalSeconds: 10,
          effectiveIntervalNote: 'BullMQ hardcodes a 10s BZPOPMIN ceiling whenever a delayed job exists (e.g. a retry backoff) — drainDelay is not the real idle cadence in that case; see packages/shared/src/constants/queue.ts',
          stalledIntervalMs: QUEUE_STALLED_INTERVAL_MS,
        },
        {
          name: 'redis-heartbeat-publish',
          role: 'PUBLISH on worker.updated, gated — not one per DB heartbeat tick',
          dbWriteIntervalMs: env.HEARTBEAT_INTERVAL_MS,
          publishesOn: 'status/inflight change, or at most once per 30000ms otherwise',
        },
        { name: 'instance-lock', role: 'SET NX PX on boot, refreshed roughly once a minute on the heartbeat cycle — see instance-lock.ts' },
      ],
    },
    liveWorkerInstances > env.EXPECTED_WORKER_FLEET_SIZE
      ? `Redis client census: ${liveWorkerInstances} live worker instances seen, more than the expected ${env.EXPECTED_WORKER_FLEET_SIZE} — check for orphaned processes (pnpm dev:clean)`
      : 'Redis client census for this process (each duplicate process running this list multiplies idle command spend)',
  );
}

async function main() {
  try {
    await acquireInstanceLock();
  } catch (err) {
    if (err instanceof InstanceLockConflictError) {
      logger.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const workerId = await resolveWorkerId();
  await logRedisClientCensus();
  await registerWorker(workerId);
  logger.info(`Worker "${workerId}" registered and listening for jobs`);

  const inflight = new InflightCounter();
  const worker = startWorker(workerId, inflight);
  const heartbeat = startHeartbeat(workerId, inflight);

  registerShutdownHandlers({ workerId, worker, stopHeartbeat: heartbeat.stop });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
