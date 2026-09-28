# PHASE_4CF_COMMERCIAL_FOUNDATION.md

**Phase:** 4CF — Commercial Foundation / CRUD Truth · **Date:** 2026-09-17
**Repo:** `/home/dino/pulsegrid-repo` (HEAD `7efb44b` + inherited uncommitted Phase 4C tree + this phase's changes)
**Scope:** the seven bounded objectives from the commercial audits (CRUD truth, user lifecycle/session safety, artist canonical source of truth, persist-or-demo contract, minimal ownership seam, minimal audit + usage seams, backend Label Intelligence Profile). Nothing committed; Phase 4D NOT started.

---

## 1. Starting repository state

- HEAD `7efb44b`; working tree carried the complete uncommitted Phase 4C implementation (27 modified files + untracked `web/src` surfaces, gate screenshots, `COMMERCIAL_PRODUCT_READINESS_AUDIT.md`, `COMMERCIAL_FOUNDATION_RECHECK.md`, `PHASE_4C_*` docs).
- Baseline at phase start: backend `npm test` 127/127/27 suites; verify 54/54 (clean DB); frontend build PASS; static gate 9/9 (+23/23 self-test); live gate 70/70; audit: web/ 2 moderate (React Router 6).
- The two independent commercial audits (Kimi K3 audit + my adversarial recheck) were the accepted scope; every fix below was re-verified against the actual reachable code before changing it.

## 2. Defects fixed (all previously live-reproduced)

| # | Defect | Fix |
|---|---|---|
| F-1 | `PUT /v3/users/:id` silently dropped `artistAccess` (reachable handler); only the shadowed duplicate persisted it | Destructure + assign `artistAccess` in the reachable handler (`src/routes/users.js`) |
| F-2 | Reachable `DELETE /v3/users/:id` destroyed ANY user unguarded (root admin deletable, self-deletable); guards existed only in the shadowed duplicate | Guards on the reachable handler: 404 on missing, 403 root admin (absolute, checked first), 400 self-delete |
| F-2 tail | Deleted users' already-issued JWTs kept authorizing protected routes up to 24h (middleware trusted claims; no DB lookup) | Composite `authenticateToken` in `src/routes/context.js`: JWT verify (unchanged) + per-request DB revalidation; missing row → 401; role/artistAccess/integrationCount/email re-sourced from the row so permission changes take effect immediately. Tokens without an `id` claim (ADMIN_EMAIL override) skip the lookup — behavior unchanged. DB failure fails OPEN (logged) |
| F-3 | Artist split-brain: list read DB∪memory; detail/archive/restore/image/monthly-sales/development read memory only → API-created artists 404'd after restart; seeded artists' archive state diverged between list and detail | `artistRepository` is now the canonical access layer: `findById` (DB-first, memory fallback), `createArtist`, `archiveArtist`, `restoreArtist`, `setArtistImage`, `findAllHybrid`; all roster routes and the entity-audit `getArtistData` resolve through it; writes update DB + in-memory mirror |
| F-4 | Duplicate artist name → 200 + memory-only twin (lying success); DB failure → 200 "memory only" warning | Duplicate → **409**; DB failure → **500**. The memory-fallback write pattern is gone |
| F-5 | A&R submissions/votes/shortlist and sales entries were process memory — every customer write vanished on restart | New `AnrSubmission` + `SalesEntry` Sequelize models; seeds from the active profile; handlers DB-backed with response parity (see §6) |
| F-6 | `quotaUsed: Math.random()` per call served as operational metering | `quotaUsed: null` ("no metering data"); frontend IntegrationsView renders `—` for null |
| F-7 | Validation gaps (sideways votes, ghost artistIds, 1-char password change) | Ghost-artistId guard on `POST /v3/analytics/sales` (404 via canonical artist read). Vote direction outside `up`/`down` → 400 (post-review hardening §25). Change-password remains a documented before-pilot item |
| F-8 | `ecosystem.config.js` pointed PM2 at a non-listening module | **Verified still broken; NOT changed** — deployment work stays with the deployment-readiness phase (documented §21) |

## 3. User CRUD corrections

- `artistAccess` and `pageAccess` both round-trip now: create persists both (4C fixed pageAccess; artistAccess was already correct on create), update persists both, `GET /v3/users`, login and `/v3/auth/me` agree. Response shapes unchanged (no added keys).
- The reachable DELETE now: 404 missing · 403 root admin (from `profile.rootAdminEmail`) · 400 self · else destroy. Shadowed duplicates left untouched (preserved-for-parity policy).

## 4. Artist source-of-truth correction

- One authoritative durable store: the `Artist` table. The profile roster (`mock/artistData.js`, required once via `src/profile/labels/pulsegrid.js`) is reference/seed data + an in-process mirror kept consistent by `syncMemoryMirror()`.
- Acceptance verified by `tests/regression/durability.test.js`: create → list → detail → archive → **restart against the same disposable DB** → detail shows archived AND list agrees → restore persists.
- Aggregates (label overview, demographics, projections label-wide, royalties, contracts, geography-except-below) now resolve through the canonical hybrid list, so created artists count everywhere **except the label-overview admin `monthlyRevenue`, which remains the frozen `labelTotals` fixture**.
- **Documented residuals (unchanged on purpose):** `analytics/geography` reads the roster array (byte-parity: the baseline captures it after the AI keyword sorts reorder the shared array, and `regions` is built in first-encounter order — a DB-order read would return a different region sequence; verified the integer sums themselves are order-invariant); AI keyword path + monthly cron + campaign CRM stats + label-wide export overview remain roster-memory (pinned semantics).

## 5. Session / user-deletion correction

- Deleted users lose protected access at the next request (proven: `snapshot.test.js` "deleted user's already-issued JWT stops authorizing").
- Root-admin protection now exists on BOTH self-service (`DELETE /v3/auth/me`, pre-existing) and admin routes (new), sourced from the profile.

## 6. Persist-vs-demo classification table

| Domain | Storage | Classification |
|---|---|---|
| Users | SQLite | PERSISTENT (was already) |
| Artists + archive/restore/image | SQLite (canonical) + memory mirror | PERSISTENT (read paths unified this phase) |
| A&R submissions, votes, shortlist (store #1) | SQLite `AnrSubmission` | **PERSISTENT (new)** |
| Sales entries + projections input | SQLite `SalesEntry` | **PERSISTENT (new)** |
| A&R demos + ratings (store #2), whiteboard, nowListening | process memory | EPHEMERAL demo workspace (documented; store unification is a product decision) |
| Campaigns (`POST /v3/marketing/campaigns`, stats) | nothing stored | **DEMO — lying-success documented; persistence deferred to a campaigns feature pass** |
| Integration connections | process memory, keyed by user id | DEMO until real OAuth (connect response already says "(Mock)") |
| Integration quotaUsed | — | **EXPLICIT NULL ("no metering")** |
| Prospects, scout fixtures, fan demographics, operations fixtures, development insights, campaign stats | profile datasets / fixtures | DEMO reference data (profile-owned; frontend badges them) |
| Stats table | SQLite, never written (masterLoop unregistered) | DORMANT demo |
| apiCache | dead object | dead code (retained for parity) |
| Reports/PDFs | filesystem | GENERATED, not catalogued (deferred) |

## 7. Customer/label ownership seam

- **`src/profile/`** — the Active Label Intelligence Profile is the ownership root for the dedicated-instance model. `LABEL_SLUG`/`ACTIVE_LABEL` env selects a profile module; default/fallback `pulsegrid`. Data-only modules (no config/logger/model requires → no load cycles).
- `DB_STORAGE` env (new) selects the SQLite file → per-label databases without a source edit.
- Convention established and applied: **the first new owned table (`AuditEvents`) carries `labelSlug` from day one**; future owned tables must carry an owner column. No `tenant_id` anywhere; no Customer/Organization table; full multi-tenancy explicitly NOT built.

## 8. Audit-event seam

- `AuditEvents` table (append-only; id, labelSlug, actorId, actorEmail, action, resourceType, resourceId, metadata JSON, requestId, createdAt) + `src/services/auditService.js::emitAudit` (fire-and-forget; never breaks the write).
- Wired at the representative set: `user.create`, `user.update`, `user.delete`, `artist.create`, `artist.archive`, `artist.restore`, `artist.image`.
- Proven end-to-end by `durability.test.js` (reads the table back from the disposable DB: rows carry labelSlug, actorId, resourceId, requestId).

## 9. Usage / request-attribution seam

- Every response carries `X-Request-Id` (honours upstream, else uuid) and the winston pipeline logs a completion line `{requestId, userId, method, path, status, durationMs}` with post-auth identity.
- `src/services/usageService.js::recordUsage(kind, quantity, meta)` wired at the two paid-provider spend points: Groq token usage (`aiService.query`) and entity-audit provider calls + AI analysis (`entityAuditService.audit`, which now takes an optional `actor`). Bounded in-memory ring; structured log line; no billing, no quotas.

## 10. Label Intelligence Profile architecture

- **Frontend `BrandProfile`** (visual brand: identity, locale, theme, map — unchanged, gate-enforced) is now complemented by the **backend Label Intelligence Profile** (`src/profile/labels/pulsegrid.js` + resolver `src/profile/index.js`).
- Generic code reads profile fields; the pulsegrid profile carries every previous literal **verbatim**. No pulsegrid intelligence was removed or diluted.

## 11. Pulsegrid-specific values moved behind configuration

| Area | Field(s) | Consumers |
|---|---|---|
| AI | `ai.systemContext`, `ai.devFallback` (deduped: aiService + routes/ai.js), `ai.keywordInsights` (roiSecondPlace, touringAdvice `{artist}`, growthContext, defaultInsight), `ai.developmentInsights`/`developmentFocusAreas` | prompts.js, aiService.js, routes/ai.js, routes/artists.js |
| Search context | `searchContext.artistQueryPrefix` ('pulsegrid '), `.tertiaryQueryPrefix` | routes/integrations.js, modules/entityAudit.js |
| Knowledge sources | `fandom {host, rosterPage, labelWikiPath, labelWikiTitle, sectionKeywords}`, `wikipedia {labelPage, fallbackSummary, fallbackThumbnail, categoryKeywords}`, `discogs.labelUrl`, `http {wikiUserAgent, discogsUserAgent, labelBotUserAgent}`, `defaultGenre` | modules/entityAudit.js (all provider params) |
| Social mappings | `socialMappings` (ARTIST_MAPPINGS verbatim: art_lumenveil + art_novakin) | integrations/index.js, src/integrations facade |
| A&R | `anr.defaultGenre`, `benchmarkArtist`, `evaluate` copy | routes/anr.js |
| Reports | `reports {pdfTitle, generatedBy, monthlyHeader, monthlySubheader, accentColor, confidentialLine}` | routes/reports.js, reports/monthlyReport.js |
| Charts | `charts {accent, accentSoft, piePalette, donutPalette, projectionAccent}` | utils/charts.js, routes/analytics.js |
| Email | `email {from, resetSubject, resetHeadingColor, resetLinkColor}` | emailService.js, routes/auth.js (the route keeps its byte-identical inline PASSWORD-RESET copy — pre-existing duplication, documented not deduped) |
| Identity | `identity.bannerTitle/Subtitle/Features`, `serviceName` | server.js banner (values verbatim; padding rendered programmatically so the box is rectangular — the original byte-counted padding was ragged; stale legacy artist email line removed — that account was never seeded), config/logger.js |
| Authz | `rootAdminEmail` | routes/users.js (new guard), routes/auth.js (GDPR guard) |
| Seeds | `seedUsers` (2 pulsegrid accounts verbatim) | models/index.js seeding |
| Datasets | `datasets {roster (mock/artistData), demographics, anr (prospects/submissions/anrState), scouts, operations}` | artistRepository, inMemoryStores, scoutService, operationsRepository, routes/label.js |

## 12. Backend files changed

New: `src/profile/index.js`, `src/profile/labels/pulsegrid.js`, `src/services/auditService.js`, `src/services/usageService.js`, `tests/regression/durability.test.js`.
Modified: `src/config/index.js` (DB_STORAGE env with `profile.db.sqliteFile` fallback; email.from env-only), `src/config/logger.js`, `src/models/index.js` (AuditEvent/AnrSubmission/SalesEntry; profile seeds; A&R seeding), `src/middleware/index.js` (requestId + completion log), `src/routes/context.js` (composite auth; profile/usage/audit/AnrSubmission/SalesEntry in ctx), `src/routes/users.js` (F-1/F-2 + audit), `src/routes/auth.js` (profile email/root), `src/routes/artists.js` (repository + audit + profile insights), `src/routes/label.js`, `src/routes/analytics.js`, `src/routes/finance.js`, `src/routes/reports.js`, `src/routes/integrations.js` (KG prefix; quotaUsed null), `src/routes/anr.js` (store #1 → DB; profile copy), `src/routes/ai.js` (profile fallback), `src/repositories/artistRepository.js` (canonical layer), `src/repositories/inMemoryStores.js`, `src/repositories/operationsRepository.js`, `src/integrations/scoutService.js`, `src/integrations/index.js`, `src/services/emailService.js`, `src/services/entityAuditService.js` (actor + usage), `src/ai/aiService.js`, `src/ai/prompts.js`, `src/utils/charts.js`, `src/reports/monthlyReport.js`, `modules/entityAudit.js`, `integrations/index.js`, `server.js` (profile banner), `web/src/pages/SettingsPage/IntegrationsView.jsx` (null quota rendering), `tests/regression/snapshot.test.js`, `tests/regression/units.test.js`, `tests/snapshots/phase2_baseline.json`, plus docs `FRONTEND_ARCHITECTURE.md` and `REFACTOR_PROGRESS.md`.

## 13. API contracts changed (deliberate, documented)

1. `DELETE /v3/users/:id` on a nonexistent id: **200 `{success:true}` → 404 `{error:'User not found'}`** (baseline case `users_delete_nonexistent` updated — required for the root-admin guard, matches PUT and the shadowed handler).
2. `POST /v3/artists` duplicate name: 200+warning → **409 `{error:'Artist already exists', id}`**; DB failure: 200 "memory only" → **500**.
3. `GET /v3/integrations/status`: `quotaUsed` random 0–79 → **`null`** (no metering data; UI shows `—`).
4. Deleted/deactivated users' JWTs now **401** on protected routes (was: authorized up to 24h).
5. Every response gains an **`X-Request-Id`** header (additive; CORS preflight OPTIONS responses answered by the cors middleware are excluded; upstream ids outside `[A-Za-z0-9_.-]{8,64}` are regenerated).
6. `POST /v3/analytics/sales` for a nonexistent artist: **404** (was: accepted).
7. New tables auto-created by the existing `sync({alter:true})` on boot (no migration files).
8. `GET /v3/anr/submissions` list order: memory `unshift` (newest-first) → DB `ORDER BY id ASC` (seeded order, oldest first; baseline case `anr_submissions_after_create` sits in the NONDETERMINISTIC set so no snapshot pin fires — divergence documented, not pinned).
9. Non-finite sales revenue (`'abc'`, `'Infinity'`) → **400** (was: silently accepted into memory as NaN).
10. `POST /v3/anr/submissions/:id/vote` direction outside `up`/`down` → **400** (was: stored and echoed verbatim).

No other response bodies changed (141-test suite + 91-case snapshot + verify 54 + live gate 70 all green).

## 14. Database / schema changes

- New tables: `AuditEvents`, `AnrSubmissions`, `SalesEntries` (Sequelize `sync({alter:true})` creates them on next boot of an existing DB).
- No changes to `Users`/`Artists`/`Stats` schemas.
- Seeds unchanged for the pulsegrid profile (same two users, same 29 artists, plus A&R sub_1/sub_2 when the table is empty).

## 15. Tests added

- `snapshot.test.js` (+5): artistAccess round-trip incl. login//me agreement; DELETE guards (404/403-root/400-self/200-regular); deleted-user JWT 401; X-Request-Id per response.
- `units.test.js` (+8): models contract (new tables' columns); 4 profile pins (active-profile values, byte-for-byte literal preservation, 29-artist roster graph, LABEL_SLUG fallback); usageService ring; auditService contract shape + non-throwing; aiService usage hook.
- `durability.test.js` (+1 end-to-end): full create→archive→restart→verify cycle for artist/A&R/sales + ghost-sale 404 + duplicate 409 + audit-table read-back against a disposable DB.
- Suite: **141 tests / 141 pass / 32 suites** (was 127/27; +14 tests, +5 new describe blocks).

## 16. Restart / durability validation

`tests/regression/durability.test.js` boots `server.js` twice against the same disposable DB (`DB_STORAGE`): artist detail/archive/restore survive; list and detail AGREE post-restart; A&R submission + vote survive; logged sales drive projections post-restart ([1000,2000,3000], no synthetic reversion); audit rows present with actor/request correlation.

## 17. Frontend regression results

- Production build: PASS (2.9s; pre-existing >500 kB chunk warning, unchanged).
- Static portability gate: **9/9** + self-test **23/23**.
- Full live gate (Playwright, vite + new backend): **70/70** — including Example Records two-profile run, F21/F22 authz boxes, and the updated IntegrationsView.
- Legacy HTML `pulsegrid-frontend-connected.html` / `pulsegrid-terminal-dashboard.html`: md5-identical to HEAD.
- Gate screenshots restored via `git checkout -- web/validation/phase4b-*.png` after the run (documented 4C workflow).

## 18. Backend regression results

- `npm test`: **141/141, 32 suites** (127 pre-existing + 14 new; 91-case snapshot parity intact except the one deliberate baseline change §13.1).
- `npm run verify`: **54/54** against a fresh disposable instance of the new code. (First attempt hit the known non-idempotence artifact: a STALE pre-4CF server on :3000 with polluted memory — not a regression; documented tooling defect, clean-run workflow followed.)
- `npm audit --omit=dev`: web/ **2 moderate** (React Router 6 — unchanged, reported not suppressed). Repo root (backend tree): **23 advisories (2 low, 6 moderate, 14 high, 1 critical)** — all transitive (axios, tar-via-sequelize/uuid chain, body-parser, brace-expansion, dottie, follow-redirects, form-data, ip-address); newly published registry advisories, not introduced by this phase (zero dependency changes). No `npm audit fix` applied — dependency bumps are out of scope and recorded here honestly.

## 19. Known commercial debt remaining

- PM2/deployment truth (`ecosystem.config.js` → non-listening entrypoint, `instances:'max'`).
- Password policy on change-password (1-char accepted); no reset-password redeem route.
- A&R store #2 + whiteboard ephemeral; campaigns endpoint is a documented lying success.
- Free-text `role` string (fail-closed); ~20 inline role checks.
- `pageAccess` remains nav-only, unenforced server-side (backend authz is role+artistAccess).
- Published demo seed passwords (banner + profile) — rotation is a before-pilot item.
- `sync({alter:true})`, no migrations; Postgres unverified.
- Residual roster-memory aggregates (§4); monthly cron iterates memory artists.
- Instagram label-level account merge (cross-artist leak) while `USE_REAL_DATA` off.
- Backend tree audit advisories (§18).
- Banner still claims "Multi-Tenant Access Control Enabled" (preserved copy; see recheck §marketing-claim debt).

## 20. Explicitly deferred architecture

Shared multi-tenancy / tenant_id columns · billing/Stripe/subscriptions · SSO/SAML/SCIM · BYOK credential vaults · event buses/webhooks/microservices/Kubernetes · N-provider AI router · policy-engine RBAC · API keys/service accounts (seam reserved via the composite auth design) · full usage metering · audit UI/webhooks.

## 21. What is still demo/simulated

Campaigns (no read-back) · integration connections ("(Mock)") · quotaUsed (now explicit null) · A&R store #2 demos + whiteboard · scout fixtures · fan demographics fixture · operations fixtures · development insights (canned) · keyword "AI" path (`confidence 0.98`) · dev AI fallback (labeled `source:'fallback'`) · Stats table (dormant) · contracts/rights mock · royalty arithmetic over mock revenue.

## 22. What is now safe for customer data

Users (create/update/delete with real guards and audit) · artists (create/read/archive/restore/image — durable across restarts, single source of truth) · A&R submissions/votes/shortlist (durable) · sales entries (durable, ghost-guarded) · reports/exports generation · deleted-user session revocation · request/usage attribution records. **Caveat:** schema is still `sync({alter:true})`-managed and backups are manual — before REAL customer data, migrations + backup runbook (already on the before-pilot list).

## 23. Dedicated-instance commercial-readiness assessment

**LABEL A (dedicated deployment, own DB, own users, own artists, own integrations, own profile):** after this phase, provisioning is a CONFIGURATION operation: create `src/profile/labels/<slug>.js` (data-only module with its own datasets/seeds/identity), set `LABEL_SLUG` + `DB_STORAGE` (+ frontend `VITE_BRAND_PROFILE`). No generic-source edits for label identity or intelligence. Remaining blockers are the before-pilot list (deployment truth, password policy/reset, quotas on paid endpoints, seed-credential rotation, migrations).
**LABEL B (second dedicated deployment):** same path; the two instances share code only. Full shared tenancy remains explicitly NOT built and not needed.

## 24. Exact Phase 4D starting recommendation

Ordinary Phase 4D is **ready for review** with the following order:
1. Land/answer the open 4C product questions (Q2/Q9/Q10/Q12).
2. Deploy the before-pilot list (§19 items) as its own bounded pre-pilot pass when a pilot label is real: PM2/server.js + instances:1; password policy + reset flow; per-user quotas on `ai/query` + `entity-audit?refresh=true`; seeds/credential rotation; migrations.
3. Then 4D product work per the 4C handoff (§13): 4-AI provider route, code splitting, React Router 7 evaluation — none of it conflicts with this phase's seams; new code should keep reading label identity/intelligence through the profile and keep owner columns on new owned tables.

## 25. Post-4CF adversarial review fixes (2026-09-17)

Five read-only defect-hunt agents (taxonomy: correctness/parity/hardening/hygiene/operational, disjoint scopes) then verified fixes:

- **Session/type safety**: composite auth now re-sources `req.user.id` from the DB row (self-delete guard correct for string-id tokens; audit actorIds normalized). `req.body || {}` at login/change-password/PUT-user (pre-existing public unauth DoS: JSON-less body used to crash the whole API). `X-Request-Id` upstream values validated (`[A-Za-z0-9_.-]{8,64}`) else regenerated.
- **Artist SoT**: archive/restore now also write the `status` COLUMN; zero-row updates warn (no more silent memory-only writes in partial-seed mode); memory-only roster collision → 409; concurrent same-name create → 409 (unique-constraint catch); `findAllHybrid` fails soft; POST validates string names; monthly-sales/reports tolerate sparse rows and sanitize filenames.
- **A&R/sales**: non-finite sales revenue → 400 (was unhandled-crash via NOT NULL); vote direction whitelisted; same-ms submission PK collision retried; vote/delete/rating DB errors → clean 500; shortlist dedupe restored for `''` names; `SalesEntry(artistId, month)` unique index on fresh DBs.
- **Profile/env**: `LABEL_SLUG` lowercased (PULSEGRID resolves); banner clamps to box width; `config.db.storage` defaults from `profile.db.sqliteFile`; `.env.example` documents `DB_STORAGE`/`LABEL_SLUG`/`ACTIVE_LABEL`; stale load-order comment removed.
- **Test truthfulness**: the obsolete "login tokens omit id" pin rewritten to the two real token shapes; durability test made hermetic (`ADMIN_EMAIL/ADMIN_PASS=''`), fails fast on orphan-port servers, and cleans `-wal`/`-shm`.
- **Docs**: §12-§18 corrected (suite count, +8 units tests, file list, ANR list-order divergence, geography residual reason, monthlyRevenue fixture residual).
