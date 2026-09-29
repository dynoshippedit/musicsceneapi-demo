# Findings — Architect (ARC)
Owner: ARC · Lane: architecture/structure · Phase 2
ID range: ARC-001… · Status values per B7 (NEW → CONFIRMED → …)
Ledger entry fields per B8: ID · title · severity · confidence · location · evidence · what's wrong · impact.
Severity scale: S0 critical · S1 high · S2 medium · S3 low · S4 info. S4 never auto-fixed.

## Index
| ID | Severity | Confidence | Title | Status |
|---|---|---|---|---|
| ARC-001 | S3 | Confirmed | God files and god functions: royalties.js (1076), entityAudit.js (939), models/index.js (761), directsales.js (712), monthlyclose.js (564); ~380-line import handler | NEW |
| ARC-002 | S2 | Confirmed | Money domains have no service layer — business logic and data access live in route handlers | NEW |
| ARC-003 | S3 | Confirmed | ctx god-bundle fans ~60 names (incl. raw JWT secret, fs, path, bcrypt) into all 22 route domains | NEW |
| ARC-004 | S2 | Confirmed | In-memory state assumes a single instance: labelData mutated in place; inMemoryStores lost on restart, forked on scale-out | NEW |
| ARC-005 | S3 | Confirmed | Two live integration trees: legacy integrations/ behind the src/integrations/ facade (elevates MAP-003) | NEW |
| ARC-006 | S3 | Confirmed | Split schema authority: sequelize.sync() creates, hand-written migrations.js alters — upgrade drift risk | NEW |
| ARC-007 | S3 | Confirmed | Demo-vs-real separation is by convention (demoMemoryAllowed at every read site), not by construction | NEW |
| ARC-008 | S4 | Confirmed | API consistency gaps: sparse zod adoption (2/22 domains), ad-hoc pagination, varying success envelopes | NEW |
| ARC-009 | S4 | Confirmed | Boundary fragility: royalties.js requires ./catalog for shared regexes; anrRoom asymmetric registration (extends MAP-004) | NEW |
| ARC-010 | S3 | Suspected | CPU-heavy cron work (PDF + chart rendering) runs in the request-serving process | NEW |

---

### ARC-001 · God files and god functions
- **Severity:** S3 (structural — slows change, raises review/merge risk; no live bug)
- **Confidence:** Confirmed
- **Location:** `src/routes/royalties.js` (1076 lines), `modules/entityAudit.js` (939),
  `src/models/index.js` (761), `src/routes/directsales.js` (712), `src/routes/monthlyclose.js` (564)
- **Evidence:** `wc -l` on the listed files; the `POST /v3/royalties/import` handler spans
  L307–692 (~380 lines: multer → CSV parse → ISRC/UPC resolution → decimal math → dedup →
  statement identity → DB writes in one async closure); `POST /v3/direct-sales/sync`
  spans L242–360; the comment at `src/routes/index.js` itself notes registration order is
  load-bearing partly because of shadowed duplicates.
- **What's wrong:** five files exceed the B9.3 god-file threshold (500–800 lines); handlers
  exceed the god-function threshold (60–80 lines) by 4–5×. The 2026-09-28 refactor moved
  handler bodies verbatim, so the monolith's density survives in the new files.
- **Impact:** change blast radius (a royalty-rule edit touches the same file as CSV upload
  plumbing), review fatigue, merge-conflict surface. Migration: ARCHITECTURE.md §4 steps
  5–7 (service extraction, then file splits).
- **Related:** MAP-001 (dead duplicate in users.js — same root cause: oversized route files).

### ARC-002 · Money domains have no service layer
- **Severity:** S2 (correctness-adjacent: money rules are untestable without HTTP)
- **Confidence:** Confirmed
- **Location:** `src/routes/royalties.js`, `src/routes/directsales.js`, `src/routes/monthlyclose.js`
- **Evidence:** handlers call Sequelize models directly (`RoyaltyLine`, `Payout`, `BankDeposit`…),
  run CSV parsing, exact-decimal computation, review-state transitions and monthly-close
  aggregation inline. The only repository is `artistRepository` (artists); the only clean
  domain-logic island is `src/finance/` (pure math, used by 5 route domains but owned by none).
  118 route registrations, zero `*Service` classes for the three money domains.
- **What's wrong:** routing, business logic and data access are mixed in one place (B9.3
  checklist fail). Money math can only be exercised through supertest; pure-logic unit tests
  are impossible for the import/dedup/supersede pipeline.
- **Impact:** the riskiest part of the codebase to change is also the least testable.
  Migration: ARCHITECTURE.md §4 steps 1 (characterization tests), 5, 6.

