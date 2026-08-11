// Refreshes lastHeartbeatAt to "now" for the 7 workers meant to read online, leaving worker-08 stale. Run with `pnpm db:touch-workers` right before demoing/viewing — until M5 brings a real worker process with a live heartbeat loop, seeded heartbeats go stale the moment time passes.
import { eq } from 'drizzle-orm';
import { db } from '../client.ts';
import { workersTable } from '../schema/index.ts';
import { SEED_WORKERS } from './seed-workers.ts';

async function main() {
  const now = new Date();

  for (const worker of SEED_WORKERS) {
    await db
      .update(workersTable)
      .set({ lastHeartbeatAt: new Date(now.getTime() - worker.heartbeatAgeSeconds * 1000) })
      .where(eq(workersTable.id, worker.id));
  }

  console.log(`Refreshed heartbeats for ${SEED_WORKERS.length} workers relative to ${now.toISOString()}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Touch-workers failed:', err);
  process.exit(1);
});
