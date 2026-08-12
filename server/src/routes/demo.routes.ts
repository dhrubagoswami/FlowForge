// POST /api/demo/{trigger,break,kill-worker,reset} — the demo/chaos panel. Guarded by DEMO_MODE
// and rate limited; parses nothing beyond that, calls one service, shapes the response.
import type { FastifyInstance } from 'fastify';
import { demoModeGuard } from '../middleware/demo-mode-guard.ts';
import { demoRateLimit } from '../middleware/rate-limit.ts';
import { demoBreak, demoKillWorker, demoReset, demoTrigger } from '../services/demo.service.ts';

const demoPreHandlers = [demoModeGuard, demoRateLimit];

export async function registerDemoRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/demo/trigger', { preHandler: demoPreHandlers }, async (_request, reply) => {
    const run = await demoTrigger();
    reply.send(run);
  });

  app.post('/api/demo/break', { preHandler: demoPreHandlers }, async (_request, reply) => {
    const run = await demoBreak();
    reply.send(run);
  });

  app.post('/api/demo/kill-worker', { preHandler: demoPreHandlers }, async (_request, reply) => {
    const worker = await demoKillWorker();
    reply.send(worker);
  });

  app.post('/api/demo/reset', { preHandler: demoPreHandlers }, async (_request, reply) => {
    const workers = await demoReset();
    reply.send(workers);
  });
}
