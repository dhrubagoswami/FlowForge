// Writes one client's SSE stream: subscribes to the event bus, forwards every event as an SSE
// frame, and sends a comment line every SSE_HEARTBEAT_MS so proxies don't time out the connection.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SSE_HEARTBEAT_MS } from '../config/constants.ts';
import { subscribeToEvents } from './event-bus.ts';

export function handleSseConnection(request: FastifyRequest, reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const unsubscribe = subscribeToEvents((event) => {
    reply.raw.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    reply.raw.write(': heartbeat\n\n');
  }, SSE_HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  request.raw.on('close', cleanup);
  reply.raw.on('close', cleanup);
}
