// SSE event names and their payloads — the single source of truth for what the server publishes
// and the frontend receives. §8: run.queued/started/log/finished, worker.updated, stats.tick.
import type { RunLogLine, RunSummary, StatsOverview, WorkerSummary } from '../schemas/api.schema.ts';

export const SSE_EVENT_NAMES = ['run.queued', 'run.started', 'run.log', 'run.finished', 'worker.updated', 'stats.tick'] as const;
export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

export interface RunQueuedPayload {
  run: RunSummary;
}

export interface RunStartedPayload {
  run: RunSummary;
}

export interface RunLogPayload {
  runId: string;
  line: RunLogLine;
}

export interface RunFinishedPayload {
  run: RunSummary;
}

export interface WorkerUpdatedPayload {
  worker: WorkerSummary;
}

export type StatsTickPayload = StatsOverview;

export interface SseEventPayloadMap {
  'run.queued': RunQueuedPayload;
  'run.started': RunStartedPayload;
  'run.log': RunLogPayload;
  'run.finished': RunFinishedPayload;
  'worker.updated': WorkerUpdatedPayload;
  'stats.tick': StatsTickPayload;
}

export type SseEvent = {
  [K in SseEventName]: { event: K; data: SseEventPayloadMap[K] };
}[SseEventName];

export interface SseEventEnvelope<TPayload = unknown> {
  event: SseEventName;
  data: TPayload;
}
