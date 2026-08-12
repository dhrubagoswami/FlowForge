// pnpm dev:clean — kills any node process whose command line points at this repo (a stray
// `tsx watch` from a previous `pnpm dev` that was never stopped), so a fresh `pnpm dev` can't
// silently start alongside orphans and accumulate duplicate worker/server instances (the actual
// cause of the 2026-08-11 incident — see DECISIONS.md). Cross-platform: uses `wmic`/PowerShell CIM
// on Windows, `ps` elsewhere.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(new URL('.', import.meta.url))).replace(/\\scripts$/, '');
const currentPid = process.pid;

// Written to a temp .ps1 file and run with -File, not -Command with a hand-escaped inline string —
// cmd.exe's own quoting rules mangle PowerShell's $(...) subexpression syntax before PowerShell
// ever sees it, which silently breaks a -Command one-liner (confirmed: 'is not recognized' error).
function findWindowsPids() {
  const dir = mkdtempSync(path.join(tmpdir(), 'flowforge-dev-clean-'));
  const scriptPath = path.join(dir, 'list-node.ps1');
  try {
    writeFileSync(scriptPath, `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`);
    const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { encoding: 'utf8' });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [pidStr, ...rest] = line.split('|');
        return { pid: Number(pidStr), commandLine: rest.join('|') };
      })
      .filter((p) => Number.isFinite(p.pid));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function findUnixPids() {
  const output = execSync('ps -eo pid,args', { encoding: 'utf8' });
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(.*)$/.exec(line);
      if (!match) return null;
      return { pid: Number(match[1]), commandLine: match[2] };
    })
    .filter((p) => p !== null);
}

function killPid(pid) {
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`);
  } else {
    process.kill(pid, 'SIGKILL');
  }
}

const allProcesses = process.platform === 'win32' ? findWindowsPids() : findUnixPids();

const normalizedRoot = repoRoot.replace(/\\/g, '/').toLowerCase();
const orphans = allProcesses.filter((p) => {
  if (p.pid === currentPid) return false;
  const cmd = (p.commandLine ?? '').replace(/\\/g, '/').toLowerCase();
  return cmd.includes(normalizedRoot) && (cmd.includes('tsx') || cmd.includes('vite') || cmd.includes('pnpm'));
});

if (orphans.length === 0) {
  console.log('dev:clean — no orphaned FlowForge node processes found.');
  process.exit(0);
}

console.log(`dev:clean — found ${orphans.length} orphaned FlowForge node process(es), killing:`);
for (const p of orphans) {
  console.log(`  pid ${p.pid}: ${p.commandLine.slice(0, 120)}`);
  try {
    killPid(p.pid);
  } catch (err) {
    console.error(`  failed to kill pid ${p.pid}:`, err instanceof Error ? err.message : err);
  }
}
console.log('dev:clean — done.');
