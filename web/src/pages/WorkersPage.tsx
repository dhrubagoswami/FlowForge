import type { WorkerCard } from '../types';
import { CardEmpty, CardError, CardSkeleton } from '../components/CardStates';

export function WorkersPage(props: {
  workers: WorkerCard[];
  workersOnline: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { workers, workersOnline, loading, error, onRetry } = props;
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 38, margin: '0 0 4px' }}>Workers</h1>
        <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Stateless containers pulling from one Redis queue.</p>
      </div>
      {loading ? (
        <div className="card elev-sm" style={{ padding: '18px 20px', marginBottom: 18 }}><CardSkeleton lines={4} /></div>
      ) : error ? (
        <div className="card elev-sm" style={{ padding: '18px 20px', marginBottom: 18 }}><CardError message={error} onRetry={onRetry} /></div>
      ) : workers.length === 0 ? (
        <div className="card elev-sm" style={{ padding: '18px 20px', marginBottom: 18 }}><CardEmpty message="No workers reporting in." /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
          {workers.map(w => (
            <div className="card elev-sm" style={{ padding: '18px 20px', gap: 10 }} key={w.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13 }}>{w.id}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`tag ${w.tagClass}`}>{w.state}</span>
                  <span className={`tag ${w.statusTagClass}`} style={{ fontWeight: 600 }}>{w.status}</span>
                </div>
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
      )}
      <div className="card" style={{ padding: 22, gap: 14 }}>
        <h4 style={{ margin: 0 }}>Scaling</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="text-muted" style={{ fontSize: 13 }}>Replicas</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-icon" disabled title="Scaling arrives with the write API (M7)">−</button>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 26, minWidth: 34, textAlign: 'center' }}>{workersOnline}</span>
            <button className="btn btn-secondary btn-icon" disabled title="Scaling arrives with the write API (M7)">+</button>
          </div>
          <span className="text-muted" style={{ fontSize: 13 }}>· scaling arrives at M7 · concurrency varies per worker</span>
        </div>
      </div>
    </div>
  );
}
