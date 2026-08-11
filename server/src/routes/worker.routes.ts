// GET /api/workers — parses nothing, calls worker.service, shapes the response.
import type { FastifyInstance } from 'fastify';
import { listWorkers } from '../services/worker.service.ts';

export async function registerWorkerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/workers', async (_request, reply) => {
    const workers = await listWorkers();
    reply.send(workers);
  });
}
