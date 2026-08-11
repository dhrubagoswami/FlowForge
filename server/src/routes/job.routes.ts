// GET /api/jobs, /api/jobs/:id, /api/jobs/:id/runs, POST /api/jobs/:id/trigger, and the M7 write
// endpoints (create/update/pause/resume/delete) — parses query/params/body, calls one service, shapes the response.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createJobRequestSchema, jobStatusSchema, updateJobRequestSchema } from '@flowforge/shared';
import { triggerJob } from '../services/enqueue.service.ts';
import { createJob, deleteJob, getJobDetail, listJobs, pauseJob, resumeJob, updateJob } from '../services/job.service.ts';
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

  app.post('/api/jobs/:id/trigger', async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const run = await triggerJob(id);
    reply.status(202).send(run);
  });

  app.post('/api/jobs', async (request, reply) => {
    const config = createJobRequestSchema.parse(request.body);
    const job = await createJob(config);
    reply.status(201).send(job);
  });

  app.patch('/api/jobs/:id', async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const patch = updateJobRequestSchema.parse(request.body);
    const job = await updateJob(id, patch);
    reply.send(job);
  });

  app.post('/api/jobs/:id/pause', async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const job = await pauseJob(id);
    reply.send(job);
  });

  app.post('/api/jobs/:id/resume', async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const job = await resumeJob(id);
    reply.send(job);
  });

  app.delete('/api/jobs/:id', async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    await deleteJob(id);
    reply.status(204).send();
  });
}
