<!-- SEC Phase 2 authorization matrix — Security Auditor, 2026-09-29. -->
<!-- Branch: devteam/review-2026-09-29 · HEAD 111aa9d (src/ identical to 53b7404). -->
# Authorization Matrix — all routes, bound handlers, effective controls

**Counts (verified 2026-09-29):** 118 `app.METHOD(` registration statements
expand to **128 bound routes** (catalog.js `registerCrud` binds 5 statements x
3 models = 15 routes + 1 integrity). Of those, **4 are shadowed duplicates**
(users.js: POST /v3/users x3, PUT /v3/users/:id x2, DELETE /v3/users/:id x2) —
first registration wins in Express, all duplicates carry equivalent guards.
**124 unique effective routes.**

**Reading key:**
- Auth: `JWT` = composite authenticateToken (JWT verify + per-request DB
  revalidation: user exists, active, current role/artistAccess,
  sessionVersion — src/auth/index.js, src/routes/context.js).
- RL: `G` = global `/v3/` rate limiter (1000 req/hr, src/middleware/index.js).
- Roles: admin (explicit), grants (requireGrants = any non-empty
  artistAccess), artist-scoped (hasArtistAccess / scopeWhere / listWhere /
  checkScope), page (pageAccess).
- "dup#" marks shadowed registrations (not effective).

## auth.js — 6 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 1 | POST | /v3/auth/login | auth.js:95 | none (public) | — | — | manual: email+password present (401) | G |
| 2 | POST | /v3/auth/forgot-password | auth.js:191 | none (public) | — | generic 200, no oracle | email required | G |
| 3 | POST | /v3/auth/reset-password | auth.js:253 | none (public) | — | token = sha256 digest single-use; unified 400 | token format regex + password policy | G |
| 4 | DELETE | /v3/auth/me | auth.js:296 | JWT | self | req.user.id only | — | G |
| 5 | GET | /v3/auth/me | auth.js:321 | JWT | self | req.user.id only | — | G |
| 6 | POST | /v3/auth/change-password | auth.js:346 | JWT | self | bcrypt verify currentPassword; bumps sessionVersion | password policy | G |

## users.js — 8 registrations (4 effective)

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 7 | POST | /v3/users | users.js:68 | JWT | admin (inline) | self-elevation blocked: non-admin id param != user.id -> 403 | zod createUser (dup-reg w/o schema) | G |
| 8 | POST | /v3/users | users.js:130 dup1 | JWT | admin (inline) | same | — | G |
| 9 | POST | /v3/users | users.js:254 dup2 | JWT | admin (inline) | same | — | G |
| 10 | PUT | /v3/users/:id | users.js:150 | JWT | admin (inline) | password cannot be set here; role free-form string (SEC-009) | zod updateUser (pageAccess merged) | G |
| 11 | PUT | /v3/users/:id | users.js:268 dup1 | JWT | admin (inline) | same | — | G |
| 12 | DELETE | /v3/users/:id | users.js:207 | JWT | admin (inline) | self-delete blocked (409) | — | G |
| 13 | DELETE | /v3/users/:id | users.js:288 dup1 | JWT | admin (inline) | same | — | G |
| 14 | GET | /v3/users | users.js:241 | JWT | admin (inline) | passwordHash/sessionVersion stripped | — | G |

## artists.js — 9 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 15 | GET | /v3/artists | artists.js:54 | JWT | any | roster filtered by filterDataByAccess | — | G |
| 16 | POST | /v3/artists | artists.js:89 | JWT | admin (inline) | — | manual name/tier; id = name.toLowerCase(), whitespace stripped (no header chars) | G |
| 17 | POST | /v3/artists/:id/archive | artists.js:122 | JWT | admin (inline) | — | — | G |
| 18 | POST | /v3/artists/:id/restore | artists.js:146 | JWT | admin (inline) | — | — | G |
| 19 | PUT | /v3/artists/:id/image | artists.js:170 | JWT | admin (inline) | imageUrl stored as-is; never fetched server-side (no SSRF) | — | G |
| 20 | GET | /v3/artists/:id | artists.js:195 | JWT | any | hasArtistAccess(:id) -> 403 | — | G |
| 21 | GET | /v3/artists/:id/entity-audit | artists.js:244 | JWT | any | hasArtistAccess(:id) -> 403 | refresh=true literal | G |
| 22 | GET | /v3/artists/:id/monthly-sales | artists.js:269 | JWT | any | hasArtistAccess(:id) -> 403 | — | G |
| 23 | GET | /v3/artists/:id/development | artists.js:293 | JWT | any | hasArtistAccess(:id) -> 403 | — | G |

