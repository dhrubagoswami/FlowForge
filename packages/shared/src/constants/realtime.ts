// Redis pub/sub channel the worker publishes SSE events to and the server subscribes on, so both
// processes agree on the channel name without hand-matching a string in each.
export const SSE_REDIS_CHANNEL = 'flowforge:events';
