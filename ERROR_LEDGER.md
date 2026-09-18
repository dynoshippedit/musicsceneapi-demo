# ERROR LEDGER — mau5trap forensic pass (HEAD `9101746`)

**Repair update, 2026-09-18:** The user authorized repairs after the review. Read [REPAIR_RESULTS_2026-09-18.md](REPAIR_RESULTS_2026-09-18.md) for the current state. Sales schema, access/cache checks, AI errors, persistent Room/campaigns, forecasts, graph/map, form refresh and session verification have been repaired. The operator database was backed up and migrated with all original rows preserved; API 3000/UI 5173 are running the repaired code. Gates: 150 backend tests, 54 API checks, 9 brand checks, 8 browser workflows passed. External OAuth/contracts remain explicitly unavailable; other feature gaps are listed in the repair report. **The ledger and “no repairs” statements below describe the earlier audit, not current status.**


**Independent review update, 2026-09-18:** [APPLICATION_REVIEW_2026-09-18.md](APPLICATION_REVIEW_2026-09-18.md) adds RV-001 through RV-005 and qualifies earlier findings. RV-001 affects the current operator database: restart adds individual UNIQUE constraints to sales artist/month. RV-002 confirms AI cache authorization bypass; RV-003 confirms unauthorized royalty disclosure. RV-004 reproduces forecasts with incorrect history lengths; RV-005 reproduces invisible campaign errors. AI-004 is retracted below. `pageAccess` is intentionally navigation-only; missing artist authorization is the independently confirmed access defect. No product repair is claimed.

Evidence date: 2026-09-18. Runtime: disposable `PORT=4010` + Vite `4173` against `/tmp/mau5-forensic.sqlite`. Operator DB **not** written by this pass.

Severity: BLOCKER | CRITICAL | MAJOR | MINOR | DEBT  
Confidence: CONFIRMED | SOURCE-CONFIRMED | SUSPECTED | UNTESTABLE

Astra hypotheses were **re-verified independently**. Fixed items are listed at the bottom so they are not re-opened as live defects.

---

## Live defects