## label.js — 3 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 24 | GET | /v3/tours | label.js:42 | JWT | any | roster filtered by hasArtistAccess; artistId narrows within grants | — | G |
| 25 | GET | /v3/fans/demographics | label.js:66 | JWT | any | topMovers from granted roster only; demographics = profile fixture | — | G |
| 26 | GET | /v3/label/overview | label.js:99 | JWT | any | KPIs built from granted artistIds only | — | G |

## ai.js — 4 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 27 | GET | /v3/ai/providers | ai.js:21 | JWT | any | capability flags only, no data | — | G |
| 28 | POST | /v3/ai/query | ai.js:49 | JWT | any | aiService enforces hasArtistAccess; cache key = sha256(user id, role, grants, resolved context) | zod aiQuery | G |
| 29 | POST | /v3/ai/analyze | ai.js:50 | JWT | any | same as #28 | zod aiQuery | G |
| 30 | POST | /v3/ai/financial-analysis | ai.js:57 | JWT | any | acknowledgeNotAdvice opt-in required; hasArtistAccess in service | manual opt-in check | G |

## integrations.js — 7 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 31 | GET | /v3/integrations/status | integrations.js:47 | JWT | any | provider list only | — | G |
| 32 | POST | /v3/integrations/configure | integrations.js:92 | JWT | any | — | — | G |
| 33 | POST | /v3/integrations/oauth/callback | integrations.js:103 | JWT | any | — | — | G |
| 34 | POST | /v3/integrations/test | integrations.js:117 | JWT | any | — | — | G |
| 35 | POST | /v3/integrations/sync | integrations.js:123 | JWT | any | — | — | G |
| 36 | GET | /v3/integrations/test-limit/:service | integrations.js:129 | JWT | admin (inline) | — | — | G |
| 37 | GET | /v3/integrations/google-kg | integrations.js:143 | JWT | any | proxies user query to Google KG; response only, no fetch of user URLs | — | G |

## finance.js — 2 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 38 | POST | /v3/royalties/calculate | finance.js:39 | JWT | any | hasArtistAccess(artistId) -> 403; read-only calculator, not persisted | splits: finite [0,1], sum=1 | G |
| 39 | GET | /v3/rights/contracts | finance.js:94 | JWT | any | hasArtistAccess if artistId | 501 stub | G |

## anr.js — 7 routes (A&R pipeline, label-internal)

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 40 | POST | /v3/anr/submissions | anr.js:77 | JWT | admin (inline) | — | manual + URL scheme allowlist (http/https); PII encrypted at rest | G |
| 41 | GET | /v3/anr/submissions | anr.js:90 | JWT | admin (inline) | — | — | G |
| 42 | POST | /v3/anr/submissions/:id/vote | anr.js:145 | JWT | admin (inline) | one vote per user, signed int clamp +-1 | — | G |
| 43 | DELETE | /v3/anr/submissions/:id | anr.js:230 | JWT | admin (inline) | — | — | G |
| 44 | POST | /v3/anr/evaluate | anr.js:256 | JWT | admin (inline) | — | fixture response | G |
| 45 | GET | /v3/anr/scout | anr.js:281 | JWT | admin (inline) | — | fixture response | G |
| 46 | POST | /v3/anr/shortlist | anr.js:300 | JWT | admin (inline) | — | — | G |

## anrRoom.js — 7 routes (voting room)

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 47 | GET | /v3/anr-room/submissions | anrRoom.js:27 | JWT | admin (inline) | — | — | G |
| 48 | GET | /v3/anr-room/votes | anrRoom.js:32 | JWT | admin (inline) | — | — | G |
| 49 | POST | /v3/anr-room/submissions | anrRoom.js:39 | JWT | admin (inline) | — | — | G |
| 50 | POST | /v3/anr-room/vote | anrRoom.js:47 | JWT | admin (inline) | — | — | G |
| 51 | DELETE | /v3/anr-room/vote/:user | anrRoom.js:57 | JWT | admin (inline) | — | — | G |
| 52 | POST | /v3/anr-room/decision | anrRoom.js:67 | JWT | admin (inline) | — | — | G |
| 53 | POST | /v3/anr-room/reset | anrRoom.js:73 | JWT | admin (inline) | — | — | G |

