// Strict per-task-type input schemas, plus a lookup map keyed by TaskType. Used by the API validator and the AI validator as a second pass after job-config.schema.ts's loose parse.
import { z } from 'zod';
import { FAILURE_MODES, type TaskType } from '../constants/enums.ts';

export const httpCheckInputSchema = z.strictObject({
  url: z.url(),
  expectStatus: z.number().int().min(100).max(599).optional(),
  expectContains: z.string().min(1).optional(),
  timeoutMs: z.number().int().min(1000).max(900000).optional(),
});

export const httpFetchJsonInputSchema = z.strictObject({
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
  assertPath: z.string().min(1).optional(),
  assertEquals: z.unknown().optional(),
});

export const reportGenerateInputSchema = z.strictObject({
  windowHours: z.number().int().min(1).max(720),
  groupBy: z.string().min(1),
});

export const notifyWebhookInputSchema = z.strictObject({
  url: z.url(),
  payload: z.record(z.string(), z.unknown()),
});

export const dbSnapshotInputSchema = z.strictObject({
  table: z.string().min(1),
});

export const simulateInputSchema = z.strictObject({
  durationMs: z.number().int().min(0).max(900000),
  failureMode: z.enum(FAILURE_MODES).optional(),
  failureRate: z.number().min(0).max(1).optional(),
});

export const TASK_INPUT_SCHEMAS = {
  'http.check': httpCheckInputSchema,
  'http.fetch_json': httpFetchJsonInputSchema,
  'report.generate': reportGenerateInputSchema,
  'notify.webhook': notifyWebhookInputSchema,
  'db.snapshot': dbSnapshotInputSchema,
  simulate: simulateInputSchema,
} satisfies Record<TaskType, z.ZodType>;

export type TaskInputFor<T extends TaskType> = z.infer<(typeof TASK_INPUT_SCHEMAS)[T]>;

export function getTaskInputSchema(type: TaskType) {
  return TASK_INPUT_SCHEMAS[type];
}
