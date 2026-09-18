# EXECUTION_GUIDE.md

**Date:** 2026-09-17 · **Repo:** mau5trap-repo
**Current HEAD for execution:** Step 2 on D0 `7336323` / Step 1 `4b00c8c`. Historical recipes were written against `7efb44b` + uncommitted 4CF.
**Authority:** supersedes the per-step recipes produced by 5 planning agents (2026-09-17,
transcripts on file) and /home/dino/step7-8-recipe.md (fully incorporated here).
**Status:** IN EXECUTION — D0 + Steps 1–2 complete; Step 3 is next. D7/D12F still unsigned.
**Operator map:** `WORK_TREE.md` (do not restart D0).

How to use this guide:
1. Resolve the DECISION RECORDS first (D0 is blocking for everything).
2. Follow the EXECUTION ORDER; each step lists its exact edits, its pins, and its verify.
3. Consult the PIN LEDGER before touching any test so no pin flips silently.

---

## 0. Decision records (all require explicit operator sign-off before that step starts)

| ID | Blocks | Record location |
|---|---|---|
| **D0 — Checkpoint strategy** | ALL steps | This file (template §0.1); decision goes in REFACTOR_PROGRESS.md §Status |
| **D7 — Password reset** | Step 7 | New root file `STEP7_PASSWORD_RESET_DECISION.md` (template §7.5) |
| **D12F — /health body change** | Step 12F | Same decision-record convention (template below §12F) |

### 0.1 D0 template — checkpoint the uncommitted tree

The working tree carries the entire uncommitted Phase 4C+4CF implementation on top of
HEAD `7efb44b` (dozens of modified + untracked files). Every recipe's rollback says
`git restore …`, which is only safe if the 4C+4CF work is committed first. Decision:

- [x] A. Commit the current tree as a 4C+4CF checkpoint commit before any new step
      (recommended — each step can then be its own commit with clean rollback).
      Done: `7336323` after B1/B2/B3/FE-01/FE-02. See DECISION_D0_CHECKPOINT.md.
- [ ] B. Work in-place on the dirty tree (rollback = manual file restores; fragile).
- [ ] C. Other (state it).

---

## 1. Consolidated pin ledger (every deliberate test/artifact flip, all steps)

Route-count discipline: `routes.test.js:62-65` pins `TABLE.length === 63`. Each
route-adding step increments by its delta; keep this ledger as the running total.

| Step | Pin flip | From → To |
|---|---|---|
| 6a | routes.test.js:63 route count (+1 GET /v3/marketing/campaigns) | 63 → 64 |
| 7 | routes.test.js:63 route count (+1 reset-password) · delete the "reset-password still unimplemented" PINS assertion (:141-146) · unauth list 3→4 (:148-165) · optional `required` array add · cases.js:141-143 replaced by two deterministic cases (91→92) · phase2_baseline.json:2775-2782 + `__meta.caseCount` 91→92 · baseline.json:1701-1708 · gate F16 (:246-248: disabled→enabled) + P03 selector (:586-588) + new F23 box · API_INVENTORY.md (63→64, 3→4, delete dead-call row) | see §7 |
| 6d | services.test.js:269-271 (apiCache deep-equal → absence assert) | see §6d |
| 9 | routes.test.js:63 route count (+2: POST /v3/api-keys, DELETE /v3/api-keys/:id) | 64/65 → +2 (N) |
| 11A | gate.mjs:346 V16 `mainChildren.length <= 4` ceiling (+1 section) | 4 → 5 |
| 12F | /health version pins ×4 (snapshot.test.js:165-170, verify_phase2.js:47-49, tests/snapshots/baseline.json:8, phase2_baseline.json:8) + body-shape reconciliation (add `database` key to baseline health bodies IF the health case is byte-compared — check the NONDETERMINISTIC set in cases.js at implementation time) | '3.0-production' → package.json version '5.0.0' |

Non-flips that MUST stay green (do not edit unless the ledger says so): 141 tests,
91/92-case snapshot bodies, verify 54/54, gate 70 boxes, services.test.js pins,
units.test.js token-shape pins (140-162), routes.test.js name-guard (148-165) except
Step 7's documented edit.

---

## 2. Execution order