## marketing.js — 3 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 54 | POST | /v3/marketing/campaigns | marketing.js:11 | JWT | any, but artistId grant or admin | hasArtistAccess(artistId) if set; admin required to create without artistId | enums (channel/status), name trim | G |
| 55 | GET | /v3/marketing/campaigns | marketing.js:26 | JWT | any | canRead(artistId) filter: grants or 'all'/admin | — | G |
| 56 | GET | /v3/campaigns/stats | marketing.js:30 | JWT | any | roster filtered by hasArtistAccess | — | G |

## reports.js — 3 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 57 | GET | /v3/reports/monthly/:artistId/:month | reports.js:64 | JWT | any | hasArtistAccess(:artistId) -> 403 | month regex YYYY-MM; filename via safeFilename | G |
| 58 | POST | /v3/reports/generate-all | reports.js:105 | JWT | admin (inline) | — | — | G |
| 59 | GET | /v3/exports | reports.js:163 | JWT | checkExportAccess: admin OR user with artistId grant | export artist-scoped; artistId interpolated into Content-Disposition (server-derived IDs, whitespace-stripped -> no header injection; SEC-010) | type enum (artists/royalties/pdf); month validated | G |

## operations.js — 3 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 60 | GET | /v3/operations/logistics | operations.js:40 | JWT | admin (inline) | label-internal fixture | — | G |
| 61 | GET | /v3/operations/assets | operations.js:46 | JWT | admin (inline) | label-internal fixture | — | G |
| 62 | GET | /v3/operations/contracts | operations.js:52 | JWT | admin OR manager (inline) | label-internal fixture | — | G |

## analytics.js — 3 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 63 | GET | /v3/analytics/geography | analytics.js:27 | JWT | any | roster filtered by hasArtistAccess | — | G |
| 64 | POST | /v3/analytics/sales | analytics.js:76 | JWT | any | hasArtistAccess(artistId) -> 403; amounts parsed decimal-string -> integer cents (no float) | artistId, month required; period YYYY-MM | G |
| 65 | GET | /v3/analytics/projections | analytics.js:150 | JWT | any | hasArtistAccess(artistId) if supplied | — | G |

## system.js — 1 route

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 66 | GET | /health | system.js:37 | none (public) | — | status/uptime only, no sensitive data | — | — |

## billing.js — 3 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 67 | POST | /v3/billing/checkout | billing.js:161 | JWT | admin (requireAdmin) | — | server-side Stripe price IDs only (no client price control) | G |
| 68 | POST | /v3/billing/webhook | billing.js:242 | none (public) | — | Stripe signature verified via constructEvent over raw body before any processing | signature | G |
| 69 | GET | /v3/billing/status | billing.js:264 | JWT | admin (requireAdmin) | — | — | G |

## oauth.js — 4 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 70 | GET | /v3/oauth/:provider/authorize | oauth.js:97 | JWT | requireAdminOrArtist (name only — checks identity, NOT role; per-handler resolveArtistId does the real scoping; SEC-004) | resolveArtistId: admin picks artistId (defaults 'all'); non-admin uses own grant scalar, may not pass artistId | provider allowlist | G |
| 71 | GET | /v3/oauth/:provider/callback | oauth.js:124 | none (public) | — | state = random, single-use, 10-min TTL; callback userId validated as admin | state/code validated; state must match | G |
| 72 | GET | /v3/oauth/status | oauth.js:163 | JWT | requireAdminOrArtist + resolveArtistId | status scoped to resolved artist | provider allowlist | G |
| 73 | DELETE | /v3/oauth/:provider | oauth.js:179 | JWT | requireAdminOrArtist + resolveArtistId | disconnect scoped to resolved artist | provider allowlist | G |

## catalog.js — 16 bound routes (registerCrud x 3 models + integrity)

