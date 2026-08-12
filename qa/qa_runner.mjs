// FlowForge browser QA harness.
//
// What this covers: layout/demo-panel basics (responsive wrap, tooltip text, reset idempotency),
// realtime behavior (SSE connects with no CORS error, Fire-a-job progresses live with no refresh,
// Kill-a-worker shows draining before offline), and the Failures page's window selector
// (24h/7d/30d) including AI diagnosis scoped to the selected window. It was assembled from two
// earlier one-off passes — the checks below are the union of both, deduped where they repeated
// (e.g. two "click through all six pages and screenshot" sweeps became one).
//
// How to run: needs the app running first (`pnpm dev` from the repo root — server on :3001,
// web on :5173) and reasonably fresh seed data (`pnpm --filter=@flowforge/server db:seed`) —
// the Failures checks read real failure history, and the default 7-day window will come up
// empty against a seed more than a week old, which would look like a bug but isn't (see
// DECISIONS.md). Then: `pnpm qa` from the repo root. Runs headless by default; set
// QA_HEADED=1 to watch it drive a real browser window instead.
//
// Output: qa/output/screenshots/*.png and qa/output/qa_results.json (gitignored, regenerated
// every run — nothing in qa/output/ is meant to be committed).
//
// Each check below appends one entry to `checkResults` with a `pass` boolean and an `observed`
// value — the observed value is what makes a FAIL diagnosable later without re-running the
// browser, so prefer recording the actual string/count/array over just true/false.
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const QA_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(QA_DIR, 'output');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const HEADLESS = process.env.QA_HEADED !== '1';
const BASE_URL = 'http://localhost:5173';

// Every check pushes one entry here: { group, name, pass, observed }. Written to
// qa_results.json at the end alongside the raw console/network logs, so a failure can be
// diagnosed from the JSON without re-running the browser.
const checkResults = [];

