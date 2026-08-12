// pnpm redis:floor — measures this app's actual idle Redis command floor against a running
// server+worker pair. Waits 30s after invocation (so boot-time bursts like schedule reconciliation
// don't pollute the idle reading), then MONITORs for 90s, then reports total commands, cmd/sec, and
// a per-burst breakdown (commands landing within 200ms of each other count as one burst — this is
// what a single BZPOPMIN wakeup or heartbeat tick actually costs, not the raw command count).
import { Redis } from 'ioredis';
import { env } from '../src/config/env.ts';

const SETTLE_MS = 30000;
const CAPTURE_MS = 90000;
const BURST_GAP_MS = 200;

interface MonitorLine {
  atMs: number;
  command: string;
}

function fingerprintBurst(lines: MonitorLine[]): string {
  return lines.map((l) => l.command).join('+');
}

async function main(): Promise<void> {
  console.log(`redis:floor — waiting ${SETTLE_MS / 1000}s for boot-time activity to settle...`);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

  const monitorClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const lines: MonitorLine[] = [];
  const captureStartedAt = Date.now();

  const monitor = await monitorClient.monitor();
  monitor.on('monitor', (_time, args) => {
    lines.push({ atMs: Date.now() - captureStartedAt, command: String(args[0]).toUpperCase() });
  });

  console.log(`redis:floor — capturing for ${CAPTURE_MS / 1000}s...`);
  await new Promise((resolve) => setTimeout(resolve, CAPTURE_MS));
  await monitorClient.quit();

  const elapsedSeconds = CAPTURE_MS / 1000;
  const totalCommands = lines.length;
  const cmdPerSec = totalCommands / elapsedSeconds;

  const bursts: MonitorLine[][] = [];
  for (const line of lines) {
    const current = bursts.at(-1);
    if (current && line.atMs - current.at(-1)!.atMs <= BURST_GAP_MS) {
      current.push(line);
    } else {
      bursts.push([line]);
    }
  }

  const burstsByType = new Map<string, { count: number; totalCommands: number }>();
  for (const burst of bursts) {
    const key = fingerprintBurst(burst);
    const entry = burstsByType.get(key) ?? { count: 0, totalCommands: 0 };
    entry.count += 1;
    entry.totalCommands += burst.length;
    burstsByType.set(key, entry);
  }

  console.log('\n--- redis:floor report ---');
  console.log(`window: ${elapsedSeconds}s`);
  console.log(`total commands: ${totalCommands}`);
  console.log(`cmd/sec: ${cmdPerSec.toFixed(3)}`);
  console.log(`distinct burst types: ${burstsByType.size}`);
  console.log('\nburst breakdown (commands within 200ms = one burst):');
  for (const [signature, { count, totalCommands: burstCommandTotal }] of [...burstsByType.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const burstsPerMin = (count / elapsedSeconds) * 60;
    const commandsPerBurst = burstCommandTotal / count;
    console.log(`  [${signature}]`);
    console.log(`    bursts: ${count} (${burstsPerMin.toFixed(2)}/min) · commands/burst: ${commandsPerBurst.toFixed(1)} · total commands: ${burstCommandTotal}`);
  }
  console.log('--- end report ---\n');
}

main().catch((err: unknown) => {
  console.error('redis:floor failed:', err);
  process.exit(1);
});
