# REFACTOR_PROGRESS.md

Running log of the incremental refactor. Phase 1 and Phase 2 are complete;
Phase 3 has not been authorized.

Reference commit for all "original"/"pre-refactor" claims: `c0281d8`.

---

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Canonical entrypoint, config, middleware, auth, models, shared utils | COMPLETE |
| 2 | repositories, services, integrations facade, AI, analytics, reports, jobs, controllers/routes | COMPLETE |
| 3 | Defect remediation, security fixes, validation, logging redaction | COMPLETE — see PHASE_3_VALIDATION.md |

Monolith size: **3207 → 82 lines** (`mau5trap-production-api.js` is now an app
assembler). 39 modules under `src/`, 5249 lines total.

---

## Phase 2 — files created (27)

### Repositories
| File | Lines | Responsibility |
|---|---|---|
| `src/repositories/artistRepository.js` | 221 | mock lookup, cache-aware `getArtistData`, DB+mock hybrid union, ranking helpers |
| `src/repositories/inMemoryStores.js` | 118 | prospects, anrSubmissions, anrState, userIntegrations, salesData, apiCache(dead) |
| `src/repositories/operationsRepository.js` | 104 | static logistics/assets/contracts fixtures (copied programmatically) |

### Services
| File | Lines | Responsibility |
|---|---|---|
| `src/services/cacheService.js` | 75 | sole NodeCache owner; named key builders + TTL constants |
| `src/services/emailService.js` | 92 | nodemailer transport, `sendEmail`, `sendPasswordReset` |
| `src/services/entityAuditService.js` | 123 | orchestrates 5 providers + AI + two-tier caching |

### AI
| File | Lines | Responsibility |
|---|---|---|
| `src/ai/groqClient.js` | 118 | model invocation only; lazy construction, 20s timeout, injectable transport |
| `src/ai/prompts.js` | 73 | all 3 prompt templates, byte-frozen |
| `src/ai/responseParser.js` | 166 | tolerant JSON parse, zod validation, verbatim fallback |
| `src/ai/aiService.js` | 186 | `query`, `analyzeEntityHealth`, `analyzeByKeyword`, `reportInsight` |

### Integrations / analytics / reports / jobs
| File | Lines | Responsibility |
|---|---|---|
| `src/integrations/index.js` | 68 | facade over every external source; fully injectable |
| `src/integrations/rateLimiter.js` | 79 | `RateLimiter`, `SERVICES`, `limiters` |
| `src/integrations/scoutService.js` | 101 | A&R scout mock fixtures + filter + simulated latency |
| `src/analytics/regression.js` | 88 | OLS regression, synthetic history generator |
| `src/reports/monthlyReport.js` | 436 | 379-line pdfkit builder, copied programmatically |
| `src/jobs/index.js` | 35 | `registerJobs()` — explicit, not a require side effect |
| `src/jobs/monthlyReportJob.js` | 137 | cron `0 3 1 * *`, `autoPrintReport` |

### Routes (13 domain modules + 2 support)
`src/routes/index.js` (65) · `context.js` (114) · `anr.js` (380) ·
`artists.js` (288) · `reports.js` (206) · `users.js` (196) · `auth.js` (193) ·
`integrations.js` (185) · `analytics.js` (181) · `ai.js` (137) ·
`label.js` (138) · `finance.js` (94) · `marketing.js` (82) ·
`operations.js` (58) · `system.js` (46)

### Tests / tooling
`tests/support/cases.js` (shared 91-case catalogue) ·
`tests/support/verify_phase2.js` (53 live operational checks) ·
`tests/support/sort_side_effect_check.js` (one-off measurement) ·
`tests/regression/services.test.js` (Phase 2 layer tests) ·
`tests/snapshots/phase2_baseline.json` (pre-Phase-2 baseline)

### Docs
`BACKEND_ARCHITECTURE.md`, this file.

---

## Phase 2 — files modified (5)

| File | Change |
|---|---|
| `mau5trap-production-api.js` | 1974 → 82 lines. Now only: middleware → routes → error handlers, plus `initializeDatabase()` and exports. No business logic, data access, prompts, PDF layout, cron or handlers remain. |
| `server.js` | Added explicit `registerJobs()` after DB init; honours `SCHEDULE_JOBS=false`. |
| `tests/support/probe.js` | Rewritten to consume the shared catalogue; 50 → 91 cases; volatile-key scrubbing widened (ids, timestamps, download URLs). |
| `tests/regression/routes.test.js` | Added duplicate-ordering, cross-domain shadowing, middleware-chain and no-cron-on-require assertions. |
| `tests/regression/snapshot.test.js` | Repointed at `phase2_baseline.json`; added status-parity-on-all-91, DB-read and CSV-export checks. |

