# FlowForge — Handoff

Written at the end of a session before a context clear. Read this first if you have no memory of prior work.

## 1. Where we are

- **M0–M10 are complete and accepted** (browser QA round 2, six checks, all clean).
- The first actual run of the merged `pnpm qa` harness — run this session, immediately after M10's acceptance — found **two more real, previously-undetected bugs** in the SSE/live-update path, on top of the draining-transition fix already known about. Both are now fixed and verified: one via direct SSE listener (equivalent rigor to what closed the earlier SSE bugs), one via the full `pnpm qa` suite passing clean (26/26) after the fix. See §2.
- **This is now the fourth distinct SSE-path failure this project has hit**, each invisible to whatever verification method was used right before it — see the DECISIONS.md entry on this pattern, and treat it as a live warning, not settled history.
- **M11 (documentation, tests, load-test script) starts next**, once you've read §2 in full.
- Phase 3 (AWS EC2 deployment) has not been started.

## 2. This session's `pnpm qa` findings — all fixed, all measured

Running the merged QA harness for the first time (its check groups had never actually executed end-to-end before) surfaced three things — two real app bugs, one already-known fix confirmed working:

### 2a. Draining-before-offline (already known, now confirmed working)

`realtime / Killed worker shows "draining" before "offline"` **passed** on every run this session, including the very first one. The explicit-publish fix (previous session) works as intended — a killed worker's badge genuinely shows `draining` then `offline`, deterministically, no race. Nothing new here; this is closure, not a new finding.

### 2b. NEW BUG — SSE responses were buffered and never flushed without an immediate write

`reply.raw.writeHead()` alone left the SSE response's headers sitting in Node's internal buffer, never flushed to the socket, until *something* else wrote to the stream — which, before this fix, was only the `SSE_HEARTBEAT_MS` (20s) heartbeat interval. Every client — curl, Node's `fetch()`, a real browser's `EventSource` — saw **zero bytes** for up to 20 seconds after connecting, far past any realistic client timeout.

This is a **third**, previously undiscovered way the SSE path could look fixed under one verification method while still being broken for a real client: the CORS-header fix (an earlier session) was real and correct, and was verified via `fetch()` — but that verification happened to hold the connection open long enough to see the header eventually arrive, which masked the fact that a client with any realistic timeout (curl's default, a browser's actual connect timeout) would give up first.

Fixed: `server/src/realtime/sse.handler.ts` now writes an immediate `: connected\n\n` comment line right after `writeHead()`, forcing the headers out instead of waiting on the heartbeat. Verified directly: a fresh server process, curl with a 5s timeout, before the fix — 0 bytes; after the fix — headers plus the comment line arrive within the first round-trip.

### 2c. NEW BUG — `startStatsTick()` was fully built, never called

The exact same shape of bug as the already-documented M8 `startRedisEventSubscriber()` gap: `server/src/realtime/stats-tick.ts` fully implements the `stats.tick` publisher (recomputes and publishes the Overview payload every 3s) — but `server/src/index.ts` never imported or called it. The only reference to `startStatsTick` anywhere in the codebase was its own definition.

**Practical impact: the Overview page's live counters and "Recent runs" table have never actually updated without a manual page refresh**, in any session, ever — `stats.tick` is the only thing that repoints the frontend away from its one-shot initial fetch. This was true even during round 2's "all six checks passed" browser QA pass, because that pass's live-update checks happened to watch the *worker status badge* (driven by `worker.updated`, a different event, unaffected by this bug) rather than the Overview's run table or headline numbers — so a real, working browser session still didn't catch it.

Fixed: `server/src/index.ts` now calls `startStatsTick()` at boot and `.stop()` on shutdown, matching the existing pattern for the other realtime bridges. Verified via a direct SSE listener: three consecutive `stats.tick` events at 1726ms, 4684ms, 7702ms after connecting (matching the 3s interval). Re-ran the full `pnpm qa` suite after this fix — the previously-failing "recent-runs row changes over 25s" check now passes, showing a fired job's row genuinely progress `running` → `succeeded` with real duration values.

### 2d. Three QA harness checks were themselves buggy (false positives) — also fixed

