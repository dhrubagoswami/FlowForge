// Request/response shapes for the HTTP API — the contract in PHASE2.md §6, nothing route-specific beyond that.
import { z } from 'zod';
import { jobHealthSchema, jobStatusSchema, logLevelSchema, runStatusSchema, runTriggerSourceSchema, triggerTypeSchema, workerStatusSchema } from '../constants/enums.ts';
import { jobConfigSchema, triggerShape, taskSchema, retrySchema, idempotencySchema, alertSchema } from './job-config.schema.ts';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const createJobRequestSchema = jobConfigSchema;
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

// A true deep partial, not zod's shallow .partial() — omitted fields (at any level, e.g. just
// retry.baseMs inside retry) keep their current DB value; the merged whole is still validated
// against the full jobConfigSchema before saving (see job.service.ts), so a partial edit can never
// produce an invalid whole. name is excluded — a job's id/slug isn't something PATCH changes.
export const updateJobRequestSchema = z
  .object({
    description: z.string().optional(),
    trigger: triggerShape.partial().optional(),
    task: taskSchema.partial().optional(),
    timeoutMs: z.number().int().min(1000).max(900000).optional(),
    retry: retrySchema.partial().optional(),
    idempotency: idempotencySchema.partial().optional(),
    alert: alertSchema.partial().optional(),
  })
  .strict();
export type UpdateJobRequest = z.infer<typeof updateJobRequestSchema>;

export const jobSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  triggerType: triggerTypeSchema,
  schedLabel: z.string(),
  status: jobStatusSchema,
  health: jobHealthSchema,
  successRatePct: z.number(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  avgDurationMs: z.number().nullable(),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;

export const jobDetailSchema = jobSummarySchema.extend({
  config: jobConfigSchema,
});
export type JobDetail = z.infer<typeof jobDetailSchema>;

export const runSummarySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobName: z.string(),
  status: runStatusSchema,
  triggerSource: runTriggerSourceSchema,
  attempt: z.number().int(),
  maxAttempts: z.number().int(),
  workerId: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export const runLogLineSchema = z.object({
  id: z.number().int(),
  ts: z.string(),
  level: logLevelSchema,
  message: z.string(),
});
export type RunLogLine = z.infer<typeof runLogLineSchema>;

export const workerSummarySchema = z.object({
  id: z.string(),
  hostname: z.string(),
  status: workerStatusSchema,
  concurrency: z.number().int(),
  inflight: z.number().int(),
  lastHeartbeatAt: z.string(),
});
export type WorkerSummary = z.infer<typeof workerSummarySchema>;

export const statsOverviewSchema = z.object({
  runsLast24h: z.number(),
  successRatePct: z.number(),
  queueDepth: z.number(),
  p95WaitMs: z.number(),
  activity: z.array(
    z.object({
      hour: z.string(),
      succeeded: z.number().int(),
      failed: z.number().int(),
    }),
  ),
  topWorkers: z.array(
    z.object({
      id: z.string(),
      inflight: z.number().int(),
      concurrency: z.number().int(),
    }),
  ),
  recentRuns: z.array(runSummarySchema),
});
export type StatsOverview = z.infer<typeof statsOverviewSchema>;

export const failureClusterSchema = z.object({
  errorType: z.string(),
  count: z.number().int(),
  sampleMessage: z.string(),
  jobIds: z.array(z.string()),
});
export type FailureCluster = z.infer<typeof failureClusterSchema>;

export const aiComposeRequestSchema = z.object({
  prompt: z.string().min(1),
});
export type AiComposeRequest = z.infer<typeof aiComposeRequestSchema>;

export const aiComposeResponseSchema = z.object({
  config: jobConfigSchema,
  yaml: z.string(),
  validation: z.object({ ok: z.literal(true) }),
});
export type AiComposeResponse = z.infer<typeof aiComposeResponseSchema>;

export const aiComposeFailureResponseSchema = z.object({
  error: z.string(),
  validation: z.object({
    ok: z.literal(false),
    issues: z.array(z.string()),
  }),
});
export type AiComposeFailureResponse = z.infer<typeof aiComposeFailureResponseSchema>;

export const aiDiagnoseRequestSchema = z.object({
  windowHours: z.number().int().min(1).max(720).optional(),
  jobId: z.string().optional(),
});
export type AiDiagnoseRequest = z.infer<typeof aiDiagnoseRequestSchema>;

export const aiDiagnoseFindingSchema = z.object({
  title: z.string(),
  detail: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
});

export const aiDiagnoseFixSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
  action: z.record(z.string(), z.unknown()).optional(),
});

export const aiDiagnoseResponseSchema = z.object({
  summary: z.string(),
  findings: z.array(aiDiagnoseFindingSchema),
  fixes: z.array(aiDiagnoseFixSchema),
  clusters: z.array(failureClusterSchema),
});
export type AiDiagnoseResponse = z.infer<typeof aiDiagnoseResponseSchema>;
