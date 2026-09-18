# COMMERCIAL_PRODUCT_READINESS_AUDIT.md

**Audit date:** 2026-09-17 · **Repo:** `/home/dino/mau5trap-repo` (branch `master`, HEAD `7efb44b` + uncommitted Phase 4C tree)
**Nature:** evaluation/research only. No fixes implemented, no Phase 4D started, nothing committed.

## How this audit was performed (evidence basis)

- Read all 16 named repository documents in full, plus `INTEGRATION_INVENTORY.md`, `GAP_ANALYSIS.md`, and `ARCHITECTURE_AUDIT.md`.
- Read the actual source: every `src/routes/*.js`, `src/models`, `src/auth`, `src/config`, `src/middleware`, `src/ai/*`, `src/repositories/inMemoryStores.js`, `src/validation`, `server.js`, `ecosystem.config.js`, `src/jobs/monthlyReportJob.js`, and the frontend `web/src` tree (endpoints, auth, brand, AI seam, AdminPage).
- **Re-ran the backend suite:** `npm test` → **127 pass / 0 fail / 27 suites** (matches PHASE_4C_HANDOFF exactly).
- **Exercised the API live** (~60 probes) against a throwaway database on port 3100: full CREATE→READ→UPDATE→READ→DELETE→VERIFY cycles for users, artists, A&R submissions, sales, campaigns, integrations; RBAC probes as admin/artist/viewer/arbitrary roles; a **server-restart durability pass**; AI, exports (CSV+PDF), auth edge cases. The operator's `mau5trap_v5.sqlite` was moved aside untouched and **restored byte-identical (sha256 `83abc474…` before and after)**.
- The Playwright frontend gate was deliberately **not** re-run: it overwrites committed `web/validation/phase4b-*.png` evidence files, and its claims were already independently re-observed by two prior sessions (PHASE_4B_VALIDATION, PHASE_4C_HANDOFF). Backend and API claims were re-verified directly instead.

Where documentation and runtime behavior disagreed, runtime behavior is reported. Nothing in this file is inferred from route existence alone.

---

## 1. Executive conclusion

The repository contains a well-disciplined **single-label prototype in mid-conversion to a reusable platform**, not yet a commercial product foundation.

What is real and strong: a decomposed, tested backend (127 tests, snapshot parity, fixed CRITICAL/HIGH security defects); a genuinely brand-portable **frontend** whose generic code is enforced leak-free by a self-testing static gate; a clean AI adapter seam (`groqClient`) and a well-designed frontend AI contract that degrades on the absent provider-catalogue route; an honest documentation culture that records debt rather than hiding it.

What blocks commercial use is concentrated and identifiable:

1. **There is no customer/label ownership concept anywhere in the domain model.** Grep for `tenant|organization|label_id|customer` across `src/` returns zero. One hardcoded SQLite file (`src/config/index.js:82`), one global roster import, global in-memory stores, global caches, one global cron. This is the cheapest it will ever be to fix and the most expensive it will ever be to retrofit.
2. **Backend label intelligence is not externalized.** AI prompts, search prefixes, knowledge sources, report/email identity, chart colors, seeds, and the root-admin rule are mau5trap literals in generic code (BRAND_PORTABILITY_AUDIT R01–R33, all confirmed against source). The frontend is portable; the backend is not. "Phase 4-LABEL" is the correct, already-scoped remedy.
3. **CRUD is partially trustworthy.** This audit reproduced three live integrity defects the docs understate or omit (§5): `PUT /v3/users/:id` returns success while silently dropping `artistAccess` (and the Admin UI sends it, so the failure is user-visible); `DELETE /v3/users/:id` lets an admin delete the root admin and themselves (guards exist only in shadowed duplicate handlers); and artists created via the API **404 on their own detail/archive routes after any restart** (list reads DB∪memory, detail reads memory only).
4. **Most "product" state is process memory.** A&R, sales, campaigns, integration connections are lost on every restart — verified. Campaigns have no read-back at all. The banner's "Multi-Tenant Access Control Enabled" is aspirational; there is no tenancy.
5. **The API is internal-grade:** no keys/service accounts, no scopes, no usage metering, no per-user cost controls on paid-provider endpoints, no versioning/deprecation policy, no OpenAPI, fabricated values served without provenance flags in several places.

The trajectory is right. The correct commercial path is **dedicated single-customer instances now, with a deliberately label-shaped domain model** so a shared multi-tenant design remains possible later. The foundations that must be laid now are few, small, and listed in §25. Nothing found requires a rewrite.

---

## 2. What the product actually is today

| Layer | Verdict | Evidence |
|---|---|---|
| Customer / label identity | **MISSING** (backend) / REAL (frontend-only) | No label/org entity in backend; frontend `brand/profiles` switch presentation only |
| Users | **REAL** | Sequelize `User`; login/me/list/create/update/delete verified live |
| Memberships (user↔label) | **MISSING** | No such concept |
| Roles / RBAC | **PARTIAL** | `role` string (admin/artist/viewer, free-text); artist scoping works (HIGH-4 fixed); `pageAccess` is nav-visibility only, never enforced server-side |
| Roster / artists | **PARTIAL** | Hybrid DB+mock union; create/archive/restore/image work; split-brain persistence (§5 F-3) |
| A&R | **DEMO** | Two unreconciled in-memory stores; mock scouting; canned evaluation |
| Analytics | **DEMO** | Projections regress synthetic `Math.random()` history; `Stats` table never written |
| Fan/audience intelligence | **DEMO** | Fixed fixtures, labeled "Mock Aggregation" in code only |
| Campaigns / marketing | **DEMO** | Create returns an ID; nothing is persisted or readable; stats are a fixture |
| Operations | **DEMO** | Static fixtures labeled SOURCE: FIXTURE in UI |
| Finance | **DEMO** | Royalty calculator is arithmetic over mock revenue; contracts endpoint is a mock message |
| Reports / exports | **REAL (generation) / MISSING (persistence)** | CSV+PDF verified live; no stored report records |
| AI | **PARTIAL** | Real Groq path with clean adapter; fabricated dev fallback; keyword path is not AI; no provider router |
| Integrations | **DEMO** | Mock connect/disconnect; real provider clients exist but 2/29 artist coverage and gated off |
| External data providers | **PARTIAL** | entity-audit fans out to 5 real providers + Groq; cached; no quota |
| Label intelligence configuration | **DEMO/MISSING** | Frontend profile schema exists; backend has no profile at all |
| Branding / theme | **REAL (frontend)** | Enforced by static gate; verified two-profile runs |
| Database / persistence | **PARTIAL** | SQLite, `sync({alter:true})`, no migrations; Postgres path unverified |
| API | **PARTIAL** | 58 reachable routes; internal-grade contracts |
| Frontend | **REAL** | 12 surfaces migrated, gate 70/70 |
| Scheduled jobs | **PARTIAL** | One cron (monthly report), explicit registration; global, not label-scoped |
| Email | **DEMO** | Simulated send returns success indistinguishably; reset flow dead end-to-end |
| Logging / observability | **PARTIAL** | winston request logs with redaction; no request IDs, metrics, tracing, audit log |

---

## 3. Commercial product boundary

