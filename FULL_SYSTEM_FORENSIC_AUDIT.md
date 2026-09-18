# FULL SYSTEM FORENSIC AUDIT

**2026-09-18 review correction:** This is the earlier audit record. [APPLICATION_REVIEW_2026-09-18.md](APPLICATION_REVIEW_2026-09-18.md) contains newer browser, source and database-schema evidence. Its sales-schema and authorization findings take priority. The AI-004 timeout-crash claims below were disproved by a late-rejection reproduction and must not be treated as a confirmed live blocker. No repairs were made in the review pass.

**Repository:** `/home/dino/mau5trap-repo`  
**HEAD:** `9101746dee32f7dade6a0814ddfe19d1c76e15c1` (`Close crash, vote-corruption, and stale-UI bugs from the full-tree re-read`)  
**Dirty tree:** clean (audit docs added after fingerprint)  
**Role of this pass:** authoritative error ledger. **No product repairs. No D0 commit. No Steps 1–13.**

Source of truth: current source + disposable runtime. Historical `*.md` handoffs are evidence, not proof.

Companion files: [ERROR_LEDGER.md](ERROR_LEDGER.md), [API_CONNECTION_MATRIX.md](API_CONNECTION_MATRIX.md), evidence in `execution-validation/forensic-2026-09-18/`.

---

## 1. Current repository state

| Item | Value |
|---|---|
| Branch | `master` (ahead of `origin/master` by 11) |
| HEAD | `9101746` |
| `git status` at pre-flight | clean |
| Operator DB at audit start/end | `mau5trap_v5.sqlite` size **196608** sha256 **`a71f9ec104d5bbcf66a471dbd03a1dac477403aac86aa2cf592c9f5a93aa919a`** mtime_ns `1789703513835023313` — **unchanged during this pass** |
| Prior contamination | A previous “make it run” session booted `node server.js` against the default file. Hash had already moved off the earlier `46afbd4aca…` / 184320 freeze. This audit **did not** write that file. |
| Live operator processes (untouched) | API `:3000`, Vite `:5173` |
| Disposable forensic | API `:4010` + Vite `:4173` + `/tmp/mau5-forensic.sqlite` |

## 2. Historical architecture reviewed

Read as **historical claims**: ARCHITECTURE_AUDIT, API_INVENTORY, FRONTEND_API_MAP (stale vs React), INTEGRATION_INVENTORY, SECURITY_AUDIT, TEST_COVERAGE_AUDIT, BACKEND_ARCHITECTURE, REFACTOR_PROGRESS, PHASE_3/4A/4B/4C/4CF handoffs and validations, COMMERCIAL_* audits, EXECUTION_GUIDE, NEXT_STEPS_PLAN, EXECUTION_RESULTS, DECISION_D0, STEP7 reset, DECISION_D12F, WORK_TREE, GAP_ANALYSIS.

Phase 4C/4CF “connected / commercial” language is **not** treated as certified. Several 4C known gaps (player, generate-all, reset) remain open.

Reference implementations inspected: `mau5trap-frontend-connected.html`, `mau5trap-production-api.js`, `Server v5.js`.

## 3. Exact validation environment

- Disposable API: `JWT_SECRET=forensic-audit-secret-32chars PORT=4010 DB_STORAGE=/tmp/mau5-forensic.sqlite SCHEDULE_JOBS=false GROQ_API_KEY= NODE_ENV=development USE_REAL_DATA=false`
- Disposable UI: `VITE_API_BASE_URL=http://127.0.0.1:4010` Vite 6.4.3 `:4173`
- Probe: `/tmp/mau5-forensic-probe.js` → **43/43 scripted API checks executed** (many are *positive detections of mock/lie*, not product-pass)
- Playwright Chromium crawl: login admin + artist role, all primary routes, log-sale intercept, screenshots
- Existing gates **not** used as conclusion: `npm test` 143 and `verify:hermetic` 54 were already green at HEAD; this pass explains why that is insufficient

## 4. Operator database safety

| | sha256 | size |
|---|---|---|
| Before forensic probes | `a71f9ec104d5bbcf66a471dbd03a1dac477403aac86aa2cf592c9f5a93aa919a` | 196608 |
| After | **identical** | 196608 |

All destructive writes targeted `/tmp/mau5-forensic.sqlite`. Disposable DB confirmed: 29 artists, sales rows including Playwright `art_attlas/2026-03/50`, `sub_1` votes=16 after directed vote.

## 5. Routes / pages tested

Crawled as admin (no React `pageerror`): `/login`, `/dashboard`, `/artists`, `/artists/art_deadmau5`, `/artists/art_rezz`, `/anr`, `/anr/scouting`, `/intelligence`, `/marketing`, `/fans`, `/operations`, `/settings/integrations`, `/settings/ai`, `/admin`.

