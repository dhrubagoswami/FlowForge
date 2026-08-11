// Runs the same full diff-and-fix pass the server does at boot, without a restart — useful when the
// jobs table and BullMQ's schedule set have drifted (e.g. after a manual DB edit) and you want it
// fixed and verified without bouncing the whole process. Run with: pnpm --filter=@flowforge/server exec tsx scripts/reconcile-schedules.ts
import { reconcileAllSchedules } from '../src/queue/scheduler.ts';

const result = await reconcileAllSchedules();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