1 → 2 → 3 → 4 → 5 → 6a → 6b → 6c/6d/6e → **[D7 gate]** 7 → 8 → 9 → 10
→ 11C → 11A+11B (+doc drift) → 12A-G (**[D12F gate]** at 12F) → 13 (pilot-gated, no build now).

11C/11A/11B are independent of 7-10 (only need Steps 1-2 held). 12 depends on 1, 2, 6.

---

## 3. Steps 1–4 (trust tier, foundations)

### Step 1 — Deployment truth (small/very-low)
- ecosystem.config.js: full rewrite — `script:'./server.js'`, `exec_mode:'fork'`,
  `instances:1`, `restart_delay:3000`, keep `max_memory_restart:'1G'`, `env_production`.
- README.md:74+96, QUICKSTART.md:18, PRODUCTION_DEPLOYMENT.md:78 (+:33/:62 wording),
  package-production.json:7 (+:5/:8) — `mau5trap-production-api.js` → `server.js`.
  (PRODUCTION_DEPLOYMENT.md:37 is already correct — leave.)
- Verify: `node --check ecosystem.config.js`. Isolated PM2 check only (§14.2):
  disposable cwd, scratch `DB_STORAGE`, unused PORT, isolated `PM2_HOME` and app
  name; curl that child's `/health`; delete only the process this step created.
  Never `pm2 start`/`delete mau5trap-api` against the operator namespace or DB.

### Step 2 — Hermetic verify (small/medium)
- New `scripts/run-verify-hermetic.js`: spawn `server.js` (dedicated port 3971, temp
  DB_STORAGE in os.tmpdir, ephemeral 32-byte JWT_SECRET, `ADMIN_EMAIL=''`,
  `ADMIN_PASS=''`, `USE_REAL_DATA=false`, `SCHEDULE_JOBS=false`, `GROQ_API_KEY=''`,
  `AUTO_PRINT=false`) → wait /health (fail-fast on dead child / EADDRINUSE) → run
  `tests/support/verify_phase2.js http://127.0.0.1:<port>` with stdio inherit → kill child → unlink
  DB + -journal/-wal/-shm in finally → exit with verify's code.
- package.json: add `"verify:hermetic": "node scripts/run-verify-hermetic.js"`. Do NOT
  edit verify_phase2.js (its 54 checks stay byte-identical; it reads BASE from argv).
- Verify: `npm run verify:hermetic` twice (both 54/54; the child must pass
  `http://127.0.0.1:<port>` into `verify_phase2.js` — §14.1), then once while the
  operator :3000 server + DB are live — operator DB mtime+size+sha256 unchanged.

### Step 3 — Error contract (small/very-low)
- middleware/index.js error handler: before the 500, add
  `if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });`
- Normalize `'Internal error'` → `'Internal server error'` at auth.js:208, :232,
  integrations.js:87, :98, :112 (grep-verified: no test pins either string).
- API_INVENTORY.md: document the envelope (3 shapes + 1 deliberate `{error,id}` outlier).
- New snapshot test: malformed JSON → 400 exact body. No pins flip.

### Step 4 — Pagination (small/low-medium)
- GET /v3/users (users.js:231-238) and GET /v3/anr/submissions (anr.js:73-77): opt-in
  `limit`/`offset` — no-params response byte-identical (bare array / `{submissions}`);
  with params: `{users|submissions, total, limit, offset}`. Clamp limit≥1, offset≥0;
  `total` = full count pre-slice (mirrors artists.js semantics).
- 4 new snapshot tests (no-params bare shape ×2, paged shape ×2). No pins flip.

---

## 4. Steps 5–6 (durable-state tier)

### Step 5 — Ownership consistency (small/low; operator-DB rebuild required)
- models/index.js: add `labelSlug: { type: DataTypes.STRING, allowNull: false }` to
  AnrSubmission (after :93) and SalesEntry (after :99).
- **FIVE stamp sites** (correction: the plan said four — the SEED site is the fifth):
  1. models/index.js:182-193 — `AnrSubmission.create` seed row (without it, seeding
     throws NOT NULL on every fresh boot).
  2-4. anr.js:97 (submit), :115 (same-ms retry), :469 (shortlist).
  5. analytics.js:115 (SalesEntry.create). The findOne→save path (:110-113) needs no
     stamp (it mutates an already-stamped row).