Today the product is: **a single-tenant label dashboard with a portable frontend skin, a mau5trap-flavored backend, and a tested API shell.** It is not yet: multi-customer anything, an integration-ready API product, or a system whose demo surfaces could be shown to a paying label as-is (several serve fabricated numbers without a `source` flag — fan demographics, campaign history, integration quotas, development insights, dev-AI fallback).

The boundary that exists and is worth keeping: **mock/fixture/demo content is clearly identified in code and the new frontend badges it** (`SOURCE: MOCK`, `SOURCE: FIXTURE`, `PROTOTYPE`). That discipline is the seed of the commercial boundary: demo data must become *label-profile-owned reference data*, and live data must carry provenance.

---

## 4. CRUD matrix (runtime-verified, not inferred)

Verified live on a throwaway DB. ✓ = works end-to-end, ~ = partial, ✗ = absent.

| Entity | CREATE | READ LIST | READ DETAIL | UPDATE | DELETE | Notes (verified behavior) |
|---|---|---|---|---|---|---|
| Users | ✓ admin, zod-validated, persists pageAccess+artistAccess | ✓ admin only; no pagination; secrets excluded | ✗ no `GET /v3/users/:id` (only `/me`) | ~ pageAccess/name/role/email/password persist; **artistAccess silently dropped with success:true** | ✓ admin; persists; **no root-admin guard, no self-delete guard, no session revocation** | Duplicate email → 400. Strict schema rejects extra fields. Role is free text. |
| Artists | ✓ admin; id derived from name; **duplicate name → 200 + memory-only warning** | ✓ DB∪mock union; search; server-side access filter; slice pagination (NaN-safe but unvalidated) | ~ **memory-only read → 404 after restart for API-created artists** | ~ archive/restore/image only; no general edit | ✗ by design (archive lifecycle) | Archive/restore mutate memory first, DB opportunistically, always 200 |
| A&R submissions (store #1) | ✓ any authed user | ✓ | ~ (via list) | ~ vote only; **direction unvalidated ('sideways' accepted)** | ✓ admin | **Process memory — lost on restart (verified)** |
| A&R demos (store #2) | ✓ | ✓ | ✓ rating aggregate | ~ add/remove vote by email | ✗ | Split-brain vs store #1, documented; **process memory** |
| Scouting/shortlist | ✓ | ✓ | ✗ | ✗ | ✗ | Mock fixtures; shortlist writes store #1 |
| Campaigns | ✓ returns `cmp_<ts>` | ✗ **no list/detail route** | ✗ | ✗ | ✗ | Created campaigns are unreadable and vanish on restart; `/v3/campaigns/stats` is a separate fixture |
| Sales entries | ✓ upsert-by-month (verified replace) | ~ only via projections | ✗ | ✓ same-month replace | ✗ | **Process memory**; ghost artistIds accepted |
| Integration connections | ✓ mock connect | ✓ status | ✗ | ✓ disconnect | ✓ | **Process memory**; `quotaUsed` is `Math.random()` per call; per-user now (JWT id), shared `undefined` bucket only for override-admin token |
| Reports / exports | n/a (generation) | ✗ no stored reports | n/a | n/a | n/a | CSV+PDF verified 200; `checkExportAccess` enforced; cron writes `reports/` lazily |
| Fan demographics | n/a | ✓ | n/a | n/a | n/a | Fixed fixture |
| Operations (logistics/assets/contracts) | n/a | ✓ (contracts admin/manager) | n/a | n/a | n/a | Static fixtures |
| Financial (royalties/rights) | n/a | compute-only | n/a | n/a | n/a | Arithmetic over mock revenue |
| Stats (model) | ✗ **never written by anything** | ✗ | ✗ | ✗ | ✗ | `sync/masterLoop.js` unregistered → projections synthetic |
| AI provider settings | n/a | ✗ route absent by design | n/a | n/a | n/a | Frontend degrades to `selectable:false` (documented contract) |

Authorization summary (verified): admin-only guards fire correctly (artist role 403s on users/artists/A&R-delete/contracts); artist data-scoping works (roster=own artist, other-artist detail 403, own export 200, label-wide export 403); non-admin write attempts are blocked. The gaps are the two missing DELETE guards, the dropped `artistAccess` update, free-text roles, and no token revocation.

---

## 5. Data integrity / runtime failure findings

All reproduced live on a throwaway DB unless noted. Severity per the audit rubric.

### F-1 — `PUT /v3/users/:id` drops `artistAccess` and reports success — **MAJOR**
- **Files:** `src/routes/users.js:131-161` (live handler destructures `email, role, pageAccess, name, password` — no `artistAccess`); the shadowed duplicate at `src/routes/users.js:196-213` *does* update it. **Frontend:** `web/src/pages/AdminPage/AdminPage.jsx:58` sends `artistAccess` in the edit payload.
- **Runtime path:** Admin › Team › edit user › change Artist Access › save → green success.
- **Observed:** `PUT {artistAccess:'art_deadmau5'}` → `200 {success:true}`; stored value remains `'art_rezz'` (read back via `GET /v3/users`).
- **Commercial consequence:** the one permission that scopes a staff user to specific artists cannot be changed through the product, and the failure is silent. Same defect class as the pageAccess API-killer Phase 4C fixed — that fix covered pageAccess only.
- **Smallest response:** one-line destructure + assignment in the live handler (parity with the shadowed one); add a round-trip test like the pageAccess ones. **Cost now: LOW. Cost later: MEDIUM** (grows as more roles/fields accrete; the audit trail question compounds it).

### F-2 — `DELETE /v3/users/:id` has no root-admin guard, no self-delete guard, no revocation — **MAJOR**
- **File:** `src/routes/users.js:164-168` (live). The self-delete guard exists only in the shadowed duplicate (`:216-229`); the root-admin guard exists only on `DELETE /v3/auth/me` (`src/routes/auth.js:173`, and it hardcodes `admin@mau5trap.com` — label coupling in an authorization rule).
- **Observed:** `DELETE /v3/users/1` (the root admin) → `200 {success:true}`; subsequent login as root admin → 401. Self-delete via this route → 200. Deleted users' existing JWTs continue to authorize admin routes (verified: requests with the deleted admin's token still succeed), because role checks trust token claims and no DB lookup/revocation exists.
- **Commercial consequence:** any admin can irreversibly delete the only root account or lock themselves out; offboarding a staff user does not actually cut access for up to 24h (JWT expiry).
- **Smallest response:** guards on the live handler (root email from label profile, self-delete, consider last-admin protection); document token-revocation as a before-paid-production item. **Cost now: LOW. Cost later: MEDIUM-HIGH** (revocation after customers exist forces an auth-model change under pressure).

### F-3 — Artist persistence is split-brain: created artists 404 after restart — **MAJOR**
- **Files:** `src/routes/artists.js` — list reads DB∪memory (`:51-58`), but detail (`:189`), archive (`:124`), restore (`:143`), image (`:163`) read `labelData.artists` (process memory) only.
- **Observed:** `POST /v3/artists {name:'Audit Probe'}` → persisted to DB **and** memory. After server restart: `GET /v3/artists?search=Audit` → artist present (from DB row, including the previously persisted `manualImage`); `GET /v3/artists/art_auditprobe` → **404**; `POST …/archive` → **404**.
- **Commercial consequence:** the roster — the customer's core asset — behaves inconsistently across restarts. A label that creates artists and restarts the deployment loses access to them everywhere except the list view.
- **Smallest response:** make the `:id` routes resolve through the same repository path as the list (DB with memory fallback), one seam already used by the list. **Cost now: LOW-MEDIUM. Cost later: HIGH** (once customers create real rosters, the fix becomes a data reconciliation).

### F-4 — Duplicate artist name → success with silent divergence — **MODERATE**
- **File:** `src/routes/artists.js:90-117`. ID derived as `art_<name squashed>`; `Artist.create` PK-conflicts; catch pushes to memory and answers `200 {success:true, warning:'Persisted to memory only'}`.
- **Observed:** second identical create → 200 + warning; the memory duplicate is hidden by the union's id-dedupe but present for `find()`.
- **Response:** 409 on duplicate id/name; stop the memory-fallback pattern (it was prototype robustness). **Cost now: LOW. Cost later: MEDIUM.**

### F-5 — Product state is process memory; restart wipes it — **MAJOR**
- **File:** `src/repositories/inMemoryStores.js` (self-documented as unsolved).
- **Observed across a restart:** sales entries gone → projections revert from real logged values `[1000,2000,5555]` to synthetic randoms `[6944038,…]`; A&R submissions revert to the two seeds; integration connections revert to disconnected; campaign state has no read-back at any time.
- **Commercial consequence:** any restart/crash/deploy destroys customer work in A&R, sales logging, and integrations. Under `ecosystem.config.js` (`instances:'max'`) it is incoherent *within* a single run.
- **Smallest response:** decide which of these is product data vs demo; persist the product ones (Sequelize models are cheap here), badge the demo ones. **Cost now: MEDIUM. Cost later: VERY HIGH** (retrofitting persistence + migration after customers have data, while semantics are frozen by usage).

### F-6 — Fabricated values served without provenance — **MAJOR (commercial trust)**
- **Observed/confirmed in code:** `GET /v3/integrations/status` returns `quotaUsed: Math.floor(Math.random()*80)` per call (`src/routes/integrations.js:126` — observed values 20, then 6); `/v3/fans/demographics` fixed fixture (`label.js:77-103`); `/v3/campaigns/stats` fixed history (`marketing.js:69-76`); `/v3/artists/:id/development` fixed insights (`artists.js:276-285`); `/v3/anr/evaluate` random score + canned report (`anr.js:165-180`); AI dev fallback fabricates `200 success:true` with `[Dev Fallback]…` (distinguishable only by `source:'fallback'`); `/v3/ai/analyze` is keyword matching with `confidence: 0.98` and hardcoded "Rezz is second at 6.5x".
- **Consequence:** a paying label cannot tell measured data from invented data at the API level. The new frontend badges some of this; the API itself does not.
- **Response:** a `source: live|mock|fixture|fallback` convention on every intelligence endpoint; entity integrations already compute `meta.realDataSources` — expose it. **Cost now: LOW-MEDIUM. Cost later: HIGH** (retroactive provenance is archaeology).

### F-7 — Validation/semantics gaps (all verified) — **MODERATE**
- A&R vote `direction` unvalidated: `'sideways'` → 200 and is stored (`anr.js:80-110`).
- `POST /v3/analytics/sales` accepts nonexistent artistIds (`analytics.js:79-90`).
- `change-password` accepts a 1-character new password (`auth.js:209-230`); no reset route exists — forgot-password tokens are **unredeemable** (`POST /v3/auth/reset-password` → 404, verified).
- `role` is a free string: `role:'superadmin'` created successfully (fail-closed, so benign today).
- Malformed JSON body → `500 Internal server error` (should be 400; `express.json` SyntaxError reaches the terminal handler).
- Pagination params unvalidated (`limit=abc` → 200 with `artists:[]`, `limit:null`).
- **Response:** one validation pass over write endpoints (the zod layer exists and is wired to exactly two routes). **Cost now: LOW. Cost later: MEDIUM.**

### F-8 — Operational: documented PM2 deployment is broken; cluster mode is incoherent — **MAJOR**
- **Files:** `ecosystem.config.js:4` (`script: './mau5trap-production-api.js'`), `PRODUCTION_DEPLOYMENT.md`.
- **Verified:** `node mau5trap-production-api.js` exits 0 immediately (Phase 2 made it a pure module; only `server.js` listens). `pm2 start ecosystem.config.js` therefore starts a process that exits instantly and restart-loops; `instances:'max'` would also shard the in-memory stores across workers.
- **Response:** point the ecosystem script at `server.js`, `instances: 1` until state is externalized. **Cost now: LOW. Cost later: MEDIUM.**

### F-9 — Unbounded paid-provider spend per user — **MAJOR (commercial)**
- Confirmed open (HIGH-7): `POST /v3/ai/query` and `GET …/entity-audit?refresh=true` are JWT-only, cached but refresh-bypassable, no per-user quota; the only limiter is a global 1000 req/h/IP (verified header `X-RateLimit-Limit: 1000`).
- **Response:** per-user rate limits/credits on cost-incurring endpoints before any external user exists. **Cost now: LOW-MEDIUM. Cost later: HIGH** (a single pilot user can run real bills; retrofitting quotas under incident conditions is how pricing mistakes ship).

### Positives verified
- No unhandled-rejection process kills on any probed write path (4C's PUT fix holds; server survived all probes).
- Login/lockout semantics, token 401/403 split, export RBAC, GDPR self-delete, duplicate-email 400, strict-schema rejection of smuggled fields — all correct.
- PDF endpoints (the Phase 2 process-killer) return 200 `%PDF-1.3` on both paths.
- Error handler no longer leaks internals; request logger redacts tokens.

---

## 6. API product-readiness findings

| Concern | Today (verified) | Classification |
|---|---|---|
| Versioning | `/v3` prefix only; "v3" is a lineage label, no policy, no deprecation story | BEFORE FIRST PILOT (write the policy, not the machinery) |
| Endpoint consistency | REST-ish, but mixed conventions (`/v3/campaigns/stats` vs `/v3/marketing/campaigns`; vote actions in body vs path) | SAFE TO DEFER |
| Status codes | Mostly sane; malformed JSON → 500; validation → 400 with details; non-admin on validated route gets 400-before-403 | BEFORE FIRST PILOT (cheap normalizations) |
| Error schema | `{error}` / `{error,message}` / `{error,path}` / `{error,details[]}` — 4 shapes | BEFORE FIRST PILOT (one envelope) |
| Pagination | limit/offset on one endpoint, unvalidated, in-memory slice | BEFORE PAID PRODUCTION (real roster sizes) |
| Filtering/sorting | search only, client-side sorting | SAFE TO DEFER |
| Validation | zod on 2 of ~20 write routes | BEFORE FIRST PILOT (§5 F-7) |
| Identifiers | users INTEGER, artists `art_*` strings, A&R `sub_<epoch>`, campaigns `cmp_<epoch>` — no prefix/ULID convention | **FOUNDATIONAL NOW** (IDs are the one thing that cannot change later) |
| Timestamps | ISO in responses; `resetTokenExpiry` epoch-as-STRING in DB | SAFE TO DEFER |
| Nullable semantics | inconsistent (`warning` only on fallback success) | SAFE TO DEFER |
| Auth model | JWT 24h, no refresh, no revocation, no API keys, no service accounts, no scopes | **FOUNDATIONAL NOW** (decision + seam; implementation before paid) |
| Rate limiting | global 1000/h/IP; nothing per-user/per-key | BEFORE FIRST PILOT (cost endpoints) |
| Request IDs / tracing | none | BEFORE FIRST PILOT (one middleware) |
| API documentation | `API_INVENTORY.md` is accurate and current; no OpenAPI | BEFORE FIRST PILOT (inventory → OpenAPI-lite) |
| Backward-compat policy | snapshot harness enforces it internally; no stated customer policy | BEFORE FIRST PILOT (one paragraph) |
| Quotas / usage tracking | none; integration quota is a random number | **FOUNDATIONAL NOW** (§11, §12) |
| Customer-level limits | n/a (no customer concept) | BEFORE PAID PRODUCTION |

---

## 7. Customer / label domain-model findings

**There is no customer, organization, label, deployment, membership, or ownership concept anywhere in the backend.** Verified by grep and by reading every model and route. The architecture assumes exactly one label, globally:

- One hardcoded database file: `src/config/index.js:82` `storage: 'mau5trap_v5.sqlite'` (no `DB_STORAGE` env read — brand audit R15 confirmed in code).
- One globally imported roster: `artistRepository` requires `mock/artistData.js` directly.
- Global process stores, one global `NodeCache`, one global cron, one root admin email literal (`auth.js:173`).
- Seeds unconditionally create mau5trap accounts with documented weak passwords (`models/index.js:94-105`) on any empty database — including a customer's first boot.

**"If this product gains five paying labels, what has to change?"** Today: five separate checkouts with ~20 source edits each (the brand audit's §12 edit list is accurate and verified), five hand-edited config files, five manual DB swaps, and five processes whose memory stores, caches, crons, and AI context are all mau5trap-shaped. Provisioning is a source-code operation, not an operation.

The unit of ownership that matters and is missing: **an active label profile that owns (a) its datasets** (roster, seeds, operations, scouting, demographics), **(b) its intelligence configuration** (search prefixes, knowledge sources, social mappings, benchmarks, AI context), **(c) its identity outputs** (reports, emails, charts, logger/banner), **(d) its root admin**, and **(e) its database**. Artists, users, reports, integration credentials, and API credentials are all naturally label-owned; nothing in the current data legitimately spans labels.

---

## 8. Dedicated-instance vs multi-tenant analysis

| | A. Dedicated per label | B. Shared multi-tenant | C. Dedicated-first, tenant-compatible model |
|---|---|---|---|
| Fit to current code | Good — single-process assumptions hold | Bad — global stores/caches/config everywhere | Good — same as A, plus discipline |
| Cost now | LOW | VERY HIGH | LOW-MEDIUM |
| Data isolation | Physical (separate process+DB) | Must be built into every query | Physical now; logical seam later |
| Upgrade/ops burden | N deployments | 1 deployment | N now, consolidate later |
| Risk of cross-label leakage | ~zero | High if attempted today (no scoping) | ~zero now; designed-out later |
| Path to B | Rewrite ownership later | — | Add `label_id` to owned tables + one membership table when demand proves it |

**Recommendation: C.** The deliberate choices that make C real, all cheap now and expensive later:

1. **One active-label resolution seam in the backend** (env-selected profile object) through which every label-flavored value flows — this is exactly the already-scoped "Phase 4-LABEL".
2. **A rule for new code: anything label-owned is read through the profile/context, never a module-level literal.** The frontend already enforces its half of this rule with a static gate; the backend needs the same discipline (a lint/grep rule is enough initially).
3. **ID conventions that survive tenancy** (prefixed, unique without central coordination) so `art_*`, `sub_*`, user ids never collide when data is later merged or partitioned.
4. **No globally-unique assumptions in new tables** — e.g. if an `audit_events` or `api_keys` table appears, give it a `label`/owner column from day one even while only one label exists.

Do **not** add `tenant_id` to existing tables speculatively; with dedicated instances the column is dead weight until B is actually chosen, and the migration then is mechanical.

---

## 9. User / RBAC / identity findings

- **Lifecycle:** create/list/update/delete exist (admin-gated). No invitation flow (admin sets passwords directly), no activation/deactivation flag, no password-reset completion (route absent — verified 404), no email verification.
- **Password handling:** bcrypt cost 10, no strength policy (1-char accepted, verified), reset tokens minted but unredeemable.
- **Roles:** free-text string; checks are ~20 inline `role !== 'admin'` copies plus one `manager` check; no policy layer.
- **pageAccess:** persisted stringified-JSON array; served on login and `/me` (verified); enforced **nowhere** server-side — it is a nav hint, correctly documented as such. Backend authorization is role+artistAccess based and held up under probing.
- **Ownership boundaries:** `artistAccess` works per-user (scalar/array normalized; verified own-artist vs other-artist). It cannot be edited via the live update route (F-1).
- **Admin behavior:** any admin can delete root/self (F-2); override admin (`ADMIN_EMAIL` env) mints a token with no `id` claim so `/me`, change-password, GDPR delete 404 for it, and its integration connections land in a shared `undefined` bucket (documented debt, re-confirmed in code).
- **Auditability of permission changes:** none — no record of who granted what when (§10).
- **Enterprise identity readiness:** SSO/OIDC/SAML would be *moderately* priced later: identity is email-keyed with a clean `User` model and one login path, which helps; the local-password assumption in create/change/reset flows and the JWT-only session model are the friction. SCIM/provisioning would need the membership concept that does not exist. Not blockers; do nothing now beyond keeping identity email-keyed.

**RBAC for multiple staff users: trustworthy at the current scope** (admin/all-powerful + artist/data-scoped + viewer), **not yet trustworthy as a commercial permission system** (pageAccess unenforced server-side, F-1/F-2 open, no audit trail).

---

## 10. Audit-log / event findings

Nothing exists: zero hits for any audit/event/activity log in `src/`. For a B2B platform the events that must eventually be answerable — user created, permission changed, artist modified, integration connected, export performed, credentials issued/revoked, destructive actions — are currently lost.

- **Cost now: LOW.** One append-only table (`actor, action, target, timestamp, metadata`) + one `emit()` helper called from the handful of write handlers that exist today. The write surface is small; wiring it now is hours.
- **Cost later: HIGH.** After more features ship, every handler needs retrofitting; after customers exist, the absence is a sales/security-review blocker and the history is unrecoverable.
- This is the canonical LOW-now/HIGH-later item. Do not build a UI, webhooks, or an event bus — just the table and the writes.

---

## 11. Billing / subscription architecture findings

No billing exists and none should be built yet. What billing will attach to later, and whether it exists:

| Billing will need | Exists? | Note |
|---|---|---|
| Customer account entity | ✗ | The label profile is the natural anchor |
| Subscription/plan/status | ✗ | SAFE TO DEFER entirely |
| Seats | ~ | Users exist; per-label user counting trivial once label ownership exists |
| API usage metering | ✗ | §12 |
| AI usage metering | ~ | token usage is `console.log`'d, not recorded (`aiService.js:84`) |
| External-data usage | ✗ | entity-audit spends are invisible except cache logs |
| Feature entitlements | ~ | pageAccess is a de-facto entitlement list (nav-level only) |
| Provider customer IDs (Stripe etc.) | ✗ | trivial to add to the customer entity once it exists |

Expensive-to-meter-retroactively: **AI token spend and paid-API calls per user/label** — if not attributed at call time from the start, historical cost allocation is impossible. A usage-recording hook at the two spend points (AI completion, entity-audit refresh) is cheap now and is the only billing-adjacent work worth doing early.

## 12. Usage / metering findings

The system cannot currently answer: which customer (no customer), which user made this API request (request logs have IP only, no user id), endpoint counts (no counters), AI tokens per user (stdout only), external calls per user (not tracked), reports generated (not tracked), expensive processing per label (not tracked).

Minimum viable seam (not implementation): a request-context middleware that attaches `requestId` + `userId` to the log line, and a `recordUsage(kind, quantity)` no-op-backed helper at the AI/audit spend points. Both are tens of lines. **Cost now: LOW. Cost later: HIGH** (middleware ordering and handler edits multiply; historical data is gone forever). Classify as **before first pilot**.

## 13. API keys / service accounts

The current JWT/user system cannot support machine access well: 24h user-bound tokens, no scopes, no revocation, no rotation, no per-credential attribution. Minimum architecture to avoid redesign later:

1. Keep auth middleware token-issuer-agnostic: today it does `jwt.verify` and trusts claims. Introduce a single `resolvePrincipal(req)` seam through which both user-JWTs and future API keys pass, yielding `{kind:'user'|'key', id, label, scopes}`.
2. When keys are built (before paid production): hashed-at-rest credentials, scope list, expiry, `lastUsedAt`, per-key usage counters feeding §12.
3. **Cost now (seam only): LOW. Cost later (after external integrators build against user JWTs): HIGH** — you would be migrating customers off a credential you never meant to issue.

## 14. Integration / secret ownership findings

- **Credentials today are global environment variables**, read by `src/config` and provider modules — operator-owned, deployment-global. There is no per-customer credential concept.
- **Connection state is per-user mock memory** (`userIntegrations`), not real OAuth: `/v3/integrations/auth/:service` fabricates a connected state (verified); YouTube's OAuth callback URL is hardcoded localhost with no implementing route.
- **Configuration is label-specific nowhere**: `ARTIST_MAPPINGS` (Spotify/IG/YouTube/etc. IDs) covers exactly `art_deadmau5` and `art_rezz` (verified in `integrations/index.js:12-30`); the other 27 artists fall back to mock with only a console.warn. The Fandom host is `deadmau5.fandom.com` for every artist (`modules/entityAudit.js:684-732`). The Google-KG route prefixes `mau5trap ${query}` (`src/routes/integrations.js:69`).
- **Secret storage assumptions:** env vars + `.gitignore` discipline are fine for operator-owned keys; **BYOK (customer-owned keys) would require encrypted-at-rest per-label credential storage, which does not exist and should not be built now.** The decision that must happen *before customers connect credentials*: credentials are label-owned records, referenced by label profile, never per-process globals. BYOK later is then a storage/UX problem, not an architecture change.
- **One real data-quality defect:** Instagram merges one label-level account's metrics into *every* artist (`integrations/index.js:68`) — if real integrations are ever enabled, cross-artist contamination. Keep `USE_REAL_DATA` off until mappings are label/artist-resolved.

## 15. AI architecture findings

- **Provider neutrality:** the seam is good — `groqClient` is a lazy, timeout-bounded, injectable adapter; `aiService` imports it directly (the one coupling). A provider registry is *not* needed now; a `createAiService({client})` injection point already exists. The frontend provider contract is genuinely well-designed (404-degrades to `selectable:false`, flips with no rewrite when `/v3/ai/providers` ships — verified in `web/src/ai/aiClient.js`).
- **Label neutrality: NO (verified).** System prompt is "AI analyst for mau5trap" (`prompts.js:37`); keyword path emits "Rezz is second at 6.5x", `artists[1]` comparisons, fixed TikTok/15% claims (`aiService.js:127-143`); dev fallback fabricates EU-tour advice (`aiService.js:36-37`).
- **Cost visibility:** usage is console-logged only (§11/§12). **Timeout:** 20s, correct. **Retry:** none (fine at this stage). **Rate limits:** none per user (F-9).
- **Response parsing:** tolerant-parse + zod + fallback is solid engineering; the entity-audit prompt still begs for JSON in prose (documented).
- **Refactor NOW vs later:** *now* — move label context into the label profile (prompt identity, canned insights, fallback behavior) as part of 4-LABEL; *later* — provider router, per-request model selection, streaming.

## 16. Label Intelligence Profile findings

Branding is not enough, and the repository already knows this: the frontend `BrandProfile` (`web/src/brand/schema.js`) covers identity/locale/search/assets/map; the brand audit's proposed backend `§15.3` profile adds datasets, knowledge, AI context, reports/email identity, root admin, DB selection. **The backend profile does not exist at all** — that is the single structural gap from which most portability failures follow.

A commercial Label Intelligence Profile needs, beyond the frontend schema: known-artists/aliases, search context + query prefixes, knowledge sources (+ per-source parser selection — the current Fandom parser assumes one wiki's English section layout, verified `entityAudit.js:573-590`), comparison/benchmark artists, A&R assumptions, AI system context + fallback copy, social mappings, venue/location intelligence (already externalized correctly to `profiles/mau5trap/locations.js`), integration metadata, report identity, email identity, locale, currency, timezone, scouting fixtures, fan-demographic fixtures, operations fixtures, root admin, DB selection.

**Principle compliance check:** the mau5trap intelligence is intact and must remain the default profile's data — externalize, never remove. Every audit-named hardcoding (R01–R33) was re-confirmed present in source.

## 17. External-data dependency findings

| Provider | Runtime dependency | Cached | Failure behavior | Stored persistently | Notes |
|---|---|---|---|---|---|
| Groq | AI query, entity audit, PDF insights | yes (varied TTLs) | dev: fabricated 200; prod: error | no | paid; no per-user quota |
| Google KG | entity audit, google-kg route | yes | silent fallback chain | no | paid; key from env |
| Wikipedia | artist detail enrichment, audit | 24h | `console.warn`, nulls | no | best-behaved module (null-over-guess) |
| Discogs / Genius / Fandom | entity audit | 2wk / ∞ / per-call | silent degrade | no | Genius cached forever |
| Spotify/IG/TM/YT/Twitter/TikTok | gated behind `USE_REAL_DATA` (off) | n/a | try/catch → mock | no | 2/29 artist coverage; IG cross-artist leak |
| Basemap tiles | frontend map | n/a | watermark "API KEY REQUIRED" | no | keyable via profile/env, documented |

- **Technical architecture risk:** silent degradation to mock with no `source` flag on responses (F-6) is the main one; unbounded paid refresh (F-9); indefinite caches (Genius) will serve stale data as fact.
- **Commercial/legal verification needed (flagged, not concluded):** redistribution of provider-sourced data (Knowledge Graph images/entity data, Discogs, Genius, Fandom content) inside paid reports/API outputs requires provider-terms review before commercial distribution. This is a terms-of-service question, not a code question; it belongs on the before-paid-production checklist for counsel, not in the codebase.

## 18. Reports / export findings

- **Generation is real** (CSV 200, label PDF 200 `1635B`, artist monthly PDF 200 `78KB`, all verified; export RBAC enforced: artist label-wide 403, own-artist 200).
- **Not label-aware:** "mau5trap Intelligence Report", "Generated by mau5trap OS v5.0", `#00FF00`, "MAU5TRAP INTELLIGENCE • CONFIDENTIAL" (verified `reports.js:149,175`, `monthlyReport.js:45,54,446`, `charts.js` greens). Filenames embed artist names (safe after HIGH-6's execFile fix).
- **No persistence:** no report records, no history, no regeneration guarantees; cron writes `reports/<YYYY-MM>/` lazily, nothing catalogs it. Temp-file/stored-file isolation for multi-customer does not exist (single filesystem root).
- **Reproducibility:** projections regress synthetic random data, so two runs of the same report can disagree — fine for demo, disqualifying for customer-facing "reports of record".
- **Response:** label-aware identity via profile (with 4-LABEL); provenance flags; deterministic data sources before paid reports. Storage/report registry can wait.

## 19. Database / schema findings

- SQLite with `sync({ alter: true })` on every boot — no migrations, no indexes beyond PKs/unique email, no FKs (Stats.artistId → nothing), `Artist.data` is an opaque JSON blob (unqueryable), `pageAccess`/`artistAccess` polymorphic strings, `resetTokenExpiry` epoch-as-string.
- **Postgres:** dialect switch exists (`DB_DIALECT`/`DATABASE_URL`) but is **unverified** (documented); `pg` driver present.
- **Must happen before real customers:** (1) migrations (knex/umzug/sequelize-cli — anything but boot-time alter); (2) the label-ownership decisions in §7-8; (3) persist-or-demo decision for in-memory stores (F-5); (4) ID conventions (§6). **Can wait:** Postgres itself (SQLite is adequate for a dedicated pilot instance), indexes (tiny datasets), seed/demo separation mechanics (profiles will own this).
- Backup/restore: nothing automated; single file makes the runbook trivial for dedicated instances — write it before first pilot.

## 20. Operations findings

- **Health:** `/health` is a static literal (no DB check) — fine for liveness, insufficient for readiness.
- **Graceful shutdown:** correct (SIGTERM/SIGINT + rejection backstops, verified in `server.js`).
- **Jobs:** one cron, explicit registration, `SCHEDULE_JOBS=false` honored; global (not label-scoped); monthly job fires the PDF path — verified working.
- **Deployment truth:** PM2 config broken (F-8); `PRODUCTION_DEPLOYMENT.md` describes a path that cannot work as written.
- **Config:** single env module with fail-fast JWT secret (good); `.env.example` vs `.env.prod.template` disagree (documented: prod template omits `GROQ_API_KEY`, includes unread `OPENAI_API_KEY`).
- **Missing (before paid):** structured request logs with IDs, metrics, alerting, backup/restore drill, secrets management beyond env vars, support diagnostics. **Do not build now** beyond request-ID logging.

## 21. Security / productization findings

Phase 3 fixed the criticals (verified in code and tests). What remains for *productization*, tied to code:

- **Authorization:** inline role checks everywhere instead of a policy layer (acceptable now, sprawling later); pageAccess unenforced server-side (documented, fine while backend authorization remains authoritative); F-1/F-2 are the live gaps.
- **Customer isolation:** none needed for dedicated instances; impossible for shared (§8).
- **Secret boundaries:** operator env vars OK; no customer secrets exist yet — keep it that way until the label-credential decision (§14).
- **Sensitive logging:** token redaction present (verified); err.message no longer leaks; AI prompt logging of token counts only.
- **Exported data:** PDFs/CSVs contain full roster financials; export guard is the only control — adequate for dedicated pilot; needs audit events before paid.
- **Admin capabilities:** root-admin rule hardcodes a mau5trap email (label coupling in an authz rule); override-admin token has no `id` (documented debt).
- **Destructive actions:** F-2 guards; no soft-delete/undo anywhere; frontend has two-step confirms (good).
- **Dependency advisories:** 2 moderate React Router 6, honestly reported, deferred with a trigger (correct handling).

## 22. Frontend ↔ backend contract findings

The 4C tracing discipline held up well under probing. Confirmed contract breaks:

| # | Path | Finding | Severity |
|---|---|---|---|
| C-1 | AdminPage edit → `updateUser` → `PUT /v3/users/:id` | **Sends `artistAccess`; backend drops it; UI shows success** (F-1) | MAJOR |
| C-2 | AdminPage delete → `DELETE /v3/users/:id` | UI offers delete on root/self; backend permits it (F-2) | MAJOR |
| C-3 | ArtistsPage create → duplicate name | 200-with-warning treated as success; invisible duplicate | MODERATE |
| C-4 | ArtistDetailPage after restart | List shows artist; detail 404s (F-3) | MAJOR |
| C-5 | CommandConsole → `/v3/ai/query` (no key, dev) | Fabricated answer rendered as a real answer; only `source:'fallback'` marks it | MODERATE (badged in UI?) — partially mitigated by `source` field |
| C-6 | MarketingPage wizard → `POST /v3/marketing/campaigns` | "Created" campaign is never readable; stats panel is a different fixture | MODERATE (badged PROTOTYPE) |
| C-7 | IntegrationsView → connect | Mock connect reported as real connection; quota is random | MODERATE |
| C-8 | Settings AI → `/v3/ai/providers` | Absent route, handled exactly as designed | Not a defect |
| C-9 | pageAccess end-to-end | Now correct: create persists, edit round-trips, `/me` agrees (verified like 4C's F22) | Fixed class |
| C-10 | Dashboard KPIs, exports, charts, map | Verified consistent with served payloads; chart re-skin works around backend hex (E-5, documented) | Not a defect |

The pattern from the pageAccess bug generalizes: **every Admin/roster write should have a read-back round-trip test in the snapshot suite**, as the 4C pageAccess tests now do.

## 23. Commercial deployment thought experiment

### Scenario A — small independent label, dedicated deployment, 5 staff, 50 artists
- **Works today:** app boots; auth, roster viewing, dashboards, reports, exports, AI console all function on the mau5trap dataset; frontend re-skins with zero generic edits (verified Example Records gate).
- **Breaks:** their roster requires swapping `mock/artistData.js` + DB (source operation); mau5trap intelligence leaks everywhere backend-side (§16); created artists 404 after restart (F-3); A&R/sales work vanishes on restart (F-5); PM2 path broken (F-8).
- **Leaks:** mau5trap names in PDFs, emails, AI answers, search prefixes, benchmarks, banner.
- **Requires source edits:** ~20 files (brand audit §12 list — accurate).
- **Requires schema changes:** none for the demo path.
- **Requires operational changes:** file-based DB swap, single-instance pm2/systemd, password rotation for seeded accounts.
- **Verdict:** feasible only after the 4-LABEL externalization; then genuinely credible.

### Scenario B — mid-sized label, 40 staff, 500 artists, API integration, customer-owned credentials
- **Works today:** user CRUD at that scale; role model; exports.
- **Breaks:** no API keys/service accounts (§13); no usage metering (§12); no per-user cost limits (F-9); integrations are operator-env globals, not customer-owned (§14); in-memory state (F-5); artist split-brain (F-3); no invitations, no deactivation, no audit trail (§9/§10); list pagination is in-memory slicing over DB∪mock unions (500 artists fine; 50k not).
- **Leaks:** AI/integration spend attributable to no one; permission changes invisible.
- **Requires source edits:** credential model, metering middleware, integration ownership, persistence of stores.
- **Requires schema changes:** yes — api_keys, usage events, audit events, persisted stores.
- **Verdict:** blocked on §25 items; realistic after them.

### Scenario C — two unrelated paying labels on one operator
- **Works today:** nothing shared safely. Only as two fully separate instances (2× Scenario A) — and even that needs distinct working directories or a config edit because the DB filename is hardcoded identically.
- **Breaks:** everything isolation: one DB, one memory space, one cache, one cron, one AI context, one integration set.
- **Leaks:** total, if ever attempted on one instance.
- **Requires:** the ownership model first (§7-8). Do not attempt before. With dedicated instances per label, Scenario C is an operations concern, not an architecture one.

## 24. Cost-of-deferral matrix

| # | Decision / fix | Now | Later | Why |
|---|---|---|---|---|
| 1 | Backend label profile seam (4-LABEL): datasets, intelligence, identity, root admin, DB selection | **MEDIUM** | **VERY HIGH** | Every new feature written against literals adds retrofit surface; with customer data it becomes a migration + contract change |
| 2 | Ownership rule for new code (no module-level label literals; owner column on new owned tables) | **LOW** | **VERY HIGH** | Convention + grep rule now; archaeology later |
| 3 | Persist-or-demo decision for A&R/sales/campaigns/integrations | **LOW** (decision) / MEDIUM (persist) | **VERY HIGH** | Semantics freeze under customer use; retrofit = data model under pressure |
| 4 | CRUD lies: F-1 artistAccess, F-2 delete guards, F-4 duplicate 409, F-7 validation | **LOW** | **MEDIUM** | Small now; each new consumer cements the lie |
| 5 | Artist repository unification (F-3) | **LOW-MEDIUM** | **HIGH** | Data reconciliation after real rosters exist |
| 6 | Audit event table + emit points | **LOW** | **HIGH** | Hours now; unrecoverable history later |
| 7 | Request-ID + usage-record seam | **LOW** | **HIGH** | Middleware now; attribution archaeology later |
| 8 | Auth principal seam (user JWT vs future API key) | **LOW** | **HIGH** | Cheap abstraction before external integrators exist |
| 9 | Provenance flags (`source: live/mock/fixture/fallback`) | **LOW-MEDIUM** | **HIGH** | Convention now; trust repair later |
| 10 | Deployment truth: PM2→server.js, DB_STORAGE env, instances:1 | **LOW** | **MEDIUM** | Paper fixes now; incident later |
| 11 | Per-user cost quotas on AI/refresh endpoints | **LOW-MEDIUM** | **HIGH** | Before external users; billing disputes after |
| 12 | Migrations instead of `sync({alter:true})` | **MEDIUM** | **HIGH** | Before customer DBs exist; mandatory by paid production |
| 13 | OpenAPI from API_INVENTORY | **LOW-MEDIUM** | **MEDIUM** | Needed for external integrators (Scenario B) |
| 14 | ID convention (prefixed/collision-free) | **LOW** | **VERY HIGH** | IDs are forever |
| 15 | Multi-tenant schema (tenant_id everywhere) | **HIGH** | n/a | **Do not build yet** — dedicated-first covers the near term |
| 16 | Postgres | MEDIUM | MEDIUM | Before paid production, not before pilot |
| 17 | SSO/OIDC/SAML/SCIM | HIGH | HIGH | Wait for a customer to ask |
| 18 | Second AI provider + router UI | MEDIUM | MEDIUM | Seam exists; build on demand |
| 19 | BYOK credential vault | HIGH | HIGH | Not before customer credentials exist |
| 20 | Event bus / webhooks / microservices / k8s | VERY HIGH | — | **Do not build** |

## 25. MUST DESIGN / FIX NOW (cheap now, expensive later)

1. **Label profile seam decision + skeleton (4-LABEL, backend):** one active-label resolution (env-selected), owning datasets, intelligence config, identity outputs, root admin email, DB file — mau5trap values moved in verbatim as the default profile. This is the single highest-value item; it converts Scenario A from "source edits" to "configuration".
2. **Ownership convention for new code:** no new label literals outside profile/data; any new owned table gets an owner column. Add a grep rule to the existing static-gate family.
3. **Fix the four CRUD lies:** F-1 (artistAccess one-liner), F-2 (delete guards), F-4 (409 on duplicate artist), F-7 batch (vote-direction enum, ghost-sales 400, password min length, malformed-JSON 400).
4. **Unify artist reads through the repository** (F-3) so DB-persisted artists survive restarts on every route.
5. **Persist-or-demo decision** for A&R submissions, sales, campaigns, integration connections. Persisting is two or three small Sequelize models; the *decision* is the urgent part.
6. **Audit event table + emit on**: user create/update/delete, permission change, artist create/archive/restore, export, integration connect/disconnect.
7. **Deployment truth:** ecosystem.config.js → server.js + instances 1; `DB_STORAGE` env; reconcile `.env` templates.
8. **Provenance flag convention** on intelligence endpoints.

## 26. BEFORE FIRST EXTERNAL PILOT

1. Request-ID middleware + user-attributed request logs; usage-record seam at AI/audit spend points.
2. Per-user quotas on `ai/query` and `entity-audit?refresh=true`.
3. Password policy + complete the reset flow (redeem route) or remove the UI affordance.
4. Error-envelope normalization (one shape; malformed JSON → 400).
5. API_INVENTORY → minimal OpenAPI/reference; one-paragraph versioning/compatibility policy.
6. Health readiness (DB-aware) + backup/restore runbook for the SQLite file.
7. Root admin + seeds sourced from the label profile (no mau5trap email in authz rules; no documented weak default passwords on customer boots).
8. Read-back round-trip tests for every admin/roster write (extend the 4C pageAccess pattern).

## 27. BEFORE ACCEPTING PAYMENT / PRODUCTION DATA

1. Postgres verified + real migrations; no `sync({alter:true})` against customer data.
2. API keys / service accounts with scopes, expiry, revocation, per-key usage attribution (§13 seam first).
3. Audit-log surfacing (even admin-only read) + token revocation or short-expiry + refresh.
4. Per-customer rate limits and cost ceilings; AI/external spend attributable and capped.
5. Provider-terms review for redistributed third-party data in paid outputs (counsel, §17).
6. Secrets management beyond plain env; integration credentials as label-owned records.
7. Backup/restore drill executed; support diagnostics (request IDs) wired through logs.
8. Deactivation/invitation lifecycle for staff users.

## 28. SAFE TO DEFER

- Postgres itself (pilot can run SQLite on a dedicated instance).
- OpenAPI completeness beyond a reference doc; pagination hardening; sorting/filtering expansion.
- Second AI provider implementation and provider-selection UI (seams already correct).
- Report registry/history storage; asynchronous report jobs.
- Real OAuth flows for integrations (mock is honestly labeled).
- SSO readiness work beyond keeping identity email-keyed.
- Bundle-size code splitting and React Router 7 evaluation (already queued for 4D).

## 29. DO NOT BUILD YET

- **Shared multi-tenant schema / tenant_id everywhere** — dedicated-first covers the near term; the ownership model preserves the path.
- **Billing, plans, Stripe, invoicing, entitlement machinery** — no customer entity exists; add the anchor first, much later the meters.
- **SSO / SAML / SCIM / enterprise provisioning** — zero demand evidence.
- **BYOK / customer credential vaults** — until a customer owns a credential.
- **Event buses, webhooks, microservices, Kubernetes** — nothing in the load profile or org size justifies them.
- **A general provider-router abstraction with N adapters** — one adapter + injection point is the right size today.
- **A policy-engine RBAC framework** — the current checks are few and correct; consolidate only when permission count grows.
- **Async report infrastructure** — generation is fast and on-demand.

## 30. Proposed minimum commercial architecture

```
Dedicated instance per label (process + SQLite/Postgres file + port)
  └─ env LABEL_SLUG → ActiveLabelProfile (NEW backend seam)
        ├─ datasets:      roster, seeds, operations, scouting, demographics (mau5trap values = default)
        ├─ intelligence:  search prefixes, knowledge sources+parsers, social mappings,
        │                 benchmarks, AI system context + fallback copy
        ├─ identity:      report titles/accent, email sender/templates, chart colors, logger/banner
        ├─ rootAdmin:     email/flag (replaces auth.js:173 literal)
        └─ db:            storage path / connection selection
  ├─ API (unchanged /v3 surface)
  │     ├─ auth: user JWT today; resolvePrincipal() seam → API keys later
  │     ├─ middleware: request-id, per-user quota on spend endpoints, usage record hook
  │     └─ provenance: source: live|mock|fixture|fallback on intelligence payloads
  ├─ Persistence (decide per store): users, artists ✓ DB today;
  │     + A&R submissions, sales, campaigns, integration connections → small models
  │     + audit_events (actor, action, target, ts, meta)  ← new, append-only
  ├─ AI: aiService → provider client (Groq adapter today; registry later)
  │     → label profile supplies context
  └─ Frontend: existing brand layer (already correct) — profile slugs match backend
```

Everything in this diagram except `ActiveLabelProfile`, `audit_events`, the three middleware hooks, and the persisted stores **already exists**. That is the point: the gap is a seam, not a system.

## 31. Recommended sequence BEFORE continuing deep product development

1. **Land the CRUD truth fixes** (§25 item 3) — hours, kills the lying-success class Phase 4C started fixing.
2. **Take the persist-or-demo decision** (§25 item 5) — it determines the schema work that follows.
3. **Execute 4-LABEL (backend label profile)** with the ownership convention in force — the big one; converts Scenario A to configuration and unlocks honest second-label testing.
4. **Add audit_events + request-id/usage seams** — small, permanent leverage.
5. **Repair deployment truth** (PM2, DB_STORAGE, env templates).
6. **Then Phase 4D** as scoped in the 4C handoff (product decisions Q2/Q9/Q10/Q12, 4-AI provider route, code splitting) — it composes cleanly on top of the above and none of it conflicts.
7. **Only after a pilot label is real:** §26 pilot list.

---

## Final questions — explicit answers

1. **mau5trap application or reusable label platform?** Still fundamentally a mau5trap application on the backend; genuinely a reusable platform on the frontend. Transition is real but half-done.
2. **Can another label be provisioned without rewriting generic frontend code?** **YES** (verified: Example Records runs with zero edits outside `web/src/brand/`; static gate enforces it).
3. **Can another label be provisioned without rewriting generic backend code?** **NO.** ~20 files of label literals in generic code; no active-label resolution exists.
4. **Is dedicated-instance commercial deployment realistic with the current trajectory?** **YES**, after the 4-LABEL externalization plus the §25 fixes. The trajectory is correct and the distance is short.
5. **Would adding true multi-tenancy later require a destructive redesign?** **NO — if** the ownership conventions in §8 are adopted now (label-shaped domain, owner columns on new owned tables, collision-free IDs). **YES** if the codebase keeps hardening single-label assumptions.
6. **Does the current database have the right ownership boundaries?** **NO.** There are no ownership boundaries at all; there is also nothing mis-owned that would require destructive repair — the boundary is absent, not wrong.
7. **Are CRUD operations trustworthy enough for customer data?** **PARTIALLY.** Users: yes except F-1/F-2. Artists: no (F-3/F-4). A&R/sales/campaigns/integrations: no (volatile). All fixable at LOW cost now.
8. **Is RBAC trustworthy enough for multiple staff users?** **PARTIALLY** — authorization checks held under probing; permission editing silently fails (F-1), destructive user ops are under-guarded (F-2), and nothing is audited.
9. **Is the API structurally suitable for eventual external customers?** **PARTIALLY** — consistent enough to grow, missing keys/scopes/metering/docs; the seams for those are cheap now.
10. **Highest cost if deferred?** **The backend label/ownership profile (4-LABEL) with its ownership conventions** — MEDIUM now, VERY HIGH once customer data and integrations exist. Runner-up: the persist-or-demo decision for in-memory product state.
11. **What should explicitly NOT be built yet?** Multi-tenant schema, billing, SSO/SCIM, BYOK, event buses/microservices/k8s, N-provider AI router, policy-engine RBAC, async report infrastructure (§29).
12. **What should happen BEFORE Phase 4D?** The CRUD-truth fixes (F-1, F-2, F-4, F-7), the persist-or-demo decision, deployment truth — all small. 4-LABEL and the audit/usage seams can run as the first items *of* 4D per the 4C handoff's own ordering, but no new persistence-heavy or customer-integration features should precede them.

---

## FINAL VERDICT

REUSABLE LABEL PLATFORM FOUNDATION: **PARTIAL** (frontend PASS, backend FAIL today, path clear and short)

CRUD / DATA-INTEGRITY FOUNDATION: **PARTIAL** (users nearly there with two live defects; artists split-brain; product state volatile)

COMMERCIAL API FOUNDATION: **PARTIAL** (internally consistent, externally incomplete; seams cheap now)

DEDICATED-CUSTOMER DEPLOYMENT PATH: **NEEDS WORK** (4-LABEL + §25 items; then credible)

FUTURE MULTI-TENANT PATH: **NEEDS FOUNDATIONAL CHANGES** (ownership model absent; dedicated-first recommended; path preserved by §8 conventions)

HIGH-COST-OF-DEFERRAL ISSUES FOUND: **YES** (label/ownership seam; persist-or-demo decision; audit/usage/identity seams — all LOW-MEDIUM now, HIGH-VERY HIGH later)

SAFE TO CONTINUE TO PHASE 4D WITHOUT ARCHITECTURAL CORRECTIONS: **YES** — provided 4D begins with the §31 sequence (CRUD truth → persist-or-demo decision → 4-LABEL + seams), which matches the 4C handoff's own recommended order. It is NOT safe to build new persistence-heavy features or customer integrations before those corrections land.