No legacy file was deleted. `Server v5.js`, `package1.json`,
`package-production.json` and all 18 ad-hoc scripts are untouched.

---

## Functionality moved

| Behavior | From | To |
|---|---|---|
| `getArtistData`, `getAllArtists`, mock/DB union | monolith data layer | `repositories/artistRepository.js` |
| 4 ranking sorts inlined in handlers | `/v3/ai/analyze`, `getLabelOverview` | `artistRepository.topBy*` |
| 8 module-scope mutable stores | monolith globals | `repositories/inMemoryStores.js`, `operationsRepository.js` |
| NodeCache instance + 12 inline key strings | monolith | `services/cacheService.js` |
| nodemailer transport, `sendEmail`, reset template | monolith | `services/emailService.js` |
| entity-audit orchestration (~105-line handler) | route handler | `services/entityAuditService.js` |
| 3 `groq.chat.completions.create` call sites | route handlers + PDF builder | `ai/groqClient.js` via `ai/aiService.js` |
| `JSON.parse` on model output | route handler | `ai/responseParser.js` |
| prompt strings | 3 inline locations | `ai/prompts.js` |
| `performLinearRegression`, `generateSyntheticHistory` | monolith | `analytics/regression.js` |
| `generateMonthlyReport` (379 lines) | monolith | `reports/monthlyReport.js` |
| `cron.schedule`, `autoPrintReport` | monolith side effect | `jobs/monthlyReportJob.js`, registered by `server.js` |
| `RateLimiter`, `SERVICES`, `limiters` | monolith | `integrations/rateLimiter.js` |
| scout mock fixtures + 500ms latency | route handler | `integrations/scoutService.js` |
| 63 route handlers | one file | 13 domain modules |
| `getLabelOverview` | monolith | `routes/reports.js` (its only consumer) |

### Removed as verified-dead
- **Rogue `SpotifyWebApi`** with literal `'your-client-id'` /
  `'your-client-secret'`. Verified never invoked: the scout handler returns
  hardcoded mocks inside a `setTimeout`. No response changed.
- Direct `require('./modules/entityAudit')` in the monolith — the 6 call sites
  now go through the integrations facade.

---

## Dependencies changed

**None.** No package added, removed or upgraded in Phase 1 or Phase 2.
`package-lock.json` differs only from the initial `npm install`.

Testing uses Node 22 built-ins (`node:test`, `node:assert`, global `fetch`).
`zod` was already a dependency (used by `modules/SafeStatsSchema.js`) and is now
also applied to LLM output — the audit's point that validation existed but was
not wired to the thing that needed it.

`package.json` scripts added: `dev`, `test`, `test:units`, `test:routes`,
`test:snapshot`, `test:services`, `snapshot:baseline`, `verify`.

---

## Tests added / changed

| Suite | Before Phase 2 | After |
|---|---|---|
| Total assertions | 49 | **114** |
| Suites | 10 | 26 |
| Snapshot cases | 50 (37 deterministic) | **91 (77 deterministic)** |
| Operational checks | — | **53** (`verify_phase2.js`) |

New coverage: AI prompts/parser/service/client (incl. injected transport and a
timeout test), all three repositories, cache key/TTL contracts, entity-audit
orchestration with mocked providers, regression maths, integrations facade
injection, scout filtering, rate limiter, jobs, email (incl. simulated-send),
reports export surface, route ordering and shadowing.

Tests labelled `PINS` intentionally assert current defective behavior so a
Phase 3 fix cannot land silently: CRITICAL-1, CRITICAL-2, HIGH-4, HIGH-5,
HIGH-6, NEW-1, NEW-2, missing `id` claim, split-brain A&R, in-place sort,
genius-never-refetched, orphan service registry, dead `apiCache`,
synthetic-history randomness, the two unrouted frontend endpoints.

---

## Tests executed and results

### 1. Regression suite — `npm test`
```
# tests 114   # suites 26   # pass 114   # fail 0   # skipped 0
```
All 26 suites green.