- **Operator-DB hazard (correction, must be actioned):** SQLite cannot
  `ALTER TABLE … ADD COLUMN … NOT NULL` on a non-empty table — boot would fail to
  alter, initDB returns false, server runs with the OLD schema, then stamped writes
  500. Mitigation: one-time delete/rebuild of `mau5trap_v5.sqlite` (seeds regenerate)
  or manual backfill before boot. Do NOT add a `defaultValue` (it would mask future
  unstamped create sites).
- Tests: extend units models pins + durability sqlite3 readback for labelSlug.
  No response-path change → snapshot/verify green.

### Step 6a — Campaigns persist + read-back (small-medium/low)
- New `Campaign` model: id STRING PK, labelSlug STRING NOT NULL (ownership convention),
  artistId STRING null, type STRING null, platforms JSON null, status STRING
  default 'created', budget STRING default 'Pending Approval', plan JSON NOT NULL,
  createdAt DATE. Add `Campaign` to context.js models bundle.
- marketing.js POST → async: build the EXACT current response object, persist row,
  respond with the locally-built object (byte-identical shape); try/catch → 500.
- New `GET /v3/marketing/campaigns` (authed, ordered createdAt ASC/id ASC).
- Pin: routes.test.js:63 → 64 (ledger). Do NOT add a cases.js entry (snapshot.test.js
  pins `caseCount === CASES.length`; a new case would force a baseline regen).
- Docs: API_INVENTORY storage rows; 4CF doc §6:55 + §21 campaigns rows.

### Step 6b — Integrations per-user JSON seam (small-medium/medium)
- User model: add `integrations: { type: DataTypes.JSON, defaultValue: {} }`
  (JSON column over a table — 1:1, matches the map shape). Fresh-object assignment on
  write (the voters trick, anr.js:174) so Sequelize detects the change.
- integrations.js three-site swap, all async with try/catch (Express 4 unhandled
  rejection kills the process — the hazard):
  - status (~:117-134): read `User.findByPk(req.user.id)?.integrations || {}`; on
    error fail-open to `{}` (the always-200 pin).
  - auth (~:137-155): `req.user.id == null` → respond Mock message without persisting
    (preserves the documented override-token quirk); else merge + save; on error still
    respond the Mock message. Keep `(Mock)` strings.
  - disconnect (~:158-164): `id == null` → `{success:true}`; else delete key + save;
    catch → 500. Success body byte-pinned (cases.js:110) — unchanged.
- Optional hygiene: drop `userIntegrations` from inMemoryStores.js:65-67/85 +
  context.js:146 + 13 route destructures (grep-verified zero other usage).
- No pins flip (status/auth are NONDETERMINISTIC shape-only; disconnect identical).

### Step 6c — A&R store #2 decision (document-only, trivial)
Decision text (verbatim): store #2 (demos ratings, whiteboard, nowListening) stays
EPHEMERAL demo by design — whiteboard/nowListening are label-wide singletons that do
not fit per-demo rows; unifying vote semantics (scalar vs ratings[]) is a product
decision (DO-NOT-BUILD). Write to inMemoryStores.js header (after :30) + 4CF doc §19.

### Step 6d — apiCache deletion (small, mechanical)
Delete: inMemoryStores.js:72-79 + :87 (export), context.js:148, and the destructure
entry in 13 route files (artists.js:47, label.js:33, analytics.js:34, ai.js:35,
system.js:31, anr.js:46, operations.js:33, marketing.js:32, reports.js:39, auth.js:39,
users.js:41, integrations.js:39, finance.js:32).
Pin: services.test.js:269-271 → `assert.ok(!('apiCache' in stores))`.
Docs: PRODUCTION_DEPLOYMENT.md:61 false "5-minute TTL" claim (coordinate with Step 1
edits — different lines, sequential OK); 4CF §6:60 → REMOVED; REFACTOR_PROGRESS.md:80.
Verify: `grep -rn apiCache src/` → zero.

### Step 6e — Stats/masterSyncLoop dormancy (trivial)
Replace src/jobs/index.js:7-12 comment with a DORMANT-BY-DECISION note (wiring the loop
flips projections synthetic→real — a data-pipeline project, not a toggle). NOTE:
`sync/masterLoop.js` lives at `/sync/`, not `/src/sync/`. Doc updates only; no pins.

