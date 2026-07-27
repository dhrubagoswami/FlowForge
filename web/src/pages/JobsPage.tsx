import type { JobRow } from '../types';

export function JobsPage(props: { jobRows: JobRow[]; onGoComposer: () => void }) {
  const { jobRows, onGoComposer } = props;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 38, margin: '0 0 4px' }}>Jobs</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Cron and webhook definitions, versioned as YAML.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input" style={{ width: 220 }} placeholder="Filter jobs…" />
          <button className="btn btn-primary" onClick={onGoComposer}>New job</button>
        </div>
      </div>
      <div className="card" style={{ padding: '20px 22px' }}>
        <table className="table">
          <thead><tr><th>Job</th><th>Trigger</th><th>Schedule</th><th>Success (7d)</th><th>Last run</th><th>p50</th><th>Status</th></tr></thead>
          <tbody>
            {jobRows.map(j => (
              <tr className="ffrow" onClick={j.open} key={j.id}>
                <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13 }}>{j.name}</td>
                <td><span className="tag tag-neutral">{j.trigger}</span></td>
                <td className="text-muted" style={{ fontSize: 13 }}>{j.schedLabel}</td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 82, height: 7, borderRadius: 999, background: 'color-mix(in srgb, var(--color-text) 10%, transparent)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', background: j.fill, width: j.pct }} />
                    </span>
                    <span style={{ fontSize: 12.5 }}>{j.rate.toFixed(1)}%</span>
                  </span>
                </td>
                <td className="text-muted" style={{ fontSize: 13 }}>{j.last}</td>
                <td style={{ fontSize: 13 }}>{j.avg}</td>
                <td><span className={`tag ${j.tagClass}`}>{j.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