### 2. Behavioral equivalence
Probed the canonical entrypoint after every extraction step and diffed against
`phase2_baseline.json` (captured before Phase 2, itself proven equivalent to
git HEAD in Phase 1):

| Checkpoint | Deterministic drift |
|---|---|
| after config/models/stores/email/rate-limiter extraction | **0 / 77** |
| after AI + entity-audit + scout rewire | **0 / 77** |
| after reports + jobs extraction | **0 / 77** |
| after entityAudit facade rewire | **0 / 77** |
| after full controllers/routes split | **0 / 77** |

Status codes match the baseline on **all 91** cases, including the 14
nondeterministic ones.

### 3. Operational verification — `verify_phase2.js` (clean DB)
```
=== 53 passed, 0 failed ===
```
Covers health, unauthenticated 401/403/404 contracts, seeded logins, admin vs
artist authorization, DB read/write/archive/restore/404, secret-free user list,
integration status + scout + limiter + disconnect, AI keyword path and graceful
AI degradation, CSV exports, analytics reads and the sales write, and the A&R
split-brain.

### 4. Legacy scripts — offline (9)
`test_safestats.js`, `verify_dependencies.js`, `test_sync.js`,
`test_sync_draft.js`, `test_db_insert.js`, `test_wiki.js`,
`verify_entity_audit_integration.js`, `verify_label_audit.js`,
`test_discogs.js` — **all exit 0**.

### 5. Legacy scripts — against the running refactored server (6)
| Script | Exit | Note |
|---|---|---|
| `check_api_health.js` | 0 | completed |
| `verify_anr_rating.js` | 0 | completed |
| `verify_anr_hidden.js` | 0 | completed |
| `verify_fandom_api.js` | 0 | completed |
| `test-api.js` | 0 | auth rejected (placeholder `your_api_key_here`) |
| `verify_admin_permissions.js` | **1** | pre-existing NEW-1, see below |

Identical to the Phase 1 results.

### 6. Application start
`node server.js` boots, banner preserved verbatim, `/health` returns
`{"status":"operational","version":"3.0-production",...}`.

---

## Failures

### NEW-1 — admin user creation always fails (PRE-EXISTING)
`POST /v3/users` (now `src/routes/users.js`) does
`User.create({ id: \`user_${Date.now()}\`, ... })`, but `User.id` is INTEGER
autoincrement → `SQLITE_MISMATCH` → `500 {"error":"Failed to create user"}`.

Verified pre-existing: unmodified git HEAD fails identically. This is the sole
cause of `verify_admin_permissions.js` exiting 1.

Notable: the **shadowed duplicate** at the third `POST /v3/users` registration
omits `id` entirely and would have worked — the dead copy was the correct one.

### NEW-2 — PDF endpoints crash the process (PRE-EXISTING, NEW FINDING)
`src/reports/monthlyReport.js` calls
`doc.addBackground(doc.y, doc.page.width - 80, 20, {...})` with four positional
arguments, but pdfkit-table@0.1.99 declares
`addBackground({x, y, width, height}, fillColor, fillOpacity, cb)`. `x`/`y`
resolve to `undefined`, pdfkit throws `Error: unsupported number: undefined`,
and because the throw occurs inside pdfkit-table's own async `forEach` it
escapes the returned promise as an **unhandled rejection — which terminates the
Node process under Node 22**.

Impact: `GET /v3/reports/monthly/:artistId/:month` and
`GET /v3/exports?format=pdf` are a denial of service. CSV export is unaffected.

Verified pre-existing: unmodified git HEAD crashes identically at
`mau5trap-production-api.js:2212` with the same stack. **Not introduced by the
refactor.** Not fixed in Phase 2 because the fix changes PDF output (row
striping would begin rendering). Pinned statically by
`tests/regression/services.test.js` — asserted by source inspection rather than
invocation, because calling the function would kill the test runner.

### No regressions
Zero deterministic response drift at every checkpoint; status parity on all 91
cases; identical legacy-script outcomes.

---

## Unresolved issues → Phase 3 resolution

1. **NEW-2 PDF crash** — FIXED. `addBackground` rect object + footer rewrite;
   PDF endpoints verified 200 + `%PDF` end-to-end.
2. **NEW-1 user creation** — FIXED. String `id` assignment removed; create 200.
3. **CRITICAL-1 / CRITICAL-2** — FIXED. Empty body 401; no JWT fallback secret.
4. **HIGH-4** — FIXED. `artistAccess` scalar normalized (fail-closed); artists
   read their own data, still denied others'.
