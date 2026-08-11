// POST /api/ai/compose — parses the request, applies the AI rate limit, calls the composer service, shapes the response.
import type { FastifyInstance } from 'fastify';
import { aiComposeRequestSchema } from '@flowforge/shared';
import { aiRateLimit } from '../middleware/rate-limit.ts';
import { composeJob } from '../services/ai-composer.service.ts';

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/ai/compose', { preHandler: aiRateLimit }, async (request, reply) => {
    const { prompt } = aiComposeRequestSchema.parse(request.body);
    const result = await composeJob(prompt);
    reply.status('validation' in result && !result.validation.ok ? 422 : 200).send(result);
  });
}
