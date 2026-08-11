// GET /api/stats/overview — parses nothing, calls stats.service, shapes the response.
import type { FastifyInstance } from 'fastify';
import { getStatsOverview } from '../services/stats.service.ts';

export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/stats/overview', async (_request, reply) => {
    const overview = await getStatsOverview();
    reply.send(overview);
  });
}