Interplay notes: 6b requires Step 9 to set `req.user.id = ApiKey.owningUserId` or the
column keys to nothing for key-auth (9's recipe does). Step 5+6a define the labelSlug
convention Step 13's first real migration must capture. Do 5→6 before 9.

---

## 5. Step 7 — Password reset (MEDIUM/MEDIUM; GATED on D7)

Full verified recipe was delivered at /home/dino/step7-8-recipe.md and is incorporated
here (that file is superseded by this guide).

Backend: new PUBLIC `POST /v3/auth/reset-password` after forgot-password (auth.js:166):
validate token+expiry (`resetToken` STRING column — `parseInt` expiry epoch ms), min-8
password, bcrypt hash, clear token columns, single-use; unknown == expired == identical
400 body (no enumeration oracle). Config: `resetLinkBase: process.env.RESET_LINK_BASE
|| 'http://localhost:5173/reset-password'` (8080→5173 default is a D7 sub-option).
Frontend: LoginPage.jsx:43 un-disable + navigate('/forgot-password');
router.jsx 2 public routes; new ForgotPasswordPage + ResetPasswordPage (+module.css);
endpoints.js 2 functions; copy.js keys (S05: no inline strings).

12 deliberate pin edits — see LEDGER row for Step 7 (route count +1, PINS assertion
deleted, unauth 3→4, cases 91→92 with two deterministic 400 cases, both baseline
snapshots incl. `__meta.caseCount`, F16 enabled + P03 selector fix + new F23 box,
API_INVENTORY rows). verify_phase2.js: NO reset pin — stays 54/54.

New `tests/regression/passwordReset.test.js` (durability-style spawn harness, 8 named
tests incl. expiry via sqlite3 write, single-use, login-after-reset).

### 7.5 D7 decision template (to be filed at repo root BEFORE Step 7 work)
Status line + question (ship the pinned-dead reset flow?) + options:
A. proceed as specced; B. RESET_LINK_BASE default 5173 (recommended) vs 8080;
C. optional emitAudit('user.password_reset') yes/no; D. deferred: JWT session
invalidation on reset (needs passwordChangedAt claim — OUT of scope, noted).
Cross-ref after filing: NEXT_STEPS_PLAN.md Step 7 SIGNED-OFF line + REFACTOR_PROGRESS
§Status row.

---

## 6. Step 8 — Password policy + quota stubs (small/low; no pins flip)

- change-password min-8: insert AFTER the `validPassword` guard, NOT before —
  cases.js:37 + phase2_baseline.json:139-141 pin the wrong-current+1-char case at 401;
  placing min-8 first flips it (CRITICAL ordering fact).
- Quota stubs (seam only, no enforcement): ai.js destructure + `usageService.recordUsage
  ('ai_query', 1, {...})` after the !userPrompt guard (ai.js:65); artists.js destructure
  + `recordUsage('entity_audit_refresh', 1, {...})` gated on forceRefresh (after
  artists.js:224). Update usageService.js header.
- New tests: tests/regression/quota.test.js (injection harness, 3 cases) + the
  change-password ordering case inside passwordReset.test.js.

---

## 7. Step 9 — API keys (medium/medium-low, additive)

- Models: ApiKey (id INT PK auto, labelSlug STRING NOT NULL, label STRING, keyHash
  STRING UNIQUE (sha256 hex), keyPrefix STRING, role STRING default 'viewer',
  artistAccess STRING default 'none' — STRING deliberately, mirrors User.artistAccess;
  expiresAt STRING null (SQLite date convention), revoked BOOL default false,
  owningUserId INT NOT NULL, updatedAt:false). Add to exports (:204). No seeding.
- context.js: key branch BEFORE `auth.authenticateToken` at :66-67, gated on the
  `X-API-Key` header only (no existing client sends it → every existing request stays
  byte-identical on the JWT path). Lookup by sha256(key); 401 `{error:'Invalid or
  expired API key'}` for unknown/revoked/expired/owner-deleted. req.user =
  { id: owningUserId (NUMERIC → audit actorId INTEGER), email: owner.email,
  role: key.role, artistAccess: key.artistAccess, integrationCount: owner's,
  apiKeyId }; req.authKind='apikey'. Key branch skips layer-2 DB revalidation
  (documented debt: role grants are key-carried).
- New src/routes/apikeys.js: POST /v3/api-keys (admin; zod createApiKey .strict();
  201 with plaintext secret shown once; emitAudit api_key.create) + DELETE
  /v3/api-keys/:id (admin; revoke; 404/403; emitAudit api_key.revoke). Register
  `'apikeys'` in DOMAIN_ORDER (src/routes/index.js) LAST.
- Pins: route count +2 (ledger); name-guard NO edit (both routes use the composite);
  units ApiKey shape test added; NO snapshot/durability/case changes.
- New tests/regression/apikeys.test.js (spawn harness, 6 cases incl. revoked-key 401,
  sqlite3 readback of numeric actorId).
- Optional hardening: add X-API-Key to the log-redaction list (middleware:63-66).

## 8. Step 10 — OpenAPI + versioning (medium/low; Step 9 first)

- New root `openapi.yaml` (3.0.3, hand-written from routeTable + API_INVENTORY):
  ~60 unique method+path pairs post-Step 9 (shadowed dups collapse); ~25 reusable
  schemas; bearerAuth + ApiKeyAuth schemes. Presence-gated coverage, not schema-deep.
- New coverage test in routes.test.js: `'OpenAPI spec declares every registered route
  (routeTable ⊆ spec.paths)'` — normalize `:param` → `{param}`; assert every TABLE
  entry has an operation; optional reverse drift guard. Add `js-yaml` devDep.
- Optional static serve (pin-invisible): `app.use('/openapi.yaml', express.static(...))`
  in mau5trap-production-api.js after registerRoutes — express.static layers have no
  `layer.route`, so routeTable/name-guard/count pins are unaffected.
- API_INVENTORY.md: versioning/deprecation policy section (additive-only /v3; breaking
  → /v4; ≥6-month deprecation window; Deprecation/Sunset headers; openapi.yaml is the
  contract; route-count pin = enforcement point).

---

## 9. Step 11 — Frontend debt (interleavable after 1-2)

- 11C first (zero-risk): `cd web && npm i react-router@^7 react-router-dom@^7`;
  16 import sites keep working (no removed APIs); optionally rewrite imports to
  'react-router'. Verify: build + 70-box gate + static self-test.
- 11A: new charts/RevenueBarChart.jsx (Bar from react-chartjs-2; tokens from
  chartDefaults; zero colour literals → S05-safe) consuming label.js topArtists
  (:96-105) already fetched by DashboardPage; render as a new Section. Gate pin:
  V16 `mainChildren.length <= 4` → 5 (ledger). New bar-chart gate box.
- 11B: new components/media/UniversalPlayer.jsx (port legacy sniffer from
  mau5trap-frontend-connected.html; SoundCloud accent via token → hex conversion,
  NO literals; drop auto_play=true). Wire in AnrRoomView.jsx:42-47 (nowListening) +
  DemoRow (:65). New player gate box.
- Doc drift: FRONTEND_ARCHITECTURE.md:201/207/220 mark as 4A-plan-not-shipped.

## 10. Step 12 — Ops hardening (D12F gate at 12F)

- 12A: delete .env.prod.template (stale: SESSION_SECRET/OPENAI_API_KEY unused —
  grep-confirmed); .env.example = single manifest + PRODUCTION section.
- 12B: assertSecrets production additions (ALLOWED_ORIGINS non-empty; reject known
  placeholder values) — fail-loud. Existing min-16 JWT check untouched.
- 12C: banner seed-password removal (server.js:64-89) — `- ${s.email}` + rotation
  notice; stdout-only, no response change.
- 12D: winston-daily-rotate-file replacing the two unbounded File transports.
- 12E: requestId on error-handler logs (body unchanged); route remaining
  console.* error/warn paths → logger (41 hits enumerated in recipe; keep email
  simulation + aiService token-usage console lines).
- 12F (GATED): /health async DB probe + truthful version. Pin flips ×4 per ledger
  (snapshot.test.js:165-170, verify_phase2.js:47-49, baseline.json:8,
  phase2_baseline.json:8) + reconcile the health BODY in both baseline files if the
  health case is byte-compared (check cases.js NONDETERMINISTIC at implementation
  time). D12F template mirrors D7's (question: flips 4 pins + body; options:
  version source package.json vs keep literal; include `database` key or not).
