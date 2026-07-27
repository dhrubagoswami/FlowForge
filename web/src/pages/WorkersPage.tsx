import type { WorkerCard } from '../types';

export function WorkersPage(props: {
  workers: WorkerCard[];
  workersOnline: number;
  drain: string;
  onScaleUp: () => void;
  onScaleDown: () => void;
}) {
  const { workers, workersOnline, drain, onScaleUp, onScaleDown } = props;
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 38, margin: '0 0 4px' }}>Workers</h1>
        <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Stateless containers pulling from one Redis queue — scale by adding replicas.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        {workers.map(w => (
          <div className="card elev-sm" style={{ padding: '18px 20px', gap: 10 }} key={w.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13 }}>{w.id}</span>
              <span className={`tag ${w.tagClass}`}>{w.state}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{w.inflight}</span>
              <span className="text-muted" style={{ fontSize: 12 }}>/ {w.capacity} in flight</span>
            </div>
            <span style={{ height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--color-text) 10%, transparent)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', background: w.fill, width: w.pct }} />
            </span>
            <div className="text-muted" style={{ fontSize: 11.5 }}>{w.meta}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 22, gap: 14 }}>
        <h4 style={{ margin: 0 }}>Scaling</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="text-muted" style={{ fontSize: 13 }}>Replicas</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-icon" onClick={onScaleDown}>−</button>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 26, minWidth: 34, textAlign: 'center' }}>{workersOnline}</span>
            <button className="btn btn-secondary btn-icon" onClick={onScaleUp}>+</button>
          </div>
          <span className="text-muted" style={{ fontSize: 13 }}>· est. drain time {drain} · concurrency 4 per replica</span>
        </div>
      </div>
    </div>
  );
}
