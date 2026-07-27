import type { JobRow, LogLine, Page } from '../types';

interface MobileTab {
  key: Page;
  label: string;
}

const TABS: MobileTab[] = [
  { key: 'overview', label: 'Home' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'composer', label: 'AI' },
  { key: 'failures', label: 'Digest' },
];

export function MobileView(props: {
  page: Page;
  onNavigate: (p: Page) => void;
  onToggleViewport: () => void;
  onToggleTheme: () => void;
  themeLabel: string;
  workersOnline: number;
  mobileStats: { label: string; value: string; note: string }[];
  jobRows: JobRow[];
  mobileLogs: LogLine[];
}) {
  const { page, onNavigate, onToggleViewport, onToggleTheme, themeLabel, workersOnline, mobileStats, jobRows, mobileLogs } = props;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '32px 20px 56px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onToggleViewport}>← Desktop</button>
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onToggleTheme}>{themeLabel}</button>
      </div>
      <div style={{ width: 392, height: 812, borderRadius: 46, background: 'var(--color-bg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-divider)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--color-accent)', display: 'grid', placeItems: 'center', color: '#f5ead8', fontFamily: 'var(--font-heading)', fontSize: 14 }}>F</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>FlowForge</span>
          </div>
          <span className="tag tag-accent-2">{workersOnline} up</span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: '6px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {mobileStats.map(s => (
              <div className="card elev-sm" style={{ padding: '14px 16px', gap: 2 }} key={s.label}>
                <div className="card-kicker">{s.label}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1.1 }}>{s.value}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{s.note}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16, gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h4 style={{ margin: 0, fontSize: 17 }}>Jobs</h4>
              <span className="text-muted" style={{ fontSize: 11 }}>tap to open</span>
            </div>
            {jobRows.map(j => (
              <div className="ffrow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid color-mix(in srgb, var(--color-text) 8%, transparent)' }} onClick={j.open} key={j.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{j.schedLabel} · {j.last}</div>
                </div>
                <span className={`tag ${j.tagClass}`}>{j.status}</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#17140f', borderRadius: 22, padding: 14, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse' }}>
            <div>
              {mobileLogs.map((l, i) => (
                <div style={{ display: 'flex', gap: 8, fontFamily: 'ui-monospace,monospace', fontSize: 11, lineHeight: 1.7 }} key={i}>
                  <span style={{ color: '#6f6555', flex: 'none' }}>{l.t}</span>
                  <span style={{ color: l.color, flex: 'none', width: 40 }}>{l.level}</span>
                  <span style={{ color: '#e2d7c4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 12px 20px', borderTop: '1px solid var(--color-divider)' }}>
          {TABS.map(t => (
            <button
              className="ffnav"
              data-active={page === t.key}
              style={{ width: 'auto', flexDirection: 'column', gap: 3, fontSize: 11, padding: '6px 14px' }}
              onClick={() => onNavigate(t.key)}
              key={t.key}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
