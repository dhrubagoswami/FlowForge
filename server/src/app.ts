// Builds the Fastify instance: plugins, middleware, routes. Does not listen — that's index.ts's job.
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.ts';
import { registerErrorHandler } from './middleware/error-handler.ts';
import { registerRequestLogger } from './middleware/request-logger.ts';
import { registerRoutes } from './routes/index.ts';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: env.CORS_ORIGIN });

  registerErrorHandler(app);
  registerRequestLogger(app);
  await registerRoutes(app);

  return app;
}
