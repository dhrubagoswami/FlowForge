// §9.2.6: rate-limits the AI endpoints so a demo visitor can't burn the free-tier quota. Per-IP,
// in-memory, fixed window — consistent with M7's already-established single-server assumption.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.ts';
import { AppError } from '../lib/app-error.ts';

const requestsByIp = new Map<string, { count: number; windowStart: number }>();

export async function aiRateLimit(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const ip = request.ip;
  const now = Date.now();
  const entry = requestsByIp.get(ip);

  if (!entry || now - entry.windowStart >= env.AI_RATE_LIMIT_WINDOW_MS) {
    requestsByIp.set(ip, { count: 1, windowStart: now });
    return;
  }

  if (entry.count >= env.AI_RATE_LIMIT_PER_MIN) {
    throw new AppError({
      code: 'AI_RATE_LIMITED',
      message: 'Too many AI requests — please wait a moment before trying again.',
      statusCode: 429,
    });
  }

  entry.count += 1;
}
