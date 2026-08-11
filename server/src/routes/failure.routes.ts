// GET /api/failures/clusters — parses query, calls failure-cluster.service, shapes the response. No AI dependency; /api/ai/diagnose (M10) builds on top of this.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getFailureClusters } from '../services/failure-cluster.service.ts';

const failureClustersQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(720).optional(),
  jobId: z.string().min(1).optional(),
});

export async function registerFailureRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/failures/clusters', async (request, reply) => {
    const query = failureClustersQuerySchema.parse(request.query);
    const clusters = await getFailureClusters(query);
    reply.send(clusters);
  });
}
