// A minimal Fastify instance for route tests: just the error handler (the only place a thrown
// AppError/ZodError becomes an HTTP response) plus one route module — not the full buildApp()
// composition. buildApp() registers every route file via routes/index.ts, which transitively
// imports every service in the app; a test for job.routes.ts alone would otherwise need every
// unrelated service mocked just to import it safely. Registering one route module against a bare
// Fastify instance keeps each route test file's mocks scoped to the services that route actually calls.
import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from '../middleware/error-handler.ts';

export async function buildTestApp(registerRoutes: (app: FastifyInstance) => Promise<void>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await registerRoutes(app);
  return app;
}
