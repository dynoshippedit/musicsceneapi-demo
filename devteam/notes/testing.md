# Testing inventory & plan — TST (Test Engineer, B9.7)

Author: TST · Date: 2026-09-29 · Branch: devteam/review-2026-09-29
Mission: know exactly what today's tests prove, make the rest provable, guard every fix.

## 1. What `npm test` is

`node --test --test-force-exit tests/regression/*.test.js` — Node's built-in runner over 20 files.
Each file is a separate OS process; files run **in parallel** (default concurrency = CPUs−1).
Most files spawn `server.js` as a child on localhost (ephemeral or fixed ports) against
throwaway SQLite (mkdtemp, `:memory:`, or temp files). No test calls a live external host
(verified: no axios/fetch to real hosts in tests; Wikipedia is fixture-only via
`FIXTURE_WIKIPEDIA=1` in the snapshot probe; entity-audit route is only ever hit with
non-admin tokens expecting 403, so the live `modules/entityAudit.js` path never executes).

## 2. Real `npm test` results (observed on Threadripper, 2026-09-29)

| Run | Command | Result |
|---|---|---|
| 1 | `npm test` (default concurrency) | **290 pass / 64 fail / 7 cancelled** of 361 (exit 1) |
| 2 | `npm test` (default concurrency) | **361 pass / 0 fail** of 361, 60 suites (exit 0, 11.3 s) |
| 3 | `node --test --test-concurrency=4 ...` | **356 pass / 5 fail** of 361 (exit 1, 28.7 s) |
| isolated | each failing file alone (authz, durability, snapshot) | all green |

**Verdict: the suite is load-flaky under parallel execution.** Failing files differ run to run
(run 1: authz/demoDataset/demoMode/directsales/financials/monthlyclose/phase2/snapshot;
run 3: durability + snapshot only). Every failing file passes in isolation and in small
combinations. Failure mode is `fetch failed` / dead child servers — the heaviest tests
(durability's SIGKILL-restart cycle, snapshot's dual server boot + probe.js child) die most
often. The playbook's "361/361 green" claim is true only sometimes. See TST-001.

## 3. Inventory: every test-like file

### 3a. In `npm test` (automated, assertions, headless, offline) — 20 files, 361 tests / 60 suites

