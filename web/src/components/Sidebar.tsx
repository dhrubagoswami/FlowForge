import type { Page } from '../types';

interface NavEntry {
  key: Page;
  label: string;
}

const NAV: NavEntry[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'composer', label: 'AI composer' },
  { key: 'failures', label: 'Failure digest' },
  { key: 'workers', label: 'Workers' },
];

export function Sidebar(props: {
  page: Page;
  onNavigate: (p: Page) => void;
  workersOnline: number;
  depthStr: number;
  themeLabel: string;
  onToggleTheme: () => void;
  onToggleViewport: () => void;
}) {
  const { page, onNavigate, workersOnline, depthStr, themeLabel, onToggleTheme, onToggleViewport } = props;
  return (
    <aside style={{ width: 236, flex: 'none', padding: '26px 18px', display: 'flex', flexDirection: 'column', gap: 28, borderRight: '1px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8 }}>
        <div style={{ width: 34, height: 34, borderRadius: 999, background: 'var(--color-accent)', display: 'grid', placeItems: 'center', color: '#f5ead8', fontFamily: 'var(--font-heading)', fontSize: 17 }}>F</div>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19, lineHeight: 1 }}>FlowForge</div>
          <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.5 }}>job fleet</div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map(item => (
          <button
            key={item.key}
            className="ffnav"
            data-active={page === item.key || (item.key === 'jobs' && page === 'job')}
            onClick={() => onNavigate(item.key)}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', opacity: 0.6 }} />
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: 14, borderRadius: 22, background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--color-accent-2-500)', animation: 'ffpulse 2.4s ease-in-out infinite' }} />
            <span>{workersOnline} workers online</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>redis://queue.prod — depth {depthStr}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12, padding: '6px 10px' }} onClick={onToggleTheme}>{themeLabel}</button>
          <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12, padding: '6px 10px' }} onClick={onToggleViewport}>Mobile</button>
        </div>
      </div>
    </aside>
  );
}
