// §10: every /api/demo/* route is guarded behind DEMO_MODE — off means the endpoints don't work,
// not just that a button is hidden.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.ts';
import { AppError } from '../lib/app-error.ts';

export async function demoModeGuard(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!env.DEMO_MODE) {
    throw new AppError({ code: 'DEMO_MODE_DISABLED', message: 'The demo panel is turned off on this server.', statusCode: 403 });
  }
}
