// The only place an AppError (or any thrown error) becomes an HTTP response. Routes never construct error JSON themselves.
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.ts';
import { logger } from '../lib/logger.ts';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }

    if (err instanceof ZodError) {
      reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'The request did not match the expected shape.', details: { issues: err.issues } },
      });
      return;
    }

    logger.error({ err }, 'Unhandled error');
    reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our end.' } });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No route matches this URL.' } });
  });
}