- 12G: scripts/backup_db.sh (sqlite3 .backup, keep 14, logs too) +
  scripts/restore_drill.sh (temp DB_STORAGE + PORT 3999 seam) + scripts/watchdog.js
  (delete stale check_api_health.js) + new OPS_RUNBOOK.md.

## 11. Step 13 — Postgres + migrations + licensing (PILOT-GATED — no build now)

Evidence: dialect branch + `pg ^8.16.3` + DATABASE_URL ALREADY wired
(models/index.js:30-34); zero raw SQL in src; ORM-clean types. Real cost (~1-2
eng-days): umzug (recommended over sequelize-cli) + initial migration freezing the
post-Step-5/6 schema + replace sync({alter:true}) in production + de-SQLite 3 test
harnesses (probe/snapshot rename dance, durability sqlite3 readback :223-225,
verify boot) + pg_dump backups. Plus THIRD_PARTY_LICENSES.md per-provider note
(entityAudit: Google KG/Wikipedia/Discogs/Genius/Fandom; integrations/: 7 providers).

---

## 12. Corrections this guide records over NEXT_STEPS_PLAN.md

1. Step 5 has FIVE stamp sites (plan said 4) — the model SEED site must be stamped
   or fresh boots throw NOT NULL.
2. Step 5's NOT NULL column add fails on the existing operator SQLite — one-time
   rebuild/backfill required; never mask with defaultValue.
