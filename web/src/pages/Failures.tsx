import { CardEmpty, CardError, CardSkeleton } from '../components/CardStates';

export function Failures(props: {
  clusters: { title: string; sample: string; count: number; pct: string }[];
  clustersLoading: boolean;
  clustersError: string | null;
  onRetryClusters: () => void;
  diagnosis: { summary: string; findings: { title: string; detail: string; severity: 'high' | 'medium' | 'low' }[] } | null;
  diagnosisLoading: boolean;
  diagnosisError: string | null;
  onDiagnose: () => void;
  fixes: { n: string; title: string; detail: string }[];
  onGoComposer: () => void;
}) {
  const {
    clusters, clustersLoading, clustersError, onRetryClusters,
    diagnosis, diagnosisLoading, diagnosisError, onDiagnose,
    fixes, onGoComposer,
  } = props;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 38, margin: '0 0 4px' }}>Failure digest</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Recent errors, clustered and summarized so nobody greps.</p>
        </div>
        <button className="btn btn-primary" onClick={onDiagnose} disabled={diagnosisLoading}>
          {diagnosisLoading ? 'Diagnosing…' : 'Diagnose failures'}
        </button>
      </div>

      <div style={{ borderRadius: 32, padding: '26px 28px', background: 'var(--color-accent-100)', color: 'var(--color-accent-900)', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--color-accent-600)' }} />
          <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>AI diagnosis</span>
        </div>
        {diagnosisLoading ? (
          <CardSkeleton lines={3} />
        ) : diagnosisError ? (
          <CardError message={diagnosisError} onRetry={onDiagnose} />
        ) : diagnosis ? (
          <>
            <p style={{ fontFamily: 'var(--font-heading)', fontSize: 22, lineHeight: 1.35, margin: '0 0 14px', maxWidth: '66ch' }}>
              {diagnosis.summary}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, maxWidth: '80ch' }}>
              {diagnosis.findings.map((f, i) => (
                <div style={{ display: 'flex', gap: 10 }} key={i}><span style={{ opacity: 0.55 }}>—</span><span>{f.title} — {f.detail}</span></div>
              ))}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>Click "Diagnose failures" to have Gemini explain what's going wrong, in plain English.</p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card" style={{ padding: '20px 22px', gap: 12 }}>
          <h4 style={{ margin: 0 }}>Clusters</h4>
          {clustersLoading ? (
            <CardSkeleton lines={4} />
          ) : clustersError ? (
            <CardError message={clustersError} onRetry={onRetryClusters} />
          ) : clusters.length === 0 ? (
            <CardEmpty message="No failures clustered in this window." />
          ) : (
            clusters.map(c => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid color-mix(in srgb, var(--color-text) 8%, transparent)' }} key={c.title}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, marginBottom: 3 }}>{c.title}</div>
                  <div className="text-muted" style={{ fontSize: 12, fontFamily: 'ui-monospace,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sample}</div>
                </div>
                <span style={{ width: 76, height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--color-text) 10%, transparent)', overflow: 'hidden', flex: 'none' }}>
                  <span style={{ display: 'block', height: '100%', background: 'var(--color-accent)', width: c.pct }} />
                </span>
                <span style={{ fontSize: 13, width: 44, textAlign: 'right', flex: 'none' }}>{c.count}</span>
              </div>
            ))
          )}
        </div>

        <div className="card" style={{ padding: '20px 22px', gap: 12 }}>
          <h4 style={{ margin: 0 }}>Suggested fixes</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {fixes.length === 0 ? (
              <CardEmpty message="Run a diagnosis to see suggested fixes." />
            ) : (
              fixes.map(fx => (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 20, background: 'color-mix(in srgb, var(--color-accent-2-500) 14%, transparent)' }} key={fx.n}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15, opacity: 0.6 }}>{fx.n}</span>
                  <div>
                    <div style={{ fontSize: 14, marginBottom: 2 }}>{fx.title}</div>
                    <div className="text-muted" style={{ fontSize: 12.5 }}>{fx.detail}</div>
                  </div>
                </div>
              ))
            )}
            <button className="btn btn-primary btn-block" onClick={onGoComposer}>Apply as config change</button>
          </div>
        </div>
      </div>
    </div>
  );
}