### ARC-003 · ctx god-bundle fans secrets and infra into every route domain
- **Severity:** S3 (coupling + hygiene; server-side only, not a leak)
- **Confidence:** Confirmed
- **Location:** `src/routes/context.js` (204 lines; `buildContext()` returns ~60 names)
- **Evidence:** the bundle includes the raw JWT secret (`JWT_SECRET: config.jwtSecret`),
  `bcrypt`, `jsonwebtoken`, `fs`, `path`, all 31 models, every service/repo, chart helpers and
  `validateBody`. It is injected into all 22 route domains. The file header calls it a
  "deliberately transitional seam" — the transition never happened.
- **What's wrong:** every module nominally depends on everything (real dependencies are
  hidden, not greppable); secret material is fanned out to 22 domains when only
  `src/auth` token issuance needs it; `fs`/`path` in route handlers invites ad-hoc file
  I/O outside the reviewed sinks.
- **Impact:** coupling drag; a compromised/leaky handler has broader reach than it needs.
  Migration: ARCHITECTURE.md §4 step 4 (per-domain narrowing, JWT secret stays in auth).

### ARC-004 · In-memory state assumes a single instance; shared labelData mutated in place
- **Severity:** S2 (silent corruption on scale-out; split-brain documented but unresolved)
- **Confidence:** Confirmed
- **Location:** `src/repositories/artistRepository.js` (labelData), `src/repositories/inMemoryStores.js`,
  `ecosystem.config.js`
- **Evidence:** `artistRepository.js` header lists PRESERVED DEFECTS: (2) `labelData` is the
  same object graph the whole process shares, mutated in place by archive/restore/image and
  `POST /v3/artists`; (3) ranking helpers sort the SHARED array in place (pinned by tests).
  `inMemoryStores.js` header: "Everything here is lost on restart and is NOT shared between
  PM2 cluster workers"; holds `userIntegrations` (per-user OAuth state), `anrState` (votes),
  `salesData`, dead `apiCache`. `ecosystem.config.js` runs fork/1-instance — the only thing
  making this correct, and its currency is unverified (BLD lane).
- **What's wrong:** correctness holds only as a single instance; nothing in code enforces it.
  The split-brain A&R (two vote models, never reconciled) is documented and preserved — a
  product decision, but an architectural one to record.
- **Impact:** any second instance (PM2 `instances: max`, a second container, a restart)
  forks or wipes votes, integration state, and sales entries with no error.
  Migration: ARCHITECTURE.md §4 steps 10, 12; open questions Q-ARC-3, Q-ARC-4.

### ARC-005 · Two live integration trees
- **Severity:** S3 (ownership ambiguity; the legacy tree is live, not dead)
- **Confidence:** Confirmed
- **Location:** `integrations/` (7 files) vs `src/integrations/` (facade, rateLimiter, scoutService, wikipedia.fixtures)
- **Evidence:** `src/integrations/index.js:19` requires `../../integrations`; also required
  directly by `src/repositories/artistRepository.js`, `src/services/catalogIntegrityService.js`,
  `src/integrations/scoutService.js`, `src/jobs/providerSync.js`, `sync/masterLoop.js`.
  Elevates MAP-003 (logged S4 as a map oddity) to an architectural finding.
- **What's wrong:** two homes for provider code; the facade is bypassed by `artistRepository`,
  so "the facade owns providers" is not true.
- **Impact:** a provider change may land in the wrong tree; reviewers must check both.
  Migration: ARCHITECTURE.md §4 step 8 (merge under `src/integrations/providers/`, facade
  surface unchanged). NEEDS-OWNER (file moves) — Q-ARC-1.

### ARC-006 · Split schema authority: sync() creates, migrations.js alters
- **Severity:** S3 (future upgrade-drift risk; no current breakage)
- **Confidence:** Confirmed
- **Location:** `src/models/index.js:233` (`await sequelize.sync()`), `src/models/migrations.js`
- **Evidence:** `initDB` runs explicit idempotent repair migrations (`repairSalesSchema`,
  `addUserSecurityColumns`, `addRoyaltyDedupColumns`, `addMonthlyCloseColumns`) then
  `sequelize.sync()` for absent tables. Model headers repeat "sync() creates absent tables;
  existing schema changes use explicit migrations" — a two-authority contract enforced only
  by comments. No test asserts that every model field has a migration path for existing DBs.
- **What's wrong:** a future field added to a model with no matching migration entry gives
  new customers the field (sync) and existing customers silent drift. `sync()` has no
  downgrade story.
- **Impact:** customer upgrades (sqlite file on disk) can diverge from the model definitions
  with no error at boot.
  Migration: ARCHITECTURE.md §4 step 9; open question Q-ARC-2.

