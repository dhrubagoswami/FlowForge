// Recomputes and stores a job's health after one of its runs settles, using the same §5 rule the read API uses.
import { deriveJobHealth, JOB_HEALTH_SAMPLE_SIZE, jobsTable, runsTable } from '@flowforge/shared';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';

export async function recomputeJobHealth(jobId: string): Promise<void> {
  const [job] = await db.select({ status: jobsTable.status }).from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
  if (!job) return;

  const recentRuns = await db
    .select({ status: runsTable.status })
    .from(runsTable)
    .where(eq(runsTable.jobId, jobId))
    .orderBy(desc(runsTable.queuedAt))
    .limit(JOB_HEALTH_SAMPLE_SIZE);

  const health = deriveJobHealth(
    job.status,
    recentRuns.map((r) => r.status),
  );

  await db.update(jobsTable).set({ health, updatedAt: new Date() }).where(eq(jobsTable.id, jobId));
}