| ID | Sev | Conf | Summary | Evidence |
|---|---|---|---|---|
| **API-001** | MAJOR | CONFIRMED | `GET /v3/ai/providers` does not exist. Every console mount 404s. Chip still **SYSTEM DEFAULT · READY**. | Playwright failed[] 404 `/v3/ai/providers`; `web/src/ai/aiClient.js:16-19`; no route in `src/routes/ai.js` |
| **API-002** | CRITICAL | CONFIRMED | Campaign create returns `status:'created'` + `campaignId`; **nothing is stored**. Stats ignore the id. | Probe `campaign-created-lie` + `campaign-stats-not-the-create`; `src/routes/marketing.js:38-55` |
| **API-003** | CRITICAL | CONFIRMED | A&R Room **Submit Demo** writes store #1 (`POST /v3/anr/submissions`); room list reads store #2 (`GET /v3/anr/state`). Demo never appears in the room. | `AnrRoomView.jsx:136-140`; `anr.js` two stores; UI comment admits split-brain |
| **API-004** | MAJOR | CONFIRMED | Whiteboard / now-listening are **display-only**. Backend POSTs exist; React never calls them. Probe write is visible in UI until restart. | Shot `_anr.png` shows “forensic board” from API probe; no FE POST; `anr.js:346,357` |
| **API-005** | CRITICAL | CONFIRMED | Integration connect is mock OAuth (`mock_token_*`, message “Connected … (Mock)”). UI still shows Connected. | Probe `integ-connect-mock`; `integrations.js:137-154` |
| **API-006** | MAJOR | CONFIRMED | Scout is fixture + delay, not Spotify. Errors still say “Spotify Scouting Network”. | `src/integrations/scoutService.js`; probe `scout-mocked` |
| **API-007** | MAJOR | CONFIRMED | Operations + Fans are read-only profile fixtures. No create/update/delete routes. UI provenance badges (FIXTURE/MOCK) are honest; product still looks operational. | `operations.js:40-55`; `label.js:64-85`; crawl pages 200 |
| **API-008** | CRITICAL | CONFIRMED | `GET /v3/rights/contracts` returns `success:true` + fake `downloadUrl` even for unknown artist. No PDF. React never calls it. | Probe `rights-fake-success` body `Contract generated for Unknown Artist` |
| **API-009** | MAJOR | SOURCE-CONFIRMED | `POST /v3/reports/generate-all` returns “Reports generated successfully” even if every artist fails (`count:0`). No React caller. | `reports.js:115-132` |
| **API-010** | MAJOR | CONFIRMED | Forgot-password control **disabled**. `POST /v3/auth/reset-password` **404**. Forgot mints an unredeemable token. | Crawl button DISABLED; probe `reset-missing` 404; `LoginPage.jsx:43`; STEP7 decision |
| **API-011** | MINOR | SOURCE-CONFIRMED | Logout is client-only. `DELETE /v3/auth/me` unused. | `Sidebar` vs `auth.js` |
| **API-012** | MAJOR | SOURCE-CONFIRMED | Entity-audit **response contains** issues/AI analysis; React **does not render** them. | `EntityAuditTab.jsx` vs `entityAuditService.js` |
| **AI-001** | CRITICAL | CONFIRMED | Missing Groq key in **development** → HTTP **200** `{success:true, source:'fallback', answer:'[Dev Fallback]…'}`. Console treats as success. Chip stays READY. | Probe `ai-query-no-key` status=200 source=fallback; `aiService.js:105-110`; `ai.js:97-102` |
| **AI-002** | MAJOR | SOURCE-CONFIRMED | Command console never sends `artistId`. Query context is always `{}` even though service can `findById`. | `CommandConsole.jsx:79`; `aiClient.js:41-49` |
| **AI-003** | MAJOR | CONFIRMED | `POST /v3/ai/analyze` is keyword substring + `confidence: 0.98`. Not Groq. React unused. Second 307 handler shadowed. | Probe `ai-analyze-keyword`; `ai.js:41-56,128` |
| **AI-004** | RETRACTED | DISPROVED for the stated mechanism | Timeout followed by late transport rejection does not produce an unhandled rejection: `Promise.race` attaches rejection handlers to every input. Cancellation remains an improvement, not a confirmed process-death fix. | `execution-validation/review-2026-09-18/source-evidence.json`, `AI-004-late-rejection-after-timeout` |
| **AI-005** | MINOR | CONFIRMED | Provider chip always READY (404 catalogue + fallback 200). | Shots `02-dashboard.png`, `_intelligence.png` |
| **AI-006** | MAJOR | SOURCE-CONFIRMED | `GET /v3/artists/:id/entity-audit` has **no** `hasArtistAccess` (unlike monthly-sales). | `artists.js:239` vs `257` |
| **AI-007** | DEBT | SOURCE-CONFIRMED | Usage is a 100-entry log ring, not metering. Entity `ai_call` counted even on stub. | `usageService.js`; `entityAuditService.js:78-114` |
| **GRAPH-001** | MAJOR | CONFIRMED | 0/29 roster `collaborations` are non-empty. Graph is 29 unlabeled orbiting dots, 0 edges. Honest renderer, **empty relationship data**. | `mock/artistData.js`; shot `_intelligence.png` |
| **GRAPH-002** | MAJOR | CONFIRMED | No node labels, click, hover, or navigation (legacy drew names). | `NetworkGraph.jsx`; vs `mau5trap-frontend-connected.html:405` |
| **GRAPH-003** | MINOR | SOURCE-CONFIRMED | Layout is fake orbit by array index, not force/geo/collab clustering. File comment “physics intact” is false. | `NetworkGraph.jsx:47-73` |
| **CRUD-001** | CRITICAL | CONFIRMED | A&R store #2 (demos, ratings, whiteboard, listening) is **process memory**. Restart wipes it. Room UI is this store. | `inMemoryStores.js`; `anr.js:322-475`; durability tests omit demos |
| **CRUD-002** | CRITICAL | CONFIRMED | Campaigns never persist. | See API-002 |
| **CRUD-003** | CRITICAL | CONFIRMED | Integration connection map is memory; ADMIN override JWT has **no `id`** so store key can be `undefined`. | `integrations.js`; `auth.js:74-79` |
| **CRUD-004** | MAJOR | SOURCE-CONFIRMED | Sales upsert is `findOne` + `save`/`create` **without a transaction**. Concurrent same-month create → 500. | `analytics.js:113-119` |
| **CRUD-005** | MAJOR | SOURCE-CONFIRMED | Artist archive/image/restore RMW whole `data` JSON; last writer wins. | `artistRepository.js:257-277` |
| **CRUD-006** | MAJOR | SOURCE-CONFIRMED | User PUT last-write-wins; no version. Email create is find-then-create. | `users.js:150-180` |
| **CRUD-007** | MINOR | SOURCE-CONFIRMED | No `affectedRows` check after `save()` (zero-row UPDATE possible). | artist/user save paths |
| **CRUD-008** | MAJOR | SOURCE-CONFIRMED | `initDB` swallows connect/sync failure and still serves. | `models/index.js:197-201`; `server.js:44-51` |
| **STATE-001** | MAJOR | SOURCE-CONFIRMED | Dashboard sale + marketing wizard `artistId` is mount-local; can POST an id no longer in the select after roster/access change. | `DashboardPage.jsx:97`; `MarketingPage.jsx:40-44` |
| **STATE-002** | MAJOR | SOURCE-CONFIRMED | `useAiProviders` module cache survives logout/login, token-agnostic. | `web/src/ai/useAiProviders.js:10-23` |
| **STATE-003** | MAJOR | SOURCE-CONFIRMED | Paid entity-audit refresh can show previous platforms + `refreshError`. | `EntityAuditTab.jsx:23-41` |
| **STATE-004** | MAJOR | SOURCE-CONFIRMED | Nav/`PermissionRoute` trust `localStorage` user until `/me`. Spoofed `role`/`pageAccess` shows chrome; APIs still 403. | `AuthContext.jsx:7-19`; crawl artist `/admin` ACCESS DENIED (API still safe) |
| **AUTH-001** | CRITICAL | SOURCE-CONFIRMED | `pageAccess` is **frontend visibility only**. Over-grant mounts pages and fires APIs. Backend authorizes by `role`/`artistAccess`, not pageAccess. | `users.js` comments; `permissions.js` |
| **AUTH-002** | CRITICAL | SOURCE-CONFIRMED | Auth DB revalidation **fails open** on Sequelize error (token claims used). | `src/routes/context.js:81-84` |
| **AUTH-003** | MAJOR | SOURCE-CONFIRMED | ADMIN_EMAIL override JWT omits `id` → `/me` 404, integrations keyed `undefined`. | `auth.js:74-79` |
| **AUTH-004** | MAJOR | CONFIRMED | Password reset unredeemable. | API-010 |
| **AUTH-005** | MAJOR | SOURCE-CONFIRMED | Entity-audit skips artistAccess. | AI-006 |
| **PARITY-001** | MAJOR | CONFIRMED | No in-app A&R player (legacy UniversalPlayer). | crawl `_anr.png`; no media component |
| **PARITY-002** | MAJOR | SOURCE-CONFIRMED | Entity-audit narrative (issues, AI, schema, wiki, platform URLs) not shown. | API-012 |
| **PARITY-003** | DEBT | CONFIRMED | No finance UI. Backend royalties/contracts unconsumed (and contracts lie). | API-008 |
| **PARITY-004** | DEBT | CONFIRMED | No generate-all / monthly PDF UI. | API-009 |
| **PARITY-005** | MINOR | CONFIRMED | Graph name labels gone vs legacy. | GRAPH-002 |
| **TEST-001** | BLOCKER (process) | CONFIRMED | Root `npm test` never loads `web/src`. 143 green ≠ React workflows. | `package.json` test glob |
| **TEST-002** | MAJOR | CONFIRMED | Snapshot catalogue historically pinned broken clients (`amount` sales, `{}` vote). Byte-parity ≠ product correctness. | `tests/support/cases.js` |
| **TEST-003** | MAJOR | CONFIRMED | `verify:hermetic` sales 200 without readback; **pins A&R split-brain as preserved**. | `verify_phase2.js` |
| **TEST-004** | MAJOR | CONFIRMED | Frontend gate is nav/KPI/brand; does not log sale, vote, graph edges, or persist. | `web/validation/gate.mjs` |
| **VIS-001** | MINOR | CONFIRMED | Geo map tiles watermarked **API KEY REQUIRED** (Carto). | `02-dashboard.png` |
| **VIS-002** | MAJOR | CONFIRMED | Intelligence “ROSTER NETWORK” with no edges/labels. | `_intelligence.png` |
| **EXT-001** | MAJOR | UNTESTABLE live | Social `USE_REAL_DATA=false` default. Mapping covers 2/29 artists. IG/TikTok ignore per-artist identity if enabled. | `integrations/*.js`; `.env.example` |
| **EXT-002** | MINOR | SOURCE-CONFIRMED | Wikipedia CLIENT_ID/SECRET unused; placeholder access token can break public Wiki. | config vs `modules/entityAudit.js` |

