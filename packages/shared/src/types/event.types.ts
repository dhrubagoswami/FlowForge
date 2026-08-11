// SSE event names and envelope. Real per-event payload shapes are defined at M8 once the event bus exists.
export const SSE_EVENT_NAMES = ['run.queued', 'run.started', 'run.log', 'run.finished', 'worker.updated', 'stats.tick'] as const;
export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

export interface SseEventEnvelope<TPayload = unknown> {
  event: SseEventName;
  data: TPayload;
}