### ARC-007 · Demo-vs-real separation is by convention, not construction
- **Severity:** S3 (data-integrity risk on customer boots)
- **Confidence:** Confirmed
- **Location:** `src/repositories/artistRepository.js` (`demoMemoryAllowed()`), `src/profile/labels/pulsegrid.js`, `server.js`/`production-api.js` (`initDB({demoMode})`)
- **Evidence:** DEMO_MODE gates seeding; `demoMemoryAllowed()` gates each read site. But the
  fictional Pulsegrid roster and the customer in-process mirror share one mutable `labelData`
  object graph (`profile.datasets.roster`), and a customer boot relies on every read site
  honoring the gate. The hybrid `findAllHybrid()` union logic exists precisely because the
  boundary is porous.
- **What's wrong:** a single read site that forgets the gate leaks fictional artists into a
  customer deployment's list/detail views. The invariant "customer boot serves zero fictional
  rows" is not asserted by any test.
- **Impact:** brand-data contamination in a white-label customer instance.
  Migration: ARCHITECTURE.md §4 step 13 (single chokepoint + boot-time test).

### ARC-008 · API consistency gaps: validation adoption, pagination, envelopes
- **Severity:** S4 (consistency/polish; failure shape and versioning are already uniform)
- **Confidence:** Confirmed
- **Location:** `src/validation/index.js`, `src/routes/artists.js:55-77`, `src/routes/directsales.js:434`,
  `src/routes/monthlyclose.js:95,159`, `src/routes/catalog.js:39-56`
- **Evidence:** zod `validateBody` is used in 2 of 22 route domains (ai.js ×3, users.js ×2);
  `catalog.js` uses hand-rolled string-returning validators (`validateRecording` etc.);
  most domains have none. Pagination: three ad-hoc patterns (in-memory slice default
  limit 50 in artists.js; per-route clamp max 500/default 100 in directsales.js;
  hardcoded `findAll({limit: 200})` in monthlyclose.js). Success envelopes vary
  (`{success}`, `{id}`, `{url}`, raw objects). Failure shape is consistent (`{error}` on
  4xx/5xx) and `/v3/` versioning is uniform — those hold.
- **What's wrong:** no single validation layer, no shared pagination helper, no envelope
  convention — each new endpoint re-invents them.
- **Impact:** frontend must handle per-endpoint shapes; validation gaps are SEC/BUG surface.
  Migration: ARCHITECTURE.md §4 steps 2, 11 (step 11 NEEDS-OWNER — response-shape change).

### ARC-009 · Boundary fragility: cross-domain route import + asymmetric registration
- **Severity:** S4 (fragile but verified single-binding today)
- **Confidence:** Confirmed
- **Location:** `src/routes/royalties.js:82` (`require('./catalog')` for ISRC_RE/UPC_RE);
  `src/routes/anr.js:252` (`require('./anrRoom').register(app, ctx)`); `src/routes/index.js` DOMAIN_ORDER
- **Evidence:** shared domain constants (ISRC/UPC regexes) are owned by a route module and
  imported by another route module — the constants have no neutral home. `anrRoom.js` is
  the only one of 23 route files not registered via DOMAIN_ORDER (extends MAP-004); the
  "registration order is part of the contract" invariant is documented but relies on every
  future editor reading the comment.
- **What's wrong:** leaky module boundaries; route-order tooling that enumerates
  DOMAIN_ORDER misses anrRoom's routes.
- **Impact:** maintainer trap; a future reorder or a second `require('./catalog')` consumer
  inherits coupling accidentally.
  Migration: ARCHITECTURE.md §4 step 3 (constants home), step 7 (registration normalization).

### ARC-010 · CPU-heavy cron work runs in the request-serving process
- **Severity:** S3 (reliability; suspected — not load-tested)
- **Confidence:** Suspected
- **Location:** `src/jobs/monthlyReportJob.js` (schedule `0 3 1 * *`), `src/reports/monthlyReport.js`
- **Evidence:** the monthly report job renders PDFs via pdfkit + chartjs-node-canvas
  (CPU-bound chart rasterization) inside the same Node process that serves requests; a long
  run blocks the event loop. Job registration is explicit and clean (`registerJobs`), but
  the work itself shares the process. `AUTO_PRINT` additionally shells to `lp`/`lpr`.
- **What's wrong:** no isolation between scheduled batch work and request latency; no
  health signal for job runs.
- **Impact:** on the 1st of the month at 03:00, request latency can degrade or the loop can
  stall; a failed report run is only visible in logs.
  Migration: ARCHITECTURE.md §4 step 12; open question Q-ARC-3. PRF may raise the severity.
