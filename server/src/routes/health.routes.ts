// GET /api/health — liveness. Parses nothing, calls health.service, shapes the response.
import type { FastifyInstance } from 'fastify';
import { getHealthStatus } from '../services/health.service.ts';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_request, reply) => {
    const status = await getHealthStatus();
    reply.status(status.ok ? 200 : 503).send(status);
  });
}