Models: `recordings` (74-78), `releases` (79-83), `works` (84-88). Statements at
catalog.js:171/188/210/228/255, expanded per model; integrity at catalog.js:280.

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 74 | GET | /v3/catalog/recordings | catalog.js:171 | JWT | any | listWhere scoping | — | G |
| 75 | POST | /v3/catalog/recordings | catalog.js:188 | JWT | any | checkScope | zod model schema | G |
| 76 | GET | /v3/catalog/recordings/:id | catalog.js:210 | JWT | any | per-row hasArtistAccess | — | G |
| 77 | PUT | /v3/catalog/recordings/:id | catalog.js:228 | JWT | any | per-row hasArtistAccess | zod model schema | G |
| 78 | DELETE | /v3/catalog/recordings/:id | catalog.js:255 | JWT | any | per-row hasArtistAccess | — | G |
| 79 | GET | /v3/catalog/releases | catalog.js:171 | JWT | any | listWhere scoping | — | G |
| 80 | POST | /v3/catalog/releases | catalog.js:188 | JWT | any | checkScope | zod model schema | G |
| 81 | GET | /v3/catalog/releases/:id | catalog.js:210 | JWT | any | per-row hasArtistAccess | — | G |
| 82 | PUT | /v3/catalog/releases/:id | catalog.js:228 | JWT | any | per-row hasArtistAccess | zod model schema | G |
| 83 | DELETE | /v3/catalog/releases/:id | catalog.js:255 | JWT | any | per-row hasArtistAccess | — | G |
| 84 | GET | /v3/catalog/works | catalog.js:171 | JWT | any | listWhere scoping | — | G |
| 85 | POST | /v3/catalog/works | catalog.js:188 | JWT | any | checkScope | zod model schema | G |
| 86 | GET | /v3/catalog/works/:id | catalog.js:210 | JWT | any | per-row hasArtistAccess | — | G |
| 87 | PUT | /v3/catalog/works/:id | catalog.js:228 | JWT | any | per-row hasArtistAccess | zod model schema | G |
| 88 | DELETE | /v3/catalog/works/:id | catalog.js:255 | JWT | any | per-row hasArtistAccess | — | G |
| 89 | GET | /v3/catalog/integrity | catalog.js:280 | JWT | admin (inline) | label-wide catalog integrity | leaks err.message on failure (SEC-003) | G |

## royalties.js — 8 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 90 | POST | /v3/royalties/import | royalties.js:307 | JWT | admin (requireAdmin) | — | multer 5 MiB / 1 file; header alias map; numeric validation | G |
| 91 | POST | /v3/royalties/import/atvenu | royalties.js:693 | JWT | admin (requireAdmin) | — | multer 5 MiB / 1 file; venue stored verbatim (formula source -> SEC-001) | G |
| 92 | GET | /v3/royalties/merch-settlements | royalties.js:812 | JWT | any | per-artist inline scoping (grants or 'all') | artistId checked against grants | G |
| 93 | GET | /v3/royalties/summary | royalties.js:858 | JWT | any | per-artist inline scoping | artistId checked against grants | G |
| 94 | GET | /v3/royalties/lines | royalties.js:1033 | JWT | any | listRecords scoping | filter keys allowlisted | G |
| 95 | GET | /v3/royalties/settlements | royalties.js:1034 | JWT | any | listRecords scoping | filter keys allowlisted | G |
| 96 | PATCH | /v3/royalties/lines/:id/review | royalties.js:1071 | JWT | admin (requireAdmin) | review machine reported->reconciled->approved (+disputed/estimated) | reviewer + evidence | G |
| 97 | PATCH | /v3/royalties/settlements/:id/review | royalties.js:1072 | JWT | admin (requireAdmin) | same review machine | reviewer + evidence | G |

## directsales.js — 13 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 98 | POST | /v3/direct-sales/connect/authorize | directsales.js:133 | JWT | admin (inline) | — | — | G |
| 99 | GET | /v3/direct-sales/connect/callback | directsales.js:156 | none (public) | — | single-use state, 10-min TTL; encrypted token at rest | state validated | G |
| 100 | GET | /v3/direct-sales/connect/status | directsales.js:203 | JWT | any | — | exposes lastSyncError (may contain provider internals; SEC-008) | G |
| 101 | DELETE | /v3/direct-sales/connect | directsales.js:227 | JWT | admin (inline) | — | — | G |
| 102 | POST | /v3/direct-sales/sync | directsales.js:242 | JWT | admin (requireAdmin) | — | Stripe pull; payout persist idempotent on providerPayoutId | G |
| 103 | GET | /v3/direct-sales/mappings | directsales.js:360 | JWT | any — **NO artist scoping** (SEC-002) | none: returns all mappings (matchType/matchValue/artistId) | — | G |
| 104 | POST | /v3/direct-sales/mappings | directsales.js:377 | JWT | admin (requireAdmin) | — | matchType enum validated | G |
| 105 | DELETE | /v3/direct-sales/mappings/:id | directsales.js:408 | JWT | admin (requireAdmin) | — | — | G |
| 106 | GET | /v3/direct-sales | directsales.js:424 | JWT | any | scopeWhere artist scoping; __check denies grant violations | artistId checked against grants | G |
| 107 | GET | /v3/direct-sales/summary | directsales.js:464 | JWT | any | scopeWhere artist scoping | — | G |
| 108 | GET | /v3/financials/reconciliation | directsales.js:520 | JWT | any | scopeWhere + artist filter checked | period regex YYYY-MM; leaks err.message on 500 (SEC-003) | G |
| 109 | PATCH | /v3/direct-sales/:id/review | directsales.js:551 | JWT | admin (inline) | review machine | — | G |
| 110 | GET | /v3/financials/export | directsales.js:586 | JWT | checkExportAccess (admin OR artistId grant) | artist-scoped export | CSV formula injection (SEC-001) | G |

