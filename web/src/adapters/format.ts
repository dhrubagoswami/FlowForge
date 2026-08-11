// Formatting helpers shared by every adapter — turn raw API values (ms, ISO timestamps) into the
// short display strings the existing page components already expect (e.g. "12.1s", "2m ago").
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${(minutes % 60).toString().padStart(2, '0')}m`;
}

export function formatRelativeToNow(iso: string | null): string {
  if (!iso) return '—';
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (deltaMs < 0) return 'just now';
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatUntilNow(iso: string | null): string {
  if (!iso) return '—';
  const deltaMs = new Date(iso).getTime() - Date.now();
  if (deltaMs <= 0) return 'due now';
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function clock(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 8);
}
