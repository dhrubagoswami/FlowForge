// Strict validation of Gemini's raw JSON output: a full jobConfigSchema parse (catches hallucinated
// task types, invalid cron expressions, out-of-bounds numbers) plus a second pass checking task.input
// against that specific task type's own schema. The AI never writes to the database — this function
// only says yes or no with reasons; ai-composer.service.ts decides what to do with the answer.
import { getTaskInputSchema, jobConfigSchema, type JobConfig, type TaskType } from '@flowforge/shared';

export type JobConfigValidationResult = { ok: true; config: JobConfig } | { ok: false; issues: string[] };

function formatIssue(path: PropertyKey[], message: string): string {
  const location = path.length > 0 ? path.join('.') : '(root)';
  return `${location}: ${message}`;
}

// The structured-output schema (compose-job.prompt.ts) offers Gemini every task type's field names
// in one flat object, since JSON Schema can't easily make task.input's shape conditional on
// task.type — so the model occasionally includes a field from a different task type alongside the
// correct ones (e.g. http.check with a stray report.generate field). Silently dropping keys the
// *chosen* task type doesn't recognize is not "trusting the model's own conformance" (§9.2.3) — the
// strict per-field parse below still fails loudly on anything actually wrong or missing for that
// task type. It only ignores extra noise around an otherwise-correct answer, so a good answer isn't
// wasted retrying over a field that was never going to be used anyway.
function stripUnknownTaskInputKeys(taskType: TaskType, input: Record<string, unknown>): Record<string, unknown> {
  const shape = getTaskInputSchema(taskType).shape as Record<string, unknown>;
  return Object.fromEntries(Object.entries(input).filter(([key]) => key in shape));
}

export function validateComposedJobConfig(raw: unknown): JobConfigValidationResult {
  const parsed = jobConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => formatIssue(issue.path, issue.message)) };
  }

  const config = parsed.data;
  const taskType = config.task.type as TaskType;
  const taskInputSchema = getTaskInputSchema(taskType);
  const cleanedInput = stripUnknownTaskInputKeys(taskType, config.task.input);
  const taskInputResult = taskInputSchema.safeParse(cleanedInput);
  if (!taskInputResult.success) {
    const issues = taskInputResult.error.issues.map((issue) => formatIssue(['task', 'input', ...issue.path], issue.message));
    return { ok: false, issues };
  }

  return { ok: true, config: { ...config, task: { ...config.task, input: cleanedInput } } };
}
