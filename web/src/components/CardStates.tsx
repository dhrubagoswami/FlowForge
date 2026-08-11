// Loading/empty/error presentation for a single card — never full-page. Loading is a muted
// skeleton block shaped like the card's content (no spinners); empty and error are one line of
// muted text, error adding a btn-secondary Retry. Callers render these in place of a card's body.
export function CardSkeleton(props: { lines?: number; height?: number }) {
  const { lines, height } = props;
  if (height) {
    return <div style={{ height, borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--color-text) 8%, transparent)' }} />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines ?? 4 }, (_, i) => (
        <div key={i} style={{ height: 14, borderRadius: 999, background: 'color-mix(in srgb, var(--color-text) 8%, transparent)', width: i % 3 === 2 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

export function CardEmpty(props: { message: string }) {
  return <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>{props.message}</p>;
}

export function CardError(props: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span className="text-muted" style={{ fontSize: 13 }}>{props.message}</span>
      <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px', flex: 'none' }} onClick={props.onRetry}>Retry</button>
    </div>
  );
}