## monthlyclose.js — 16 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 111 | GET | /v3/financials/payouts | monthlyclose.js:89 | JWT | grants (requireGrants) | label-wide by design (cash evidence) | — | G |
| 112 | POST | /v3/financials/deposits | monthlyclose.js:113 | JWT | admin (requireAdmin) | — | strict: provider, amountCents int, date regex, idempotency on provider reference | G |
| 113 | GET | /v3/financials/deposits | monthlyclose.js:154 | JWT | grants (requireGrants) | label-wide by design | — | G |
| 114 | POST | /v3/financials/matches | monthlyclose.js:177 | JWT | admin (requireAdmin) | — | match IDs validated, one-sided match blocked | G |
| 115 | DELETE | /v3/financials/matches | monthlyclose.js:230 | JWT | admin (requireAdmin) | — | — | G |
| 116 | POST | /v3/financials/gaps/:id/annotate | monthlyclose.js:251 | JWT | admin (requireAdmin) | — | — | G |
| 117 | POST | /v3/financials/adjustments | monthlyclose.js:267 | JWT | admin (requireAdmin) | — | amounts decimal-string -> int cents | G |
| 118 | PATCH | /v3/financials/adjustments/:id/review | monthlyclose.js:303 | JWT | admin (requireAdmin) | review machine | — | G |
| 119 | POST | /v3/financials/commissions/contracts | monthlyclose.js:334 | JWT | admin (requireAdmin) | — | — | G |
| 120 | GET | /v3/financials/commissions/contracts | monthlyclose.js:391 | JWT | grants (requireGrants) | filtered by accessible artists | — | G |
| 121 | GET | /v3/financials/commissions/worksheet | monthlyclose.js:415 | JWT | any | checkArtist | — | G |
| 122 | POST | /v3/financials/expected-reports | monthlyclose.js:448 | JWT | admin (requireAdmin) | — | — | G |
| 123 | GET | /v3/financials/expected-reports | monthlyclose.js:471 | JWT | grants (requireGrants) | label-wide by design | — | G |
| 124 | GET | /v3/financials/mappings | monthlyclose.js:499 | JWT | grants (requireGrants) | label-wide by design | — | G |
| 125 | POST | /v3/financials/mappings/:id/approve | monthlyclose.js:520 | JWT | admin (requireAdmin) | — | — | G |
| 126 | GET | /v3/financials/statements | monthlyclose.js:537 | JWT | grants (requireGrants) | label-wide by design | — | G |

## sync.js — 2 routes

| # | Method | Path | File:line | Auth | Role | Artist/ownership | Validation | RL |
|---|---|---|---|---|---|---|---|---|
| 127 | POST | /v3/sync/* | sync.js:50 | JWT | admin (requireAdmin) | — | — | G |
| 128 | GET | /v3/sync/* | sync.js:81 | JWT | admin (requireAdmin) | — | — | G |

---

**Public routes (no JWT):** #1-3 (auth), #66 (health), #68 (billing webhook,
Stripe-signed), #71 (oauth callback, single-use state), #99 (stripe connect
callback, single-use state). All others require JWT.

**Admin-only mutations:** user mgmt, artist create/archive/restore/image,
imports, monthly close writes, review transitions, mapping writes, OAuth
connect, billing checkout/status, sync, report generation, catalog integrity.
