// Writes one run's log lines back to the database, in order, as the task producing them runs.
import type { LogLevel } from '@flowforge/shared';
import { runLogsTable } from '@flowforge/shared';
import { db } from '../db/client.ts';
import { publishRealtimeEvent } from './realtime-publisher.ts';

export function createTaskLogger(runId: string) {
  return async function log(level: LogLevel, message: string): Promise<void> {
    const [row] = await db.insert(runLogsTable).values({ runId, ts: new Date(), level, message }).returning();
    if (row) {
      publishRealtimeEvent({
        event: 'run.log',
        data: { runId, line: { id: row.id, ts: row.ts.toISOString(), level: row.level, message: row.message } },
      });
    }
  };
}

export type TaskLogger = ReturnType<typeof createTaskLogger>;
