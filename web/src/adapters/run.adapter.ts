import type { RunLogLine, RunSummary } from '@flowforge/shared';
import type { LogLine, RunRow } from '../types.ts';
import { clock, formatDuration, formatRelativeToNow } from './format.ts';
import { RUN_STATUS_TAG_CLASS } from './tags.ts';

export function toRecentRunRow(run: RunSummary, open: () => void): RunRow {
  return {
    id: run.id.slice(0, 8),
    // jobId is the slug — the same on-screen identifier used everywhere else (see job.adapter.ts).
    job: run.jobId,
    trigger: run.triggerSource,
    attempts: `${run.attempt} / ${run.maxAttempts}`,
    worker: run.workerId ?? '—',
    duration: formatDuration(run.durationMs),
    status: run.status,
    tagClass: RUN_STATUS_TAG_CLASS[run.status],
    open,
  };
}

export function toJobRunRow(run: RunSummary): RunRow {
  return {
    id: run.id.slice(0, 8),
    started: formatRelativeToNow(run.queuedAt),
    attempts: `${run.attempt} / ${run.maxAttempts}`,
    worker: run.workerId ?? '—',
    duration: formatDuration(run.durationMs),
    status: run.status,
    tagClass: RUN_STATUS_TAG_CLASS[run.status],
  };
}

const LEVEL_COLOR: Record<RunLogLine['level'], string> = {
  info: '#8f8878',
  ok: '#aebf92',
  warn: '#f6a06b',
  error: '#e08a6a',
};

export function toLogLine(log: RunLogLine): LogLine {
  return { t: clock(log.ts), level: log.level, msg: log.message, color: LEVEL_COLOR[log.level] };
}
