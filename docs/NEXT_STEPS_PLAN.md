# NEXT_STEPS_PLAN.md

**Date:** 2026-09-17 · **Repo:** pulsegrid-repo (HEAD `7efb44b`, Phase 4CF complete/uncommitted)
**Basis:** five read-only research agents (P1–P5, transcripts on file) + the external product
review. Every step cites verified file:line evidence. Nothing here is implemented yet.
**Execution mechanics:** see EXECUTION_GUIDE.md (supersedes this file's line-level details;
records every pin flip, the checkpoint decision, and 8 corrections found by the recipe pass).

Ground rules for every step (no-hallucination guards):
- A step is DONE only when its listed verification commands pass, run for real.
- Response-parity pins (141 tests / 91-case snapshot / verify 54 / gate 70 box) must stay
  green unless the step explicitly names a pin it flips AND lists the pin edit as part of
  the change.
- Decision-point (DP) items require explicit user sign-off before the step starts.

---

## Reconciliation: external review items vs reality

| Review item | Status | Where closed |
|---|---|---|
| Truthful CRUD (artistAccess, canonical artist SoT, durable A&R+Sales) | DONE | Phase 4CF (artistRepository.js, users.js:148-170, models AnrSubmission/SalesEntry) |
| Session lifecycle (deleted-user JWT 401, root/self-delete guards) | DONE | context.js:66-86, users.js:197-213 |
| Persist-vs-demo contract (explicit answer) | DONE (documented) | 4CF doc §6/§21; leftovers = Step 6 |
| Backend Label Intelligence Profile | DONE | src/profile/ + 4CF §11 consumers |
| Ownership root | PARTIAL | profile-as-root adequate; only AuditEvent has labelSlug (models:113) → Step 5 |
| Audit seam | DONE | AuditEvents + emitAudit ×7 |
| Usage/request attribution | DONE (seam) | usageService + X-Request-Id on all responses |
| Malformed JSON → 400 | OPEN | middleware/index.js:106-112 → Step 3 |
| Pagination conventions | PARTIAL | artists only (artists.js:55); users + anr/submissions unbounded → Step 4 |
| OpenAPI spec | ABSENT | seeds exist (routes.test.js routeTable, API_INVENTORY.md) → Step 10 |
| Versioning/deprecation policy | ABSENT | /v3 is literal prefixes, not a mount → Step 10 |
| API keys/service accounts | ABSENT (seam reserved) | insert point context.js:66-67 → Step 9 |
| PM2 config | BROKEN | ecosystem.config.js:4-6 → Step 1 |
| verify script idempotence | BROKEN | package.json:14 → Step 2 |
| change-password policy | OPEN | auth.js:217-232 → Step 8 |
| reset-password flow | PINNED-DEAD | routes.test.js:142-143 → Step 7 (DP) |
| Migrations (over sync({alter:true})) | OPEN | models/index.js:137 → Step 13 (pilot-gated) |
| RevenueBarChart / UniversalPlayer | MISSING in Vite app | see Step 11 |
| Backups / health / secrets / licensing | OPEN | Steps 12, 13 |

## Build-now steps (trust tier, pre-4D)

### Step 1 — Deployment truth (small)
Fix `ecosystem.config.js`: script `./server.js`, `exec_mode:'fork'`, `instances:1`,
`env_production:{NODE_ENV:'production'}`, `restart_delay:3000`. Correct the four wrong
docs: README.md:74, QUICKSTART.md:18, PRODUCTION_DEPLOYMENT.md:37+78, package-production.json:7
(`node server.js`). Closes F-8.
Verify: `pm2 start ecosystem.config.js; curl :3000/health` (P4 evidence: cluster/alter races,
N cron duplicates, N log writers).