3. Step 7 flips two pins the plan did not name (route count +1; unauth list 3→4) and
   P03 breaks by throwing (selector finds nothing once nothing is disabled).
4. Step 12F's version literal is pinned in FOUR places, not one.
5. Step 10's static serve is pin-invisible (express.static has no layer.route) — the
   route-count concern in the plan resolves to "no problem".
6. sync/masterLoop.js lives at /sync/, not /src/sync/.
7. Step 6b's per-user column depends on Step 9 setting req.user.id from owningUserId.
8. Route-count pin edits are relative — the ledger's running total governs, so step
   ordering never double-counts.

## 13. Rollback + verify discipline (every step)

- One commit per step (after D0); rollback = revert that commit.
- Green baseline before starting any step: `npm test` 142/142/32 + snapshot 91-case +
  `npm run verify:hermetic` 54/54 + web build + gate 70 (frontend steps).
  Use `npm run verify:hermetic` (absolute URL, isolated env, throwaway SQLite).
- After every step: re-run the suites named in the step's Verify line, AND the full
  `npm test` before the next step.
- Doc edits are pin-free (no test greps docs) — safe anytime.
- Never regenerate a snapshot baseline unless the step's ledger row says so.

## 14. Source-correct execution qualifications (do not skip)

These amend the recipes above. They do not authorize D7, D12F, or product-policy changes.

1. Step 2 must pass an absolute URL to `verify_phase2.js` (`http://127.0.0.1:<port>`).
   argv[2] is used as `BASE` verbatim; a bare port fails before the first assertion.
2. Step 1 PM2 verification must use an isolated `PM2_HOME`, a unique app name, a
   disposable working copy/cwd, an unused port, and a scratch SQLite `DB_STORAGE`.
   Do not `pm2 start`/`pm2 delete mau5trap-api` against the operator namespace or DB.
3. Any hermetic child must set `DB_DIALECT=sqlite`, empty `DATABASE_URL`, reference
   `LABEL_SLUG`, isolated cwd, blank admin/provider/mail credentials, and
   `SCHEDULE_JOBS=false`. `DB_STORAGE` alone does not isolate the Postgres branch.
4. Step 5 must not delete/rebuild the operator database. Use a nullable-add /
   backfill / constraint transition proven on disposable copies first.
5. Step 6b must exclude `User.integrations` from the public users-list projection.
6. Step 6e keeps `/sync/masterLoop.js` dormant. Scheduling it does not make
   projections Stats-backed; the projection handler reads SalesEntry or synthetic history.
7. `tests/snapshots/baseline.json` is historical Phase-1 evidence, not an executable
   pin. Live snapshot output is `.live.json`. D7/D12F remain unsigned.
8. Route-count edits are relative to the immediately preceding validated checkpoint.
