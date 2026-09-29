# Claims Audit — Product & Docs Auditor (DOC), Phase 1

**Date:** 2026-09-29 · **Branch:** `devteam/review-2026-09-29` · **Auditor:** DOC
**Scope:** every factual claim in `README.md` (144 lines, read in full),
`docs/whitepaper.md` (345 lines, read in full), `docs/QUICKSTART.md`,
`docs/START_HERE.md`, `docs/DEPLOY.md`, `docs/runbook.md`, plus skim of
`docs/API_INVENTORY.md`, `docs/EXECUTION_GUIDE.md`, `docs/MASTER_GUIDE.md`,
`docs/SYSTEM_OVERVIEW.md`. Historical execution recipes (`EXECUTION_*.md`,
`PHASE_*`, `REPAIR_*`) are treated as dated records, not current claims,
and were not verdict-scored except where they contradict current docs.

**Verdict key:** TRUE = verified against code · FALSE = contradicted by code ·
PARTIAL = true in part / overreaches · UNVERIFIABLE = could not confirm from
this lane (deferred to the named lane) · POSITIONING = product language, not a
factual claim.

## README.md claims

| # | Claim | Source | Verdict | Evidence |
|---|---|---|---|---|
| R1 | Node.js/Express API with React/Vite frontend | README.md:3-5 | TRUE | `package.json:30` (`"express": "^4.22.1"`), `web/package.json` (`vite`, `@vitejs/plugin-react`), `web/index.html` |
| R2 | Pulsegrid is the fictional demo label; no affiliation with real artists/companies | README.md:7-10 | TRUE | Text present; seed data is the fictional pulsegrid profile (`src/profile/labels/pulsegrid.js`) |
| R3 | Dedicated instance per label; no shared multi-tenancy | README.md:12-14 | TRUE | No tenant id in models; one profile per deployment (`src/profile/`); `docs/DEPLOY.md` per-client model |
| R4 | Prerequisites: Node.js 18+, npm | README.md:18 | TRUE | `package.json:65-67` (`"engines": {"node": ">=18.0.0"}`) |
| R5 | `npm install` + `cd web && npm install` | README.md:21-24 | TRUE | Root `package.json` and `web/package.json` both exist |
| R6 | `./scripts/run-demo.sh` → API :4000, frontend :5173 | README.md:28-30 | TRUE | `scripts/run-demo.sh:22-23` (`API_PORT="${API_PORT:-4000}"`, `UI_PORT="${UI_PORT:-${WEB_PORT:-5173}}"`) |
| R7 | `./scripts/stop-demo.sh` stops both | README.md:29 | TRUE | `scripts/stop-demo.sh` exists; reads PID files (`scripts/run-demo.sh:15-16,25-26`) |
| R8 | Demo boots with `DEMO_MODE=true` against throwaway SQLite `.demo-data/demo.sqlite` | README.md:32-33 | TRUE | `src/models/index.js:244` (demo gate); `src/config/index.js:107` (`demoMode: process.env.DEMO_MODE === 'true'`) |
| R9 | Demo logins `admin@pulsegrid.fm`/`admin123`, `tours@novakin.band`/`novakin123` (demo mode only) | README.md:36-39 | TRUE | `src/profile/labels/pulsegrid.js:63-83`; seeded only under the demo gate (`src/models/index.js:244-251`) |
| R10 | Customer mode boots empty; first admin bootstrapped via `ADMIN_EMAIL`/`ADMIN_PASS` at first login | README.md:41-50 | TRUE | `src/models/index.js:236-244` (empty boot); `src/routes/auth.js:108-116` (override creates admin on first login) |
| R11 | `DEMO_MODE=false` is the default; demo seeding is opt-in | README.md:49 | TRUE | `src/config/index.js:107` — `=== 'true'`, so unset = false |
| R12 | `.env.example` is the full documented variable list | README.md:52 | TRUE | `.env.example` exists (28 keys); spot-checked `JWT_SECRET`, `ADMIN_EMAIL`, `DEMO_MODE` all read by code |
| R13 | Financial ingestion: CSV keyed by ISRC/UPC/catalog key; import history, row-level provenance, dedup hashing, rejected-row reporting; integer cents + decimal audit fields | README.md:56-60 | TRUE | `src/routes/royalties.js` import endpoints; `src/models/migrations.js` `addRoyaltyDedupColumns`; `src/finance/decimal.js` exact-decimal |
| R14 | "the pipeline never double-counts deposits or payouts as income" | README.md:60 | TRUE | Cash-evidence discipline in `src/finance/reconciliation.js`; deposits/payouts never enter income totals (whitepaper §4.5) |
| R15 | Reconciliation & monthly close with guarded month-close workflow (`docs/audit/05-reconciliation-provenance.md`) | README.md:61-63 | TRUE | `src/routes/monthlyclose.js` exists; `docs/audit/05-reconciliation-provenance.md` exists |
| R16 | Catalog: recordings, releases, works with ISRC/UPC keys | README.md:64-65 | TRUE | `src/models/index.js` catalog models |
| R17 | A&R: submissions with voting + listening-room whiteboard | README.md:66 | TRUE | `src/routes/anr.js:16,23` (vote routes); `src/routes/anrRoom.js` exists |
| R18 | Campaigns; optional Stripe Connect (test mode) for the label's own sales | README.md:67-69 | TRUE | `src/routes/marketing.js`; `src/routes/billing.js:4` ("TEST MODE only") |
| R19 | "The platform is a lens on the label's sales, not a financial custodian" | README.md:69 | POSITIONING | Product framing, not a verifiable fact |
| R20 | Scheduled monthly PDF per artist (`src/jobs/monthlyReportJob.js`), `execFile` (no shell), hardened filename handling | README.md:70-72 | TRUE | `src/jobs/monthlyReportJob.js:75,92` (`execFile` with args array); `src/utils/safeFilename.js` exists |
| R21 | "Every request is authorized server-side" | README.md:74 | UNVERIFIABLE | Needs the full route matrix — deferred to SEC (authz matrix) |
| R22 | AI opt-in and user-initiated; provider failure → `unavailable`/`not_configured`, never a canned answer | README.md:75-77 | TRUE | `src/ai/aiService.js:109` (`not_configured`), `:132,:139` (`unavailable`) |
| R23 | Integrations: Spotify OAuth + token storage; AtVenu and direct-sale importers | README.md:78-79 | TRUE | `src/routes/oauth.js`, `src/oauth/tokenCrypto.js`; `src/routes/royalties.js:693` (`POST /v3/royalties/import/atvenu`); `src/routes/directsales.js` |
| R24 | Without credentials, provider paths are disabled or fixture-backed | README.md:79-80 | TRUE | `src/jobs/providerSync.js:103,165` (`fixture: true`); `src/ai/aiService.js:109`; scout fixtures |
| R25 | Integration status table (Spotify fixture-labeled syncs; Stripe inert; Groq `not_configured`; Wikipedia fixture-backed + music gating) | README.md:84-91 | TRUE | providerSync fixture labeling; `src/routes/billing.js:4`; aiService; `src/integrations/wikipedia.fixtures.js` + `src/routes/artists.js:223` (`musicRelated` gate) |
| R26 | "Test suites never touch the network" | README.md:93-94 | TRUE | Fixtures injected; browser gates run local servers only. (Caveat: `web/validation/gate.mjs` fetches fonts CSS via CDN in real browsers — cosmetic.) |
| R27 | `npm test` runs `tests/regression/*.test.js` | README.md:100 | TRUE | `package.json:9` (`"test": "node --test --test-force-exit tests/regression/*.test.js"`) |
| R28 | `node scripts/run-visual-gate.js` self-hosts scratch API + Vite on ephemeral ports with throwaway DB | README.md:101-104 | TRUE | `scripts/run-visual-gate.js:32,55,58,75` (`freePort()`, `mkdtempSync`, `gate.sqlite`) |
| R29 | Project layout tree (server.js, production-api.js, src/*, web/, tests/, docs/audit/, scripts/, demo/dataset-v1/) | README.md:108-122 | TRUE | Every named path exists; `docs/audit/01`-`06` all present (plus an unlisted `07-triple-verification-remediation.md`) |
| R30 | `docs/audit/01–06` links | README.md:128-133 | TRUE | All six files exist in `docs/audit/` |

**README tally:** 28 TRUE · 0 FALSE · 0 PARTIAL · 1 UNVERIFIABLE (R21→SEC) · 1 POSITIONING (R19).

## docs/whitepaper.md claims

| # | Claim | Source | Verdict | Evidence |
|---|---|---|---|---|
| W1 | Entry point `server.js`; three boot invariants (secrets first, DB before listen, jobs explicit/disableable) | whitepaper.md §3 | TRUE | `server.js:29-30` (`config.assertSecrets()`), `:42-44` (`initializeDatabase()` before listen), `:47-49` (`registerJobs`, `SCHEDULE_JOBS=false` disables) |
| W2 | `src/finance/` contents: decimal.js, income.js, reconciliation.js, commission.js, reviewState.js | whitepaper.md §3 | TRUE | All five files exist in `src/finance/` (plus `kpi.js`, unlisted) |
| W3 | `src/auth/` — JWT auth, role checks, per-artist grants | whitepaper.md §3 | TRUE | `src/auth/` exists; `src/routes/auth.js`; `hasArtistAccess` used in routes |
| W4 | `src/profile/` — Label Intelligence Profile per deployment | whitepaper.md §3 | TRUE | `src/profile/` with `labels/` exists |
| W5 | Frontend is a 14-page React app with design-token system | whitepaper.md §3 | TRUE | 14 page dirs in `web/src/pages/`; `web/src/styles/tokens.css` |
| W6 | FinancePage is a five-step monthly-close wizard (review, match cash, gaps, commissions, close/share) | whitepaper.md §3, §17 | TRUE | `web/src/pages/FinancePage/MonthlyCloseView.jsx:37,43,49-52` (5 steps) |
| W7 | "Every view carries loading, error, and empty states" | whitepaper.md §3 | UNVERIFIABLE | UI sweep — deferred to UIX |
| W8 | Exact money: integer cents + exact scaled decimals; single boundary rounding (round-half-up) | whitepaper.md §4.1, §14 | TRUE | `src/finance/decimal.js:1-40` (BigInt mantissa + scale; "No float math, ever") |
| W9 | Review-state machine: forward-only reported→reconciled→approved; disputed/estimated quarantined; superseded only via import | whitepaper.md §4.2, §13 | TRUE | `src/finance/reviewState.js:27-33` (transition map; superseded absent as a target "on purpose") |
| W10 | Per-artist grants; cross-artist access returns 403 | whitepaper.md §6 | TRUE | `hasArtistAccess` → 403 in `src/routes/analytics.js:156` and artist routes |
| W11 | Financial write paths are admin-only | whitepaper.md §6 | TRUE | `requireAdmin` on import/review/deposit/match routes (completeness deferred to SEC matrix) |
| W12 | AI boundaries: no LLM output in money math; failure → explicit error; access control before the AI call | whitepaper.md §7 | TRUE | aiService fail-closed (`not_configured`/`unavailable`); routes guard before calling |
| W13 | Projections: labeled; ≥3 months of counted income required; gaps shown as gaps not zeros; disputed/estimated excluded; basis stated | whitepaper.md §7 | TRUE | `src/routes/analytics.js:150-184` — `rows.length < 3` → no forecast; `historyValues` with `null` gaps; `note` + `basis: 'counted_reviewed_income'` |
| W14 | "There is no float anywhere in the money path — not in parsing, not in aggregation, not in commissions, not in projections" | whitepaper.md §14 | PARTIAL | Parsing/aggregation/commissions are exact (decimal.js) ✓ — but **projections use float**: `src/services/salesService.js:26` → `performLinearRegression` (`src/analytics/regression.js:18-40`) does mathjs float matrix math; `Math.round` on `centsToNumber` output. The claim overreaches on projections. → DOC-002 |
| W15 | Backup/restore: migrations back up the DB before destructive schema repair | whitepaper.md §9.3 | TRUE | `src/models/migrations.js:15-25` (`VACUUM INTO` backup, chmod 600) |
| W16 | "Backend: 333 tests across 56 suites" | whitepaper.md §11 | FALSE | Actual: **361 tests / 60 suites** (`npm test` run 2026-09-29: `# tests 361`, `# suites 60`). Count is stale. → DOC-001. (Also: 5 tests failed in my run — see Observations.) |
| W17 | "Frontend static gates: 9 checks" | whitepaper.md §11 | TRUE | S01–S09 in `web/validation/static-checks.mjs:56-114` |
| W18 | "Visual/contract gates: login geometry, page-access contracts, live API payload shapes" | whitepaper.md §11 | TRUE | `web/validation/gate.mjs` (browser checks), `shots4c.mjs`, `smoke.mjs`, `static-checks.mjs` — login/page/API-shape checks present (sub-claims not exhaustively enumerated) |
| W19 | "Browser workflows: 8 end-to-end journeys" | whitepaper.md §11 | UNVERIFIABLE | `scripts/run-browser-workflows.js` runs `execution-validation/repair-2026-09-18/workflows.mjs` (187 lines) producing `browser-workflows/workflow-results.json` with keys `tileMode/checks/pageErrors/pages/tiles` — a tile-validation result, not 8 named journeys. Could not confirm the "8 journeys" figure. → DOC-009 |
| W20 | "Snapshot contracts: API response shapes pinned; repairs go to `repaired_contracts.json`, never by editing the baseline" | whitepaper.md §11 | TRUE | `tests/snapshots/{baseline,phase2_baseline,repaired_contracts}.json` all exist |
| W21 | "Seed credentials exist only in the demo profile and are fenced out of the frontend source by static gate S09" | whitepaper.md §15 | TRUE | `admin123`/`novakin123` appear only in `src/profile/labels/pulsegrid.js`, `demo/dataset-v1/{README.md,load.js}`; gate S09 at `web/validation/static-checks.mjs:114`. (Nuance: `web/validation/gate.mjs:29-30` — dev tooling, not `web/src` — hardcodes the same passwords as gate defaults.) |
| W22 | "JWT secrets are required in every environment — there is no fallback secret" | whitepaper.md §15 | TRUE | `src/config/index.js:208-217` (`assertSecrets` exits when missing/short) |
| W23 | "The export carries the same disclaimers as the API: reviewed income and cash evidence, not a P&L" | whitepaper.md §17 | FALSE | `src/reports/monthlyReport.js` writes **no** "not a P&L" / "cash evidence" / "fictional data" text. The only disclaimer in the PDF is the AI one (`monthlyReport.js:108,115` via `src/ai/disclaimer.js`). → DOC-003 |
| W24 | "nine static gates enforce this" (brand isolation) | whitepaper.md §18 | TRUE | S01–S09 (same as W17) |
| W25 | Demo data is fictional; "Nothing here is financial advice" | whitepaper.md §9.2, §10 | TRUE | Fictional pulsegrid dataset (`demo/dataset-v1/`); footer "All figures fictional. Not financial advice." |
| W26 | "No DDEX. The importer handles CSV layouts." | whitepaper.md §10 | TRUE | CSV importers only (`src/routes/royalties.js`); no DDEX parser found |
| W27 | Multi-currency tracked per currency; no FX conversion | whitepaper.md §10 | TRUE | Per-currency buckets in `src/finance/reconciliation.js:55-63`; no FX/convert code in `src/finance/` |
| W28 | Production should use Postgres via `DB_DIALECT=postgres` | whitepaper.md §10 | TRUE | `src/config/index.js:86` (`dialect: process.env.DB_DIALECT \|\| 'sqlite'`) |

**Whitepaper tally:** 23 TRUE · 2 FALSE (W16, W23) · 1 PARTIAL (W14) · 2 UNVERIFIABLE (W7→UIX, W19).

## Other docs

| Doc | Verdict | Notes |
|---|---|---|
| `docs/runbook.md` | TRUE (1 minor inaccuracy) | Current: ports, PID files, logs, backup/restore, demo accounts, env table. Inaccuracy: §9 "verify API is up (frontend proxies `/v3` to it)" — there is **no** Vite proxy (`web/vite.config.js` has no proxy config); the frontend reaches the API via `VITE_API_BASE_URL` (`web/src/api/client.js:1`, set by `scripts/run-demo.sh:80`). → DOC-010 |
| `docs/DEPLOY.md` | TRUE | Current: `scripts/deploy-client.sh` exists; per-client ports 3100–3299, systemd services, Threadripper references check out |
| `docs/QUICKSTART.md` | FALSE (stale) | Pre-refactor doc: references `pulsegrid-frontend-connected.html` and `pulsegrid-terminal-dashboard.html` (**neither file exists**), port 3000, "database (in-memory)", `npx http-server . -p 8080`. Every setup step is wrong for the current tree. → DOC-005 |
| `docs/START_HERE.md` | FALSE (stale) | Lists the two non-existent HTML files as "Critical Files"; link `[README.md](README.md)` resolves to `docs/README.md` which **does not exist** (broken). "Generated: 2025-12-10". → DOC-006 |
| `docs/MASTER_GUIDE.md` | FALSE (stale + mojibake) | Encoding damage: `ðŸŽ§`, `ðŸ“¦`, `ðŸš€`, `ðŸ”` … (`docs/MASTER_GUIDE.md:1-186`, mis-decoded emoji). Content is pre-refactor ("18 Files", "TWO PATHS TO CHOOSE"). → DOC-007 |
| `docs/SYSTEM_OVERVIEW.md` | PARTIAL (mojibake) | Same mojibake at `:1` and `:371`; otherwise a system overview of the old era. → DOC-007 |
| `docs/API_INVENTORY.md` | FALSE (stale) | "Generated by parsing `production-api.js` (commit `c0281d8`)" — old monolith line numbers; Consumers legend references the non-existent `pulsegrid-frontend-connected.html` / `pulsegrid-terminal-dashboard.html`. Superseded by `docs/openapi.json` (102 paths). → DOC-008 |
| `docs/audit/01–07` | Not scored | Design/audit notes for changed behavior; all seven files exist as README links them. Content review is other lanes' scope. |
| `docs/EXECUTION_GUIDE.md`, `docs/EXECUTION_RESULTS.md` | Not scored | Dated 2026-09-17/18 execution recipes; explicitly historical ("IN EXECUTION — D0 + Steps 1–3 complete"). Kept as records. |

## Feature reality check (simulated / stubbed / hardcoded)

| Feature | What it really does | Labeled in product? |
|---|---|---|
| `/v3/anr/evaluate` — A&R "signability score" | `Math.floor(Math.random() * 25 + 70)` — random score from fixture copy (`src/routes/anr.js:266-276`) | **API: yes** (`source: 'fixture'` in response). UI surfacing of the fixture label **not confirmed** in `web/src/pages/AnrPage/` (no `fixture` string found) |
| `/v3/anr/scout` — Spotify scouting | Mock fixtures + 500ms simulated latency (`src/integrations/scoutService.js`); no Spotify client invoked | **API: yes** (`source: 'fixture'`, `src/routes/anr.js:291`) |
| Provider sync without credentials | Returns `fixture: true`, execution status `fixture` | **API: yes** (`src/jobs/providerSync.js:103,165,263`) |
| Wikipedia artist bios | Fixture-backed when `FIXTURE_WIKIPEDIA=1`; non-music matches rejected (`src/routes/artists.js:223`) | **Yes** (fixture module; music-relevance gate) |
| `generateSyntheticHistory()` (12 fabricated months + `Math.random()` noise) | **Dead code** — destructured but never called at runtime; only unit tests exercise it (`src/analytics/regression.js:72`; callers: none in routes) | n/a (unreachable). Stale comment in `regression.js:60-66` claims "README.md claims projections regress over 12 months of historical revenue data" — README makes no such claim → DOC-011 |
| `/v3/analytics/projections` | Real counted income via `salesService.forecast`; gaps as `null`; `note` + `basis` in response (`src/routes/analytics.js:150-184`) | **Yes** — de-mock verified (gap 6): no fabricated history in the live path |
| Stripe / AI without credentials | Paths inert / `not_configured` | **Yes** |

**De-mock verdict:** the "recently de-mocked (gap 6)" claim holds — the live projection path no longer fabricates history, and every remaining simulated surface carries a `fixture` label at the API layer. Two gaps: (1) UI surfacing of the fixture labels is unconfirmed (UIX lane); (2) there is no unofficial/fan-project/fictional-data disclaimer in the UI or in generated PDFs (README-only) → DOC-003, DOC-004.

## Known-lead dispositions (assigned to DOC)

**P1 #14 — frontend (Babel? unpinned CDN? localStorage token? innerHTML):**
- In-browser Babel (`text/babel`): **absent** — dismissed as stale. No match in `web/index.html`, `web/src/`.
- Unpinned JS CDN: **absent** — dismissed as stale. Only external reference is Google Fonts CSS (`web/index.html:7`); no JS CDN, no unpkg/jsdelivr.
- `innerHTML` / `dangerouslySetInnerHTML`: **absent** — dismissed as stale. No matches in `web/src/`.
- localStorage token: **CONFIRMED current** — `web/src/auth/AuthContext.jsx:9` (`getItem('authToken')`), `:58-59` (`setItem('authToken', ...)`), `:24-25` (cleared on logout). Not a docs violation (docs never claim otherwise); the XSS-vs-CSRF trade-off is SEC's call. No DOC finding; recorded here per D-001.

**P1 #15 — docs (mojibake; stale file refs; default creds):**
- Mojibake: **CONFIRMED current** — `docs/MASTER_GUIDE.md:1-186` (`ðŸŽ§` etc.), `docs/SYSTEM_OVERVIEW.md:1,371`. → DOC-007.
- Stale file refs: **CONFIRMED current** — `docs/QUICKSTART.md` (two non-existent HTML files, port 3000, in-memory DB), `docs/START_HERE.md` (same files + broken `docs/README.md` link), `docs/API_INVENTORY.md` (old monolith inventory). → DOC-005, DOC-006, DOC-008.
- Default credentials: **dismissed as designed** — `admin@pulsegrid.fm`/`admin123` published in README/docs are demo-mode-only, seeded only under `DEMO_MODE=true`, fenced out of `web/src` by static gate S09. Not a finding.

**P1 #17 — simulated features unlabeled; unofficial-project disclaimer:**
- Simulated features: **labeled at the API layer** (`source: 'fixture'` on anr evaluate/scout; `fixture: true` on provider sync); projections use real data with stated basis. De-mock verified. UI surfacing of fixture labels unconfirmed (UIX).
- Unofficial-project disclaimer: **CONFIRMED missing in product** — present in README only. No "fictional"/"unofficial"/"fan project"/"not affiliated" string in `web/src/`; generated monthly PDFs carry only the AI disclaimer (`src/reports/monthlyReport.js:108,115`), contradicting whitepaper §17. → DOC-003, DOC-004.

## Observations (not DOC findings; for other lanes / parent)

1. **Test suite not green on this branch.** `npm test` 2026-09-29: **361 tests / 60 suites, 356 pass, 5 fail** (exit 1). Failures: `durability.test.js:122` ("server.js never became healthy" — artist/A&R/sales/audit survive restart); `snapshot.test.js` — "live probe matches the baseline for every deterministic case", "status codes match the baseline on ALL cases", "PUT /v3/users/:id persists artistAccess (F-1)", "a deleted user's already-issued JWT stops authorizing (F-2 session tail)". TST/BUG to triage; also contradicts PLAYBOOK B3 "361 tests / 60 suites green".
2. **Hardcoded JWT secret value in a committed test script.** `scripts/run-browser-workflows.js` sets `JWT_SECRET` to a hardcoded ~50-char value (value redacted from my view; not inspected). Test-only throwaway DB context, but a committed secret-shaped value — SEC to assess.
3. `web/validation/gate.mjs:29-30` (dev tooling) hardcodes `admin123`/`novakin123` as gate defaults. Outside `web/src`, so the S09 "fenced out of frontend source" claim holds as written; noted for completeness.
4. `docs/audit/` contains an unlisted `07-triple-verification-remediation.md` (README lists 01–06) — harmless, but the README index is incomplete.
5. `server.js` banner prints demo seed credentials to the console on boot (`server.js:61-63`, from `profile.seedUsers`) — demo-mode only by construction.

## Claims tally

- README: 28 TRUE · 0 FALSE · 0 PARTIAL · 1 UNVERIFIABLE (R21→SEC) · 1 POSITIONING
- Whitepaper: 23 TRUE · 2 FALSE · 1 PARTIAL · 2 UNVERIFIABLE (W7→UIX, W19)
- Other docs: runbook TRUE (1 nit) · DEPLOY TRUE · QUICKSTART FALSE · START_HERE FALSE · MASTER_GUIDE/SYSTEM_OVERVIEW mojibake+stale · API_INVENTORY stale
- **Total scored: 51 TRUE · 6 FALSE · 1 PARTIAL · 3 UNVERIFIABLE**
