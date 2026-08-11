// Entry point: boot the worker, register its identity, start heartbeating and processing, handle shutdown.
import { InflightCounter, startHeartbeat } from './heartbeat.ts';
import { logger } from './lib/logger.ts';
import { registerWorker, resolveWorkerId } from './registration.ts';
import { registerShutdownHandlers } from './shutdown.ts';
import { startWorker } from './worker.ts';

async function main() {
  const workerId = await resolveWorkerId();
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
