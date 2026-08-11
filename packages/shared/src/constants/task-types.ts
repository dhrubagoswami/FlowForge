// The fixed task menu — human-readable metadata for each TaskType. No handler logic lives here.
import { TASK_TYPES, type TaskType } from './enums.ts';

export const TASK_TYPE_DESCRIPTIONS: Record<TaskType, string> = {
  'http.check': 'GET a URL, assert status code and optional body-contains',
  'http.fetch_json': 'GET a JSON endpoint, optionally assert a JSONPath value',
  'report.generate': "Aggregate FlowForge's own run data into a summary record",
  'notify.webhook': 'POST a payload to a URL (used for alerts too)',
  'db.snapshot': "Snapshot a table's row count into a record",
  simulate: 'Deterministic test task: sleeps, then succeeds or fails on demand',
};

export const TASK_TYPE_LIST: readonly TaskType[] = TASK_TYPES;
