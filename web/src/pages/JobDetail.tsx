import type { JobDetailData, LogLine, RunRow } from '../types';

export function JobDetail(props: {
  job: JobDetailData;
  jobRuns: RunRow[];
  guarantees: { k: string; v: string }[];
  logs: LogLine[];
  live: boolean;
  liveLabel: string;
  logCount: number;
  onToggleLive: () => void;
  onClearLogs: () => void;
  onRunNow: () => void;
  onGoJobs: () => void;
  onGoFailures: () => void;
}) {
  const { job, jobRuns, guarantees, logs, liveLabel, logCount, onToggleLive, onClearLogs, onRunNow, onGoJobs, onGoFailures } = props;
  return (
    <div>
      <button className="btn btn-ghost" style={{ marginBottom: 10, fontSize: 13 }} onClick={onGoJobs}>← All jobs</button>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 34, margin: '0 0 8px', fontFamily: 'ui-monospace,monospace', letterSpacing: '-.01em' }}>{job.name}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`tag ${job.tagClass}`}>{job.status}</span>
            <span className="tag tag-neutral">{job.trigger}</span>
            <span className="text-muted" style={{ fontSize: 13 }}>{job.schedLabel} · next in {job.next}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onGoFailures}>Summarize failures</button>
          <button className="btn btn-secondary">Pause</button>
          <button className="btn btn-primary" onClick={onRunNow}>Run now</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, marginBottom: 18 }}>
        <div className="card" style={{ padding: '20px 22px', gap: 12 }}>
          <h4 style={{ margin: 0 }}>Run history</h4>
          <table className="table">
            <thead><tr><th>Run</th><th>Started</th><th>Attempts</th><th>Worker</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody>
              {jobRuns.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12.5, opacity: 0.7 }}>{r.id}</td>
                  <td className="text-muted" style={{ fontSize: 13 }}>{r.started}</td>
                  <td>{r.attempts}</td>
                  <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12.5, opacity: 0.7 }}>{r.worker}</td>
                  <td style={{ fontSize: 13 }}>{r.duration}</td>
                  <td><span className={`tag ${r.tagClass}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card" style={{ padding: '20px 22px', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0 }}>Delivery guarantees</h4>
            </div>
            {guarantees.map(g => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '5px 0', borderBottom: '1px solid color-mix(in srgb, var(--color-text) 8%, transparent)' }} key={g.k}>
                <span className="text-muted">{g.k}</span>
                <span style={{ textAlign: 'right' }}>{g.v}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: '20px 22px', gap: 10 }}>
            <h4 style={{ margin: 0 }}>job.yaml</h4>
            <pre style={{ margin: 0, fontFamily: 'ui-monospace,monospace', fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap', background: '#17140f', color: '#e8dcc8', padding: '14px 16px', borderRadius: 18 }}>{job.yaml}</pre>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h4 style={{ margin: 0 }}>Live logs</h4>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} className="text-muted">
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--color-accent)', animation: 'ffpulse 1.6s ease-in-out infinite' }} />
              streaming · {logCount} lines
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onToggleLive}>{liveLabel}</button>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onClearLogs}>Clear</button>
          </div>
        </div>
        <div style={{ background: '#17140f', borderRadius: 20, padding: '16px 18px', height: 260, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse' }}>
          <div>
            {logs.map((l, i) => (
              <div style={{ display: 'flex', gap: 12, fontFamily: 'ui-monospace,monospace', fontSize: 12.5, lineHeight: 1.75, animation: 'ffin .18s ease-out' }} key={i}>
                <span style={{ color: '#6f6555', flex: 'none' }}>{l.t}</span>
                <span style={{ flex: 'none', width: 52, color: l.color }}>{l.level}</span>
                <span style={{ color: '#e2d7c4' }}>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