### Step 2 — Hermetic verify (small)
Wrap verify_phase2.js to self-spawn server.js on a dedicated port with temp `DB_STORAGE`,
`ADMIN_EMAIL/PASS=''`, `SCHEDULE_JOBS=false`, `JWT_SECRET` ephemeral — mirroring
durability.test.js:31-118 pattern. Keep all 54 assertions untouched.
Verify: `npm run verify` twice in a row (both 54/54), AND once while the operator :3000
server + DB are live — operator DB bytes unchanged before/after (mtime+size check).

### Step 3 — Error contract tidies (small)
- middleware/index.js:106-112: `err.type==='entity.parse.failed'` → 400 `{error:'Malformed JSON body'}`.
- Normalize duplicate strings ('Internal error'→'Internal server error' etc.) ONLY after
  confirming no snapshot case pins the old string (grep snapshots first).
- Document the envelope (3 shapes + the one deliberate `{error,id}` outlier, artists.js:97)
  in API_INVENTORY.md.
Verify: full suite + probes for 400-on-malformed JSON.

### Step 4 — Pagination on unbounded lists (small)
GET /v3/users and GET /v3/anr/submissions: opt-in `limit`/`offset` (+ envelope `{..., total}`
entirely additive when params present; response identical when params absent).
Verify: snapshot suite green (defaults unchanged); new unit tests for limit/offset/total.

### Step 5 — Ownership consistency (small)
Add `labelSlug` to AnrSubmission + SalesEntry models (mirror AuditEvent, models:113) and
stamp at all create sites (anr.js:97,115,469; analytics.js sales + upsert). No response
changes. Customer/Label table = DEFERRED (dedicated-deployment profile-as-root is adequate;
full table only if one process ever serves >1 label).
Verify: fresh boot columns exist; durability + snapshot suites green.

### Step 6 — Product-state truth (small–medium)
- Campaigns: `Campaign` model; marketing.js:38-55 persists + new GET read-back; keep the
  EXACT response shape (marketing_campaign_create is NONDETERMINISTIC, shape-checked);
  campaigns_stats_admin is deterministic — body must stay byte-identical.
- Integrations: per-user `integrations` JSON column on User (or UserIntegration table);
  swap the 3 read/write sites in integrations.js (L119, L145-152, L160-164); keep "(Mock)"
  labels. Blast radius: NONDETERMINISTIC probes only.
- A&R store #2: DOCUMENT-ONLY decision (demos/whiteboard/nowListening stay ephemeral demo;
  whiteboard/nowListening are label-wide singletons that don't fit per-demo rows). DO NOT
  unify vote semantics.
- apiCache: delete from bundle (inMemoryStores.js:77-87 + 14 dead destructures).
- Stats/masterLoop: mark dormant explicitly in code comment + docs (DO NOT wire the sync
  loop — it flips projections synthetic→real, a data-pipeline project).
Verify: snapshot + route-table + durability suites.

### Step 7 — Password reset flow (DP first) (medium)
DP: shipping this flips deliberate pins — routes.test.js:142-143, cases.js:142, two
snapshot baseline files (baseline.json:1706, phase2_baseline.json:2780; current.json
regenerates on the next snapshot run, no manual edit), gate F16/P03 (gate.mjs:246-248,
586-588). Sign-off required.
Change: POST /v3/auth/reset-password (validate token+expiry at auth.js:139-140, min-8
password), env-driven resetLinkBase (config:130), un-disable LoginPage.jsx:43, add
`/reset-password` route + token step.
Verify: the named pins updated deliberately; full suite + gate.

### Step 8 — Password policy + quotas (small)
- change-password min length (auth.js:217-232).
- Per-user quota stubs on POST /v3/ai/query + entity-audit ?refresh=true (seam exists:
  usageService recordUsage).
Verify: suite + new quota unit tests.

### Step 9 — API keys / service accounts (medium)
ApiKey model (labelSlug, scopes/role, artistAccess, expiresAt, revoked, owningUserId) +
generate/revoke routes (admin). Branch in context.js BEFORE jwt.verify (context.js:66-67);
key requests set req.user; composite otherwise untouched. Update the 63-route pin
deliberately. Audit coverage for key-authenticated writes (numeric actorId preserved).
Verify: new key-auth tests; route-table + snapshot suites (with pin edit).

