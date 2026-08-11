// Registers every route module against the Fastify instance. No route logic lives here.
import type { FastifyInstance } from 'fastify';
import { registerFailureRoutes } from './failure.routes.ts';
import { registerHealthRoutes } from './health.routes.ts';
import { registerJobRoutes } from './job.routes.ts';
import { registerRunRoutes } from './run.routes.ts';
import { registerStatsRoutes } from './stats.routes.ts';
import { registerStreamRoutes } from './stream.routes.ts';
import { registerWorkerRoutes } from './worker.routes.ts';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerHealthRoutes(app);
  await registerStatsRoutes(app);
  await registerJobRoutes(app);
  await registerRunRoutes(app);
  await registerWorkerRoutes(app);
  await registerFailureRoutes(app);
  await registerStreamRoutes(app);
}
