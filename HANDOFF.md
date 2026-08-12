# FlowForge — Handoff

Written at the end of a session before a context clear. Read this first if you have no memory of prior work.

## 1. Where we are

- **M0–M10 are complete and accepted.** Browser QA round 2 (Playwright, six checks) passed clean: console clean, network clean, zero orphaned processes, SSE live updates confirmed end-to-end (Fire-a-job progressed `queued` → `running` → `succeeded` with no refresh; a killed worker transitioned to `offline` live).
- One post-acceptance follow-up from that round has already been fixed and server-side-verified this session (not yet re-confirmed in a browser): the `draining` worker status is now published deterministically instead of depending on a heartbeat-cycle race. See §2.
- **M11 (documentation, tests, load-test script) starts next.**
- Phase 3 (AWS EC2 deployment) has not been started.

## 2. Post-M10-acceptance follow-up — fixed, not yet browser-verified

**Killed workers now show `draining` before `offline`, deterministically.** Round 2 QA found the badge jumping straight from `ready`/`online` to `offline` — `draining` never appeared. Root cause: `demoKillWorker` (`server/src/services/demo.service.ts`) wrote `draining` to the DB but never published a live update itself; it relied on the real worker process's own heartbeat loop (`worker/src/heartbeat.ts`, ~5s cadence) to notice and publish the change, and `draining` only holds in the row for `KILL_WORKER_DRAIN_DELAY_MS` (2000ms) before flipping to `offline` — so seeing it in the browser was a coin-flip race against the heartbeat's own timing, not a reliable demo.

Fixed: `demoKillWorker` now calls `publishEvent({ event: 'worker.updated', ... })` directly (the server's own in-process event bus, same one `enqueue.service.ts` already uses — not the worker's Redis-publish path, which the server can't call) at both the `draining` write and the `offline` backdate. Scoped to the demo path only — the real worker lifecycle still relies purely on its heartbeat, unchanged. A heartbeat tick landing in the same window is harmless: the frontend's `worker.updated` handler doesn't apply the payload, it just triggers a fresh `GET /api/workers`, so a duplicate event is a redundant refetch, not a correctness risk.

**Verified this session, server-side only**: a direct SSE listener (Node's `fetch()` streaming reader) against a live `POST /api/demo/kill-worker` call showed two `worker.updated` events — `draining` at 2ms after connect, `offline` at 2095ms. Deterministic, not a race, measured directly. **Not yet confirmed in a browser** — that's the one thing left before this specific fix can be considered fully closed. Full detail in DECISIONS.md.

## 3. QA harness — merged, ready to use

`qa/qa_runner.mjs` now covers everything from both prior one-off passes in one script, organized into named groups (`realtime`, `layout`, `demo panel`, `failures`, `sweep`), each check reporting PASS/FAIL with the actual observed value (not just a boolean) so a failure is diagnosable from `qa/output/qa_results.json` without re-running the browser. Includes a check for the draining-before-offline fix above.

Run with `pnpm qa` from the repo root, after `pnpm dev` (server + worker + web all running) and a reasonably fresh `pnpm --filter=@flowforge/server db:seed` (the Failures checks need real recent failure data — see SETUP.md). Headless by default; `QA_HEADED=1 pnpm qa` runs it in a visible browser window.

`playwright` stays as a root devDependency, kept per the owner's direction — this is a real, reusable QA tool now, not a one-off script.

## 4. What already passed — do not re-test

Everything in this section, plus everything fixed and now browser-confirmed at M10 (§1), is settled. Do not re-verify unless something in the surrounding code changes:

- Demo panel layout and responsive wrap (verified down to 700px width, buttons wrap correctly, no overflow).
- Kill-worker button tooltip wording, exact text confirmed correct.
- Reset-demo idempotency — clicked 3 times in a row, correct message each time, no errors.
- Failures page layout after the raw-logs-toggle removal (M10) — confirmed the right-hand card correctly shows Suggested fixes with no leftover "Show raw logs" button.
- Diagnose-failures loading state (skeleton, not spinner) and populated state (AI diagnosis panel, Clusters, Suggested fixes, Apply as config change button).
- SSE/CORS: `EventSource` connects from a real browser, no CORS error, live updates (queued/running/succeeded, worker status) all confirmed arriving without a page refresh.
- Failures page window selector (24h/7d/30d): switching windows changes what the Clusters card and AI diagnosis show; changing the window clears a stale diagnosis from the prior window.
- Overview mount: no double-slash `/api/jobs/`/`/api/jobs//runs` requests fire before a job id exists.

## 5. Redis situation (one paragraph — details are in DECISIONS.md, don't re-derive them)

Local dev now runs against a self-hosted Redis (Memurai, `127.0.0.1:6379`) instead of Upstash; Upstash is reserved for deployed environments only. BullMQ hardcodes a 10-second `BZPOPMIN` block ceiling whenever a queue has any delayed job pending (always true here), which makes roughly 1 cmd/sec the structural idle floor for this app's two-Worker-process shape — no further tuning changes that number. A single-instance Redis lock now guards both the job worker and the schedule-tick worker against duplicate processes (the actual root cause of a real Redis-quota incident earlier in the build). `pnpm redis:floor` measures the live command floor on demand. Full details, the incident writeup, the drainDelay investigation, and the lock-identity bug-and-fix are all in `DECISIONS.md` — read there before re-deriving any of this.

## 6. Working agreement — carries over, with one addition

- Strict layering: routes → services → repositories → database. No skipping a layer, no raw SQL in a service, no HTTP handling in a repository.
- `DECISIONS.md` gets updated as work happens, not retroactively — every deviation from spec, every bug found, every judgment call goes in there with a date.
- Report measured numbers, not qualitative assessments.
- The owner does browser/visual verification. Do not attempt to open a browser or claim visual confirmation of anything — server-side/log-based verification only, and say so explicitly when that's the limit of what was checked.
- **New, from this milestone's experience: browser verification is a required gate before any milestone touching SSE/CORS/live-update code is accepted, not an optional nice-to-have.** The SSE path failed twice for two different reasons, both invisible to curl/fetch/server-log checks, and was only actually confirmed correct on a real third attempt with a real browser. If a future change touches `sse.handler.ts`, `event-bus.ts`, `redis-subscriber.ts`, `realtime-publisher.ts`, `useLiveStream.ts`, or CORS config, say so explicitly and flag that it needs a browser pass before being called done — don't let a passing build/test/curl-check alone stand in for that again.
