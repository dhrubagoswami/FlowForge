import { useEffect, useMemo, useRef, useState } from 'react';
import type { JobConfig, RunLogLine, StatsOverview } from '@flowforge/shared';
import { jobConfigToYaml } from '@flowforge/shared';
import { Sidebar } from './components/Sidebar';
import { MobileView } from './components/MobileView';
import { Overview } from './pages/Overview';
import { JobsPage } from './pages/JobsPage';
import { JobDetail } from './pages/JobDetail';
import { Composer } from './pages/Composer';
import { Failures } from './pages/Failures';
import { WorkersPage } from './pages/WorkersPage';
import { EXAMPLE_PROMPTS, FINDINGS, FIXES, RAW } from './data/mockData';
import { toClusterRows } from './adapters/failure.adapter.ts';
import { toJobDetailData, toJobRow, guaranteesForJob } from './adapters/job.adapter.ts';
import { toJobRunRow, toLogLine, toRecentRunRow } from './adapters/run.adapter.ts';
import { toActivityBars, toMobileStatCards, toOverviewWorkerBars, toStatCards } from './adapters/stats.adapter.ts';
import { toWorkerCard } from './adapters/worker.adapter.ts';
import { composeJob } from './api/ai.ts';
import { createJob } from './api/jobs.ts';
import { fetchRunLogs } from './api/runs.ts';
import { useFailureClusters } from './hooks/useFailureClusters.ts';
import { useJobDetail } from './hooks/useJobDetail.ts';
import { useJobRuns } from './hooks/useJobRuns.ts';
import { useJobs } from './hooks/useJobs.ts';
import { useLiveStream } from './hooks/useLiveStream.ts';
import { useStatsOverview } from './hooks/useStatsOverview.ts';
import { useWorkers } from './hooks/useWorkers.ts';
import type { Page, Theme, Viewport } from './types';

