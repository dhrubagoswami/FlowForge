// Business rules for runs: assembling API-facing run/log shapes, paginating run history, and validating pagination input.
import type { RunLogLine, RunStatus, RunSummary } from '@flowforge/shared';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../config/constants.ts';
import { AppError } from '../lib/app-error.ts';
import { decodeRunCursor, encodeRunCursor } from '../lib/pagination-cursor.util.ts';
import { getJobDetail } from './job.service.ts';
import { findLogsByRunId } from '../repositories/run-log.repository.ts';
import { findRecentRuns, findRunById, findRunsByJobId, type RunRow, type RunRowWithJobName } from '../repositories/run.repository.ts';

function toRunSummary(run: RunRow, jobName: string): RunSummary {
  return {
    id: run.id,
    jobId: run.jobId,
    jobName,
    status: run.status,
    triggerSource: run.triggerSource,
    attempt: run.attempt,
    maxAttempts: run.maxAttempts,
    workerId: run.workerId,
    durationMs: run.durationMs,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
  };
}

function clampLimit(requested?: number): number {
  if (!requested || requested < 1) return DEFAULT_PAGE_LIMIT;
  return Math.min(requested, MAX_PAGE_LIMIT);
}

export interface PagedRuns {
  runs: RunSummary[];
  nextCursor: string | null;
}

export async function listRunsForJob(params: { jobId: string; limit?: number; cursor?: string }): Promise<PagedRuns> {
  const limit = clampLimit(params.limit);
  const cursor = params.cursor ? decodeRunCursor(params.cursor) : null;
  if (params.cursor && !cursor) {
    throw new AppError({ code: 'INVALID_CURSOR', message: 'The cursor provided is not valid.', statusCode: 400 });
  }

  // Confirms the job exists (404s otherwise) and gives us its name for the run rows.
  const job = await getJobDetail(params.jobId);

  const rows = await findRunsByJobId({ jobId: params.jobId, limit: limit + 1, cursor });
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];

  return {
    runs: page.map((r) => toRunSummary(r, job.name)),
    nextCursor: hasMore && last ? encodeRunCursor({ queuedAt: last.queuedAt, id: last.id }) : null,
  };
}

function toRunSummaryWithJoin(run: RunRowWithJobName): RunSummary {
  return toRunSummary(run, run.jobName);
}

export async function listRecentRuns(params: { limit?: number; status?: RunStatus }): Promise<RunSummary[]> {
  const limit = clampLimit(params.limit);
  const rows = await findRecentRuns({ limit, status: params.status });
  return rows.map(toRunSummaryWithJoin);
}

export async function getRun(id: string): Promise<RunSummary> {
  const run = await findRunById(id);
  if (!run) {
    throw new AppError({ code: 'RUN_NOT_FOUND', message: `No run with id "${id}" was found.`, statusCode: 404 });
  }
  return toRunSummaryWithJoin(run);
}

export async function getRunLogs(params: { runId: string; since?: string }): Promise<RunLogLine[]> {
  let since: Date | undefined;
  if (params.since) {
    since = new Date(params.since);
    if (Number.isNaN(since.getTime())) {
      throw new AppError({ code: 'INVALID_SINCE', message: 'The "since" query parameter is not a valid timestamp.', statusCode: 400 });
    }
  }

  const rows = await findLogsByRunId({ runId: params.runId, since });
  return rows.map((r) => ({ id: r.id, ts: r.ts.toISOString(), level: r.level, message: r.message }));
}
