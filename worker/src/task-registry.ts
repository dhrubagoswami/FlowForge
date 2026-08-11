// Maps each TaskType to its handler function. No handler logic lives here — only the mapping.
// Each handler keeps its own strongly-typed TaskInputFor<T> signature for direct/test use; runTask
// is the one place that dispatches dynamically by a runtime TaskType value, after validateTaskInput
// has already confirmed the input matches that task's schema — the cast there is guarded, not blind.
import { getTaskInputSchema, type TaskType } from '@flowforge/shared';
import type { TaskLogger } from './lib/task-logger.ts';
import { runDbSnapshot } from './tasks/db-snapshot.task.ts';
import { runHttpCheck } from './tasks/http-check.task.ts';
import { runHttpFetchJson } from './tasks/http-fetch-json.task.ts';
import { runNotifyWebhook } from './tasks/notify-webhook.task.ts';
import { runReportGenerate } from './tasks/report-generate.task.ts';
import { runSimulate } from './tasks/simulate.task.ts';

type AnyTaskHandler = (input: never, log: TaskLogger) => Promise<Record<string, unknown>>;

const TASK_REGISTRY: Record<TaskType, AnyTaskHandler> = {
  'http.check': runHttpCheck,
  'http.fetch_json': runHttpFetchJson,
  'report.generate': runReportGenerate,
  'notify.webhook': runNotifyWebhook,
  'db.snapshot': runDbSnapshot,
  simulate: runSimulate,
};

/** Validates raw task_input against the task's own schema, then runs that task's handler. Throws if the input doesn't match the schema. */
export async function runTask(type: TaskType, rawInput: unknown, log: TaskLogger): Promise<Record<string, unknown>> {
  const schema = getTaskInputSchema(type);
  const input = schema.parse(rawInput);
  const handler = TASK_REGISTRY[type];
  return handler(input as never, log);
}
