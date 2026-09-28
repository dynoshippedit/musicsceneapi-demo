# COMMERCIAL_FOUNDATION_RECHECK.md

**Date:** 2026-09-17 · **Repo:** `/home/dino/pulsegrid-repo` (branch `master`, HEAD `7efb44b` + uncommitted Phase 4C tree)
**Nature:** Independent adversarial recheck of `COMMERCIAL_PRODUCT_READINESS_AUDIT.md` (Kimi K3, 2026-09-17 02:25). No fixes implemented, no Phase 4D started, nothing committed. Exactly one new repository file: this one.
**Method:** every Kimi finding was re-traced from source AND re-reproduced live against a throwaway database (fresh SQLite in `/tmp/recheck-probe`, server on :3100, ~40 probes across two restart cycles). The operator's `pulsegrid_v5.sqlite` was never opened by the probe server (storage is a cwd-relative path; the probe ran from /tmp). Verified untouched at session end: mtime 01:39, size 167,936, unchanged.
**Repro environment:** Node v22.23.2, `npm test` → **127 pass / 0 fail / 27 suites** (exactly matches Kimi's claim), static portability gate `--self-test` → **23/23 pass** (re-run independently).

---

## 1. Executive verdict

**Kimi's commercial audit is materially trustworthy.** All seven headline findings were reproduced live, byte-for-byte where claims were specific (line numbers, stored values, status codes). Three of its claims are imprecise, one conclusion is understated by the audit itself, and one remediation premise is wrong in a way that makes the fix slightly larger than described — none of these change the audit's recommendations, and all are detailed below.

The repository is exactly what Kimi says: a well-disciplined single-label prototype with a portable frontend, a tested but pulsegrid-coupled backend, three live lying-success CRUD defects, split-brain artist persistence, and process-memory "product" state. The commercial gap is a small number of cheap seams, not a rewrite. Nothing found requires re-litigating the audit.

The one place this recheck is STRICTER than Kimi: ordinary Phase 4D feature work should not begin until the CRUD-truth pass lands, because two of the reproduced defects (silently dropped `artistAccess`; unguarded user deletion) sit on surfaces Phase 4C already shipped and 4D will build on.

---

## 2. Kimi audit reliability assessment

| Claim area | Independent result |
|---|---|
| Test suite 127 pass / 0 fail / 27 suites | **REPRODUCED EXACTLY** (own run) |
| F-1 artistAccess silently dropped by live PUT | **CONFIRMED live** (`PUT {artistAccess:'art_lumenveil'}` → `{success:true}`; read-back `'art_novakin'`) |
| F-2 reachable DELETE lacks self-delete/root-admin guards | **CONFIRMED live** (admin deleted root admin id=1 → root login 401; self-delete → 200) |
| F-3 API-created artists 404 on detail/archive after restart | **CONFIRMED live** (list total=1, detail/archive/restore/image all 404 post-restart) |
| F-4 duplicate artist name → success with divergence | **CONFIRMED live** (`POST {name:'lumenveil'}` on existing → 200) |
| F-5 A&R/sales/integrations/campaigns lost on restart | **CONFIRMED live** (sales [1000,2000,3000]→synthetic [10946892,…]; A&R 3→2 seeds; spotify disconnected; whiteboard reverted) |
| F-6 quotaUsed `Math.random()` per call | **CONFIRMED live** (two consecutive status calls, every service's quota changed) |
| F-7 validation gaps (sideways vote, ghost sales, 1-char password, malformed JSON 500, limit=abc, reset-password 404, free-text role) | **CONFIRMED live or code-certain** (all probed except ghost-sales and free-text role, both certain from code: no artistId check at `analytics.js:79-90`; zod `role: z.string().min(1)` with no enum at `src/validation/index.js:42` — fail-closed, so low severity) |
| F-8 PM2 entrypoint exits immediately | **CONFIRMED live** (`node production-api.js` → exit 0) |
| F-9 unbounded paid-provider spend | **CODE-CONFIRMED** (JWT-only, `refresh=true` bypasses cache, only global 1000/h/IP limiter); not runtime-probed (no Groq key in probe env) |
| Label-literal inventory (R01–R33 class) | **SPOT-CHECKED, ALL PRESENT** (48 pulsegrid hits across 28 `src/` files; prompts.js:37, aiService.js:133, monthlyReport.js:45/54/446, reports.js:149/175, auth.js:173, models seeds, config email default, integrations.js:69 KG prefix, entityAudit.js hardcoded `lumenveil.fandom.com`) |
| `ARTIST_MAPPINGS` 2/29 coverage; Instagram `getAccountData()` unscoped per artist | **CONFIRMED in source** (`integrations/index.js:12-30`, `:68`) |
| zod wired to exactly 2 write routes | **CONFIRMED** (grep: `aiQuery`, `createUser` only) |
| Stats table never written | **CONFIRMED** (`sync/masterLoop.js` is the only writer; unregistered per `src/jobs/index.js:7`) |
| Frontend gate 70/70 | **NOT re-run** (gate writes committed `phase4b-*.png` screenshots — documented side effect). Static `--self-test` 23/23 re-run; the gate file and 4C handoff evidence inspected. Accepted as previously verified. |
| AdminPage sends `artistAccess` in edit payload | **CONFIRMED** (`web/src/pages/AdminPage/AdminPage.jsx:58`) |

**Imprecisions found (do not change conclusions):**
1. "make the `:id` routes resolve through the same repository path as the list … one seam already used by the list" (§5 F-3 response) — **false as stated.** `GET /v3/artists` re-implements the DB∪memory union *inline* (`artists.js:51-58`) and never calls `artistRepo.findAllHybrid()`. The repository function exists but has **zero call sites**. The unification seam must be BUILT, not reused; the fix is slightly larger than "route through the existing path" (still LOW-MEDIUM cost).
2. The audit's §5 F-2 credits the shadowed duplicate with the self-delete guard and the `DELETE /v3/auth/me` route with the root-admin guard — both true — but doesn't state plainly that **no reachable route has either guard**, which it implicitly concludes correctly. Presentation nuance only.
3. Kimi's §6 error-envelope row counts four response shapes including `{error,message}`. Current source has **three** error shapes (`{error}`, `{error,details[]}`, `{error,path}`); no `{error,message}` pair exists anywhere in `src/routes/` (grep-verified this session). The normalization recommendation is unaffected.

**Understatement in Kimi's own finding (blast radius):** F-3 is wider than described. Not only API-created artists diverge after restart — **seeded/mock artists do too**. Live probe: archive `art_novakin` → 200; DB row persisted `tier:'archived'`; after restart the LIST shows `tier=archived` (reads DB) while DETAIL shows `tier=flagship` (reads memory). Archive/restore/image effects are silently non-durable for the detail view on every roster artist, not just created ones.

**Verdict: materially trustworthy. CONFIRMED with corrections as noted.**

---

## 3. artistAccess CRUD finding — **CONFIRMED**

**Trace (independent):**
- `AdminPage.jsx:58` builds edit payload `{ name, role, artistAccess, pageAccess }` → `updateUser()` → `PUT /v3/users/:id`.
- Reachable handler `src/routes/users.js:131-161` destructures `{ email, role, pageAccess, name, password }` — **no `artistAccess`** — then saves. Returns `{success:true}`.
- The shadowed duplicate at `:196-213` *does* assign `artistAccess` (`if (artistAccess) user.artistAccess = artistAccess`) but is unreachable: Express binds the first matching registration.
- **Live:** `PUT /v3/users/2 {artistAccess:'art_lumenveil',…}` → `200 {success:true}`; `GET /v3/users` → stored value unchanged (`'art_novakin'`).

**Classification: CONFIRMED.** It is one field bug — but it is the second instance of a defect class (pageAccess had the identical silent-drop until the Phase 4C fix at `users.js:136-144`), and it lands on the one permission that scopes staff users to artists. The 4C fix pattern (destructure + persist + round-trip test) exists in-file; `artistAccess` was simply not included. **Evidence of class, not systemic schema mismatch** — the frontend permission structures round-trip fine everywhere else (probed: create persists `artistAccess`; login/`/me` agree).

**Smallest response:** add `artistAccess` to the live PUT destructure and an `if (artistAccess !== undefined)` assignment; add a round-trip snapshot test like the four pageAccess ones added in 4C. One line plus a test. Do NOT touch the shadowed handler.

---

## 4. User-delete protections — **CONFIRMED**

**Trace (independent):**
- Reachable `DELETE /v3/users/:id` at `users.js:164-168`: admin check → `User.destroy` → `{success:true}`. **No self-delete guard, no root-admin guard, no last-admin check.**
- Shadowed duplicate `:216-229` has self-delete only (`user.email === req.user.email` → 400). Unreachable.
- Root-admin protection exists ONLY on `DELETE /v3/auth/me` (`auth.js:173`), which hardcodes `admin@pulsegrid.fm` — a label literal inside an authorization rule (separate coupling defect, noted for 4-LABEL).
- **Live:** admin2 deleted novakin (200), deleted **root admin id=1** (200 → root login 401), deleted **itself** (200 → login 401). The UI hides self-delete, but the server is authoritative and offers no protection.

**Classification: CONFIRMED.** Kimi's severity (MAJOR) is correct; the Phase 4C handoff's own rating of the self-delete gap as "MINOR, untouched" is understated — it missed root-admin deletion and token survival entirely.

**Smallest appropriate commercial behavior:** on the reachable handler only: (1) block self-delete (by `req.user.id`, not email); (2) block deletion of the root admin — sourced from the label profile once it exists, email literal until then; (3) treat revocation of deleted users' sessions as documented debt until the JWT design lands (§5). No last-admin protection, no soft-delete, no undo — that is enterprise scope for a 5-user dedicated instance.

---

## 5. Deleted-user JWT/session finding — **CONFIRMED**

**Trace (independent):**
- Issuance: DB login (`auth.js:95-101`) signs `{id, email, role, artistAccess, integrationCount}`, 24h expiry. (Override-admin branch `:74` signs no `id` — separate documented debt.)
- Middleware: `authenticateToken` (`src/auth/index.js:52-67`) is `jwt.verify` + `req.user = claims`. **No database lookup, no status check, no revocation check, ever.**
- Authorization: every guard reads `req.user.role` / `req.user.artistAccess` from the **token claims**, not the DB.
- **Live:** victim logged in → token works on `/v3/anr/state` (200) → admin deletes victim (200) → **same token still returns 200** on the protected route. `/v3/auth/me` 404s (that one route does `User.findByPk`), login 401s. Access therefore survives deletion for up to 24h.

**Why access survives:** deletion removes the credential store row; the session is self-asserted by the token. There is no server-side session state at all.

**Options compared:**
- **A. DB user/status lookup on protected requests** — one middleware change (fetch User by `req.user.id`, 404/401 if absent). Deleted users lose access immediately; role changes take effect at next request (better than today). Cost: one query per request on SQLite — trivial at this scale. Still doesn't revoke on role *downgrade* within the same token unless the lookup replaces claims (it should: re-source role/artistAccess from the row, keeping `id`/`email` from the token for identity).
- **B. Token/session version** (a `tokenVersion` int on User bumped on delete/password change) — cheaper per request than A if cached, more moving parts.
- **C. Server-side revocation record** — a session store; the heaviest of the three, still fine at 5-50 users.
- **D. Short-lived access token + refresh flow** — restructures login, frontend AuthContext, and everything downstream; largest change; solves revocation indirectly via expiry.

**Recommendation: A, smallest correct.** Re-source authorization claims (role, artistAccess) from the DB row on each protected request, 401 when the row is gone. This (a) kills the deleted-user window immediately, (b) makes the backend authoritative over permissions again (fixes the deeper "claims are trusted forever" issue), (c) keeps JWT statelessness, (d) composes with future API keys via the same `resolvePrincipal` seam (§15), and (e) is ~20 lines + tests. Keep 24h expiry; do not build refresh tokens or a revocation store yet.

---

## 6. Artist canonical-source-of-truth finding — **CONFIRMED (and wider than Kimi stated)**

**Trace (independent):**
- **Create** (`artists.js:106-116`): `Artist.create` to DB **and** `labelData.artists.push` to shared memory. On DB failure: memory-only push + 200 warning (prototype-robustness pattern that has become a lying-success).
- **List** (`:51-58`): `Artist.findAll()` (DB) ∪ `labelData.artists` (memory), id-deduped. Inline — does NOT call `artistRepo.findAllHybrid()` (dead code, zero call sites).
- **Detail** (`:189`), **archive** (`:124`), **restore** (`:143`), **image** (`:163`): `labelData.artists.find(...)` — **memory only**; DB updates happen opportunistically but are never read back.
- **Live:** created artist: list 200 / detail 404 / archive 404 after restart (DB row exists, memory does not). Seeded artist `art_novakin`: archived pre-restart → post-restart list shows `archived`, detail shows `flagship` — **the same artist disagrees with itself across two views.**

**Classification: CONFIRMED.** One canonical source of truth does not exist; there are two (`Artist` table and the mutable `mock/artistData.js` object graph) and routes pick whichever they were originally written against. The architectural origin is the hybrid prototype pattern, now cemented by the verbatim-move refactoring discipline.

**Correct fix location:** repository level, not endpoint patches. `artistRepository.js` already exists and is the intended owner of all artist access — make it real: (1) a single `findById` resolving DB-first with memory fallback; (2) all `:id` routes (detail/archive/restore/image/monthly-sales/entity-audit) go through it; (3) the list route calls `findAllHybrid()` instead of re-implementing the union; (4) create stops pushing to memory (or pushes through a `refreshMemoryCache` that mirrors DB). Memory then becomes a read-through cache/seed source, not a second authority. A round-trip test: create → restart-server → detail must 200.

---

## 7. Persist-vs-demo classification

Verified live across a restart. Contract proposal per state domain:

| Domain | Classification | Evidence / basis |
|---|---|---|
| Users | **PERSISTENT PRODUCT STATE — already durable** | Delete/create survive restart (probed); password, role, artistAccess, pageAccess in SQLite |
| Artists (roster) | **PERSISTENT (DB) but READ PATH SPLIT** | Rows survive; reads split between DB and memory (§6) |
| Artist archive/restore/image | **PERSISTENT WRITE, NON-DURABLE READ** | DB update persists; detail reads memory and shows stale state post-restart (probed) |
| A&R submissions (store #1) | **EPHEMERAL — MUST BECOME PERSISTENT** | Real user writes (submission, vote, shortlist); reverted to 2 seeds on restart (probed) |
| A&R demos (store #2) | **EPHEMERAL — MUST BECOME PERSISTENT (after store unification decision)** | Same class as store #1; split-brain between the two stores is a separate product decision |
| Sales entries | **EPHEMERAL — MUST BECOME PERSISTENT** | Customer-entered revenue; projections silently revert to `Math.random()`-based synthetic history (probed) |
| Campaigns | **DEMO/SIMULATED — NO READ-BACK AT ALL** | `cmp_<ts>` returned, nothing stored, no list/detail route (probed 404); stats endpoint is an unrelated fixture |
| Integration connections | **EPHEMERAL — PERSIST ONCE REAL OAUTH EXISTS; DEMO UNTIL THEN** | Mock connect state keyed by user id; lost on restart (probed). Persisting mock connections would be fake durability — badge as demo now, persist when real |
| Whiteboard / now-listening | **AMBIGUOUS — PRODUCT DECISION REQUIRED** | Ephemeral shared workspace; plausible either way (probed revert) |
| Fans demographics / operations / campaign stats / development insights / scout fixtures | **DEMO / FIXTURE — badge, do not persist** | Fixed fixtures; frontend already badges SOURCE: MOCK/FIXTURE/PROTOTYPE; backend responses carry no provenance |
| Stats table | **NEVER WRITTEN** | Only writer is unregistered `sync/masterLoop.js`; projections regress synthetic history |
| Reports/exports | **GENERATED, NOT PERSISTED** | CSV/PDF real; no report records (defer registry) |
| AI provider settings / integration credentials | **NOT YET PRODUCT** | Provider route absent by design; credentials are operator env vars |

**The contract:** anything a customer writes through the UI must either survive restart or be visibly DEMO. Today A&R, sales, and campaigns violate it. Do NOT persist fixtures, computed caches, or mock connection state.

---

## 8. Integration quota/metering finding — **CONFIRMED**

`src/routes/integrations.js:126`: `quotaUsed: Math.floor(Math.random() * 80)` — evaluated on **every** `GET /v3/integrations/status` call (probed: two consecutive calls, every service's value changed; e.g. spotify 46→35, tiktok 8→37). The comment labels it mock; the **API payload does not** — no `source` field — and the SettingsPage integrations view renders it as a quota bar (`IntegrationsView.jsx:61-64`, `formatters.percent(service.quotaUsed)`), so the UI presents per-call noise as operational usage. Classified: **placeholder masquerading as operational usage in a live product surface.** Severity: MODERATE today (badged nowhere at the API level), MAJOR once the surface is shown to anyone outside the project — it is exactly the fabricated-value class (Kimi F-6) that breaks commercial trust. Response: no metering; add provenance convention (§15/§23) and stop serving per-call random values (constant or omitted until real).

---

## 9. PM2/deployment finding — **CONFIRMED**

`ecosystem.config.js:4` → `script: './production-api.js'`; that file is a pure module (`module.exports = app`, no listen — its own header says so). Verified live: `node production-api.js` exits **0 immediately**. PM2 would restart-loop it; and `instances:'max'` + `exec_mode:'cluster'` would additionally shard every in-memory store across workers (anrSubmissions, salesData, userIntegrations) making state incoherent *within* a single run — moot only because the process exits. **Correct now**, not later: it is a few-line file fix (script → `server.js`, `instances: 1`, env section), the deployment docs currently describe a path that cannot work, and deployment truth is part of the pre-pilot definition of done. Doing deployment work was out of scope; verifying it was not.

---

## 10. Customer/label ownership seam

**Challenge result: Kimi's conclusion survives.** An explicit ownership seam is cheap now and expensive later — but only the *minimal* form, not an entity explosion.

1. **What "label" means today:** nothing in the domain model. `labelData` is the mock module (roster fixtures + `labelTotals`). No table, no column, no concept. Grep-verified this session: zero `tenant|organization|label_id|customer` in `src/`.
2. **Which records require ownership:** eventually all of them — users, artists, stats, A&R, sales, integrations, reports, audit events, future api_keys. Nothing legitimately spans labels.
3. **Would later ownership be destructive?** Additive (`ADD COLUMN label_id` + membership table) is NOT destructive for existing tables — **provided** two cheap disciplines hold now: (a) **IDs are collision-safe** (`art_<name>` collides the moment two labels have an artist named identically; `sub_<epoch>`/`cmp_<epoch>` collide on merge; integer user ids collide across merged DBs — IDs are the one truly irreversible thing, §15), and (b) **new owned tables carry an owner column from day one** (audit_events, api_keys, usage records). If those hold, a later migration is mechanical. If they don't, merged data is unreconcilable.
4. **Can dedicated instances skip tenant IDs now?** Yes. Physical isolation (process + DB) is complete isolation at this scale; a tenant column would be dead weight.
5. **Minimal ownership abstraction now:** an env-selected **ActiveLabelProfile** object (the 4-LABEL seam) that owns datasets, intelligence config, identity outputs, root admin, and DB selection — plus the two disciplines above. That is the whole seam. No `tenant_id` anywhere, no Customer/Organization/Account table, no membership table. Kimi's recommendation C is correct and is the smallest thing that preserves the dedicated-first → shared-later path.

---

## 11. Dedicated-instance architecture

Credible and correct for this product. Each paying label gets: own process, own SQLite/Postgres, own label profile (env `LABEL_SLUG`), own users, own integration credentials, optional API access. Everything verified in this recheck composes with that model: the global in-memory stores, single cron, single cache, and one DB path are all *fine* for one dedicated instance; they are fatal only for shared tenancy. The dedicated model also makes the persist-or-demo contract (§7) the real line: on a dedicated instance, "process memory" only breaks across restarts, not across customers.

**One prerequisite Kimi underweights:** DB selection must move from the hardcoded `storage:'pulsegrid_v5.sqlite'` (`config/index.js:82`) to profile/env (the audit lists it in 4-LABEL scope; this recheck confirms there is NO `DB_STORAGE` env read today). Without it, two dedicated instances on one host silently share a database file when run from the same cwd — the deployment model's isolation assumption fails before tenancy is even attempted.

---

## 12. Future multi-tenant architecture

**True shared multi-tenancy is NOT needed now and should not be built.** Dedicated-first with the §10 disciplines is deliberately compatible: the future path is add `label_id` to owned tables + one membership table at consolidation time. The only irreversible decisions are the ones §10 lists (ID collisions, owner column on new tables, label-literal discipline in generic code). Nothing else forces a redesign. Verdict: no `tenant_id` anywhere yet; enforce the conventions instead.

---

## 13. Audit-event seam

**Challenge result: Kimi is right that the seam is cheap now and the history is unrecoverable later — with one sequencing correction.**

A minimal mechanism: one append-only `audit_events` table (`id, actorId, actorEmail, action, targetType, targetId, metadata JSON, createdAt`) plus one `emitAudit()` helper, called from the handful of write handlers that exist (~15 sites: user create/update/delete, permission change, artist create/archive/restore/image, A&R writes, integration connect/disconnect, sales write, export). No UI, no webhooks, no event bus, no Kafka, no event sourcing. Hours of work.

**Sequencing correction:** wire it *after* the persist-or-demo decision, not before. Half the write sites are in-memory stores today; auditing them then re-wiring when they become Sequelize models is double work. Order: persist-or-demo → audit seam against the durable write paths. The cost asymmetry Kimi cites (LOW now / HIGH later, history unrecoverable) is real and stands.

---

## 14. Usage-attribution seam

**Challenge result: Kimi's conclusion survives with the same minimal form.**

Future questions (who/which credential/which endpoint/which model/tokens spent/reports generated) cannot be answered retroactively — history is lost the day a real user exists. The minimal seam: (1) a `requestId` (uuid) attached per request and included in the winston line, with `userId` attached **post-auth** (the current logger runs before `authenticateToken`, so `req.user` is not available at log time — attach on response finish or log in the auth middleware); (2) a `recordUsage({kind, quantity, actor})` no-op-backed helper called at the **two** spend points (`aiService` completion, `entityAuditService` refresh). Tens of lines. Do not build metering, aggregation, dashboards, or billing.

---

## 15. API productization / expensive-to-change contracts

Only foundational items, verified against this codebase:

| Contract | Today | Early decision needed? |
|---|---|---|
| **Identifiers** | users INTEGER; artists `art_<name>`; A&R `sub_<epoch>`; campaigns `cmp_<epoch>` — all collision-prone under merge, none tenant-safe | **YES — THE irreversible one.** Decide a prefixed/non-colliding convention for NEW entities now; existing ids can be migrated mechanically later only if new ones stop accruing in the old style |
| **Principal model** | JWT claims trusted blindly; no API keys, no scopes, no revocation | **YES.** Introduce `resolvePrincipal(req)` → `{kind:'user'|'key', id, label, scopes}` seam now; re-source role/artistAccess from DB (§5) as its first behavior. Before external integrators exist, this is a rename; after, it's a customer migration |
| **Error envelope** | 3 shapes verified in source: `{error}` / `{error,details[]}` / `{error,path}` (no `{error,message}` pair exists — corrects Kimi's count of four); malformed JSON → 500 (probed) | Normalize to one shape + 400-on-bad-JSON **before first pilot** (cheap) |
| **Provenance** | fabricated values indistinguishable from measured (`quotaUsed` random, fixtures, `[Dev Fallback]`, keyword "AI" with `confidence:0.98`) | **YES.** `source: live\|mock\|fixture\|fallback` on every intelligence/demo payload before anyone outside sees the API |
| **Versioning** | `/v3` is a lineage label; no policy | Write the one-paragraph policy before first pilot; no machinery |
| **Pagination** | one endpoint, in-memory slice, unvalidated (`limit=abc` → 200 empty; probed) | Before paid production (real roster sizes); not now |
| **Validation** | zod on 2 of ~20 write routes | Batch pass with the CRUD fixes (§22) |
| **Write semantics / idempotency** | upsert-by-month sales is idempotent by accident; nothing else is | Defer; document in the policy paragraph |
| **OpenAPI** | none; `API_INVENTORY.md` accurate | Reference doc before first pilot; not now |

No public developer platform is needed now. The three "YES" rows are the cheap-now/expensive-later set; everything else is before-pilot/before-paid.

---

## 16. Backend label portability

Verified coupling (all confirmed in source this session): AI system prompt (`prompts.js:37`), keyword-path hardcodes (`aiService.js:133`), KG search prefix (`integrations.js:69`), Fandom host (`entityAudit.js` — `lumenveil.fandom.com` hardcoded, all artists), report identity (`reports.js:149/175`, `monthlyReport.js:45/54/446`), email identity (`config` default + `auth.js:147` subject), root-admin email in an authorization rule (`auth.js:173`), seed accounts with pulsegrid emails/weak passwords (`models/index.js:94-106`), chart accent hex, server banner, `ARTIST_MAPPINGS` (2/29 artists).

**Timing answer: B — first bounded section of Phase 4D (or an immediately-preceding bounded phase), NOT after ordinary 4D.** The 4C handoff already names 4-LABEL as its Phase 4D item #2; this recheck confirms it must keep that position, and that no new backend feature should be written against literals in the meantime. Option A (before 4D) and B (first section of 4D) differ only in bookkeeping; the binding constraint is: the profile exists before any new persistence-heavy or customer-visible backend feature. The intended architecture — generic service reading an active Label Intelligence Profile with pulsegrid as default data — is right; nothing pulsegrid-specific should be removed, only externalized.

---

## 17. Label Intelligence Profile assessment

**Boundary should exist now. Cost now LOW-MEDIUM, later VERY HIGH.** Beyond the frontend `BrandProfile` (identity/locale/assets), the backend profile must own: search context + query prefixes; known artists/aliases; knowledge sources + parser selection (the Fandom parser hardcodes the host and English section keywords — `'Current'`/`'Former'`/`'Previous'`/`'Artists'`, `entityAudit.js:546-590` — verified this session); benchmark/comparison artists; A&R assumptions + scouting fixtures; AI system context + fallback copy; social mappings; venue/location intelligence; integration metadata; report identity; email identity; fan-demographics fixtures; operations fixtures; root admin; **DB selection**; locale/currency/timezone. pulsegrid values move in verbatim as the default profile. The frontend half of this discipline is already enforced by a self-testing static gate (23/23 re-run); the backend needs the same rule (grep-based lint is enough initially). This is the single highest-leverage item and it converts "provision a second label" from a ~20-file source edit into configuration.

---

## 18. Commercial customer thought experiments

**Scenario A — independent label, 5 users, 50 artists, dedicated deployment.**
- Works today: auth/RBAC basics, roster viewing, dashboards, exports, frontend re-skin (verified by prior phases; static gate re-run green).
- Breaks: roster swap is a source edit (`mock/artistData.js` + DB); pulsegrid leaks in PDFs/emails/AI/KG-prefix/banner; created artists 404 after restart (§6); A&R/sales vanish (§7); PM2 path dead (§9); seeds create pulsegrid admin with published password on their first boot.
- Schema changes: none. API changes: none. Infra: DB file per instance, single-process pm2/systemd, seed-credential rotation.
- Verdict: **feasible only after 4-LABEL + CRUD fixes + persist decision; then genuinely credible.**

**Scenario B — mid-sized label, 40 users, 500 artists, multiple admins, customer-owned credentials, external API.**
- Works today: user CRUD at that scale, role scoping, exports.
- Breaks: no API keys/service accounts; no per-user quotas on paid endpoints (F-9); integration creds are operator env globals, not customer-owned; in-memory state; artist split-brain; no invitation/deactivation lifecycle; no audit trail; list pagination is in-memory slicing (fine at 500, not 50k).
- Requires: `resolvePrincipal`/keys (schema + auth), usage records + quotas, persistence of A&R/sales, audit table, migrations.
- Verdict: **blocked on the §22/§23 items; realistic after them.**

**Scenario C — two unrelated labels in one shared instance.**
- Works today: nothing safely. One DB file, one memory space, one cache, one cron, one AI context, one root admin, one seed set.
- Leaks: total, if attempted on one instance.
- Requires: everything §12 defers. Do not attempt.
- Verdict: **with dedicated instances, C is an operations concern (two processes, two DB files, two profiles), not an architecture problem — once §10's disciplines hold.**

---

## 19. Findings Kimi overstated

Honestly: **none materially.** The two imprecisions (§2: "reuse the list's seam" — false; shadowed-handler credit — presentation nuance) slightly *under*state the fix size for §6 and don't inflate anything. The one arguable overstatement is classifying `pageAccess`-class severity as evidence of "wider mismatch" — it is a field-level gap in an otherwise correct round-trip system, which Kimi's own wording already hedges ("one field bug or evidence of a wider mismatch"). No severity inflation found anywhere else; several of Kimi's severities were independently confirmed as correct or understated (F-2).

---

## 20. Findings Kimi missed

1. **Split-brain blast radius (MAJOR):** seeded artists' archive/restore/image state diverges across views after restart (list=DB, detail=memory). Kimi described F-3 as affecting API-created artists only. Live-probed: `art_novakin` archived → list `archived`, detail `flagship` post-restart.
2. **`artistRepo.findAllHybrid()` is dead code (MODERATE):** the repository layer that was supposed to unify artist access has zero call sites on the list path; `GET /v3/artists` re-implements the union inline. The Phase 2 "repository" exists but is not yet the source of truth for the roster. (Kimi's remediation text implies it is.)
3. **Audit-seam sequencing (MODERATE, advisory):** auditing in-memory stores before the persist-or-demo decision doubles the wiring work (§13).
4. **Request logger runs pre-auth (MINOR):** the usage-attribution userId cannot be attached at the current log site without reordering or post-auth logging (§14).
5. **Shadowed `POST /v3/users` (#2) parity hazard (MINOR):** if ever un-shadowed, it writes a raw JS array into the STRING `pageAccess` column — the exact crash class 4C fixed; the file header records the hazard but it deserves a pin test or a comment-level "do not reach" note.

---

## 21. Cost-of-deferral matrix

| # | Item | Cost now | Cost if retrofitted after customer data | Why it gets expensive (tied to this repo) |
|---|---|---|---|---|
| 1 | CRUD truth fixes (F-1, F-2, F-4 dup, F-7 batch) | LOW | MEDIUM | Each new consumer (4D surfaces, pilot users) cements the silent-success contract; the audit trail question compounds the artistAccess one |
| 2 | Artist repository unification (§6) | LOW-MEDIUM | HIGH | Once customers create real rosters, the "fix" is a data reconciliation between DB rows and memory mutations, not a read-path change |
| 3 | Persist-or-demo decision + persistence (A&R, sales) | LOW (decision) / MEDIUM (models) | VERY HIGH | Semantics freeze under customer use; sales projections already silently flip from real entries to `Math.random()` history on restart — with real data the same flip becomes an unrecoverable customer-visible regression |
| 4 | ID convention for new entities | LOW | VERY HIGH | IDs are forever. `art_<name>`/`sub_<epoch>`/integer users collide the moment data is merged or partitioned; renaming ids after external API consumers or DB merges is migration-by-migration |
| 5 | ActiveLabelProfile backend seam (4-LABEL) | MEDIUM | VERY HIGH | Every new backend feature written against literals adds retrofit surface; with customer data it becomes a migration + contract change |
| 6 | Ownership rule for new code (no label literals; owner column on new owned tables) | LOW | VERY HIGH | A grep rule now; per-handler archaeology later; owner-column absence on a populated table is an unrecoverable data partition |
| 7 | Audit event table + emit points | LOW | HIGH | Hours now; after features accrete every write handler needs retrofitting and the history is permanently absent (sales/security-review blocker) |
| 8 | Request-ID + userId logging + usage-record hook at 2 spend points | LOW | HIGH | Middleware now; attribution archaeology later; per-user AI spend is invisible forever if not recorded at call time |
| 9 | `resolvePrincipal` auth seam | LOW | HIGH | Before external integrators: a rename; after: migrating customers off user-JWTs |
| 10 | Provenance `source:` convention | LOW-MEDIUM | HIGH | Convention now; trust repair later (a paying label cannot un-see a random quota) |
| 11 | Deployment truth (PM2, DB selection, env templates) | LOW | MEDIUM | Paper fixes now; incidents and "works on my machine" provisioning later |
| 12 | Per-user quotas on AI/refresh endpoints | LOW-MEDIUM | HIGH | Before external users exist; a pilot user can run real provider bills; retrofitting under incident conditions is how pricing mistakes ship |
| 13 | Migrations instead of `sync({alter:true})` | MEDIUM | HIGH | Mandatory before customer DBs exist; boot-time alter against customer data is destructive by definition |
| 14 | Seeds sourced from profile / no published weak passwords on customer boots | LOW | HIGH | A customer's first boot with `admin123` documented in the banner is a breach; every day it ships is exposure |
| 15 | OpenAPI reference from API_INVENTORY | LOW-MEDIUM | MEDIUM | Needed for external integrators (Scenario B), not urgent before pilot |
| 16 | Multi-tenant schema (`tenant_id` everywhere) | HIGH | n/a | **Do not build yet** — dedicated-first covers the near term; conventions in #4/#6 preserve the path |
| 17 | Postgres, SSO/SCIM, BYOK vault, event bus, k8s, provider router | HIGH | HIGH/— | **Do not build** (see §27) |

Strong asymmetries (LOW/MEDIUM now → HIGH/VERY HIGH later), in priority order: #5 label profile, #3 persist-or-demo, #4 ID convention, #6 ownership rule, #7 audit, #8 attribution, #9 principal seam, #12 quotas, #2 repository unification.

---

## 22. MUST FIX NOW

All reproduced this session. Combined scope ≈ one focused day + tests.

1. **F-1 artistAccess silent drop** — `src/routes/users.js:131-161` live PUT. Problem: admin edits Artist Access, gets success, nothing stored. Evidence: live probe (PUT `art_lumenveil` → read-back `art_novakin`); frontend `AdminPage.jsx:58` sends it. Consequence: the one artist-scoping permission is uneditable through the product, silently. Response: destructure + assign `artistAccess` (guard `!== undefined`) in the live handler; add round-trip snapshot test (pageAccess 4C pattern). Cost LOW / MEDIUM.
2. **F-2 unguarded user deletion** — live `DELETE /v3/users/:id` (`:164-168`). Problem: any admin deletes root admin or itself; no last-admin concept. Evidence: live probe (root id=1 deleted → root login 401; self-delete 200). Consequence: permanent lockout of the only superuser; offboarding doesn't cut access (§5). Response: self-delete block by `req.user.id`; root-admin block (email literal until profile owns it); keep JWT-revocation as documented debt pending §5. Cost LOW / MEDIUM-HIGH.
3. **F-4 duplicate artist → 409** — `artists.js:90-117`. Problem: duplicate name returns 200 and pushes a memory twin (visible to `find()`). Evidence: live probe (second `lumenveil` create → 200). Response: pre-check by id, 409 on conflict, stop the memory-fallback write pattern (fall back to memory only for the SEED path, never for writes). Cost LOW / MEDIUM.
4. **F-7 validation batch** — vote `direction` enum (`anr.js:80-110`; 'sideways' accepted, live-probed); sales artistId existence (`analytics.js:79-90`); change-password min length (`auth.js:209-230`; 1-char accepted, live-probed); malformed JSON → 400 (currently 500, live-probed). Response: extend the existing zod layer to these write routes. Cost LOW / MEDIUM.

---

## 23. MUST DESIGN NOW / IMPLEMENT MINIMALLY

1. **Artist repository unification** (§6): single DB-first findById + list-through-`findAllHybrid`; memory demoted to seed/cache. DO NOT patch endpoints individually.
2. **Persist-or-demo decision, then persistence** (§7): A&R submissions/votes + sales as small Sequelize models; campaigns marked DEMO or persisted; integration connections stay demo until real OAuth. The DECISION is the urgent part; it determines the schema work.
3. **ActiveLabelProfile backend seam** (4-LABEL): env-selected profile owning datasets/intelligence/identity/rootAdmin/DB selection; pulsegrid values verbatim as default. Plus the ownership rule for new code (grep-level enforcement initially).
4. **Audit event table + emit points** — after #2's models exist (§13).
5. **Usage attribution** — requestId + post-auth userId logging; `recordUsage` hook at AI completion and entity-audit refresh (§14).
6. **Deployment truth** — `ecosystem.config.js` → `server.js`, `instances:1`; DB storage via env/profile; reconcile `.env.example`/`.env.prod.template` (verified: they disagree — prod omits `GROQ_API_KEY`, adds unread `OPENAI_API_KEY`/`SESSION_SECRET`); seeds-from-profile (§11, #14 above).
7. **ID convention** for new entities (prefixed, non-colliding) + provenance `source:` convention on intelligence payloads.

---

## 24. BEFORE FIRST PILOT

1. Request-ID + user-attributed logs; usage-record hook at the two spend points.
2. Per-user quotas on `ai/query` and `entity-audit?refresh=true`.
3. Password policy on change-password + complete the reset flow (redeem route) or remove the affordance.
4. Error-envelope normalization; malformed JSON → 400.
5. API_INVENTORY → minimal OpenAPI reference; one-paragraph versioning/compatibility policy.
6. DB-aware readiness check + backup/restore runbook for the SQLite file.
7. Root admin + seeds sourced from the label profile (no pulsegrid email in authz rules, no published default passwords on customer boots).
8. Read-back round-trip tests for every admin/roster write (extend the 4C pageAccess pattern to artistAccess, artists, delete guards).
9. `resolvePrincipal` seam landed (§15) even if only user-JWTs flow through it.

---

## 25. BEFORE PAID PRODUCTION

1. Postgres verified + real migrations; no `sync({alter:true})` against customer data.
2. API keys/service accounts: scopes, expiry, revocation, per-key usage attribution.
3. Audit-log surfacing (admin-only read) + the §5 deleted-user fix verified end-to-end.
4. Per-customer rate limits and cost ceilings; AI/external spend attributable and capped.
5. Provider-terms review for redistributed third-party data (counsel item, not code).
6. Secrets management beyond plain env; integration credentials as label-owned records.
7. Backup/restore drill executed.
8. Invitation/deactivation lifecycle for staff users.

---

## 26. SAFE TO DEFER

- Postgres itself (SQLite is adequate for dedicated pilots).
- OpenAPI completeness, pagination hardening, sorting/filtering expansion.
- Second AI provider + selection UI (injection seam already exists).
- Report registry/history; async report infrastructure.
- Real OAuth flows (mock is honestly labeled — once provenance flags ship).
- SSO readiness beyond keeping identity email-keyed.
- Code splitting / React Router 7 (already queued for 4D).

---

## 27. DO NOT BUILD YET

- Shared multi-tenant schema / `tenant_id` everywhere.
- Billing, plans, Stripe, invoicing, entitlement machinery.
- SSO/SAML/SCIM/enterprise provisioning.
- BYOK / customer credential vaults.
- Event buses, webhooks, microservices, Kubernetes.
- N-provider AI router (one adapter + injection point is the right size).
- Policy-engine RBAC framework (the ~20 inline checks are correct; consolidate when count grows).
- Audit UI/webhooks; usage dashboards; metering aggregation.
- Kubernetes/service meshes; plugin marketplaces.

---

## 28. Recommended bounded phase BEFORE ordinary Phase 4D

**Phase 4-COMMERCIAL (bounded, reviewable, nothing else):**

1. CRUD-truth fixes (§22) — hours, kills the lying-success class 4C started fixing.
2. Persist-or-demo decision → persistence of A&R/sales (and explicit DEMO marking of the rest).
3. Artist repository unification (§6).
4. Deployment truth (§23.6).
5. **Then** ordinary 4D, opening with: 4-LABEL profile + ownership rule → audit/usage seams → provenance convention → the 4C-handoff's own 4D queue (product questions, 4-AI, code splitting). This matches the 4C handoff's recommended order, with the CRUD/persistence/repository items promoted ahead of it.

Rationale: two reproduced defects sit on shipped 4C surfaces (Admin › Team edit artistAccess; Admin › Team delete). Starting 4D before fixing them means building new features on top of a team-permission editor that silently lies and a delete button with no root-account protection — on the path toward paying customers.

---

## Final questions — explicit answers

1. **Is Kimi's commercial audit materially trustworthy?** **YES** — every headline finding re-traced and re-reproduced; two imprecisions and one understatement, none material.
2. **Which reproduced CRUD defects must be fixed before continuing?** F-1 (artistAccess silent drop), F-2 (unguarded user deletion incl. root/self), F-4 (duplicate-artist 200), F-7 (validation batch). All four.
3. **Does artist persistence require repository-level correction rather than endpoint patches?** **YES** — the split is between DB and shared memory; every `:id` route plus the list must resolve through one repository path, or the next route added re-opens the wound.
4. **Smallest correct solution for deleted-user JWT access?** **DB lookup in auth middleware**: re-source role/artistAccess from the User row per protected request, 401 when the row is gone. No refresh tokens, no revocation store, no token versions yet.
5. **Which current state domains must become durable product state?** A&R submissions/votes (both stores, after the unification decision), sales entries; campaigns must either persist or be marked DEMO; integration connections persist only once real OAuth exists; whiteboard is a product decision.
6. **Is an explicit Customer/Label ownership seam needed now?** **YES, minimal** — env-selected ActiveLabelProfile + ownership rule + collision-safe IDs; no tenant_id columns, no Customer/Organization tables.
7. **Does dedicated-per-label deployment reduce the need for immediate multi-tenancy?** **YES** — physical isolation covers the near term completely; only the §10 disciplines are required to keep the shared path open.
8. **Would true multi-tenancy later require destructive redesign under the recommended minimal architecture?** **NO** — additive columns + membership table, mechanical IF the ID and owner-column conventions hold from now.
9. **Should a minimal audit-event seam exist now?** **YES** — one append-only table + emit helper, wired after the persist-or-demo models land; history is unrecoverable later.
10. **Should minimal usage/request attribution exist now?** **YES** — requestId + post-auth userId logging and a recordUsage hook at the two spend points; tens of lines.
11. **Should the backend Label Intelligence Profile boundary be established now?** **YES** — the single highest-value seam; LOW-MEDIUM now, VERY HIGH later.
12. **Single highest-cost mistake if deferred?** **The backend label/ownership profile (4-LABEL) with its conventions** — runner-up: the persist-or-demo decision for in-memory product state; third: the ID convention.
13. **What should NOT be built yet?** §27 in full.
14. **Should ordinary Phase 4D begin before these corrections?** **NO** — the corrections are one bounded phase (§28); 4D feature work on top of the current defects extends two lying-success contracts into customer-visible surfaces.

---

## FINAL VERDICT

**KIMI COMMERCIAL AUDIT: CONFIRMED** (materially trustworthy; no material errors; three imprecisions, one understated blast radius, one wrong remediation premise — all corrected above)

**CRUD-TRUTH PASS REQUIRED BEFORE 4D: YES**

**ARTIST SOURCE-OF-TRUTH CORRECTION REQUIRED: YES**

**CUSTOMER/LABEL OWNERSHIP SEAM NEEDED NOW: YES** (minimal form only: profile + conventions; no tenant columns)

**PERSIST-OR-DEMO CONTRACT NEEDED NOW: YES**

**MINIMAL AUDIT-EVENT SEAM NEEDED NOW: YES** (after the persist-or-demo models)

**MINIMAL USAGE-ATTRIBUTION SEAM NEEDED NOW: YES**

**BACKEND LABEL-INTELLIGENCE BOUNDARY NEEDED NOW: YES**

**DEDICATED-INSTANCE COMMERCIAL PATH AFTER CORRECTIONS: CLEAR**

**FULL MULTI-TENANCY REQUIRED NOW: NO**

**SAFE TO START ORDINARY PHASE 4D BEFORE THESE CORRECTIONS: NO** — the corrections are small enough to be a single bounded phase; they must land before new feature work, not as its first items.

---

## Appendix — repository state at recheck close

- `git status --short`: identical to session start (27 modified, same untracked set). The ONLY new repository file created by this review is this one: `COMMERCIAL_FOUNDATION_RECHECK.md`.
- `git diff --stat`: unchanged (27 files, +1340/−57).
- Working database `pulsegrid_v5.sqlite`: untouched (mtime 2026-09-17 01:39, size 167,936, verified at close).
- Throwaway probe environment (`/tmp/recheck-probe`, port 3100): removed; probe server stopped.