---

## Astra hypotheses — independent disposition (do not re-open as live)

| Hypothesis | Disposition at `9101746` |
|---|---|
| Royalty malformed kills process | **FIXED** — probe 400, `/health` 200 |
| Artist persist false 200 / success audit on fail | **FIXED** for create/archive/image (500, no audit on fail) |
| Concurrent A&R votes lost | **FIXED on SQLite** — probe two users → `votes=2`. **Postgres still unlocked** (CRUD-004 class) |
| Dashboard LOG SALE `amount`/`date` | **FIXED** — Playwright POST `{"artistId":"art_attlas","month":"2026-03","revenue":50}`; DB row exists |
| Artist image draft A→B | **FIXED** — `useApiQuery` clear + `shown.id` + `key={shown.id}` |
| Stale previous-artist UI on 403 | **FIXED** — data nulled; ACCESS DENIED on restricted user crawl |
| NetworkGraph proximity edges | **FIXED** — collaboration `linked()`; remaining issue is **empty data** (GRAPH-001) |
| AI still `findMockById` only | **PARTIAL** — service prefers `findById`; **UI never sends artistId** (AI-002); mock fallback on DB miss remains |
| pageAccess object 200\|\|400 | **FIXED** — PUT object **400**, grant unchanged |

---

## Smallest tests that should exist (not implemented this pass)

1. Playwright: sale body intercept + SQL/GET readback.  
2. Vote `{}` → 400 **and** votes unchanged.  
3. Campaign POST then GET list / restart.  
4. `linked()` unit: collab pair vs proximity pair vs archived.  
5. `useApiQuery` identity change clears data.  
6. Groq timeout does not `unhandledRejection`.  
7. AI missing key is **not** HTTP 200 in any env the product ships.  
8. Entity-audit 403 for `artistAccess` miss.