5. **HIGH-6** — FIXED. `autoPrintReport` uses `execFile(args[])`.
6. **Password reset is dead end-to-end** — STILL OPEN (out of Phase 3 scope).
   Token minted, no redeem route, link hardcoded to `localhost:8080`.
7. **`req.user.id` is `undefined`** — FIXED. JWT now carries `id`.
8. **PDF verification gap** — CLOSED. Both PDF endpoints verified live.
9. **Real integrations unverified** — STILL OPEN (no credentials).
10. **Postgres path unverified** — STILL OPEN (SQLite only).

Full detail in `PHASE_3_VALIDATION.md`.

### Phase 3 close-out additions (after initial validation)

- **JWT_SECRET: option (b).** `assertSecrets()` now fails fast in EVERY
  environment — no hardcoded fallback, no ephemeral dev secret. `npm start`
  requires an explicit `JWT_SECRET` (>=16 chars). Pinned by `units.test.js`.
- **Groq model.** Default changed `llama-3.1-8b-instant` ->
  `openai/gpt-oss-20b` (the old model was retired and returned 404
  `model_not_found`). `GROQ_MODEL` now overrides via env. Live
  `POST /v3/ai/query` verified 200 with a real key.

---

## Remaining technical debt

### Architectural
- **`src/routes/context.js` is a transitional seam.** Every route module
  receives the same ~25-name bundle so handler bodies could move verbatim. Each
  module should narrow to its real imports — but only after the response
  contracts are locked by tests, which they now are.
- **Three sources of truth persist** (DB, mock, process memory). The mock is
  still the primary read source for most endpoints.
- **In-place ranking sorts retained** for exact parity. The correct fix pairs
  copy-first sorting with repairing the `artists[1]` read in the `/v3/ai/analyze`
  "tour" branch.
- **`sequelize.sync({ alter: true })`** on every boot; no migrations.
- **No FK** between `Stats.artistId` and `Artist.id`.
- **Cluster-unsafe**: `instances: 'max'` against per-process state.
- **Five shadowed routes** retained.
- **No request validation layer** (`zod` is present and now used for LLM output
  only).
- **Authorization is still ~20 inline `role !== 'admin'` checks**, not a policy
  layer. `pageAccess` is persisted, returned to clients, never enforced.

### Integration
- 27 of 29 artists have no external id mapping — permanently mock.
- Silent degradation with no `source: live|mock` flag on responses.
- Rate limiters throttle nothing real.
- Registry lists 4 services with no module.
- `sync/masterLoop.js` still unregistered → `Stats` empty → projections
  synthetic.
- `integrations/index.js` calls Instagram's `getAccountData()` with no artist
  argument, so one IG account's metrics are merged into every artist.

### Operational
- `logs/` is created by the logger, but `reports/` is still created lazily.
- No CI configuration.
- `test-api.js` still probes three nonexistent endpoints with a placeholder
  token.
- Legacy files retained by instruction: `Server v5.js`, `package1.json`,
  `package-production.json`, committed PDFs/images, 18 ad-hoc scripts.

---

## Phase 3 order (COMPLETE — see PHASE_3_VALIDATION.md)

Items 1-6 below were completed in Phase 3. Items 7-11 remain for later phases.

1. ~~Fix NEW-2 (PDF crash) and NEW-1 (user creation)~~ — DONE.
2. ~~Add a global unhandled-rejection guard~~ — DONE (`server.js`).
3. ~~Security: CRITICAL-1, CRITICAL-2, HIGH-5, MEDIUM-9, then HIGH-6~~ — DONE
   (plus MEDIUM-8 and logging redaction).
4. ~~Identity: put `id` in the JWT~~ — DONE.
5. ~~Authorization: `artistAccess` normalization (fixes HIGH-4)~~ — DONE
   (scalar normalization, not a column migration).
6. ~~Validation layer on request bodies~~ — DONE (zod, 2 routes wired).
7. Datasource decision (DB-primary vs mock-primary), then `source`/`fetchedAt`
   provenance on every stat.
8. Persist the in-memory stores; reconcile the two A&R stores (product
   decision).
9. Register the sync loop; make projections real.
10. Narrow `routes/context.js`; delete the shadowed duplicates and legacy files.
11. Only then: frontend migration.
