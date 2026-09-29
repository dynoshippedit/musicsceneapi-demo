# Triple-Verification Remediation — 2026-09-29

**Date:** 2026-09-29
**Scope:** six ordered remediation gaps against the 9-step audit (docs 01–06).
All changes verified by fresh focused runs; full `npm test` + visual gate
re-run at completion (see counts in the completion section).

---

## Gap 1 — HIGH-6 report command/path injection — FIXED

**Files:** `src/utils/safeFilename.js` (new), `src/jobs/monthlyReportJob.js`,
`src/routes/reports.js`, `tests/regression/review-fixes.test.js`.

- Filename sanitization is now centralized in `safeFilename()`: rejects
  path traversal (`..`), absolute paths, separators, leading dashes
  (argv-injection via `execFile` arg arrays), control characters and
  header-injection newlines; invalid months are rejected.
- PDF generation still uses `execFile(command, args)` — never a shell
  string — with the sanitized filename passed as an argument inside a
  fixed output root (outside-root writes rejected).
- Regression coverage: traversal, header-injection, invalid-month,
  leading-dash, outside-root, argv-shape.
- Focused run: 61/61 pass.

## Gap 2 — Explicit customer/demo-mode separation — IMPLEMENTED

**Files:** `src/config/index.js`, `src/models/index.js`, `production-api.js`,
`src/repositories/artistRepository.js`, `src/jobs/monthlyReportJob.js`,
`scripts/run-demo.sh`, `.env.example`, `tests/regression/demoMode.test.js`,
`tests/support/probe.js` and server-spawning suites.

- `DEMO_MODE` is a first-class config flag (`process.env.DEMO_MODE === 'true'`,
  default off). `initDB({ demoMode })` gates ALL fictional Pulsegrid
  seeding (users, artists, catalog, royalty, A&R, rooms).
- Customer mode: fresh database boots empty; known demo logins fail; the
  first admin bootstraps via `ADMIN_EMAIL`/`ADMIN_PASS`; no fictional
  rows exist and restarts never backfill them.
- `artistRepository` no longer merges or falls back to the fictional
  in-memory roster in customer mode; customer writes never mutate the
  demo mirror. The monthly report job reads artists via
  `findAllHybrid()`.
- `scripts/run-demo.sh` sets `DEMO_MODE=true` explicitly; every
  server-spawning regression suite sets it explicitly where demo seeds
  are required.
- New suite `tests/regression/demoMode.test.js`: 4/4 pass.

## Gap 3 — Stale root README — REWRITTEN

Root `README.md` now documents the actual Node.js/Express backend and
React/Vite frontend: financial ingestion, reconciliation, catalog, A&R,
campaign, reporting, auth, and integration workflows; The Music Scene as
product vs Pulsegrid as fictional demo data; dedicated-instance isolation
(not shared multitenancy); customer mode vs `DEMO_MODE=true`; exact
install/demo/customer/test commands; honest provider/fixture status;
`demo/dataset-v1/`. Claims re-checked against the delivered Gap 5/6
behavior (below) — no fabricated provider success.

## Gap 4 — Deterministic versioned demo dataset — IMPLEMENTED

**Files:** `demo/dataset-v1/` (`README.md`, `load.js`, `expected.json`,
`statements/`, `evidence/.gitignore`), `tests/regression/demoDataset.test.js`.

- Three fixture statements (July initial, July revised, August) with
  matched / unmatched / invalid-amount / superseded / disputed rows.
- Loader is deterministic: a second load skips imports and asserts
  identical line/state results; unmatched ISRCs never persist.
- **Deterministic contract note:** the August trusted total is `43000`
  cents, not `30500` — dataset-approved rows total `30500` cents and the
  required `DEMO_MODE=true` also includes the pre-existing seeded August
  royalty line of `12500` cents. Documented in `expected.json`.
- Focused run: 6/6 pass. `--evidence` writes import reports,
  reconciliation JSON, and approved CSV export (gitignored; never
  committed).

## Gap 5 — Provider synchronization — IMPLEMENTED

**Files:** `src/jobs/providerSync.js` (new), `src/routes/sync.js` (new),
`src/models/index.js`, `src/jobs/index.js`, `src/routes/index.js`,
`src/routes/context.js`, `.env.example`, `tests/regression/providerSync.test.js`.

- `ProviderSyncExecution` persistent model: unique idempotency key,
  provider/kind, status, attempt/maxAttempts, trigger identity,
  started/finished timestamps, sanitized error summary, attempt history,
  fixture flag, result summary.
- Runner (`runProviderSync`): duplicate protection (same key never
  re-runs; concurrent `running` rows are duplicates; stale `running`
  rows older than 1h are retaken), bounded exponential backoff retries
  (default 3 attempts, 1s/2s), terminal `succeeded` / `failed` /
  `blocked` / `fixture` states, error sanitization (credential-shaped
  values redacted before persistence).
- **Credential-absent behavior is fixture mode:** explicitly labeled,
  zero network, no provider metrics invented, nothing written. No
  fabricated provider success, metrics, or readiness anywhere in the
  runner or tests.
- Admin endpoints: `POST /v3/sync/run` (idempotency key accepted;
  400 on unknown provider/kind), `GET /v3/sync/executions`
  (filterable by provider/status, newest first). Both admin-only;
  non-admin gets 403.
- Scheduling: off by default; enabled only with
  `PROVIDER_SYNC_ENABLED=true` (daily 04:00 spotify/artist-stats +
  stripe/sales-pull). Adapters: Spotify artist-stats (OAuth token flow
  via existing `integrations/spotify.js`) and Stripe sales-pull
  (Connect test-mode via existing `integrations/stripeClient`),
  dependency-injected for tests.
- Focused run: 11/11 pass. Route appended to `src/routes/index.js`
  without reordering existing domains.

## Gap 6 — Legacy canned AI behavior — REMOVED / FAIL-CLOSED

**Files:** `src/ai/aiService.js`, `src/services/entityAuditService.js`,
`tests/regression/services.test.js`.

- `analyzeByKeyword` (legacy hardcoded Pulsegrid answers) is REMOVED
  from the service and its export; the old pinning tests were replaced
  with absence tests (`typeof svc.analyzeByKeyword === 'undefined'`).
- `analyzeEntityHealth` fails closed with an explicit status:
  `not_configured` (provider absent — checked BEFORE any call),
  `unavailable` (transport failure or unusable provider output),
  `ok` (successful provider call, validated fields). No canned roster
  claims, no fake analysis; the UI receives an explicit status, never
  mock insights (`EntityAuditTab.jsx` renders the returned
  summary/correlationInsight/criticalActions unchanged).
- `entityAuditService` records the `ai_call` usage event ONLY when
  `aiAnalysis.status === 'ok'`. A failed or unconfigured provider call
  is not a billable AI event.
- `reportInsight` (monthly PDF) throws `AI provider is not configured`
  when the provider is absent — fail-closed into the PDF builder's
  existing catch, which writes the offline message into the doc.
- `query()` was already fail-closed (discriminated `{kind:'error'}`)
  and records `ai_tokens` usage only after a successful provider call.
- Focused run: 65/65 pass.
