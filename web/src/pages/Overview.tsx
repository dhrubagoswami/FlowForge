import type { RunRow, WorkerCard } from '../types';

interface Stat {
  label: string;
  value: string;
  note: string;
}

interface Bar {
  x: number;
  y: number;
  h: number;
  fill: string;
}

export function Overview(props: {
  stats: Stat[];
  bars: Bar[];
  topWorkers: WorkerCard[];
  recentRuns: RunRow[];
  workersOnline: number;
  onGoFailures: () => void;
  onGoComposer: () => void;
  onGoWorkers: () => void;
  onGoJobs: () => void;
}) {
  const { stats, bars, topWorkers, recentRuns, workersOnline, onGoFailures, onGoComposer, onGoWorkers, onGoJobs } = props;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 26 }}>
        <div>
          <h1 style={{ fontSize: 38, margin: '0 0 4px' }}>Fleet overview</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Last 24 hours across 6 jobs and {workersOnline} workers.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onGoFailures}>Failure digest</button>
          <button className="btn btn-primary" onClick={onGoComposer}>Describe a job</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        {stats.map(s => (
          <div className="card elev-sm" style={{ gap: 6, padding: '18px 20px' }} key={s.label}>
            <div className="card-kicker">{s.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 34, lineHeight: 1.05 }}>{s.value}</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{s.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, marginBottom: 18 }}>
        <div className="card" style={{ padding: '20px 22px', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h4 style={{ margin: 0 }}>Queue depth</h4>
            <span className="text-muted" style={{ fontSize: 12 }}>enqueued vs. drained · 60 min</span>
          </div>
          <svg viewBox="0 0 560 130" style={{ width: '100%', height: 130 }} preserveAspectRatio="none">
            {bars.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={14} height={b.h} rx={6} fill={b.fill} />
            ))}
          </svg>
          <div style={{ display: 'flex', gap: 18, fontSize: 12 }} className="text-muted">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--color-accent-400)' }} />enqueued</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--color-accent-2-500)' }} />drained</span>
          </div>
        </div>

        <div className="card" style={{ padding: '20px 22px', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h4 style={{ margin: 0 }}>Worker fleet</h4>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onGoWorkers}>All workers</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {topWorkers.map(w => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} key={w.id}>
                <span style={{ fontSize: 12.5, width: 88, flex: 'none' }}>{w.id}</span>
                <span style={{ flex: 1, height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--color-text) 10%, transparent)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', borderRadius: 999, background: w.fill, width: w.pct }} />
                </span>
                <span className="text-muted" style={{ fontSize: 11.5, width: 52, textAlign: 'right' }}>{w.load}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0 }}>Recent runs</h4>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onGoJobs}>All jobs</button>
        </div>
        <table className="table">
          <thead><tr><th>Run</th><th>Job</th><th>Trigger</th><th>Attempts</th><th>Worker</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>
            {recentRuns.map(r => (
              <tr className="ffrow" onClick={r.open} key={r.id}>
                <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12.5, opacity: 0.7 }}>{r.id}</td>
                <td>{r.job}</td>
                <td className="text-muted">{r.trigger}</td>
                <td>{r.attempts}</td>
                <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12.5, opacity: 0.7 }}>{r.worker}</td>
                <td>{r.duration}</td>
                <td><span className={`tag ${r.tagClass}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