### Step 10 — OpenAPI + versioning policy (medium)
Hand-write openapi.yaml from routes.test.js routeTable + API_INVENTORY.md (both exist;
the work is ~25 response schemas). Coverage test: routeTable ⊆ spec paths. Add a versioning
paragraph to API_INVENTORY.md (additive-only v3; breaking → new prefix; deprecation
window). No runtime route for the UI (protects the 63-pin); serve the spec as a static file.
Verify: spec validators + coverage test + unchanged suites.

## Frontend debt (interleavable, small–medium)

### Step 11 — RevenueBarChart + UniversalPlayer + router eval
- RevenueBarChart.jsx: consume /v3/label/overview topArtists (label.js:98-105); amends gate
  V16 (gate.mjs:346) — pin edit required.
- UniversalPlayer.jsx: port the legacy sniffer from
  pulsegrid-frontend-connected.html (Spotify/SoundCloud/YouTube embed detection);
  SoundCloud accent from theme token (hardcoding trips S05, static-checks.mjs:84-89); wire
  into AnrRoomView for nowListening + DemoRow.
- Also correct doc drift: FRONTEND_ARCHITECTURE.md:201/207/220 describe RevenueBarChart,
  UniversalPlayer and reset-token states as built — mark them as 4A plan, not shipped.
- React Router: bump to v7 (installed 6.30.6; advisories have no exploitable surface here,
  16 import sites, no removed APIs — P3 evidence). Run build + full 70-box gate.
Verify: npm run build; 70-box gate + new player gate box; static S01-S09 + self-test.

## Pre-pilot operations (runbook tier)

### Step 12 — Ops hardening (small–medium, mostly docs/scripts)
- Secrets: reconcile .env.example vs .env.prod.template into one manifest; production
  assertSecrets additions (ALLOWED_ORIGINS, placeholder-rejection); banner drops printed
  seed passwords (replace with rotation notice).
- Observability: winston rotation; requestId attached on error-handler logs; route
  integrations/jobs console.* → logger.
- /health: report DB reachability + truthfully sourced version (system.js:37-43; hardcoded
  '3.0-production' drifts from package.json).
- Backups: daily script (sqlite3 .backup, keep N=14, logs/ too) + restore drill runbook
  using the DB_STORAGE + temp-port seam; watchdog script hitting /health (retire the stale
  check_api_health.js login-smoke in favour of the watchdog).
Verify: production-mode boot; restore drill on scratch DB; log rotation observed.

## Pilot-gated (do NOT build now)

### Step 13 — Postgres + migrations + licensing review
Evidence (P2): dialect branch + `pg` dep ALREADY wired (models/index.js:30-34); zero raw
SQL in src; types are parity-compatible; the real cost = migration tooling (absent — choose
sequelize-cli/umzug then) + rewriting the 3 test harnesses' SQLite-file mechanics
(snapshot rename dance, probe.js, durability sqlite3 readback). Backups become pg_dump.
Also: one-page per-provider licensing/TOS note (Discogs CC0-but-TOS, Fandom CC-BY-SA
scraping, Wikipedia hotlinks, TikTok/Ticketmaster/X commercial terms).

## Explicit DO-NOT-BUILD list (all three reviews concur)

Full multi-tenancy/tenant_id · billing/Stripe · SSO/SAML/SCIM · enterprise IAM · Kafka/
microservices · Kubernetes · N-provider AI router · real ad-platform/API campaign engines ·
real provider OAuth · fan-data ingestion platform · wiring masterSyncLoop · unify-ing A&R
vote semantics · full APM/vault tooling. Seams for all of these already exist (named above).

## Suggested execution order

1 → 2 → 3 → 4 → 5 → 6 (trust tier closes) → 7 (DP) & 8 → 9 → 10
Then Phase 4D product work interleaves with 11. Steps 12–13 run when a pilot label is real.