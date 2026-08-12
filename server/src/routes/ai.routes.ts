// POST /api/ai/compose, POST /api/ai/diagnose — parse the request, apply the AI rate limit, call one service, shape the response.
import type { FastifyInstance } from 'fastify';
import { aiComposeRequestSchema, aiDiagnoseRequestSchema } from '@flowforge/shared';
import { aiRateLimit } from '../middleware/rate-limit.ts';
import { composeJob } from '../services/ai-composer.service.ts';
import { diagnoseFailures } from '../services/ai-diagnosis.service.ts';

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/ai/compose', { preHandler: aiRateLimit }, async (request, reply) => {
    const { prompt } = aiComposeRequestSchema.parse(request.body);
    const result = await composeJob(prompt);
    reply.status('validation' in result && !result.validation.ok ? 422 : 200).send(result);
  });

  app.post('/api/ai/diagnose', { preHandler: aiRateLimit }, async (request, reply) => {
    const { windowHours, jobId } = aiDiagnoseRequestSchema.parse(request.body ?? {});
    const result = await diagnoseFailures({ windowHours, jobId });
    reply.status('validation' in result && !result.validation.ok ? 422 : 200).send(result);
  });
}