function record(group, name, pass, observed) {
  checkResults.push({ group, name, pass, observed });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${group} / ${name}: ${JSON.stringify(observed)}`);
}

const consoleLogs = [];
const consoleErrors = [];
const networkRequests = [];
const networkFailures = [];

async function runQA() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 100 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const entry = { type: msg.type(), text: msg.text(), location: msg.location() };
    consoleLogs.push(entry);
    if (msg.type() === 'error') consoleErrors.push(entry);
  });

  page.on('pageerror', (err) => {
    const entry = { type: 'pageerror', text: err.message, stack: err.stack };
    consoleLogs.push(entry);
    consoleErrors.push(entry);
  });

  page.on('request', (req) => {
    networkRequests.push({ url: req.url(), method: req.method() });
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      networkFailures.push({ url: res.url(), status: res.status(), statusText: res.statusText() });
    }
  });

  // ======================================================
  // Group: realtime — SSE connection, CORS, live updates without a page refresh
  // ======================================================
  console.log('\n=== Group: realtime ===');

  // The SSE response is captured via the 'response' listener rather than waited on with
  // page.waitForResponse(), because EventSource connections stay open indefinitely — Playwright
  // fires the 'response' event as soon as headers arrive, which is the moment we care about.
  let sseResponseInfo = null;
  const ssePromise = new Promise((resolve) => {
    page.on('response', (res) => {
      if (res.url().includes('/api/stream')) {
        sseResponseInfo = { url: res.url(), status: res.status(), headers: res.headers() };
        resolve(sseResponseInfo);
      }
    });
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await Promise.race([ssePromise, page.waitForTimeout(5000)]);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/realtime_overview_mount.png`, fullPage: true });

  record('realtime', 'SSE stream connects with 200', sseResponseInfo?.status === 200, sseResponseInfo);
  record(
    'realtime',
    'SSE response carries Access-Control-Allow-Origin',
    !!sseResponseInfo?.headers?.['access-control-allow-origin'],
    sseResponseInfo?.headers?.['access-control-allow-origin'] ?? null,
  );
  const corsErrors = consoleErrors.filter((e) => e.text.includes('CORS') || e.text.includes('Access-Control-Allow-Origin'));
  record('realtime', 'No CORS errors in console', corsErrors.length === 0, corsErrors);

  // Fire a job and watch the Overview table update on its own — no page.reload() anywhere in
  // this block. If this only passes after a manual refresh, the SSE bridge is broken even if
  // the checks above passed (this was exactly the M8 bug: the connection worked, but
  // worker-originated events never reached it).
  const fireBtn = page.locator('button:has-text("Fire a job")');
  await fireBtn.click();
  await page.waitForTimeout(600);
  const inlineMsgFire = await page.evaluate(() => {
    const match = document.body.innerText.match(/Fired a job[^\n]*/i);
    return match ? match[0] : null;
  });
  record('realtime', 'Fire-a-job shows an inline confirmation message', !!inlineMsgFire, inlineMsgFire);

  const firstRunRowText = () =>
    page.evaluate(() => {
      const row = document.querySelector('table tbody tr');
      return row ? row.innerText.replace(/\s+/g, ' ').trim() : null;
    });

  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/realtime_fire_3s.png` });
  const rowAt3s = await firstRunRowText();

  await page.waitForTimeout(14000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/realtime_fire_15s.png` });
  const rowAt15s = await firstRunRowText();

  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/realtime_fire_25s.png` });
  const rowAt25s = await firstRunRowText();

  // Not asserting exact status text here (job names/statuses vary run to run) — what matters is
  // that the row actually changed between snapshots without a refresh, proving live updates
  // reached the page rather than the table just being stale from the initial load.
  const rowChangedOverTime = rowAt3s !== rowAt25s;
  record('realtime', 'Recent-runs row changes over 25s without a page refresh', rowChangedOverTime, { rowAt3s, rowAt15s, rowAt25s });

  // ======================================================
  // Group: realtime — Kill a worker: draining must appear before offline
  // ======================================================
  // demoKillWorker publishes worker.updated explicitly at both the draining write and the
  // offline backdate (see DECISIONS.md) specifically so this transition is deterministic rather
  // than dependent on the real worker's own ~5s heartbeat cycle happening to land inside the
  // 2-second draining window. This check is the thing that would catch a regression back to the
  // old race-dependent behavior.
  const killBtn = page.locator('button:has-text("Kill a worker")');
  await killBtn.click();
  await page.waitForTimeout(150); // let the draining write and its SSE publish land before we look
  await page.click('text="Workers"');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/realtime_kill_worker_draining.png` });

  const readWorkerBadges = () =>
    page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card')).filter((c) => c.innerText.includes('worker-'));
      return cards.map((c) => Array.from(c.querySelectorAll('.tag')).map((t) => t.innerText.trim()));
    });

  const badgesAtDrainingWindow = await readWorkerBadges();
  const sawDraining = badgesAtDrainingWindow.some((tags) => tags.includes('draining'));
  record('realtime', 'Killed worker shows "draining" before "offline"', sawDraining, badgesAtDrainingWindow);

  await page.waitForTimeout(3000); // KILL_WORKER_DRAIN_DELAY_MS (2000ms) plus margin
  await page.screenshot({ path: `${SCREENSHOT_DIR}/realtime_kill_worker_offline.png` });
  const badgesAfterOffline = await readWorkerBadges();
  const sawOffline = badgesAfterOffline.some((tags) => tags.includes('offline'));
  record('realtime', 'Killed worker reaches "offline" without a page refresh', sawOffline, badgesAfterOffline);

  // ======================================================
  // Group: layout — mount cleanliness, responsive wrap, kill-worker tooltip
  // ======================================================
  console.log('\n=== Group: layout ===');

  const mountFailuresBefore = [...networkFailures];
  await page.click('text="Overview"');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/layout_mount_clean.png` });

  const newFailuresDuringMount = networkFailures.slice(mountFailuresBefore.length);
  // The double-slash bug (GET /api/jobs/ and /api/jobs//runs) fired on mount before a job id was
  // known. Check the URL's pathname only, not the full string — every request to this API is
  // "http://localhost:3001/...", and naively checking the full string for "//" would flag the
  // "//" in "http://" on literally every request, a false positive that isn't the bug.
  const badUrlRequests = networkRequests.filter((r) => {
    const pathname = new URL(r.url).pathname;
    return pathname.startsWith('/api/jobs/') && (pathname === '/api/jobs/' || pathname.includes('//'));
  });
  record('layout', 'No failed requests on Overview mount', newFailuresDuringMount.length === 0, newFailuresDuringMount);
  record('layout', 'No double-slash /api/jobs requests on mount', badUrlRequests.length === 0, badUrlRequests);

  const demoButtons = await page
    .locator('button:has-text("Fire a job"), button:has-text("Break something"), button:has-text("Kill a worker"), button:has-text("Reset demo")')
    .allInnerTexts();
  record('layout', 'All four demo-panel buttons are present', demoButtons.length === 4, demoButtons);

  await page.setViewportSize({ width: 700, height: 800 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/layout_responsive_700px.png` });
  const buttonBoxesAt700 = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) =>
      ['Fire a job', 'Break something', 'Kill a worker', 'Reset demo'].some((t) => b.innerText.includes(t)),
    );
    return btns.map((b) => {
      const rect = b.getBoundingClientRect();
      return { text: b.innerText.trim(), top: rect.top, right: rect.left + rect.width };
    });
  });
  // "Wraps correctly" means every button's right edge stays inside the 700px viewport — if any
  // button overflows past 700px, it didn't wrap, it's clipping off the edge of the screen.
  const noOverflowAt700 = buttonBoxesAt700.every((b) => b.right <= 700);
  record('layout', 'Demo buttons wrap (not overflow) at 700px width', noOverflowAt700, buttonBoxesAt700);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);

  const killBtnForTooltip = page.locator('button:has-text("Kill a worker")');
  await killBtnForTooltip.hover();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/layout_kill_worker_tooltip.png` });
  const tooltipText = await killBtnForTooltip.getAttribute('title');
  record('layout', 'Kill-worker button has a tooltip explaining it', !!tooltipText, tooltipText);

  // ======================================================
  // Group: demo panel — break-something, reset idempotency
  // ======================================================
  console.log('\n=== Group: demo panel ===');

  const breakBtn = page.locator('button:has-text("Break something")');
  await breakBtn.click();
  await page.waitForTimeout(800);
  const breakInlineMsg = await page.evaluate(() => {
    const match = document.body.innerText.match(/(Fired|Broke|Triggered|Break)[^\n]*/i);
    return match ? match[0] : null;
  });
  record('demo panel', 'Break-something shows an inline confirmation message', !!breakInlineMsg, breakInlineMsg);
  await page.waitForTimeout(14000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/demo_break_15s.png` });

  const resetBtn = page.locator('button:has-text("Reset demo")');
  const resetMsgs = [];
  for (let i = 0; i < 3; i++) {
    await resetBtn.click();
    await page.waitForTimeout(1200);
    const msg = await page.evaluate(() => {
      const match = document.body.innerText.match(/Reset demo[^\n]*/i);
      return match ? match[0] : null;
    });
    resetMsgs.push(msg);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/demo_reset_after_3_clicks.png` });
  // Idempotent doesn't mean identical text every time (the first click may report restored
  // worker ids, later clicks report none) — it means every click succeeds with a real message
  // and none of them error.
  record('demo panel', 'Reset demo succeeds 3 times in a row with no errors', resetMsgs.every((m) => !!m), resetMsgs);

  // ======================================================
  // Group: failures — window selector (24h/7d/30d) and window-scoped diagnosis
  // ======================================================
  console.log('\n=== Group: failures ===');

  await page.click('text="Failure digest"');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/failures_7d_default.png`, fullPage: true });

  const rawLogsBtnCount = await page.locator('button:has-text("Show raw logs")').count();
  record('failures', 'No leftover "Show raw logs" button (removed at M10)', rawLogsBtnCount === 0, rawLogsBtnCount);

  const diagnoseBtnVisible = await page.locator('button:has-text("Diagnose failures")').isVisible().catch(() => false);
  record('failures', '"Diagnose failures" button is visible', diagnoseBtnVisible, diagnoseBtnVisible);

  const clusterCardText = async () =>
    page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('.card')).find((c) => c.innerText.includes('Clusters'));
      return card ? card.innerText.slice(0, 300) : null;
    });

  const clustersAt7d = await clusterCardText();
  await page.click('button:has-text("24h")');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/failures_24h.png`, fullPage: true });
  const clustersAt24h = await clusterCardText();

  await page.click('button:has-text("30d")');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/failures_30d.png`, fullPage: true });
  const clustersAt30d = await clusterCardText();

  // The three windows are nested (24h ⊆ 7d ⊆ 30d), so this isn't asserting a specific count —
  // just that switching windows actually re-fetches and re-renders rather than the UI silently
  // ignoring the click. If all three snapshots are byte-identical, that's the bug this reports.
  const windowSwitchHadEffect = !(clustersAt7d === clustersAt24h && clustersAt24h === clustersAt30d);
  record('failures', 'Switching 24h/7d/30d changes what the Clusters card shows', windowSwitchHadEffect, {
    clustersAt7d,
    clustersAt24h,
    clustersAt30d,
  });

  await page.click('button:has-text("7d")');
  await page.waitForTimeout(800);

  // Run a diagnosis at 7d, then switch to 24h and confirm the stale 7d diagnosis was cleared
  // (App.tsx's changeFailuresWindow resets it) rather than left on screen describing a window
  // that's no longer selected.
  const diagnoseBtn = page.locator('button:has-text("Diagnose failures")');
  await diagnoseBtn.click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/failures_diagnose_loading.png` });
  const btnTextAt250ms = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((el) => el.innerText.includes('Diagnos'));
    return b ? b.innerText.trim() : null;
  });
  // A cached diagnosis (same window queried earlier in this same run — see App.tsx's ai-cache
  // note) can resolve well inside 250ms, so "still loading at 250ms" isn't guaranteed — only that
  // the button reads one of the two valid states, never something stuck or broken.
  const validLoadingOrDoneLabel = btnTextAt250ms === 'Diagnosing…' || btnTextAt250ms === 'Diagnose failures';
  record('failures', 'Diagnose button shows a valid label while diagnosing (loading or already resolved)', validLoadingOrDoneLabel, btnTextAt250ms);

  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/failures_diagnose_populated_7d.png`, fullPage: true });
  const populated7d = await page.evaluate(() => {
    // "AI diagnosis" is the literal label text in Failures.tsx, but it's styled with CSS
    // text-transform: uppercase — innerText reflects the rendered/uppercased text, not the JSX
    // source string, so this must match case-insensitively or it always reports false.
    const text = document.body.innerText;
    return {
      hasSummary: /AI diagnosis/i.test(text),
      hasSuggestedFixes: text.includes('Suggested fixes'),
      hasApplyButton: Array.from(document.querySelectorAll('button')).some((b) => b.innerText.includes('Apply as config change')),
    };
  });
  record(
    'failures',
    'Diagnosis populates with summary, suggested fixes, and an apply button',
    populated7d.hasSummary && populated7d.hasSuggestedFixes && populated7d.hasApplyButton,
    populated7d,
  );

  await page.click('button:has-text("24h")');
  await page.waitForTimeout(500);
  const clearedOnWindowChange = await page.evaluate(() => document.body.innerText.includes('Click "Diagnose failures"'));
  record('failures', 'Changing the window clears the stale diagnosis from the prior window', clearedOnWindowChange, clearedOnWindowChange);

  await page.click('button:has-text("7d")');
  await page.waitForTimeout(500);

  // ======================================================
  // Group: sweep — every page loads, no horizontal overflow
  // ======================================================
  console.log('\n=== Group: sweep ===');

  const pages = ['Overview', 'Jobs', 'AI composer', 'Failure digest', 'Workers'];
  const sweepData = {};
  for (const pName of pages) {
    await page.click(`text="${pName}"`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/sweep_${pName.replace(/\s+/g, '_')}.png`, fullPage: true });
    const info = await page.evaluate(() => ({
      textLength: document.body.innerText.length,
      hasHScroll: document.documentElement.scrollWidth > window.innerWidth,
    }));
    sweepData[pName] = info;
    record('sweep', `${pName} page loads with content and no horizontal scroll`, info.textLength > 0 && !info.hasHScroll, info);
  }

  await page.click('text="Overview"');
  await page.waitForTimeout(1000);
  const firstRow = page.locator('table tbody tr').first();
  if (await firstRow.isVisible()) {
    await firstRow.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/sweep_Job_Detail.png`, fullPage: true });
    const info = await page.evaluate(() => ({
      textLength: document.body.innerText.length,
      hasHScroll: document.documentElement.scrollWidth > window.innerWidth,
    }));
    sweepData['Job Detail'] = info;
    record('sweep', 'Job Detail page loads with content and no horizontal scroll', info.textLength > 0 && !info.hasHScroll, info);
  }

  // ======================================================
  // Wrap up
  // ======================================================
  await browser.close();

  const failed = checkResults.filter((c) => !c.pass);
  console.log(`\n${checkResults.length} checks run, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.log('Failed checks:', failed.map((c) => `${c.group} / ${c.name}`).join(', '));
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'qa_results.json'),
    JSON.stringify({ checkResults, consoleErrors, networkFailures, consoleLogs }, null, 2),
  );
  console.log(`Results written to ${path.join(OUTPUT_DIR, 'qa_results.json')}`);

  if (failed.length > 0) process.exitCode = 1;
}

runQA().catch((e) => {
  console.error('Fatal QA script error:', e);
  process.exit(1);
});