| File | Tests | Runner | Real coverage (from the assertions, not the name) |
|---|---|---|---|
| atvenu.test.js | 6 | node:test, spawned server :ephemeral | AtVenu CSV import: RBAC 403, 400 on missing file/bad header, integer-cents import report, re-import idempotency, list in integer cents |
| authz.test.js | 22 | node:test, spawned server :3996 | PHASE 1A RBAC: fixture logins, artist 403s on admin endpoints (operations, anr/*, integrations/test-limit), artist-scoped reads (own record only, no over-block), unauthenticated 401s |
| billing.test.js | 21 | node:test, spawned server + stripeClient unit | No-key → 503s; **stubbed** Stripe: RBAC, checkout idempotency, webhook signature verify, subscription state machine. **Real Stripe never exercised** |
| catalogIntegrity.test.js | 7 | node:test (`describe`/`it`), injected fakes | normalizeUpc; spotify-albums-vs-delivered-UPC matching; skips with explicit reasons; spotify-failure → error state |
| demoDataset.test.js | 6 | node:test, spawned server :32202 | demo/dataset-v1 load: matches expected.json, unmatched rows rejected, revision supersedes as unit, review states, idempotent reload, approved export |
| demoMode.test.js | 4 | node:test, spawned server :32201 (×2 boots) | Customer boot: no demo logins, ADMIN_EMAIL/PASS bootstrap, no fictional seeding, restart doesn't backfill |
| directsales.test.js | 24 | node:test, spawned server + units | Stripe Connect interface: normalizeCharge/normalizePayout integer cents, attributeToArtist, OAuth round-trip (stubbed), sync idempotency, per-artist scoping, payouts as reconciliation evidence, AI-gating disclaimers |
| durability.test.js | 1 | node:test, spawned server :3989, SIGKILL restart | Artists, A&R, sales, audit state survive a full process restart. **Uses fixed DB path** `tests/snapshots/.durability.sqlite` (TST-002) |
| financials.test.js | 22 | node:test, units + spawned server | decimal.js exact arithmetic (line-rounding trap, round-half-up); review state machine; royalty import precision; trusted-totals exclude disputed/estimated; reconciliation; export provenance |
| integrity.test.js | 1 | node:test, spawned server :ephemeral | B1–B3: malformed royalties 4xx w/o killing API; rejected artist writes don't 200/emit audits; concurrent distinct-user votes persist; FE-01 sales contract |
| monthlyclose.test.js | 25 | node:test, spawned server | Monthly close: splits/duplicates/supersede, period filtering, trusted totals, KPIs=reconciliation, payout sync idempotency, bank-deposit provenance, matching, cash≠income, commission worksheet determinism, mapping-layout re-review |
| password-reset.test.js | 10 | node:test, in-process app on :ephemeral | Reset tokens: generic request, digest-only storage, no secret in logs, single-use, concurrent redemption (exactly one wins), failed mail clears token, deactivated/deleted accounts, bootstrap-creds can't bypass |
| phase2.test.js | 30 | node:test, spawned server | OAuth unconfigured 503s; token crypto round-trip; OAuth lifecycle (stubbed); catalog CRUD + ISRC/UPC validation + artist isolation; royalty CSV import incl. duplicates |
| provenance.test.js | 26 | node:test (`describe`/`it`), injected fakes | withProvenance contract; spotify/instagram/tiktok/musicbrainz/wikidata tagging; entity-audit scoring; schemaLD honesty |
| providerSync.test.js | 11 | node:test, units + spawned server :32203 | **Fixture path only** (credentials absent): bounded retries, terminal failure sanitized, blocked status, idempotency keys, stale-running retake, HTTP RBAC. Real providers never exercised |
| review-fixes.test.js | 7 | node:test, units + spawned server :ephemeral | Migration preserves rows; unknown columns refused; AI cache auth scoping; legacy token rejection; report batch states; graph edges; multi-restart persistence + restricted reads |
| routes.test.js | 12 | node:test, in-process require (no listen) | Route table invariants: expected count, shadowed-duplicate pins still present, 7 unauthenticated routes only, export guard present, cron NOT scheduled on require |
| services.test.js | 65 | node:test, injected fakes | ai prompts/parser/service, groq client timeout, repositories (incl. split-brain A&R pins), cacheService, entityAuditService (fake facade), regression analytics (random → noise-band asserts), integrations facade, scout, rateLimiter, **jobs** (schedule expr, previousMonth, execFile argv — HIGH-6), emailService (fake transport), monthlyReport PDF (valid, confidential footer) |
| snapshot.test.js | 21 | node:test, spawned servers :3998/:3997 + probe.js child | Behavioral equivalence vs `tests/snapshots/phase2_baseline.json`: deterministic cases byte-compared (FIXTURE_WIKIPEDIA=1), nondeterministic get status/shape only; canonical entrypoint contracts; pageAccess/artistAccess write paths; user-delete guards + session tail; request-id on every response |
| units.test.js | 51 | node:test, pure units | auth (hasArtistAccess/filterDataByAccess/authenticateToken/checkExportAccess incl. HIGH-4 fixes), dataShape, config secrets hardening (CRITICAL-2, HIGH-5 CORS), model shapes, profile, usage/audit seams |

### 3b. Support scripts (tests/support/)

| File | Automated? | Headless/offline? | What it really is |
|---|---|---|---|
| cases.js | n/a (data) | yes | ~92-case HTTP catalogue + NONDETERMINISTIC set for the snapshot probe |
| probe.js | yes (exit code; writes JSON snapshot) | yes (localhost child server) | Boots server.js, replays cases.js, writes normalized snapshot. Sets `FIXTURE_WIKIPEDIA=1`. Uses fake fixed JWT secret (fine — determinism) |
| verify_phase2.js | **yes — 54 checks, real assertions, non-zero exit on fail** | yes (localhost) | Operational checklist vs a running server. NOT in `npm test`; run via `npm run verify` / `npm run verify:hermetic` |
| sort_side_effect_check.js | **no — manual** | needs a running server at :3021 | One-off investigation: prints artist ordering before/after `/v3/ai/analyze`. Asserts nothing. Keep, but never count as a test |
| run_legacy_scripts.sh | no (harness) | no | Runs ad-hoc `test_*`/`verify_*`/`check_*` scripts; self-declares NOT part of npm test (no assertions, needs creds). No such scripts currently exist at repo root |

### 3c. Other scripts (scripts/)

| File | Automated? | Notes |
|---|---|---|
| run-verify-hermetic.js | yes | Spawns server.js on throwaway SQLite + random JWT on :3971, runs verify_phase2.js, tears down. Exit code = verdict. Offline |
| run-visual-gate.js | yes | Self-hosts scratch API + Vite on ephemeral ports, runs web/validation/gate.mjs. Offline except needs Playwright chromium |
| run-browser-workflows.js | yes | Self-hosted stack, runs `execution-validation/repair-2026-09-18/workflows.mjs` with `WORKFLOW_OFFLINE=1`; exit code from workflow-results.json |
| run-demo.sh / stop-demo.sh | no — manual | One-command demo launcher (:4000/:5173, DEMO_MODE=true). Not a test |

### 3d. web/ (React/Vite frontend)

- `web/package.json` has **no test script** (dev/build/preview/gate only). No vitest/jest/RTL configured.
- `web/validation/gate.mjs` — automated Playwright acceptance gate (static brand-portability checks + ~500-request browser checks); exit 0/1. Requires chromium + servers; in `npm run test:all` only via `--static-only` + `test:workflows`.

## 4. Crown-jewel coverage map (PLAYBOOK B3)

| # | Crown jewel | Covered by | Gaps → finding |
|---|---|---|---|
| 1 | auth: JWT+bcrypt, RBAC, per-artist isolation | authz (22), password-reset (10), units (auth ×17), snapshot (session tail) | strong |
| 2 | money math: royalties/splits/reconciliation/reports | financials (22), monthlyclose (25), atvenu (6), directsales (24), demoDataset (6) | strong for integer-cents/decimal; real-Stripe path absent (TST-005) |
| 3 | provider sync: idempotency, retries, fixtures | providerSync (11) | **fixture-only**; real-credential path untested (TST-005) |
| 4 | PDF/CSV exports | services (monthlyReport PDF), snapshot (CSV e2e), financials (export provenance), verify_phase2 (CSV) | adequate |
| 5 | A&R voting integrity | integrity (1 test: concurrent votes), authz (RBAC 403s), snapshot (status-only) | **thin: no double-vote, tally-correctness, archived-demo tests** (TST-004) |
| 6 | GDPR export/delete | **nothing** | `DELETE /v3/auth/me` exists, untested; no export endpoint at all (TST-003) |
| 7 | customer/demo separation | demoMode (4) | adequate |

Critical flows: login→RBAC ✓ · royalty CSV→reconciliation→monthly report ✓ · provider sync ✓(fixture) ·
demo vs customer boot ✓ · password reset ✓ · PDF/CSV export ✓ · A&R submission→voting — partial (TST-004) ·
**scheduled report job end-to-end** ✗ (TST-007) · **GDPR delete** ✗ (TST-003).

## 5. Flaky patterns spotted

- **Parallel load flake (CONFIRMED, TST-001):** full `npm test` intermittently red on this machine;
  isolated files always green. Victims are the heaviest tests (multi-server boots, restart cycles).
- **Fixed DB path (TST-002):** durability.test.js:34 → `tests/snapshots/.durability.sqlite` (gitignored,
  but shared across concurrent runs).
- **Fixed sleeps (TST-008):** demoMode.test.js:141 (1000 ms after SIGKILL), durability shutdown (300 ms),
  financials after-hook (1500 ms). Assumptions, not synchronization.
- **No live network in tests (good):** verified — all external calls are to localhost children or injected fakes;
  Wikipedia fixtures only; entity-audit live path never reached by tests.
- **Deterministic time/randomness:** mostly handled — NONDETERMINISTIC set in cases.js, noise-band asserts for
  synthetic history, fake fixed secrets per file. `billing.test.js:112` uses Math.random for event ids (fine).
- **No shared DB state between tests:** every spawned-server file sets its own DB_STORAGE (scratch/:memory:);
  the 5 DB_STORAGE-less files (catalogIntegrity, provenance, routes, services, units) never open a DB connection
  (in-memory ring buffers, lazy sequelize models). `pulsegrid_v5.sqlite` in repo root is gitignored residue —
  harmless but worth deleting.

## 6. Prioritized test plan for Phase 5 (risk × ease)

Order of work — highest leverage first:

1. **Stabilize the gate (TST-001).** Nothing else can be verified without a reliable suite. Options, cheapest
   first: (a) run `npm test` with `--test-concurrency` capped (e.g. 4–8) and measure 5 consecutive greens;
   (b) give durability/snapshot their own serial lane (`test:heavy` script); (c) add boot-retry (one retry) in
   the spawn helpers. Recommended default: (a)+(b). Never "fix" by weakening assertions.
2. **GDPR tests (TST-003, risk: legal).** `DELETE /v3/auth/me`: self-delete works, root admin 403, deleted user's
   JWT stops authorizing, related data actually gone (currently only the user row is destroyed — verify cascade
   behavior and pin whatever the decision is). Add a GDPR *export* endpoint or document its absence (owner call).
3. **A&R voting integrity (TST-004).** Same-user double vote (rejected or idempotent?), tally correctness after
   N concurrent votes, votes on archived demos, artist can't vote outside own scope.
4. **Money with real-provider contracts (TST-005).** Record/replay (VCR-style) fixtures for Stripe charge/payout
   shapes and one provider-sync adapter; pin `normalizeCharge`/`normalizePayout` against recorded payloads so
   provider schema drift fails loudly. No live keys in tests.
5. **Cron job wiring (TST-007).** With fake timers or a triggered run: monthlyReportJob produces a PDF and
   hands it to the mailer (mailer stubbed); providerSync job records executions. Currently only the cron
   expression string is pinned.
6. **Frontend smoke (TST-010).** Add vitest + a handful of component tests for login, RBAC-hiding, and the
   export buttons — the Playwright gate covers journeys but isn't in the default gate and needs a browser.

### How to mock externals (established patterns — reuse them)
- **Providers:** `createIntegrationFacade({...})` accepts replacements for every downstream provider;
  services take `integrationFacade` by injection (services.test.js pattern).
- **Payments:** `PAYMENTS_STUB=true` + stubbed stripeClient (billing/directsales pattern). Never real keys.
- **Wikipedia:** `FIXTURE_WIKIPEDIA=1` + `src/integrations/wikipedia.fixtures.js` (probe pattern).
- **AI:** fake client injection (`fakeClient`), unconfigured-provider 503 paths.
- **Email:** fake transport injection (emailService pattern).
- **Time:** explicit `observedAt` params (provenance pattern); avoid `Date.now()` in assertions.

### How to manage test data
- One scratch dir per file (`fs.mkdtempSync(os.tmpdir())`), `:memory:` or temp-file SQLite via `DB_STORAGE`,
  deleted in `after()`. Never the repo-root `pulsegrid_v5.sqlite`, never a shared path (fix TST-002).
- Deterministic fake secrets per file (existing pattern); `DEMO_MODE=true` for the seeded path,
  `ADMIN_EMAIL=''`/`ADMIN_PASS=''` to avoid the override branch (existing pattern).
- Ephemeral ports via `net.createServer().listen(0)` (integrity/review-fixes pattern) instead of fixed ports
  where possible; keep the few fixed ports (3996/3998/3989/32201-32203) documented and non-overlapping.

## 7. What was NOT verified
- `npm run verify` / `verify:hermetic`, the visual gate, and browser workflows were inventoried but **not executed**
  (browser work is out of scope for this subagent; hermetic verify not run to avoid extra load during flake analysis).
- `web/` build was not run.
- Exact per-file pass counts for run 1's 64 failures beyond the suite-level breakdown (logs at
  `/tmp/ms-tst/npm-test.log` on the Threadripper — ephemeral, will not survive reboot).
