// The run_logs table — log lines that stream to the Job Detail page, one row per line.
import { LOG_LEVELS } from '../../constants/enums.ts';
import { bigserial, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { runsTable } from './runs.table.ts';

export const logLevelEnum = pgEnum('log_level', LOG_LEVELS);

export const runLogsTable = pgTable(
  'run_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runsTable.id),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    level: logLevelEnum('level').notNull(),
    message: text('message').notNull(),
  },
  (table) => [index('run_logs_run_id_ts_idx').on(table.runId, table.ts)],
);
