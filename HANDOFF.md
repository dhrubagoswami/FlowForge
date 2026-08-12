# FlowForge — Handoff

Written at the end of a session before a context clear. Read this first if you have no memory of prior work.

## 1. Where we are

- **Phase 2 is complete.** M0 through M11 are all done and accepted. The full stack — server, worker, Postgres/Redis-backed queue, AI composer and failure digest, and the live dashboard — is built, wired end to end, and browser-verified.
- **Phase 3 (AWS EC2 deployment) has not started.** It's the next work, in a separate session.
- Test suite: 218 tests (33 shared, 147 server, 38 worker), all passing. Build clean across all four packages.

## 2. M11 — what got built

- **Route-level tests for every `/api` endpoint** (mocked services, happy path + validation errors + the specific `AppError` codes each route can produce), plus a dedicated SSE handler test that was verified to actually catch a regression (reverted the handler to its pre-fix state, confirmed the test failed with the right symptoms, restored the fix).
- **Real-database integration tests** for the two repositories with non-trivial SQL: `stats.repository.ts` (percentile aggregation, `generate_series` gap-fill) and `run.repository.ts` (keyset pagination's tie-break clause — verified by the same revert-and-check discipline as the SSE test). `server/src/test-support/db-fixtures.ts` is the shared setup/teardown helper; its header note is important — this database is shared with manual QA, so tests must snapshot-and-delta rather than assume any slice of a table is empty.
- **`failure-cluster.service.test.ts`** — mocked-repository tests for the clustering logic.
- **`server/scripts/load-test.ts`** — pushes 10,000 runs through the real queue (9,000 unique + 1,000 deliberate duplicates across 100 keys, some fired as genuinely concurrent bursts to exercise the idempotency claim's actual race window). Found and fixed a real bug along the way: postgres.js's connection pool defaulted to `max: 10` regardless of `WORKER_CONCURRENCY` (50), which collapsed throughput under sustained load — fixed by deriving pool size from `WORKER_CONCURRENCY` in `worker/src/db/client.ts`. Final measured result: 34.4 jobs/sec submitted, 900/900 dedup exact, worker peak RSS 51.9 MB. Full findings in `DECISIONS.md`.
- **README rewritten** — architecture diagram, realtime-bridge sequence diagram, load-test results, and a "Design decisions and trade-offs" section.
- **SETUP.md rewritten** as a literal top-to-bottom sequence (previous version was ordered by "when this was needed during the build," not what a reader should do first, and was missing `pnpm install`, building `packages/shared` — required before server/worker/web can import it at all — and `db:migrate` entirely). Verified for real, not assumed: `db:migrate`/`db:generate` both load `server/.env` on their own via drizzle-kit's bundled dotenv (confirmed by running both with no `--env-file` flag and no shell-exported `DATABASE_URL`), and root `pnpm build` genuinely builds `packages/shared` before `server`/`worker`/`web` (confirmed in a scratch clone's build output).

## 3. A full "stranger clones this cold" test was deferred, on purpose

The original plan was to hand the repo to a fresh-context agent with zero knowledge of this codebase and see if SETUP.md alone gets them to a running dashboard in under 10 minutes. A partial version of that test (done by an agent that *does* know the codebase, explicitly flagged as diagnostic rather than acceptance-grade) found and fixed the real gaps: missing `pnpm install` step, missing `packages/shared` build step, no top-to-bottom ordering, and no mention that `.env.example` files exist.

The full cold-agent run was deliberately **not** done. Reasoning: nobody is actually going to clone this repo cold — the real audience for SETUP.md is Phase 3's deployment (EC2, systemd), which will exercise this same sequence for real, under real constraints, and is a better test than a synthetic one. If Phase 3 setup hits a gap SETUP.md doesn't cover, fix it there, in context, rather than pre-solving for a scenario that may not matter.

## 4. Working agreement — carries over

- Strict layering: routes → services → repositories → database. No skipping a layer, no raw SQL in a service, no HTTP handling in a repository.
- `DECISIONS.md` gets updated as work happens, not retroactively.
- Report measured numbers, not qualitative assessments.
- The owner does browser/visual verification. Server-side/log-based verification only otherwise, and say so explicitly when that's the limit of what was checked.
- **Browser verification (or, failing that, a real client with a realistic timeout) is a required gate before any milestone touching SSE/CORS/live-update code is accepted.** The SSE/live-update path failed verification four separate times across M8–M10, each invisible to whatever check ran immediately before it — full history in `DECISIONS.md`. The one thing that caught every bug in that family was asserting on an *observed value changing over time* against a *real client with a real timeout*, not connection-succeeded or header-present. Any future change to `sse.handler.ts`, `event-bus.ts`, `redis-subscriber.ts`, `realtime-publisher.ts`, `stats-tick.ts`, or `useLiveStream.ts` needs `pnpm qa`'s `realtime` group run for real before being called done.
- Real-database tests must snapshot-and-delta, never assume a table is empty — this dev database is shared with manual QA and load testing, both of which leave real rows behind.
- A test that reverts the fix it's meant to catch, confirms the test fails with the right symptom, then restores the fix, is worth the extra few minutes — it's the only way to know the test isn't decorative. Used for the SSE handler test and the keyset-pagination tie-break test this phase; worth repeating for any future test whose failure mode is subtle.
