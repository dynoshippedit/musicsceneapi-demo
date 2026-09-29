# Findings — TST (Test Engineer) · lane prefix `TST`

Ledger for test-harness issues found 2026-09-29 on branch `devteam/review-2026-09-29`.
Format per PLAYBOOK B7/B8: ID · title · severity · confidence · status · location · evidence ·
what's wrong · impact · suggested fix. Effort: XS <15m · S <1h · M <½d · L ≤2d.

## Index

| ID | Severity | Title | Status |
|---|---|---|---|
| TST-001 | S2 | Full `npm test` suite is load-flaky in parallel mode | NEW |
| TST-002 | S3 | durability.test.js uses a fixed, shared DB path | NEW |
| TST-003 | S2 | GDPR delete endpoint has zero tests; no GDPR export endpoint exists | NEW |
| TST-004 | S2 | A&R voting integrity thinly tested (crown jewel #5) | NEW |
| TST-005 | S3 | Real-provider paths (Stripe, provider sync, OAuth) tested only via stubs/fixtures | NEW |
| TST-006 | S4 | Manual scripts live beside tests with no manifest distinguishing them | NEW |
| TST-007 | S3 | Scheduled jobs (monthly report, provider sync) never executed end-to-end in tests | NEW |
| TST-008 | S3 | Fixed sleeps in tests instead of synchronization | NEW |
| TST-009 | S4 | (positive) No test hits live external hosts; Wikipedia fixture-only | NEW |
| TST-010 | S2 | React frontend has zero unit tests; browser gates not in `npm test` | NEW |

---

### TST-001 · Full `npm test` suite is load-flaky in parallel mode
- **Severity:** S2 (gate reliability — Phase 5 cannot verify fixes against a flaky suite)
- **Confidence:** Confirmed (reproduced variance across 3 full runs + isolated passes)
- **Status:** NEW · **Effort:** M
- **Location:** `tests/regression/*.test.js` (spawn helpers); observed via `npm test`
- **Evidence:**
  - Run 1 (`npm test`, default concurrency): `# tests 361 · pass 290 · fail 64 · cancelled 7`, exit 1.
    Failing suites: authz, demoDataset, demoMode, directsales, financials, monthlyclose, phase2 (3 sections), snapshot (3 sections).
  - Run 2 (identical command): `# tests 361 · pass 361 · fail 0`, 60 suites, 11.3 s, exit 0.
  - Run 3 (`--test-concurrency=4`): `# tests 361 · pass 356 · fail 5` — durability + snapshot only, exit 1.
  - In isolation, every failing file is green (authz 22/22, durability 1/1, snapshot 21/21; 3-file heavy combo also green).
  - Failure mode: `failureType: 'testCodeFailure', error: 'fetch failed'` — spawned child servers die mid-file
    (e.g. authz tests 1–6 pass, then the server is unreachable). Heaviest tests (restart cycles, dual-boot + probe child) die most often.
  - This contradicts the B3 claim "361 tests / 60 suites green" as an unconditional statement — it is true only sometimes.
- **What's wrong:** `node --test` runs all 20 files in parallel (default concurrency = CPUs−1); the burst of
  spawned `server.js` children (sequelize sync + bcrypt seeding per boot) intermittently kills or starves servers.
  Failure set varies run to run → environmental/timing, not a deterministic code bug.
- **Impact:** CI/gate signal is unreliable; a Phase 5 fixer cannot distinguish "my change broke it" from flake.
- **Suggested fix:** (a) cap `--test-concurrency` (4–8) and measure 5 consecutive greens; (b) move durability +
  snapshot to a serial `test:heavy` lane; (c) add one boot-retry in spawn helpers. Never weaken assertions.
  Recommended default: (a)+(b).

### TST-002 · durability.test.js uses a fixed, shared DB path
- **Severity:** S3 · **Confidence:** Confirmed (code read) · **Status:** NEW · **Effort:** XS
- **Location:** `tests/regression/durability.test.js:34`
- **Evidence:** `const DB_FILE = path.join(ROOT, 'tests', 'snapshots', '.durability.sqlite');` — one fixed path,
  not per-run unique. `before()` unlinks it, `after()` cleans it, but two concurrent `npm test` invocations
  (or a stale file from a killed run) share/corrupt it. Every other spawned-server test file uses
  `fs.mkdtempSync(os.tmpdir())` or `:memory:`.
- **What's wrong:** breaks the one-scratch-dir-per-file convention documented in notes/testing.md §6.
- **Impact:** overlapping runs (e.g. a gate run + a dev run) can corrupt each other's durability assertions.
- **Suggested fix:** `DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pulsegrid-durability-')), 'test.sqlite')`
  (the file is already gitignored, so no repo mutation — this is purely a concurrency fix).

### TST-003 · GDPR delete endpoint has zero tests; no GDPR export endpoint exists
- **Severity:** S2 (crown jewel #6; legal-adjacent) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Location:** `src/routes/auth.js:295` (`DELETE /v3/auth/me`); no export route found anywhere in `src/routes`, `src/services`
- **Evidence:** `grep -rniE 'gdpr|right.to.erasure|data.portab|/v3/me/export' src/ tests/` → only hit is the route
  itself plus code comments; **zero** hits in `tests/regression/`. The handler destroys only the `User` row and
  comments "In production, also cascade delete related data or anonymize logs" — the cascade decision is unpinned.
- **What's wrong:** crown jewel #6 (PLAYBOOK B3) has no automated proof; the untested delete path is exactly the
  kind of code that rots (profile.rootAdminEmail guard, session-tail behavior).
- **Impact:** GDPR delete could silently break; no export capability for data-portability requests.
- **Suggested fix:** add tests: self-delete 200, root-admin 403, deleted user's JWT stops authorizing (reuse the
  snapshot.test.js F-2 session-tail pattern), related-data disposition pinned. Owner call: add a GDPR export
  endpoint or document its absence (QUESTIONS.md).

### TST-004 · A&R voting integrity thinly tested (crown jewel #5)
- **Severity:** S2 · **Confidence:** Confirmed (assertion inventory) · **Status:** NEW · **Effort:** S
- **Location:** `tests/regression/integrity.test.js` (single test), `tests/regression/authz.test.js` (RBAC 403s on `/v3/anr/*`)
- **Evidence:** the only behavioral voting test is B3 in integrity.test.js: "concurrent distinct-user votes must
  both persist". Nothing tests: same-user double vote (rejected? idempotent? counted twice?), tally correctness
  after N concurrent votes, votes on archived demos, cross-artist vote scoping beyond route 403s. Snapshot
  cases cover `/v3/anr/*` status/shape only (most are in the NONDETERMINISTIC set).
- **What's wrong:** crown jewel #5's core integrity property (one person, one vote; tallies are right) is unproven.
- **Impact:** vote-stuffing or tally bugs would ship silently.
- **Suggested fix:** add tests for double-vote semantics, concurrent-vote tally equality, archived-demo rejection.

### TST-005 · Real-provider paths tested only via stubs/fixtures
- **Severity:** S3 · **Confidence:** Confirmed · **Status:** NEW · **Effort:** M
- **Location:** `tests/regression/billing.test.js`, `tests/regression/directsales.test.js`,
  `tests/regression/providerSync.test.js`, `tests/regression/phase2.test.js`
- **Evidence:** billing: no-key → 503s + stubbed-Stripe state machine; providerSync: "fixture execution when
  credentials are absent" only; phase2 OAuth: "unconfigured" + "stubbed" describes; directsales sync uses
  PAYMENTS_STUB. The seams are mockable (`createIntegrationFacade` injection, `normalizeCharge`/`normalizePayout`
  pure functions) but no test pins the real providers' response shapes.
- **What's wrong:** provider schema drift (Stripe charge object changes, Spotify API changes) fails silently.
- **Impact:** sync/import features break in production while the suite stays green.
- **Suggested fix:** record/replay (VCR-style) fixtures of real provider payloads; pin normalizers against them.
  No live keys in tests.

### TST-006 · Manual scripts live beside tests with no manifest distinguishing them
- **Severity:** S4 (info) · **Confidence:** Confirmed · **Status:** NEW · **Effort:** XS
- **Location:** `tests/support/sort_side_effect_check.js`, `tests/support/run_legacy_scripts.sh`, `scripts/run-demo.sh`
- **Evidence:** `sort_side_effect_check.js` prints and asserts nothing, targets a running server at `:3021`;
  `run-demo.sh` is a launcher. Per B9.7 "Never count a script without assertions as a test" — they are not
  counted, but nothing in the tree says which files are tests vs manual tools except reading them.
- **Suggested fix:** one-line manifest comment in `tests/support/README.md` (or header comments) classifying
  each script: automated-test / manual-investigation / launcher.

### TST-007 · Scheduled jobs never executed end-to-end in tests
- **Severity:** S3 · **Confidence:** Confirmed · **Status:** NEW · **Effort:** S
- **Location:** `src/jobs/` (monthlyReportJob, providerSync); `tests/regression/routes.test.js:162`-ish
  ("requiring the app does NOT schedule cron jobs"); `tests/regression/services.test.js` (jobs describe)
- **Evidence:** jobs tests pin the cron expression string, `previousMonth()`, and that `autoPrintReport` uses
  `execFile` with an argv array (HIGH-6). `generateMonthlyReport` is unit-tested (valid PDF, footer). But the
  wiring — cron fires → report generated → handed to mailer → providerSync job records executions — is never run.
- **Impact:** a broken job registration or mailer handoff ships silently; the monthly report is a revenue-facing artifact.
- **Suggested fix:** trigger the job handlers directly with fake timers / invoked run functions and a stubbed
  mailer; assert a PDF is produced and an execution row recorded.

### TST-008 · Fixed sleeps in tests instead of synchronization
- **Severity:** S3 · **Confidence:** Likely (one unverified assumption: these sleeps contribute to TST-001's flake)
- **Status:** NEW · **Effort:** XS
- **Location:** `tests/regression/demoMode.test.js:141` (1000 ms after SIGKILL), `tests/regression/durability.test.js`
  (`shutdown()` 300 ms), `tests/regression/financials.test.js` (after-hook 1500 ms)
- **Evidence:** fixed `setTimeout` waits for process death / shutdown grace instead of polling for the condition
  (port free, child exit). The spawn helpers elsewhere already use the poll-with-deadline pattern.
- **Suggested fix:** replace with `once(child, 'exit')`-style waits or port-free polling.

### TST-009 · (positive) No test hits live external hosts; Wikipedia fixture-only
- **Severity:** S4 (info) · **Confidence:** Confirmed · **Status:** NEW
- **Evidence:** `grep -nE 'https?://[a-zA-Z0-9]' tests/regression/*.test.js` → only string-shape assertions
  (`connect.stripe.com` URL prefix, instagram graph URL in a fake). The live `auditWikipedia`
  (`modules/entityAudit.js:197`, axios to en.wikipedia.org) is never reached: the only entity-audit hits in
  tests are non-admin 403s (review-fixes.test.js:159) and route-table checks; the snapshot probe sets
  `FIXTURE_WIKIPEDIA=1` (tests/support/probe.js:46, src/integrations/index.js:75). 5 DB_STORAGE-less test files
  never open a DB connection (in-memory ring buffers, lazy sequelize).
- **Note for the record:** suite is hermetic/offline-clean by construction, not by accident.

### TST-010 · React frontend has zero unit tests; browser gates not in `npm test`
- **Severity:** S2 · **Confidence:** Confirmed · **Status:** NEW · **Effort:** L
- **Location:** `web/package.json` (no test script), `web/validation/gate.mjs`
- **Evidence:** `web/package.json` scripts = dev/build/preview/gate only; no vitest/jest/RTL. The Playwright
  visual gate (gate.mjs) and browser workflows (run-browser-workflows.js) are automated with exit codes but
  require chromium + servers and are not part of the default `npm test` gate.
- **Impact:** frontend regressions (login form, RBAC-hiding, export buttons) have no fast automated check.
- **Suggested fix:** add vitest + a smoke set for login, role-based nav hiding, and export-button wiring;
  keep Playwright for journeys.
