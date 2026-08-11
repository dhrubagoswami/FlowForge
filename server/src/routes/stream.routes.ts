// GET /api/stream — opens an SSE connection. No body parsing, no service call: the handler owns the raw response.
import type { FastifyInstance } from 'fastify';
import { handleSseConnection } from '../realtime/sse.handler.ts';

export async function registerStreamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/stream', (request, reply) => {
    handleSseConnection(request, reply);
  });
}
