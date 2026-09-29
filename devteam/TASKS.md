# TASKS — authoritative fix queue (Engineering Kit v3.0)

Triage: 2026-09-29 (ms-cycle-01). Sources: `devteam/findings/{map,tst,doc,bld,aix,arc,mus,dat,sec,bug}.md`
(Phase 1/2 lanes, all CONFIRMED unless noted) + ms-cycle-01 pattern sweeps
(SWA/SWI/SWM/SWF/SWJ). Deduplicated by root cause — merged IDs are noted inline.
The 17 P1 pre-scan leads are dispositioned separately in
`devteam/notes/known-leads-verification.md` and are NOT re-entered here.

Status vocabulary: NEW · IN PROGRESS · IMPLEMENTED · VERIFIED · BLOCKED · DEFERRED · REJECTED.
Only the controller advances a task to VERIFIED after independent acceptance checks.

## S1 — fix first (confirmed)

| ID | Title | Location | Status |
|----|-------|----------|--------|
| BUG-001 | Payout/deposit match & unmatch are two separate writes with no transaction; a half-written match is API-unrepairable (409 guard blocks its own repair). Absorbs DAT-003 (same root cause). | `src/routes/monthlyclose.js:177-258` | IMPLEMENTED (ms-cycle-01) — match/unmatch wrapped in sequelize transactions with row locks; expected 404/409 rejections thrown inside the tx and translated after; audit fires after commit; response shapes unchanged. 3 new regression tests (fault-injection rollback, double-match integrity, currency-reject writes nothing). Full suite 364/364 green 2026-09-29. Awaits controller acceptance for VERIFIED. |
| MUS-001 | `POST /v3/royalties/calculate` computes "payout" on floats: unrounded fractional cents + epsilon sum tolerance. What-if calculator, not settlement — but user-facing money. | `src/routes/finance.js:55-82` | NEW — response-shape change needs owner sign-off (QUESTIONS.md, B1) |

## S2 — medium (confirmed unless noted)

