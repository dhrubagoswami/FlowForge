// Writes one client's SSE stream: subscribes to the event bus, forwards every event as an SSE
// frame, and sends a comment line every SSE_HEARTBEAT_MS so proxies don't time out the connection.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SSE_HEARTBEAT_MS } from '../config/constants.ts';
import { subscribeToEvents } from './event-bus.ts';

export function handleSseConnection(request: FastifyRequest, reply: FastifyReply): void {
  // reply.raw.writeHead() writes straight to the socket, bypassing Fastify's own send
  // pipeline — so headers set by plugins via reply.header() (e.g. @fastify/cors's onRequest
  // hook, which runs before this handler) never reach the client unless merged in here.
  reply.raw.writeHead(200, {
    ...(reply.getHeaders() as Record<string, string | number | string[]>),
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // writeHead() alone can leave the response buffered and never flushed to the socket until
  // something is actually written — confirmed directly: without this line, curl/EventSource saw
  // zero bytes for the full SSE_HEARTBEAT_MS (20s) until the first heartbeat forced a flush, long
  // past any reasonable client-side connect timeout. Writing a comment line immediately forces the
  // headers out and gives the client an onopen without waiting on the heartbeat interval.
  reply.raw.write(': connected\n\n');

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