Found and fixed while chasing the two real bugs above, not separate findings worth re-verifying:
1. The double-slash-URL check matched `//` against the *full* URL string, which matches the `//` in `http://` on every single request — always a false positive. Fixed to check the URL's pathname only.
2. The diagnosis-populated check searched for the literal string `'AI diagnosis'`, but that label is `text-transform: uppercase` in CSS — `innerText` reflects the rendered text (`'AI DIAGNOSIS'`), not the JSX source. Fixed to a case-insensitive match.
3. The loading-label check assumed the diagnose button would still read `'Diagnosing…'` 250ms after clicking, but a cached diagnosis can resolve faster than that. Fixed to accept either the loading or resolved label.

### Full `pnpm qa` result after all fixes: **26/26 checks passed.**

## 3. QA harness — merged, now proven to actually work

`qa/qa_runner.mjs` covers `realtime`, `layout`, `demo panel`, `failures`, `sweep` — each check reports PASS/FAIL with the actual observed value, not just a boolean, so a failure is diagnosable from `qa/output/qa_results.json` without re-running the browser. This session was its first real end-to-end execution, and it justified its own existence immediately by catching §2b and §2c.

Run with `pnpm qa` from the repo root, after `pnpm dev` (server + worker + web all running) and a reasonably fresh `pnpm --filter=@flowforge/server db:seed`. Headless by default; `QA_HEADED=1 pnpm qa` runs it visibly.

## 4. What already passed — do not re-test

- Demo panel layout and responsive wrap (verified down to 700px width, no overflow).
- Kill-worker button tooltip wording.
- Reset-demo idempotency — 3 clicks in a row, correct message each time, no errors.
- Failures page layout after the raw-logs-toggle removal — no leftover "Show raw logs" button.
- Diagnose-failures loading state and populated state (summary, findings, clusters, suggested fixes, apply button).
- SSE/CORS: connects, no CORS error, headers flush immediately (as of §2b's fix).
- Live updates: `stats.tick` (Overview counters, recent-runs table, as of §2c's fix), `worker.updated` (status badges, including draining), `run.queued`/`run.started`/`run.finished` (Fire-a-job's live progression) — all confirmed via `pnpm qa` in the same run, all against a real SSE connection.
- Failures page window selector (24h/7d/30d): switching windows changes the Clusters card and AI diagnosis; changing the window clears a stale diagnosis from the prior window.
- Overview mount: no double-slash `/api/jobs/` requests fire before a job id exists.

## 5. Redis situation (one paragraph — details are in DECISIONS.md, don't re-derive them)

Local dev now runs against a self-hosted Redis (Memurai, `127.0.0.1:6379`) instead of Upstash; Upstash is reserved for deployed environments only. BullMQ hardcodes a 10-second `BZPOPMIN` block ceiling whenever a queue has any delayed job pending (always true here), which makes roughly 1 cmd/sec the structural idle floor for this app's two-Worker-process shape — no further tuning changes that number. A single-instance Redis lock now guards both the job worker and the schedule-tick worker against duplicate processes. `pnpm redis:floor` measures the live command floor on demand. Full details in `DECISIONS.md`.

## 6. Working agreement — carries over, with the SSE-verification rule sharpened again

- Strict layering: routes → services → repositories → database. No skipping a layer, no raw SQL in a service, no HTTP handling in a repository.
- `DECISIONS.md` gets updated as work happens, not retroactively.
- Report measured numbers, not qualitative assessments.
- The owner does browser/visual verification. Server-side/log-based verification only otherwise, and say so explicitly when that's the limit of what was checked.
- **Browser verification (or, failing that, a real client with a realistic timeout — see §2b) is a required gate before any milestone touching SSE/CORS/live-update code is accepted.** This is now the fourth time the SSE path has failed in a way invisible to the verification method used immediately before it: (1) M8, `startRedisEventSubscriber()` never called; (2) M10 QA round 1, CORS headers dropped by a raw `writeHead()`; (3) this session, headers buffered and never flushed without an immediate write; (4) this session, `startStatsTick()` never called. **Every one of these was "fixed and verified" by some method before being caught for real.** The one thing that has actually caught every bug in this family, without exception, is asserting on an *observed value changing over time* against a *real client with a real timeout* — not connection-succeeded, not header-present, not build-passes. Any future change to `sse.handler.ts`, `event-bus.ts`, `redis-subscriber.ts`, `realtime-publisher.ts`, `stats-tick.ts`, or `useLiveStream.ts` needs `pnpm qa`'s `realtime` group run for real, not just read, before being called done.
