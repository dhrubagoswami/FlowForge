// GET /api/jobs, /api/jobs/:id, /api/jobs/:id/runs — parses query/params, calls one service, shapes the response. Write endpoints (POST/PATCH/DELETE) arrive at M7.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { jobStatusSchema } from '@flowforge/shared';
import { getJobDetail, listJobs } from '../services/job.service.ts';
import { listRunsForJob } from '../services/run.service.ts';

const listJobsQuerySchema = z.object({ status: jobStatusSchema.optional() });
const jobParamsSchema = z.object({ id: z.string().min(1) });
const runsForJobQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().min(1).optional() });

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/jobs', async (request, reply) => {
    const query = listJobsQuerySchema.parse(request.query);
    const jobs = await listJobs(query.status ? { status: query.status } : undefined);
    reply.send(jobs);
  });

  app.get('/api/jobs/:id', async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const job = await getJobDetail(id);
    reply.send(job);
  });

  app.get('/api/jobs/:id/runs', async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const query = runsForJobQuerySchema.parse(request.query);
    const page = await listRunsForJob({ jobId: id, limit: query.limit, cursor: query.cursor });
    reply.send(page);
  });
}
