export const EXAMPLE_PROMPTS = [
  { label: 'Nightly DB backup', text: 'Back up the primary Postgres to S3 every night at 2am, keep 30 days, page me if it fails twice.' },
  { label: 'Webhook reconcile', text: 'On every Stripe invoice webhook, reconcile the invoice against our ledger; skip duplicates by event id.' },
  { label: 'Re-index docs', text: 'Re-embed changed docs every 30 minutes, but never more than 200 requests per minute.' },
];

export function Composer(props: {
  prompt: string;
  setPrompt: (v: string) => void;
  examples: { label: string; text: string }[];
  onUseExample: (text: string) => void;
  modelLabel: string;
  generate: () => void;
  generateLabel: string;
  genYaml: string;
  caret: string;
  validationLabel: string;
  deployDisabled: boolean;
  onDeploy: () => void;
  onRegenerate: () => void;
  parsed: { k: string; v: string }[];
}) {
  const { prompt, setPrompt, examples, onUseExample, modelLabel, generate, generateLabel, genYaml, caret, validationLabel, deployDisabled, onDeploy, onRegenerate, parsed } = props;
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 38, margin: '0 0 4px' }}>Describe the job</h1>
        <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Plain English in, validated job config out — translated by Gemini, then schema-checked before it reaches the queue.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card" style={{ padding: 22, gap: 14 }}>
          <div className="card-kicker">Step 1 · intent</div>
          <textarea
            className="input"
            style={{ minHeight: 150, borderRadius: 22, lineHeight: 1.6, fontSize: 14 }}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {examples.map(e => (
              <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => onUseExample(e.text)} key={e.label}>{e.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
            <span className="text-muted" style={{ fontSize: 12 }}>{modelLabel}</span>
            <button className="btn btn-primary" onClick={generate}>{generateLabel}</button>
          </div>
        </div>

        <div className="card" style={{ padding: 22, gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="card-kicker">Step 2 · generated config</div>
            <span className="tag tag-accent-2">{validationLabel}</span>
          </div>
          <pre style={{ margin: 0, flex: 1, minHeight: 250, fontFamily: 'ui-monospace,monospace', fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#17140f', color: '#e8dcc8', padding: '18px 20px', borderRadius: 22 }}>
            {genYaml}<span style={{ color: 'var(--color-accent-400)', animation: 'ffpulse 1s steps(2) infinite' }}>{caret}</span>
          </pre>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onRegenerate}>Regenerate</button>
            <button className="btn btn-primary" disabled={deployDisabled} onClick={onDeploy}>Deploy to queue</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 18 }}>
        {parsed.map(p => (
          <div className="card elev-sm" style={{ padding: '16px 18px', gap: 4 }} key={p.k}>
            <div className="card-kicker">{p.k}</div>
            <div style={{ fontSize: 14 }}>{p.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
