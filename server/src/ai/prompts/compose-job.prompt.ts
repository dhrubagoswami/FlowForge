// The prompt (and its matching JSON response schema) for turning plain English into a JobConfig
// candidate. No inline prompt strings live anywhere else — ai-composer.service.ts only calls this.
import { TASK_TYPE_LIST } from '@flowforge/shared';

export const COMPOSE_JOB_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'kebab-case slug, e.g. "competitor-pricing-scrape"' },
    description: { type: 'string' },
    trigger: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['cron', 'webhook', 'manual'] },
        expr: { type: 'string', description: 'required 5-field cron expression when type is "cron"' },
        tz: { type: 'string', description: 'IANA timezone, default UTC' },
      },
      required: ['type'],
    },
    task: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...TASK_TYPE_LIST] },
        input: {
          type: 'object',
          description:
            'Only include the fields that apply to the chosen task.type — never include fields from a different task type.',
          properties: {
            url: { type: 'string', description: 'http.check, http.fetch_json, notify.webhook: the URL' },
            expectStatus: { type: 'integer', description: 'http.check: expected HTTP status code, e.g. 200' },
            expectContains: { type: 'string', description: 'http.check: substring the response body must contain' },
            timeoutMs: { type: 'integer', description: 'http.check: per-request timeout' },
            headers: { type: 'object', description: 'http.fetch_json: request headers' },
            assertPath: { type: 'string', description: 'http.fetch_json: JSONPath to assert against' },
            assertEquals: { description: 'http.fetch_json: value assertPath must equal' },
            windowHours: { type: 'integer', description: 'report.generate: how many hours of history to summarise' },
            groupBy: { type: 'string', description: 'report.generate: field to group the summary by' },
            payload: { type: 'object', description: 'notify.webhook: the JSON body to POST' },
            table: { type: 'string', description: 'db.snapshot: the table name' },
            durationMs: { type: 'integer', description: 'simulate: how long the fake task sleeps' },
            failureMode: { type: 'string', enum: ['rate_limit', 'timeout', 'crash', 'none'], description: 'simulate only' },
            failureRate: { type: 'number', description: 'simulate: 0-1 probability of failing' },
          },
        },
      },
      required: ['type', 'input'],
    },
    timeoutMs: { type: 'integer', description: '1000-900000' },
    retry: {
      type: 'object',
      properties: {
        attempts: { type: 'integer', description: '1-10' },
        backoff: { type: 'string', enum: ['fixed', 'exponential'] },
        baseMs: { type: 'integer', description: '1000-600000' },
      },
      required: ['attempts', 'backoff', 'baseMs'],
    },
    idempotency: {
      type: 'object',
      properties: {
        keyTemplate: { type: 'string', description: 'may use {{job}}, {{scheduled_at}}, {{input_hash}} tokens only' },
        ttlSeconds: { type: 'integer', description: '60-604800' },
      },
      required: ['keyTemplate', 'ttlSeconds'],
    },
    alert: {
      type: 'object',
      properties: {
        afterConsecutiveFailures: { type: 'integer', description: '1-20' },
        channel: { type: 'string' },
      },
      required: ['afterConsecutiveFailures'],
    },
  },
  required: ['name', 'trigger', 'task', 'timeoutMs', 'retry', 'idempotency', 'alert'],
};

export function composeJobPrompt(userPrompt: string): string {
  return `You turn a plain-English description of a background job into a FlowForge JobConfig.

The fixed task menu (task.type must be exactly one of these, never invented):
${TASK_TYPE_LIST.map((t) => `- ${t}`).join('\n')}

Rules:
- trigger.type "cron" requires a valid 5-field cron expression in trigger.expr.
- idempotency.keyTemplate may only reference {{job}}, {{scheduled_at}}, {{input_hash}} — no other tokens.
- Pick sensible defaults the user didn't specify: timeoutMs around 120000, retry.attempts 3 with exponential backoff, idempotency.ttlSeconds 86400, alert.afterConsecutiveFailures 3.
- task.input is REQUIRED and must never be empty. Extract every value it needs directly from the
  user's description (e.g. a URL mentioned in the text goes in task.input.url). Include only the
  fields that apply to the chosen task.type, but every field that task.type requires must be present.
- If the description does not give you a URL, table name, or other value a task type strictly
  requires, pick the closest task type that only needs what was actually said (e.g. prefer
  "simulate" over "http.check" when no real URL was given), rather than inventing a fake value.
- name must be a kebab-case slug derived from the description, not copied verbatim.

Describe the job as: ${userPrompt}`;
}

export function composeJobRetryPrompt(userPrompt: string, previousIssues: string[]): string {
  return `${composeJobPrompt(userPrompt)}

Your previous attempt was invalid. Fix these problems and return a corrected JobConfig:
${previousIssues.map((issue) => `- ${issue}`).join('\n')}`;
}
