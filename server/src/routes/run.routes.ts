// GET /api/runs, /api/runs/:id, /api/runs/:id/logs — parses query/params, calls one service, shapes the response. Write endpoints (cancel/retry) arrive later.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runStatusSchema } from '@flowforge/shared';
import { getRun, getRunLogs, listRecentRuns } from '../services/run.service.ts';

const listRunsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), status: runStatusSchema.optional() });
const runParamsSchema = z.object({ id: z.string().min(1) });
const runLogsQuerySchema = z.object({ since: z.string().min(1).optional() });

export async function registerRunRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/runs', async (request, reply) => {
    const query = listRunsQuerySchema.parse(request.query);
    const runs = await listRecentRuns(query);
    reply.send(runs);
  });

  app.get('/api/runs/:id', async (request, reply) => {
    const { id } = runParamsSchema.parse(request.params);
    const run = await getRun(id);
    reply.send(run);
  });

  app.get('/api/runs/:id/logs', async (request, reply) => {
    const { id } = runParamsSchema.parse(request.params);
    const query = runLogsQuerySchema.parse(request.query);
    const logs = await getRunLogs({ runId: id, since: query.since });
    reply.send(logs);
  });
}
