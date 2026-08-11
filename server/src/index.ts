// Entry point: boot the server, reconcile schedules, listen, handle shutdown. Nothing else.
import { buildApp } from './app.ts';
import { env } from './config/env.ts';
import { logger } from './lib/logger.ts';
import { reconcileAllSchedules } from './queue/scheduler.ts';
import { startScheduleTickWorker } from './queue/schedule-tick.worker.ts';

async function main() {
  const app = await buildApp();

  await reconcileAllSchedules();
  const scheduleTickWorker = startScheduleTickWorker();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info(`FlowForge server listening on port ${env.PORT}`);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await scheduleTickWorker.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
