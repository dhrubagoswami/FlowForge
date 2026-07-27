import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MobileView } from './components/MobileView';
import { Overview } from './pages/Overview';
import { JobsPage } from './pages/JobsPage';
import { JobDetail } from './pages/JobDetail';
import { Composer } from './pages/Composer';
import { Failures } from './pages/Failures';
import { WorkersPage } from './pages/WorkersPage';
import {
  CLUSTERS, EXAMPLE_PROMPTS, FINDINGS, FIXES, GEN_YAML, GUARANTEES, JOBS,
  LEVEL_COLOR, LOG_POOL, RAW, RUN_IDS, TAGS, YAML, clock,
} from './data/mockData';
import type { LogLine, Page, Theme, Viewport, JobRow, WorkerCard, RunRow } from './types';

const NAV_PAGES: Page[] = ['overview', 'jobs', 'composer', 'failures', 'workers'];

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [theme, setTheme] = useState<Theme>('light');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [jobId, setJobId] = useState('pricing');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [live, setLive] = useState(true);
  const [replicas, setReplicas] = useState(8);
  const [prompt, setPrompt] = useState(
    'Scrape the competitor pricing page every day at 9am UTC, retry 3 times with exponential backoff, and ping me in Slack after 3 failures in a row.'
  );
  const [genLines, setGenLines] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [counters, setCounters] = useState({ runs: 0, rate: 0, depth: 0, p95: 0 });

  const logIdxRef = useRef(0);
  const genIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const targets = { runs: 14208, rate: 99.2, depth: 37, p95: 4.8 };
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setCounters({ runs: targets.runs * e, rate: targets.rate * e, depth: targets.depth * e, p95: targets.p95 * e });
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    setLogs(
      LOG_POOL.slice(0, 6).map(([level, msg], n) => ({
        t: clock(new Date(Date.now() - (6 - n) * 4000)),
        level, msg, color: LEVEL_COLOR[level],
      }))
    );
    logIdxRef.current = 6;

    const logInterval = setInterval(() => {
      if (!liveRef.current) return;
      const [level, msg] = LOG_POOL[logIdxRef.current++ % LOG_POOL.length];
      setLogs(prev => [...prev.slice(-38), { t: clock(new Date()), level, msg, color: LEVEL_COLOR[level] }]);
    }, 1400);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(logInterval);
      clearInterval(genIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const go = (p: Page) => () => setPage(p);
  const openJob = (id: string) => () => { setJobId(id); setPage('job'); };

  const runGenerate = () => {
    clearInterval(genIntervalRef.current);
    setGenerating(true);
    setGenLines(0);
    genIntervalRef.current = setInterval(() => {
      setGenLines(n => {
        if (n >= GEN_YAML.length) {
          clearInterval(genIntervalRef.current);
          setGenerating(false);
          return n;
        }
        return n + 1;
      });
    }, 70);
  };

  const job = JOBS.find(j => j.id === jobId) ?? JOBS[0];
  const dark = theme === 'dark';

  const bars = [];
  for (let i = 0; i < 24; i++) {
    const up = 30 + Math.round(56 * Math.abs(Math.sin(i * 0.7 + 1)));
    const dn = 26 + Math.round(44 * Math.abs(Math.cos(i * 0.55)));
    bars.push({ x: i * 23 + 4, y: 65 - up * 0.72, h: up * 0.72, fill: 'var(--color-accent-400)' });
    bars.push({ x: i * 23 + 4, y: 68, h: dn * 0.62, fill: 'var(--color-accent-2-500)' });
  }

  const workers: WorkerCard[] = Array.from({ length: replicas }, (_, i) => {
    const inflight = [4, 3, 4, 2, 1, 4, 3, 2, 3, 1, 4, 2][i % 12];
    const pct = Math.round((inflight / 4) * 100);
    return {
      id: 'worker-' + String(i + 1).padStart(2, '0'),
      inflight, capacity: 4, pct: pct + '%',
      load: pct + '%',
      fill: pct > 90 ? 'var(--color-accent)' : 'var(--color-accent-2-500)',
      state: pct > 90 ? 'saturated' : 'ready',
      tagClass: pct > 90 ? 'tag-accent' : 'tag-accent-2',
      meta: ['iad', 'iad', 'fra', 'sfo'][i % 4] + ' · up 4d 11h · ' + (1200 + i * 37) + ' runs',
    };
  });

  const recentRuns: RunRow[] = RUN_IDS.slice(0, 6).map((id, i) => {
    const j = JOBS[i % 5];
    const status = i === 1 ? 'retrying' : i === 3 ? 'failed' : 'succeeded';
    return {
      id, job: j.name, trigger: j.trigger, attempts: i === 1 ? '2 / 3' : i === 3 ? '3 / 3' : '1 / 3',
      worker: 'worker-0' + ((i % 4) + 1), duration: ['12.1s', '48.2s', '840ms', '51.0s', '3m 41s', '6.1s'][i],
      status, tagClass: TAGS[status], open: openJob(j.id),
    };
  });

  const jobRuns: RunRow[] = RUN_IDS.map((id, i) => {
    const status = i === 0 ? 'succeeded' : i === 2 ? 'retrying' : i === 5 ? 'failed' : 'succeeded';
    return {
      id, started: ['2m ago', '32m ago', '1h 02m', '1h 32m', '2h 02m', '2h 32m', '3h 02m', '3h 32m'][i],
      attempts: status === 'failed' ? '3 / 3' : status === 'retrying' ? '2 / 3' : '1 / 3',
      worker: 'worker-0' + ((i % 4) + 1), duration: ['12.1s', '11.8s', '24.4s', '12.9s', '13.2s', '120s', '11.4s', '12.0s'][i],
      status, tagClass: TAGS[status],
    };
  });

  const jobRows: JobRow[] = JOBS.map(j => ({
    ...j, tagClass: TAGS[j.status], rate: j.rate,
    pct: j.rate + '%', fill: j.rate > 98 ? 'var(--color-accent-2-500)' : 'var(--color-accent)',
    open: openJob(j.id),
  }));

  const genYaml = GEN_YAML.slice(0, genLines).join('\n');
  const drain = Math.max(8, Math.round(320 / replicas)) + 's';

  const stats = [
    { label: 'Runs · 24h', value: Math.round(counters.runs).toLocaleString(), note: '+8.2% vs yesterday' },
    { label: 'Success rate', value: counters.rate.toFixed(1) + '%', note: '112 dead-lettered' },
    { label: 'Queue depth', value: String(Math.round(counters.depth)), note: 'drains in ~40s' },
    { label: 'p95 latency', value: counters.p95.toFixed(1) + 's', note: 'enqueue → ack' },
  ];
  const mobileStats = [
    { label: 'Runs · 24h', value: Math.round(counters.runs).toLocaleString(), note: '+8.2%' },
    { label: 'Success', value: counters.rate.toFixed(1) + '%', note: '112 dead-lettered' },
  ];

  const parsed = [
    { k: 'Schedule', v: genLines > 3 ? '0 9 * * * (UTC)' : '—' },
    { k: 'Retries', v: genLines > 11 ? '3 · exponential' : '—' },
    { k: 'Idempotency', v: genLines > 15 ? 'job:scheduled_at · 24h' : '—' },
    { k: 'Alerting', v: genLines >= GEN_YAML.length ? 'slack#ops after 3' : '—' },
  ];

  const sidebarProps = {
    page, onNavigate: (p: Page) => setPage(p),
    workersOnline: replicas, depthStr: Math.round(counters.depth),
    themeLabel: dark ? 'Light' : 'Dark',
    onToggleTheme: () => setTheme(dark ? 'light' : 'dark'),
    onToggleViewport: () => setViewport(viewport === 'desktop' ? 'mobile' : 'desktop'),
  };

  if (viewport === 'mobile') {
    return (
      <MobileView
        page={page}
        onNavigate={(p) => setPage(NAV_PAGES.includes(p) ? p : 'overview')}
        onToggleViewport={sidebarProps.onToggleViewport}
        onToggleTheme={sidebarProps.onToggleTheme}
        themeLabel={sidebarProps.themeLabel}
        workersOnline={replicas}
        mobileStats={mobileStats}
        jobRows={jobRows}
        mobileLogs={logs.slice(-7)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'stretch' }}>
      <Sidebar {...sidebarProps} />
      <main style={{ flex: 1, minWidth: 0, padding: '30px 38px 56px' }}>
        {page === 'overview' && (
          <Overview
            stats={stats} bars={bars} topWorkers={workers.slice(0, 5)} recentRuns={recentRuns}
            workersOnline={replicas}
            onGoFailures={go('failures')} onGoComposer={go('composer')} onGoWorkers={go('workers')} onGoJobs={go('jobs')}
          />
        )}
        {page === 'jobs' && <JobsPage jobRows={jobRows} onGoComposer={go('composer')} />}
        {page === 'job' && (
          <JobDetail
            job={{ ...job, tagClass: TAGS[job.status], yaml: YAML[job.id] || YAML.pricing }}
            jobRuns={jobRuns}
            guarantees={GUARANTEES}
            logs={logs}
            live={live}
            liveLabel={live ? 'Pause' : 'Resume'}
            logCount={logs.length}
            onToggleLive={() => setLive(l => !l)}
            onClearLogs={() => setLogs([])}
            onRunNow={() => setLogs(prev => [...prev, { t: clock(new Date()), level: 'info', msg: 'manual run enqueued · ' + job.name, color: LEVEL_COLOR.info }])}
            onGoJobs={go('jobs')}
            onGoFailures={go('failures')}
          />
        )}
        {page === 'composer' && (
          <Composer
            prompt={prompt} setPrompt={setPrompt} examples={EXAMPLE_PROMPTS}
            onUseExample={(text) => setPrompt(text)}
            modelLabel="anthropic/claude-sonnet via OpenRouter · schema-validated"
            generate={runGenerate} generateLabel={generating ? 'Generating…' : 'Generate config'}
            genYaml={genYaml} caret={generating ? '▍' : ''}
            validationLabel={genLines >= GEN_YAML.length ? 'schema valid' : generating ? 'streaming' : 'awaiting input'}
            deployDisabled={genLines < GEN_YAML.length}
            onDeploy={go('jobs')} onRegenerate={runGenerate} parsed={parsed}
          />
        )}
        {page === 'failures' && (
          <Failures
            findings={FINDINGS} clusters={CLUSTERS} showRaw={showRaw} showFixes={!showRaw}
            rawLog={RAW} rawTitle={showRaw ? 'Raw log sample' : 'Suggested fixes'}
            rawLabel={showRaw ? 'Show suggested fixes' : 'Show raw logs'}
            onToggleRaw={() => setShowRaw(r => !r)} fixes={FIXES} onGoComposer={go('composer')}
          />
        )}
        {page === 'workers' && (
          <WorkersPage
            workers={workers} workersOnline={replicas} drain={drain}
            onScaleUp={() => setReplicas(r => Math.min(12, r + 1))}
            onScaleDown={() => setReplicas(r => Math.max(2, r - 1))}
          />
        )}
      </main>
    </div>
  );
}
