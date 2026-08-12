// Per-IP, in-memory, fixed-window rate limiting — consistent with M7's already-established
// single-server assumption. One factory, two call sites: the AI endpoints (§9.2.6) and the demo
// panel (§10), each with their own counter map and limits so bursts on one never affect the other.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.ts';
import { AppError } from '../lib/app-error.ts';

function createFixedWindowRateLimit(params: { limit: number; windowMs: number; code: string; message: string }) {
  const requestsByIp = new Map<string, { count: number; windowStart: number }>();

  return async function rateLimit(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const ip = request.ip;
    const now = Date.now();
    const entry = requestsByIp.get(ip);

    if (!entry || now - entry.windowStart >= params.windowMs) {
      requestsByIp.set(ip, { count: 1, windowStart: now });
      return;
    }

    if (entry.count >= params.limit) {
      throw new AppError({ code: params.code, message: params.message, statusCode: 429 });
    }

    entry.count += 1;
  };
}

export const aiRateLimit = createFixedWindowRateLimit({
  limit: env.AI_RATE_LIMIT_PER_MIN,
  windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
  code: 'AI_RATE_LIMITED',
  message: 'Too many AI requests — please wait a moment before trying again.',
});

export const demoRateLimit = createFixedWindowRateLimit({
  limit: env.DEMO_RATE_LIMIT_PER_MIN,
  windowMs: env.DEMO_RATE_LIMIT_WINDOW_MS,
  code: 'DEMO_RATE_LIMITED',
  message: 'Too many demo actions — please wait a moment before trying again.',
});
