import type { RunRow, WorkerLoadBar } from '../types';
import { CardEmpty, CardError, CardSkeleton } from '../components/CardStates';

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
  topWorkers: WorkerLoadBar[];
  recentRuns: RunRow[];
  workersOnline: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onGoFailures: () => void;
  onGoComposer: () => void;
  onGoWorkers: () => void;
  onGoJobs: () => void;
  demoMessage: string | null;
  demoBusy: boolean;
  onDemoTrigger: () => void;
  onDemoBreak: () => void;
  onDemoKillWorker: () => void;
  onDemoReset: () => void;
}) {
  const {
    stats, bars, topWorkers, recentRuns, workersOnline, loading, error, onRetry, onGoFailures, onGoComposer, onGoWorkers, onGoJobs,
    demoMessage, demoBusy, onDemoTrigger, onDemoBreak, onDemoKillWorker, onDemoReset,
  } = props;
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

      <div className="card" style={{ padding: '18px 20px', gap: 10, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0 }}>Demo panel</h4>
          <span className="text-muted" style={{ fontSize: 12 }}>trigger, break, and recover real work on purpose</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-secondary" disabled={demoBusy} onClick={onDemoTrigger}>Fire a job</button>
          <button className="btn btn-secondary" disabled={demoBusy} onClick={onDemoBreak}>Break something</button>
          <button className="btn btn-secondary" disabled={demoBusy} onClick={onDemoKillWorker} title="Simulates worker loss at the database level — no OS process is touched.">
            Kill a worker
          </button>
          <button className="btn btn-ghost" disabled={demoBusy} onClick={onDemoReset}>Reset demo</button>
        </div>
        {demoMessage && <p className="text-muted" style={{ margin: 0, fontSize: 12.5 }}>{demoMessage}</p>}
      </div>

      {error ? (
        <div className="card elev-sm" style={{ padding: '18px 20px', marginBottom: 18 }}><CardError message={error} onRetry={onRetry} /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
            {loading
              ? Array.from({ length: 4 }, (_, i) => (
                  <div className="card elev-sm" style={{ gap: 6, padding: '18px 20px' }} key={i}><CardSkeleton height={62} /></div>
                ))
              : stats.map(s => (
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
              {loading ? (
                <CardSkeleton height={130} />
              ) : bars.length === 0 ? (
                <CardEmpty message="No activity in the last 24 hours." />
              ) : (
                <svg viewBox="0 0 560 130" style={{ width: '100%', height: 130 }} preserveAspectRatio="none">
                  {bars.map((b, i) => (
                    <rect key={i} x={b.x} y={b.y} width={14} height={b.h} rx={6} fill={b.fill} />
                  ))}
                </svg>
              )}
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
              {loading ? (
                <CardSkeleton lines={5} />
              ) : topWorkers.length === 0 ? (
                <CardEmpty message="No workers reporting in." />
              ) : (
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
              )}
            </div>
          </div>

          <div className="card" style={{ padding: '20px 22px', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0 }}>Recent runs</h4>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onGoJobs}>All jobs</button>
            </div>
            {loading ? (
              <CardSkeleton lines={6} />
            ) : recentRuns.length === 0 ? (
              <CardEmpty message="No runs yet." />
            ) : (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
