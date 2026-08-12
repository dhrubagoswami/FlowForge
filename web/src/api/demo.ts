import type { DemoResetResult, RunSummary, WorkerSummary } from '@flowforge/shared';
import { apiPost } from './client.ts';

export function demoTrigger(): Promise<RunSummary> {
  return apiPost('/api/demo/trigger', {});
}

export function demoBreak(): Promise<RunSummary> {
  return apiPost('/api/demo/break', {});
}

export function demoKillWorker(): Promise<WorkerSummary> {
  return apiPost('/api/demo/kill-worker', {});
}

export function demoReset(): Promise<DemoResetResult> {
  return apiPost('/api/demo/reset', {});
}