| ID | Title | Location |
|----|-------|----------|
| SEC-001 | CSV formula injection in financial export (`csvCell` doesn't neutralize `= + - @` prefixes); attacker-influenced Stripe descriptions / atVenu venue names flow into exports | `src/routes/directsales.js:113-117` |
| SEC-002 | `GET /v3/direct-sales/mappings` exposes all payment-matching rules to any authenticated user (no artist scoping) | `src/routes/directsales.js` |
| BUG-002+MUS-005 | Commission worksheet silently picks the newest-effective contract even when it doesn't cover the requested period; overlapping contracts not validated on create | `src/routes/monthlyclose.js:425-434`; `src/finance/commission.js:139,251-253` |
| BUG-003 | `generateMonthlyReport` uses `new Promise(async …)` — a throw becomes an unhandled rejection (server shutdown per `server.js:104-107`) plus a hung request | `src/reports/monthlyReport.js:47` |
| DAT-002 | Migrations are ad-hoc SQLite-only repairs; Postgres upgrades silently skip schema evolution | `src/models/migrations.js` |
| DAT-004 | Direct-sales sync is non-atomic and leaves stale payout rows on rerun | provider sync |
| DAT-005 | Stripe provider lists stop at the first 100 records (no pagination) | stripe adapter |
| DAT-006 | OAuth refresh tokens stored but never used; sync fails after access-token expiry | oauth flow |
| MUS-002 | Royalty CSV import accepts any non-empty `period` string — no YYYY-MM validation; lines vanish from the close | royalty import |
| MUS-003 | Three different month-assignment conventions (direct-sales + deposits use UTC, merch uses entered date) | close pipeline |
| MUS-004 | Mock-data float "Total Revenue" / "projectedAnnual" presented as real money in API + scheduled PDFs, no provenance label | API + PDFs |
| MUS-007+DAT-011 | No GDPR-style data export; user delete is DB-row only — PII persists in audit trail, logs, `reports/`, provenance fields | user delete |
| ARC-002 | Money domains have no service layer — business logic + data access inline in route handlers | `src/routes/*.js` |
| ARC-004 | In-memory state assumes a single instance (`labelData` mutated in place; `inMemoryStores` lost on restart) | server state |
| TST-001+BLD-003 | `npm test` is load-flaky in parallel mode (37 fail + 25 cancelled in one clean run) | `tests/regression/*` harness |
| TST-003 | GDPR delete endpoint has zero tests; no GDPR export endpoint exists | tests |
| TST-004 | A&R voting integrity thinly tested (crown jewel) | tests |
| TST-010 | React frontend has zero unit tests; browser gates not in `npm test` | `web/` |
| BLD-001 | `npm run verify:hermetic` fails out of the box — child env omits DEMO_MODE | `scripts/run-verify-hermetic.js:60-82` |
| BLD-002 | Duplicate fixed test port 32193 in directsales + financials suites — cross-file server squatting | `tests/regression/directsales.test.js`, `financials.test.js` |
| BLD-012 | Known moderate vulns: `uuid` via sequelize (GHSA-w5hq-g745-h8pq); `react-router` via react-router-dom (CVE-2025-68470 bypass) | deps |
| AIX-002 | No per-user quota or AI-specific rate limit — `?refresh=true` spends provider/Groq calls under only the global 1000/hr/IP | AI routes |
| DOC-001 | Whitepaper §11 test counts stale (333/56 vs actual 361/60) | whitepaper |
| DOC-002 | Whitepaper §14 "no float anywhere in the money path" overreaches — projections use float | whitepaper |
| DOC-003 | Whitepaper §17 claims PDF export carries "not a P&L" disclaimers — only the AI disclaimer is present | whitepaper/PDF |
| DOC-004 | No unofficial/fan-project/fictional-data disclaimer in UI or generated PDFs (README-only) | UI + PDFs |
| DOC-005 | `docs/QUICKSTART.md` entirely stale (pre-refactor; references nonexistent files) | docs |

## S3 — low (confirmed unless noted)

- BUG-004: `POST /v3/reports/generate-all` writes to `src/routes/reports/<month>`; scheduled job uses repo-root `reports/<month>` (`src/routes/reports.js:119`; `src/jobs/monthlyReportJob.js:42,118`)
- BUG-006: CSV export temp file in `src/routes/` with `Date.now()`-ms name — concurrent exports can collide (`src/routes/reports.js:221,233-243`)
- BUG-007: startup banner prints `profile.seedUsers` credentials even on customer boots where zero users are seeded (`server.js:59-62`)
- BUG-008: deposit creation passes `depositAt` through `new Date()` unchecked — invalid values become 500 instead of 400 (`src/routes/monthlyclose.js:129`)
- SEC-003: `err.message` returned to client on `GET /v3/financials/reconciliation` (500) and `GET /v3/catalog/integrity`
- SEC-004: `requireAdminOrArtist` checks identity, not role — misnomer on OAuth authorize/status/disconnect
- SEC-007: `RESET_LINK_BASE` defaults to `http://localhost:5173/reset-password` — broken reset links in prod if unset
- DAT-001: float types remain in financial/projection paths (schema residue of narrowed P1 #11)
- DAT-007: provider failures silently merge over a mock base with no fixture labeling
- DAT-008: atVenu import validates format but not money consistency (net ≠ gross−fees−taxes unchecked)
- DAT-009: Stripe billing webhook has no event-id idempotency
- DAT-010: legacy NULL `amountDecimal` crashes reconciliation — escalates to S1 if any deployed DB has NULLs (owner Q)
- DAT-013: provider-sync stale-run takeover is read-then-update with no lock
- DAT-014: SQLite concurrency — no WAL, no busy_timeout, concurrent writers exist
- TST-002: `durability.test.js` uses a fixed, shared DB path
- TST-005: real-provider paths (Stripe, provider sync, OAuth) tested only via stubs/fixtures
- TST-007: scheduled jobs (monthly report, provider sync) never executed end-to-end in tests
- TST-008: fixed sleeps in tests instead of synchronization
- DOC-006: `docs/START_HERE.md` stale + broken link
- DOC-007: `docs/MASTER_GUIDE.md` + `docs/SYSTEM_OVERVIEW.md` mojibake + stale pre-refactor content
- DOC-008: `docs/API_INVENTORY.md` is a stale pre-refactor inventory
- DOC-009: (Likely) whitepaper §11 "8 end-to-end browser journeys" is unverifiable
- DOC-010: `docs/runbook.md` "(frontend proxies /v3 to it)" is inaccurate
- BLD-004: `googleapis` declared but never imported (heavy unused dep) (`package.json:23`)
- BLD-005: `pdfkit` and root `chart.js` declared but never directly required (`package.json:24,26`)
- BLD-006: stale "Preserved" audit comments claim fixed CORS/`err.message` issues are still present (`src/middleware`)
- BLD-007: `RESET_LINK_BASE` read but missing from `.env.example` (`src/config/index.js:139`)
- BLD-008: `.env.prod.template` stale (documents never-read vars; omits DEMO_MODE/ALLOWED_ORIGINS/Stripe vars)
- AIX-001: model-output `status` key overrides server-set `status:'ok'` — breaks the paid-call usage gate (`src/ai/aiService.js:128`)
- AIX-003: disclaimer attached to API response but never rendered on the interactive AI surface (CommandConsole/Intelligence page)
- ARC-001: god files/functions (`royalties.js` 1076 lines, `entityAudit.js` 939, `models/index.js` 761, `directsales.js` 712, `monthlyclose.js` 564)
- ARC-003: ctx god-bundle fans ~60 names (incl. raw JWT secret, fs, path, bcrypt) into all 22 route domains
- ARC-005+MAP-003: two live integration trees — legacy `integrations/` behind the `src/integrations/` facade
- ARC-006: split schema authority — `sequelize.sync()` creates, hand-written `migrations.js` alters (upgrade drift risk)
- ARC-007: demo-vs-real separation is by convention (`demoMemoryAllowed` at every read site), not by construction
- ARC-010: (Suspected) CPU-heavy cron work (PDF + chart rendering) runs in the request-serving process
- MUS-006: A&R voting never locked by submission/demo status; tally denominator counts ineligible users
- MUS-008: identifier validation gaps — UPC without GTIN-12 check digit, any 3-letter "currency", no ISWC
- MUS-009: `fetchIncomeData` hardcodes `provider: 'stripe'` — non-stripe DirectSale rows silently excluded from income/commission/KPI
- SWEEP-001 (ms-cycle-01): neither cron schedule handler (`monthlyReportJob.register`, `providerSync.register`) has an overlap guard — a long run overlapping the next tick would double-execute; related to DAT-013

## S4 — polish (confirmed unless noted)

- MAP-001: duplicate `DELETE /v3/users/:id` registration — second handler is dead code
- MAP-002: `sync/masterLoop.js` is an orphan — the intended live-data sync path is unwired
- MAP-004+ARC-009: `src/routes/anrRoom.js` registers only via require inside `anr.js`, not `DOMAIN_ORDER` — asymmetric, fragile
- MAP-005: unreferenced tooling — `scripts/generate_roster.js`, `scripts/run-visual-gate.js` have no callers
- MAP-006: (Suspected) unclear which `tests/snapshots/*.json` baseline generation is authoritative
- MAP-007: committed binary/evidence artifacts — `execution-validation/` (67 files) + `web/validation/*.png`
- SEC-005: JWT verification does not pin `algorithms`; secret fanned out to every route module via shared ctx
- SEC-006: web SPA stores JWT in `localStorage` (accepted trade-off; mitigations documented)
- SEC-008: Stripe sync failures (`e.message`/`lastSyncError`) exposed to any authenticated user on connect/status
- SEC-009: `role` is a free-form string on user create — typo silently creates a permission-less role
- SEC-010+BUG-005: `Content-Disposition` interpolates unsanitized `artistId` (`/v3/exports`, PDF export) — HIGH-6 sanitization not applied
- DAT-012: `Stats` table has no writers and no readers — dead schema
- DAT-015: `resetTokenExpiry` type mismatch (STRING epoch millis)
- DAT-016: outbound-call resilience gaps — no timeout/retry on key paths; rate limiters diagnostic-only
- TST-006: manual scripts live beside tests with no manifest distinguishing them
- TST-009: (positive) no test hits live external hosts; Wikipedia fixture-only
- DOC-011: stale comment in `src/analytics/regression.js` about a README projection claim
- BLD-009+AIX-007: ~25 legacy provider env vars (+ `GROQ_MODEL`) documented in `.env.example` but never read
- BLD-010: no CI configuration (no `.github/workflows`)
- BLD-011: `web/.env.production` ships empty `VITE_API_BASE_URL` → prod build makes same-origin API calls
- AIX-004: no retry with backoff in `groqClient` — single attempt, 20s timeout
- AIX-005: `maxTokens` hardcoded per call site (300/400/100), not env-configurable; no spend-cap config
- AIX-006: `DEV_FALLBACK_ANSWER` exported but consumed nowhere
- AIX-008: (Probable) stored/in-band prompt injection — DB artist names interpolated raw into prompts
- ARC-008: API consistency gaps — sparse zod adoption (2/22 domains), ad-hoc pagination, varying success envelopes
- MUS-010: not modeled / retired — advances & recoupment; dead float paths (`salesService.history`, `generateSyntheticHistory`)
- MUS-011: outbound rate limiters exist but are unwired (preserved defect)

## Blocked / deferred (owner input needed)

- MUS-001 response shape (integer cents + `estimate:true` label) → `devteam/QUESTIONS.md` (B1 commercial-rule-adjacent)
- DAT-010 escalation: confirm no deployed DB carries NULL `amountDecimal` → `devteam/QUESTIONS.md`
- BUG-001 hardening follow-up: partial unique indexes on `matchedDepositId`/`matchedPayoutId` (unique where not null) so the DB — not request interleaving — enforces one-deposit-per-payout; needs a migration path for existing DBs (DAT-002 context). NEW task for a later cycle.

## Cycle log

- ms-cycle-01 (2026-09-29): reconciled Phase 1–3 records; completed coverage via 5 focused pattern sweeps (no new S1/S2; +SWEEP-001 S3); verified/dismissed all 17 P1 leads; triaged this queue; implementing BUG-001.