As `tours@rezz.com`: `/admin` → ACCESS DENIED; `/artists/art_deadmau5` → ACCESS DENIED.

Every CommandConsole mount requested `GET /v3/ai/providers` → **404**.

## 6. User workflows tested

| Workflow | Result |
|---|---|
| Admin login | CONNECTED |
| Restricted artist login + RBAC | CONNECTED (403s correct) |
| Log sale from UI | CONNECTED — body `{artistId,month,revenue}` persisted |
| $0 sale | CONNECTED |
| Old sales keys | 400 Missing fields |
| Ghost artist sale | 404 |
| Omitted vote direction | 400, seed votes **15 unchanged**, then `up` → 16 |
| Concurrent two-user vote | both 200, stored votes=2 |
| Campaign launch | **LIE** created id, stats unaware |
| Integration connect | **MOCK** 200 |
| AI query no key | **200 fallback** in development |
| AI analyze | keyword 0.98 |
| pageAccess object PUT | 400, grant unchanged |
| Royalty object body | 400, process alive |
| generate-all array month | 400, process alive |
| Forgot / reset | forgot 200, reset **404** |
| Scout | mocked (0 hits for `test`) |
| Whiteboard POST (API only) | 200 memory; shown in Room UI; **no FE writer** |

## 7. API connectivity assessment

**Partial.** Core roster/auth/sales/exports/user CRUD and A&R **store #1** votes are wired.

False connections: campaigns, integrations, AI providers, A&R room submit vs list, scout-as-Spotify, operations/fans as live ops, rights PDF, generate-all success copy, AI fallback 200.

See [API_CONNECTION_MATRIX.md](API_CONNECTION_MATRIX.md).

## 8. AI / provider assessment

| Q | Answer |
|---|---|
| 1 Frontend send? | YES — `{prompt}` only |
| 2 Endpoint? | `POST /v3/ai/query` |
| 3 Auth? | JWT |
| 4 Service? | `aiService.query` → `groqClient.complete` |
| 5 Label profile? | System prompt from profile. **Artist context empty** (no `artistId`) |
| 6 Provider? | Groq only |
| 7 Model? | `GROQ_MODEL` or `openai/gpt-oss-20b` |
| 8 Real call? | Only with working key. This env: **no** |
| 9 Mock? | Dev fallback sentence; keyword analyze; scout fixtures |
| 10 Missing key? | Dev: **200 fabricated**. Prod: 500 |
| 11 Model reject? | Same catch as (10) |
| 12 Timeout? | 20s race; **loser promise can unhandled-reject and kill process** (AI-004) |
| 13 Honest UI? | 500 yes; fallback **no** |
| 14 Usage? | Log ring, not billing |
| 15 Kill process? | Timeout path **yes**; missing JWT at boot yes; missing Groq at boot **no** |

`findById` is preferred in `query()` at this HEAD. Live UI never exercises it.

## 9. Visual graph semantic assessment

HEAD **replaced proximity edges with collaboration `linked()`**. Expected edges from `mock/artistData.js` = **∅**. Actual = **∅**. Not a fabrication bug anymore.

Remaining: DATA (stub collabs), VISUAL (no labels), LAYOUT (orbit), INTERACTION (none). Screenshot: unlabeled dots, chip READY.

## 10. CRUD / persistence assessment

