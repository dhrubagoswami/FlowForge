// Logs one line per completed request: method, path, status, duration.
import type { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.ts';

export function registerRequestLogger(app: FastifyInstance): void {
  app.addHook('onResponse', (request, reply, done) => {
    logger.info(
      { method: request.method, url: request.url, statusCode: reply.statusCode, durationMs: Math.round(reply.elapsedTime) },
      'request completed',
    );
    done();
  });
}
