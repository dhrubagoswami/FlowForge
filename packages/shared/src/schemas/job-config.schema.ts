// The canonical JobConfig — single source of truth used by the API validator, the AI output validator, and seed data.
import { CronExpressionParser } from 'cron-parser';
import { z } from 'zod';
import { IDEMPOTENCY_TEMPLATE_TOKENS, retryBackoffSchema, taskTypeSchema, triggerTypeSchema } from '../constants/enums.ts';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TEMPLATE_TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function hasOnlyKnownTemplateTokens(template: string): boolean {
  const matches = template.matchAll(TEMPLATE_TOKEN_PATTERN);
  for (const match of matches) {
    if (!IDEMPOTENCY_TEMPLATE_TOKENS.includes(match[1] as (typeof IDEMPOTENCY_TEMPLATE_TOKENS)[number])) {
      return false;
    }
  }
  return true;
}

// The bare shape, exported separately so callers that need a partial version (PATCH's deep-partial
// update schema) can build one — zod v4 refuses .partial() on a schema carrying a refinement, since
// partial-ing the shape can invalidate the refinement's own assumptions.
export const triggerShape = z.object({
  type: triggerTypeSchema,
  expr: z.string().min(1).optional(),
  tz: z.string().min(1).default('UTC'),
});

export const triggerSchema = triggerShape.superRefine((trigger, ctx) => {
    if (trigger.type !== 'cron') return;
    if (!trigger.expr) {
      ctx.addIssue({ code: 'custom', path: ['expr'], message: 'expr is required when trigger.type is "cron"' });
      return;
    }
    try {
      CronExpressionParser.parse(trigger.expr, { tz: trigger.tz });
    } catch {
      ctx.addIssue({ code: 'custom', path: ['expr'], message: `"${trigger.expr}" is not a valid 5-field cron expression` });
    }
  });

export const taskSchema = z.object({
  type: taskTypeSchema,
  input: z.record(z.string(), z.unknown()),
});

export const retrySchema = z.object({
  attempts: z.number().int().min(1).max(10),
  backoff: retryBackoffSchema,
  baseMs: z.number().int().min(1000).max(600000),
});

export const idempotencySchema = z.object({
  keyTemplate: z
    .string()
    .min(1)
    .refine(hasOnlyKnownTemplateTokens, {
      message: `keyTemplate may only use tokens: ${IDEMPOTENCY_TEMPLATE_TOKENS.map((t) => `{{${t}}}`).join(', ')}`,
    }),
  ttlSeconds: z.number().int().min(60).max(604800),
});

export const alertSchema = z.object({
  afterConsecutiveFailures: z.number().int().min(1).max(20),
  channel: z.string().min(1).optional(),
});

export const jobConfigSchema = z.object({
  name: z.string().regex(SLUG_PATTERN, 'name must be a kebab-case slug, e.g. "competitor-pricing-scrape"'),
  description: z.string().optional(),
  trigger: triggerSchema,
  task: taskSchema,
  timeoutMs: z.number().int().min(1000).max(900000),
  retry: retrySchema,
  idempotency: idempotencySchema,
  alert: alertSchema,
});

export type JobConfig = z.infer<typeof jobConfigSchema>;