const NAV_PAGES: Page[] = ['overview', 'jobs', 'composer', 'failures', 'workers'];

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [theme, setTheme] = useState<Theme>('light');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [jobId, setJobId] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [prompt, setPrompt] = useState(
    'Scrape the competitor pricing page every day at 9am UTC, retry 3 times with exponential backoff, and ping me in Slack after 3 failures in a row.'
  );
  const [generating, setGenerating] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [composedConfig, setComposedConfig] = useState<JobConfig | null>(null);
  const [composeIssues, setComposeIssues] = useState<string[] | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [counters, setCounters] = useState({ runs: 0, rate: 0, depth: 0, p95: 0 });
  const [liveStats, setLiveStats] = useState<StatsOverview | null>(null);
  const [logs, setLogs] = useState<RunLogLine[]>([]);

  const seenLogIdsRef = useRef(new Set<number>());

  const liveStream = useLiveStream();
  const stats = useStatsOverview();
  const jobs = useJobs();
  const workers = useWorkers();
  const failures = useFailureClusters();
  const activeJobId = jobId ?? jobs.data?.[0]?.id ?? null;
  const jobDetail = useJobDetail(activeJobId ?? '');
  const jobRuns = useJobRuns(activeJobId ?? '');
  const latestRunId = jobRuns.data?.runs[0]?.id ?? null;
  const clearLogs = () => setLogs([]);

  // stats.tick (every 3s) is the single source of truth for the Overview counters once it starts
  // arriving — this replaces polling entirely. Until the first tick lands, stats.data (one-shot
  // fetch) is what's shown, so the page isn't blank while the stream connects.
  const overviewStats = liveStats ?? stats.data;

  useEffect(() => {
    const offTick = liveStream.on('stats.tick', (data) => setLiveStats(data));
    return offTick;
  }, [liveStream]);

  // Every browser tab shares the same stream, so run.log only needs forwarding for the run
  // currently open on Job Detail — other tabs' latestRunId differ and simply ignore the event.
  useEffect(() => {
    return liveStream.on('run.log', ({ runId, line }) => {
      if (runId !== latestRunId || !live) return;
      if (seenLogIdsRef.current.has(line.id)) return;
      seenLogIdsRef.current.add(line.id);
      setLogs((prev) => [...prev, line]);
    });
  }, [liveStream, latestRunId, live]);

  // Switching which run is open: reset the log pane and load that run's history once (SSE only
  // carries lines written from here on, not what already happened before this tab connected).
  useEffect(() => {
    setLogs([]);
    seenLogIdsRef.current = new Set();
    if (!latestRunId) return;
    let cancelled = false;
    fetchRunLogs(latestRunId).then((lines) => {
      if (cancelled) return;
      lines.forEach((l) => seenLogIdsRef.current.add(l.id));
      setLogs(lines);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [latestRunId]);

  // run.queued/run.finished mean a job's schedule/health/last-run fields just changed — refetch
  // the jobs list and (if it's the open job) its detail/run history, rather than re-deriving that
  // server-side business logic on the client.
  useEffect(() => {
    const offQueued = liveStream.on('run.queued', (data) => {
      jobs.retry();
      if (data.run.jobId === activeJobId) jobRuns.retry();
    });
    const offFinished = liveStream.on('run.finished', (data) => {
      jobs.retry();
      if (data.run.jobId === activeJobId) {
        jobDetail.retry();
        jobRuns.retry();
      }
    });
    return () => {
      offQueued();
      offFinished();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStream, activeJobId]);

  useEffect(() => {
    return liveStream.on('worker.updated', () => workers.retry());
  }, [liveStream]);

  // A dropped-then-restored connection may have missed events — refetch everything once so a gap
  // in the stream never leaves stale data on screen, instead of running a fallback poll.
  useEffect(() => {
    if (liveStream.reconnectedAt === 0) return;
    stats.retry();
    jobs.retry();
    workers.retry();
    failures.retry();
    if (activeJobId) {
      jobDetail.retry();
      jobRuns.retry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStream.reconnectedAt]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Eases the four headline stat cards toward their real values once the first overview payload
  // resolves (whether that's the one-shot fetch or an early stats.tick — whichever lands first),
  // keeping the original "counting up" motion instead of a hard snap. Runs once — every later
  // update, including every subsequent stats.tick, sets the cards directly with no re-animation.
  const hasAnimatedRef = useRef(false);
  useEffect(() => {
    if (!overviewStats || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;
    const targets = { runs: overviewStats.runsLast24h, rate: overviewStats.successRatePct, depth: overviewStats.queueDepth, p95: overviewStats.p95WaitMs / 1000 };
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setCounters({ runs: targets.runs * e, rate: targets.rate * e, depth: targets.depth * e, p95: targets.p95 * e });
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overviewStats]);

  // After the first-load animation has run, keep the counters in sync with any later update —
  // a later fetch retry or, in steady state, every 3s stats.tick.
  useEffect(() => {
    if (!overviewStats || !hasAnimatedRef.current) return;
    setCounters({ runs: overviewStats.runsLast24h, rate: overviewStats.successRatePct, depth: overviewStats.queueDepth, p95: overviewStats.p95WaitMs / 1000 });
  }, [overviewStats]);

  const go = (p: Page) => () => setPage(p);
  const openJob = (id: string) => () => { setJobId(id); setPage('job'); };

  const runGenerate = async () => {
    setGenerating(true);
    setComposedConfig(null);
    setComposeIssues(null);
    try {
      const result = await composeJob(prompt);
      if (result.ok) {
        setComposedConfig(result.data.config);
      } else {
        setComposeIssues(result.data.validation.issues);
      }
    } catch {
      setComposeIssues(['Something went wrong talking to the AI composer. Please try again.']);
    } finally {
      setGenerating(false);
    }
  };

  const runDeploy = async () => {
    if (!composedConfig) return;
    setDeploying(true);
    try {
      await createJob(composedConfig);
      setComposedConfig(null);
      setComposeIssues(null);
      jobs.retry();
      setPage('jobs');
    } catch {
      setComposeIssues(['Deploying this config failed — it may already exist, or the server rejected it.']);
    } finally {
      setDeploying(false);
    }
  };

  const dark = theme === 'dark';
  const workersOnline = workers.data?.filter((w) => w.status === 'online').length ?? 0;

  const jobRows = useMemo(() => (jobs.data ?? []).map((j) => toJobRow(j, openJob(j.id))), [jobs.data]);
  const bars = useMemo(() => (overviewStats ? toActivityBars(overviewStats.activity) : []), [overviewStats]);
  const topWorkers = useMemo(() => (overviewStats ? toOverviewWorkerBars(overviewStats.topWorkers) : []), [overviewStats]);
  const recentRuns = useMemo(() => (overviewStats?.recentRuns ?? []).map((r) => toRecentRunRow(r, openJob(r.jobId))), [overviewStats]);
  const workerCards = useMemo(() => (workers.data ?? []).map(toWorkerCard), [workers.data]);
  const jobRunRows = useMemo(() => (jobRuns.data?.runs ?? []).map(toJobRunRow), [jobRuns.data]);
  const logLines = useMemo(() => logs.map(toLogLine), [logs]);
  const clusterRows = useMemo(() => toClusterRows(failures.data ?? []), [failures.data]);

  const statCards = overviewStats ? toStatCards(overviewStats) : [];
  const mobileStatCards = overviewStats ? toMobileStatCards(overviewStats) : [];
  const displayStats = statCards.map((s, i) => {
    const key = (['runs', 'rate', 'depth', 'p95'] as const)[i];
    if (key === 'runs') return { ...s, value: Math.round(counters.runs).toLocaleString() };
    if (key === 'rate') return { ...s, value: counters.rate.toFixed(1) + '%' };
    if (key === 'depth') return { ...s, value: String(Math.round(counters.depth)) };
    return { ...s, value: counters.p95.toFixed(1) + 's' };
  });
  const displayMobileStats = mobileStatCards.map((s, i) => (i === 0
    ? { ...s, value: Math.round(counters.runs).toLocaleString() }
    : { ...s, value: counters.rate.toFixed(1) + '%' }));

  const genYaml = composedConfig
    ? jobConfigToYaml(composedConfig)
    : composeIssues
      ? composeIssues.map((issue) => `# ${issue}`).join('\n')
      : '';
  const parsed = composedConfig
    ? [
        { k: 'Schedule', v: composedConfig.trigger.type === 'cron' ? `${composedConfig.trigger.expr} (${composedConfig.trigger.tz})` : composedConfig.trigger.type },
        { k: 'Retries', v: `${composedConfig.retry.attempts} · ${composedConfig.retry.backoff}` },
        { k: 'Idempotency', v: `${composedConfig.idempotency.keyTemplate} · ${Math.round(composedConfig.idempotency.ttlSeconds / 3600)}h` },
        { k: 'Alerting', v: composedConfig.alert.channel ? `${composedConfig.alert.channel} after ${composedConfig.alert.afterConsecutiveFailures}` : `after ${composedConfig.alert.afterConsecutiveFailures} failures` },
      ]
    : [
        { k: 'Schedule', v: '—' },
        { k: 'Retries', v: '—' },
        { k: 'Idempotency', v: '—' },
        { k: 'Alerting', v: '—' },
      ];

  const sidebarProps = {
    page, onNavigate: (p: Page) => setPage(p),
    workersOnline, depthStr: Math.round(counters.depth),
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
        workersOnline={workersOnline}
        mobileStats={displayMobileStats}
        jobRows={jobRows}
        mobileLogs={logLines.slice(-7)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'stretch' }}>
      <Sidebar {...sidebarProps} />
      <main style={{ flex: 1, minWidth: 0, padding: '30px 38px 56px' }}>
        {page === 'overview' && (
          <Overview
            stats={displayStats} bars={bars} topWorkers={topWorkers} recentRuns={recentRuns}
            workersOnline={workersOnline}
            loading={stats.loading} error={stats.error} onRetry={stats.retry}
            onGoFailures={go('failures')} onGoComposer={go('composer')} onGoWorkers={go('workers')} onGoJobs={go('jobs')}
          />
        )}
        {page === 'jobs' && (
          <JobsPage
            jobRows={jobRows}
            loading={jobs.loading} error={jobs.error} onRetry={jobs.retry}
            onGoComposer={go('composer')}
          />
        )}
        {page === 'job' && (
          <JobDetail
            job={jobDetail.data ? toJobDetailData(jobDetail.data) : null}
            jobLoading={jobDetail.loading} jobError={jobDetail.error} onRetryJob={jobDetail.retry}
            jobRuns={jobRunRows}
            jobRunsLoading={jobRuns.loading} jobRunsError={jobRuns.error} onRetryJobRuns={jobRuns.retry}
            guarantees={jobDetail.data ? guaranteesForJob(jobDetail.data) : []}
            logs={logLines}
            live={live}
            liveLabel={live ? 'Pause' : 'Resume'}
            logCount={logLines.length}
            onToggleLive={() => setLive(l => !l)}
            onClearLogs={clearLogs}
            onRunNow={() => {}}
            onGoJobs={go('jobs')}
            onGoFailures={go('failures')}
          />
        )}
        {page === 'composer' && (
          <Composer
            prompt={prompt} setPrompt={setPrompt} examples={EXAMPLE_PROMPTS}
            onUseExample={(text) => setPrompt(text)}
            modelLabel="Gemini · schema-validated"
            generate={runGenerate} generateLabel={generating ? 'Generating…' : 'Generate config'}
            genYaml={genYaml} caret=""
            validationLabel={composedConfig ? 'schema valid' : composeIssues ? 'invalid — see issues' : generating ? 'generating…' : 'awaiting input'}
            deployDisabled={!composedConfig || deploying}
            onDeploy={runDeploy} onRegenerate={runGenerate} parsed={parsed}
          />
        )}
        {page === 'failures' && (
          <Failures
            findings={FINDINGS} clusters={clusterRows}
            clustersLoading={failures.loading} clustersError={failures.error} onRetryClusters={failures.retry}
            showRaw={showRaw} showFixes={!showRaw}
            rawLog={RAW} rawTitle={showRaw ? 'Raw log sample' : 'Suggested fixes'}
            rawLabel={showRaw ? 'Show suggested fixes' : 'Show raw logs'}
            onToggleRaw={() => setShowRaw(r => !r)} fixes={FIXES} onGoComposer={go('composer')}
          />
        )}
        {page === 'workers' && (
          <WorkersPage
            workers={workerCards} workersOnline={workersOnline}
            loading={workers.loading} error={workers.error} onRetry={workers.retry}
          />
        )}
      </main>
    </div>
  );
}