Durable SQLite: User, Artist, AnrSubmission (store #1), SalesEntry, AuditEvent.

Memory / lie: anrState (room), campaigns, userIntegrations, usage ring, NodeCache, operations/fans fixtures.

Audit emits **after** successful user/artist writes only; fire-and-forget.

## 11. Concurrency assessment

SQLite A&R votes: IMMEDIATE + BUSY retry — **reproduced 2/2**.

Unprotected RMW: sales upsert, user PUT, artist JSON document, demo ratings[], whiteboard.

Postgres vote path would not get SQLite IMMEDIATE semantics.

## 12. React state / routing assessment

FE-02 (previous artist body / image draft on B) **closed** at 9101746.

Remaining: sale/marketing stale `artistId`, AI provider module cache, paid audit mixed error, localStorage chrome spoof until `/me`.

No React page exceptions in crawl.

## 13. Auth / RBAC assessment

JWT + DB revalidation for `id` tokens. Restricted artist cannot list users or read other artists (**confirmed**).

Gaps: pageAccess not backend authz; fail-open on DB error; override token without `id`; no reset redeem; entity-audit missing artistAccess; self-delete/root-admin guards exist on reachable DELETE.

## 14. Legacy parity assessment

React **reconnected** orphan tabs (fans/marketing/ops/settings) and **fixed** workstation export (legacy `downloadReport` had zero callers). KPIs match API (legacy showed NaN + fake sublines).

Lost vs workstation: A&R player, entity-audit narrative, KG hero/zoom, graph labels, forecast/touring/brand/sustainability fields, password UI.

Never built in either UI: finance, generate-all, monthly PDF, RevenueBarChart.

## 15. External integrations assessment

Default `USE_REAL_DATA=false` → social stack mock. Scout always mock. Connect always mock token.

Potentially real with keys: Groq, Google KG, Wikipedia (public), Discogs, Genius, Fandom (public `deadmau5.fandom.com`), Spotify/IG/TM/YT/Twitter/TikTok **if** USE_REAL_DATA and mapping (2 artists). **UNTESTABLE** here without paid keys.

## 16. Reports / exports assessment

CSV/PDF export **CONNECTED** from Dashboard/Admin (timeframe fixed 30d). Generate-all / monthly PDF **no UI**. Generate-all can claim success at count 0. Rights downloadUrl is fake.

## 17. Demo vs real

| Surface | Class |
|---|---|
| Seeded roster / Wikipedia enrich | ACCEPTABLE DERIVED / UNTESTED EXTERNAL |
| Projections without 3 sales months | MISLEADING if read as actuals (synthetic linear) |
| Geography dots | ACCEPTABLE DERIVED from artist fields |
| Campaign plan / history | MISLEADING PRODUCT STATE |
| Integration Connected | MISLEADING PRODUCT STATE |
| Scout “Spotify” | MISLEADING |
| AI fallback 200 | MISLEADING |
| Fans/ops fixtures | CLEARLY DEMO (badged) |
| Graph with 0 edges titled network | MISLEADING empty intelligence |
| Map Carto watermarks | VISUAL (no tile key) |
| analyze confidence 0.98 | MISLEADING |

## 18. Portability assessment

Generic `src/routes` / `src/ai` / `src/services` had **no** mau5trap/deadmau5/Rezz string hits in this grep. Intelligence lives in `src/profile/labels/mau5trap.js` — correct direction.

Residual: Fandom host and AI systemContext are profile data (OK). Frontend default brand `mau5trap`. Fandom URL is still mau5trap-wiki shaped in profile.

## 19. Error-handling / process-stability

User-input 4xx paths tested (malformed JSON + request id, royalty object, generate-all array, bad pageAccess, omitted vote, old sales keys) **did not kill** `:4010`.

Residual **BLOCKER**: Groq timeout unhandledRejection (AI-004). `initDB` continues on DB failure (CRUD-008). Auth fail-open (AUTH-002).

## 20. Test / gate blind spots

MAJOR GAPS. Root tests are backend HTTP/unit. Snapshots can freeze broken clients. Verify pins split-brain. Gate does not click writes. No `linked()` / `useApiQuery` unit. See TEST-* in ledger.

## 21. Visual / UI defects

Console aesthetic is intact (black / neon / dense). Defects: Carto **API KEY REQUIRED** watermarks; unlabeled graph; READY chip on 404; generic kicker “Real-time label performance metrics” on every page; no player chrome.

## 22. Confirmed blockers

- **AI-004** process death on Groq timeout  
- **TEST-001** green `npm test` cannot see React  

(Plus commercial-truth blockers grouped as CRITICAL below — D0 cannot ignore them.)

## 23. Confirmed majors / criticals (product truth)

API-002/005/003, CRUD-001/002/003, AI-001, AUTH-001/002, GRAPH-001/002, PARITY-001/002, EXT default mock, API-008, STATE-001, AUTH-005.

## 24. Minor / deferred

Logout client-only, graph orbit, map tiles, Wikipedia unused OAuth env, usage ring, finance/generate-all UI absence, zero-row save, console leftover output.

## 25. Genuinely working

Admin/artist login; JWT artistAccess 403; roster list/detail/create/archive/restore/image; sales persist (including $0 and UI RECORD); SQLite A&R submission votes with direction; shortlist persist; user CRUD + pageAccess array write 400 on object; CSV/PDF export route; health + request ids before JSON parse; FE-02 stale artist body; concurrent sqlite votes.

## 26. Appear connected but are not

Campaign Launch; Integration Connect; AI READY; A&R Submit Demo (wrong store); Scout-as-Spotify; Operations/Fans as live ops; Command console “analyst” without artist context; entity-audit tab vs payload; graph “network”.

## 27. Remain mocked / simulated

Scout, campaign stats/history, ops, fans, integration OAuth, AI keyword analyze, A&R evaluate, AI dev fallback, projections synthetic, geography from mock roster fields, anrState seed demos.

## 28. Tests that must be added

See ERROR_LEDGER “Smallest tests”. Do not weaken 200\|\|400. Do not recapture snapshots of lies.

## 29. Smallest repair sequence

**Do not implement in this pass.**

1. **Stability:** Groq timeout `.catch`; never 200-fabricate AI in shipped env; keep 4xx process-alive tests.  
2. **Authz:** fail-closed DB revalidation option; `hasArtistAccess` on entity-audit; document pageAccess vs route auth.  
3. **False success:** campaigns 501 or persist; integrations not “Connected”; rights not fake download; generate-all not success at 0.  
4. **A&R truth:** one store or honest UI (room submit → room list); persist store #2 or label ephemeral.  
5. **Contracts:** drop/fix `/v3/ai/providers` 404 chip; send `artistId` from console or stop implying artist analysis.  
6. **State:** key sale/marketing selects to roster ids; clear provider cache on logout.  
7. **Graph data or copy:** fill collaborations **or** empty-state (no “network” of dots). Labels.  
8. **Parity (after truth):** player, entity-audit fields, reset redeem (product decision).  
9. **Tests:** Playwright sale/vote/pager; `linked()` unit; persistence readback; no contradictory statuses.  
10. Visual tiles key / watermarks.

Atomic checkpoints: (1), (3+4), (5+6), (7), (9). High risk: unifying A&R stores (UI + snapshot).

## 30. Can D0 be certified?

**NO.** D0 as “the product is what the UI claims, writes persist, process does not die, tests would catch lies” is not true. Several Astra crash/vote/sale items **are** fixed at this HEAD; that is necessary and not sufficient.

---

## 18 questions

1. **End-to-end connected?** PARTIAL.  
2. **Disconnected visible features?** Campaigns, Connect, AI providers/READY, Forgot, SET AS DEFAULT, room submit vs room list, whiteboard writes, finance/generate-all (backend only).  
3. **Contract mismatches?** `/v3/ai/providers` 404; campaign name dropped; two A&R vote schemas (each matches *its* handler, product disjoint); rights fake URL. Sales keys **match** at HEAD.  
4. **AI connected to Groq?** Code path yes; this runtime **fallback 200**; UI omits artistId.  
5. **Mock in “real” workflows?** Scout, campaigns, integrations, fans/ops, AI fallback, keyword analyze, empty graph, synthetic projections.  
6. **Graph semantically correct?** Edges = collaborations (PASS). Data empty; labels gone.  
7. **Lost legacy?** Player, entity-audit narrative, KG hero, graph labels, several detail fields, reset UI.  
8. **Lying writes?** Campaigns, mock connect, AI fallback, rights contracts, generate-all count 0, memory A&R room votes.  
9. **Corrupt / misattribute?** Auth fail-open; pageAccess over-mount; entity-audit no artistAccess; ADMIN override integrations `undefined` key; stale sale artistId.  
10. **Lost concurrent updates?** Sales upsert, user PUT, artist JSON, demo ratings. Votes OK on SQLite.  
11. **Malformed can kill?** Tested 4xx paths no. Groq timeout **can**.  
12. **Authz stale content?** Named artist 403 leak **fixed**. localStorage chrome spoof until `/me`.  
13. **Genuinely live integrations?** None proven live in this env. Wikipedia/Fandom public possible; Groq if key.  
14. **Demo only?** Scout, OAuth connect, campaigns, ops, fans, keyword AI, anrState seed.  
15. **Why green tests missed?** Backend-only, snapshot-of-broken, pins of split-brain, ranged statuses, no Playwright writes, no graph unit.  
16. **Before D0?** Kill AI 200-lie + timeout death; stop campaign/connect lies; A&R store honesty; tests that read back writes.  
17. **Can wait?** Player, finance UI, tile keys, orbit layout, usage billing, brand polish.  
18. **Smallest sequence?** §29 steps 1→3→4→5→9.

---

## FINAL STATUS BLOCK

FULL SYSTEM FORENSIC AUDIT: COMPLETE

CURRENT APP END-TO-END CONNECTED: PARTIAL

FRONTEND ↔ BACKEND CONTRACTS: PARTIAL

CRUD / PERSISTENCE TRUTH: PARTIAL

PROCESS STABILITY: FAIL

AUTH / RBAC: PARTIAL

AI RUNTIME CONNECTION: PARTIAL

EXTERNAL INTEGRATIONS: MOSTLY DEMO

NETWORK GRAPH SEMANTICS: PASS

LEGACY BEHAVIORAL PARITY: PARTIAL

REACT RESOURCE-STATE SAFETY: PASS

CONCURRENCY SAFETY: PARTIAL

TEST / GATE COVERAGE QUALITY: MAJOR GAPS

D0 VALIDATED CHECKPOINT READY: NO

REPAIR PASS REQUIRED BEFORE EXECUTION GUIDE: YES
