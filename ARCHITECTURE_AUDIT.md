# ARCHITECTURE_AUDIT.md

Read-only audit. No source file was modified. All line numbers refer to the repo at
commit `c0281d8` ("Full reupload - fresh version of the entire project").

Repo history is 2 commits (`623c169`, `c0281d8`) on `master` only. There is no branch,
tag, or CI config, so "production" cannot be determined from deployment history — it is
inferred from code wiring below.

---

## 1. Backend entrypoints — canonical vs competing

| Candidate | Lines | Verdict | Evidence |
|---|---|---|---|
| `mau5trap-production-api.js` | 3207 | **CANONICAL** | Only file the two dashboards target (port 3000, `/v3` prefix); named by `ecosystem.config.js:4`; named by `package-production.json` `main`/`start`; `module.exports = app` (L3207) |
| `Server v5.js` | 99 | **LEGACY / ORPHAN** | Different API surface (`/api/*`, not `/v3/*`); different store (`mau5_db.json`, L15); plaintext passwords (L25-26); no frontend references it; filename contains a space so it cannot be an npm script target |
| `server.js` | — | **DOES NOT EXIST** | `package.json:5` declares `"main": "server.js"` and `"start": "node server.js"` |
| `mau5trap-api-server.js` | — | **DOES NOT EXIST** | `package1.json` `main`/`start`/`dev` all point at it |

Verified startup behaviour (real exit codes, this machine, Node v22.23.2):

```
$ npm start                 # uses canonical package.json
> node server.js
Error: Cannot find module '/home/dino/mau5trap-repo/server.js'
EXIT: 1

$ node mau5trap-production-api.js
Error: Cannot find module 'express'        # node_modules absent; npm install never run
```

So the documented start path is broken independent of dependency installation.
`PRODUCTION_DEPLOYMENT.md` §"Deploying to Clouds" gives the correct command
(`node mau5trap-production-api.js`), which contradicts `package.json`.

### Four competing project identities

| File | `name` | `version` | deps |
|---|---|---|---|
| `package.json` | `electronic-label-os` | 5.0.0 | 27 |
| `package-production.json` | `mau5trap-production-api` | 3.0.0 | 8 |
| `package1.json` | `mau5trap-api` | 3.0.0 | 4 |
| `package-lock.json` | `mau5trap-authority-platform` | 5.0.0 | lockfileVersion 3 |

`package.json` is the only manifest whose dependency set actually satisfies every
`require()` in the tree (verified: zero missing). It is therefore the canonical manifest
despite its broken `start` script. Its lockfile disagrees on the project name.

---

## 2. Module-load order — works by accident

`initDB()` is **called at L212**, but:
- `logger` is declared at **L221** and used inside `initDB` at L178, L184, L195, L207
- `labelData` is declared at **L343** and used inside `initDB` at L194, L196

Both are `const` (TDZ applies). The call does not throw only because the first statement
in `initDB` is `await sequelize.authenticate()` (L177), which defers the rest of the
function body past the end of module evaluation. Verified with an isolated mimic:

```
-- module eval finished --
[log] DB connection established.
SEED ARTISTS: would run, artists= 3
```

This is a latent trap. Any future edit that moves work before that first `await`, or
makes `authenticate()` resolve synchronously, converts this into a boot-time
`ReferenceError: Cannot access 'logger' before initialization`.

Also: the `JWT_SECRET` production guard at L215-218 runs *after* `initDB()` is
dispatched at L212, so a DB connection is attempted before the security precondition
is enforced.

---

## 3. Data layer — three parallel sources of truth

Persistence is split three ways with no owner:

**(a) Sequelize / SQLite** — `mau5trap_v5.sqlite` (L139), dialect switchable to
postgres via `DB_DIALECT` (L128-142). Three models only:

| Model | Line | Key | Notes |
|---|---|---|---|
| `User` | 145 | INTEGER autoincrement | `pageAccess` is stringified JSON in a STRING column (L152); `resetTokenExpiry` is a STRING "for SQLite safety" (L155) |
| `Artist` | 158 | STRING (`art_*`) | entire domain object dumped into a `data` JSON column (L162) |
| `Stats` | 165 | INTEGER autoincrement | `artistId` STRING — **no foreign key to `Artist`** |

There are **zero Sequelize associations** in the codebase (no `hasMany`, `belongsTo`,
`hasOne`). `Stats.artistId` and `User.artistAccess` are untyped string references.
`sequelize.sync({ alter: true })` (L179) runs on every boot — schema is mutated in place
at runtime, with no migration files.

**(b) `mock/artistData.js`** — 29 artists, 2714 lines, aliased to `labelData` at L343
and referenced at **39 sites**. This is the de facto primary read source.

**(c) Module-scope objects** that die on restart:

| Store | Line | Holds |
|---|---|---|
| `limiters` | 396 | token buckets |
| `userIntegrations` | 402 | per-user OAuth connection state |
| `apiCache` | 724 | **dead — never read or written anywhere** |
| `prospects` | 1383 | A&R prospects |
| `anrSubmissions` | 1398 | A&R demos (store #1) |
| `anrState` | 1722 | whiteboard, nowListening, demos (store #2) |
| `operationsData` | 2796 | logistics/assets/contracts |
| `salesData` | 3041 | sales writes from `POST /v3/analytics/sales` |

### The DB/mock seam is incoherent

`GET /v3/artists` (L729-740) reads `Artist.findAll()` **then unions in every mock artist
not present in the DB**:

```js
const dbIds = new Set(fullList.map(a => a.id));
const memoryArtists = labelData.artists.filter(a => !dbIds.has(a.id));
fullList = [...fullList, ...memoryArtists];
```

Meanwhile `GET /v3/artists/:id` (L926), `POST /v3/royalties/calculate` (L1330),
`GET /v3/rights/contracts` (L1361), `GET /v3/reports/monthly/...` (L2010) and 30+ other
sites read **only** `labelData`. Consequence: an artist created via
`POST /v3/artists` is written to both the DB and pushed onto `labelData.artists`
(L791-796) — but after a restart the mock array resets while the DB row persists, so
list and detail views diverge permanently.

`Artist.status` has values `active|archived|developing` (L161), but archive/restore
(L802-838) mutate `labelData` objects, not the DB column that `sync/masterLoop.js:21`
filters on.

### Global mutation bug

Four handlers call `.sort()` directly on the shared `labelData.artists` array, which
sorts **in place**:

- L900 `POST /v3/ai/analyze` — sort by roi
- L903 same handler — sort by touring revenue
- L906 same handler — sort by growthRate
- L2582 `getLabelOverview()` — sort by monthlyListeners

Verified:
```
order before: art_attlas,art_blackgummy,art_bluemora
order after : art_holyu,art_blackgummy,art_fehrplay
MUTATED: true
```
Any request hitting these paths permanently reorders the roster for every subsequent
request process-wide, including paginated `GET /v3/artists` results. Under PM2 cluster
mode (`ecosystem.config.js:5-6`, `instances: 'max'`) each worker holds a *different*
ordering, so pagination is nondeterministic per request.

---

## 4. Background jobs, caching, reporting

| Concern | Status | Evidence |
|---|---|---|
| Monthly report cron | **registered** | `cron.schedule('0 3 1 * *')` L2472; iterates `labelData.artists`, writes `reports/<YYYY-MM>/`, optional `autoPrintReport` |
| Master sync loop | **NEVER REGISTERED** | `sync/masterLoop.js` exports `masterSyncLoop` (L80); the only `require` of it is in `test_sync.js` / `test_sync_draft.js`. `grep masterSyncLoop mau5trap-production-api.js` → no match |
| `NodeCache` | active | L25, `stdTTL: 3600`; used for artist data (L296-311, 24h), entity audit (L1043, 2 weeks), Genius (L1058, unlimited), AI query (L1232) |
| `apiCache` | **dead** | declared L724, zero reads/writes |
| PDF | active | `pdfkit-table` L18; 4 global `ChartJSNodeCanvas` instances L28-31 |
| CSV | active | `csv-writer` required inline at L2650 |
| Email | conditional | `nodemailer` L528; falls back to `jsonTransport` (console log) when no SMTP key — L540-542 |
| Shell exec | present | `autoPrintReport` L2505-2528 |

### Consequence of the unregistered sync loop

`Stats` is the only time-series table and nothing ever writes to it in the running app.
So `GET /v3/analytics/projections` (L3058) — documented in `README.md:46-51` as linear
regression over "12 months of historical revenue data" — has no historical data to
regress. It falls back to `labelData` (L3087-3090).

### Directories assumed to exist but absent from the repo

- `logs/` — winston writes `logs/error.log` and `logs/combined.log` (L226-227) with no
  `mkdirSync`. Absent from the clone.
- `reports/` — `README.md:99` calls it a project directory; absent. Created lazily at
  L2039 / L2482, so only the report paths self-heal.

### Command injection surface

`autoPrintReport(filepath)` (L2505) interpolates `filepath` straight into a shell string
(L2513 `powershell ... -FilePath '${filepath}'`, L2516 `lpr "${filepath}"`, L2519
`lp "${filepath}"`) and passes it to `exec`. Today the only caller is the cron at L2494
with a server-derived path — but that path embeds `artist.name` (L2487
`${artist.name}_${month}_report.pdf`), and `artist.name` is attacker-controllable via
`POST /v3/artists` (L767). Reachability is gated on `AUTO_PRINT === 'true'` (L2493).

---

## 5. AI / LLM integration

Client: `groq-sdk` (L21), instantiated once at L24 with `process.env.GROQ_API_KEY`.
Model at every call site: `llama-3.1-8b-instant`. `README.md:26` calls this
"'Grok' AI integration" — wrong vendor; the code is Groq (GroqCloud), not xAI Grok.

Three real call sites plus one keyword-matcher impostor:

| Site | Line | Prompt | Output handling | Failure |
|---|---|---|---|---|
| `GET /v3/artists/:id/entity-audit` | 1110 | L1108, asks for "Format as JSON" | **`JSON.parse` on raw model text** (L1117) | caught → static stub (L1119) |
| `POST /v3/ai/query` | 1261 | system+user, user prompt truncated to 500 chars (L1269) | plain text (L1277) | `NODE_ENV=development` → **fabricated fake answer** (L1296-1300); else 500 with `err.message` |
| report generation | 2139 | — | — | — |
| `POST /v3/ai/analyze` | 891 | **no LLM at all** | `if (lowerQuery.includes('roi'))` keyword chain L899-910 | n/a; returns hardcoded `confidence: 0.98` (L916) |

Problems:

1. **No structured-output enforcement.** L1108 asks for JSON in prose. There is no
   `response_format: { type: 'json_object' }`, no schema, no repair pass. `JSON.parse`
   at L1117 will throw on any prose preamble or fenced code block — the common case for
   an 8B model. The catch silently degrades to `{ summary: 'AI analysis unavailable' }`,
   so the failure is invisible to the caller.
2. **`zod` is in `package.json` and used by `SafeStatsSchema`, but never applied to LLM
   output** — validation exists in the repo and is not wired to the thing that needs it.
3. **Dev fallback fabricates data.** L1298 returns
   `"[Dev Fallback] Growth is stable at 2.5%. Recommend increasing tour frequency in EU."`
   as `success: true` with no distinguishing flag other than `source: 'fallback'`. A
   client reading `answer` cannot tell this from a real analysis.
4. **`POST /v3/ai/analyze` is branded AI and is a keyword `if` chain**, hardcoding
   `confidence: 0.98` and the literal string "Rezz is second at 6.5x" (L901). This is the
   endpoint the executive Command Center calls for its "AI Query Terminal"
   (`mau5trap-terminal-dashboard.html:492`).
5. **No token/cost ceiling or per-user quota.** `max_tokens` is capped per call
   (300/400) but any authenticated user can call `POST /v3/ai/query` up to the global
   1000 req/hour IP limit. Cost is billed to the operator's Groq key.
6. **Missing key is not validated.** L24 constructs the client with
   `apiKey: undefined` if unset; failure surfaces only at first request.

---

## 6. Authentication & authorization

Flow: `POST /v3/auth/login` (L478) → `jwt.sign(..., { expiresIn: '24h' })` →
client stores token → `authenticateToken` (L428) verifies on 62 of 63 live routes.

### Unauthenticated routes (3)
`POST /v3/auth/login` (478), `POST /v3/auth/forgot-password` (572), `GET /health` (3149).

### Token payload is inconsistent across the two login branches

| Branch | Line | Payload keys |
|---|---|---|
| env admin override | 483 | `email, role, artistAccess, integrationCount` — **no `id`** |
| DB user | 500-505 | `email, role, artistAccess, integrationCount` — **no `id`** |
| `generateToken()` helper | 414-425 | `id, email, role, artistAccess` — **function is never called** |

`generateToken` is dead code (only the declaration matches). Because neither live branch
includes `id`, every handler reading `req.user.id` gets `undefined`:

- L609 `User.findByPk(undefined)` → `DELETE /v3/auth/me` (GDPR delete) **cannot work**
- L631 → `GET /v3/auth/me` returns 404 for a valid token
- L657 → `POST /v3/auth/change-password` broken
- L1170, L1194-1213 → `userIntegrations[undefined]` — **all users share one
  integration-state bucket**
- L1452 → A&R vote attribution collapses to a single `undefined` voter

### `hasArtistAccess` is broken for the only artist role that exists

```js
function hasArtistAccess(user, artistId) {   // L447
    if (user.role === 'admin') return true;
    if (user.artistAccess === 'all') return true;
    if (Array.isArray(user.artistAccess)) return user.artistAccess.includes(artistId);
    return false;
}
```

`User.artistAccess` is a `DataTypes.STRING` (L151) and the seeded artist gets the scalar
`'art_rezz'` (L189). A string is never `Array.isArray`, so the function falls through to
`return false`. Verified:

```
seeded artist user can access art_rezz?     false
seeded artist user can access art_deadmau5? false
```

The seeded artist account cannot read its own artist record. Every artist-scoped
route (L922, L1144, L1250, L2006, L2549, L2898) denies the artist role outright.
`filterDataByAccess` (L457) has the same defect via the same helper, so
`GET /v3/artists` returns an empty array for artists.

### Authorization is scattered, not layered

There is no policy module. Authorization is 20+ inline copies of
`if (req.user.role !== 'admin') return res.status(403)`. Only two named guards exist:
`authenticateToken` (L428) and `checkExportAccess` (L2536, applied to exactly one route,
L2595). `pageAccess` is persisted (L152), parsed at login (L498) and returned to the
client — but **never enforced server-side**; no route reads it. It is decorative.

### Password reset is broken end to end

`POST /v3/auth/forgot-password` (L572) mints a token, stores it (L579-581), and emails a
link to `http://localhost:8080/reset-password?token=...` — **hardcoded localhost**
(L583). The frontend posts to `POST /v3/auth/reset-password`
(`mau5trap-frontend-connected.html:2998`) and **that route does not exist** on the
server. The reset token can never be redeemed.

Additional: L576 returns `404 {'error':'User not found'}` for unknown emails — a user
enumeration oracle.

---

## 7. Duplicate and dead code

### Shadowed routes (Express binds the first; later ones are unreachable)

| Route | Lines | Live | Dead |
|---|---|---|---|
| `POST /v3/users` | 677, 1671, 1771 | 677 | 1671, 1771 |
| `POST /v3/ai/analyze` | 891, 1311 | 891 | 1311 |
| `PUT /v3/users/:id` | 1691, 1785 | 1691 | 1785 |
| `DELETE /v3/users/:id` | 1710, 1805 | 1710 | 1805 |
| `GET /v3/anr/scout` | 1394 (commented), 2698 | 2698 | — |

These are not identical copies. The dead `POST /v3/users` at L1771 accepts and persists
`artistAccess` and `pageAccess`; the live one at L677 accepts `artistAccess` but sets
`pageAccess` to the model default. So the admin user-creation behaviour the later code
intends is silently not the behaviour in effect.

The comment at L1310 — "Alias old endpoint to new one for compatibility" — describes the
intent of the L1311 handler, which is unreachable.

### Two competing A&R demo stores, both live, both used by the frontend

| Store | Line | Routes | Frontend calls |
|---|---|---|---|
| `anrSubmissions` | 1398 | GET/POST `/v3/anr/submissions` (1422/1427), `/vote` (1449), DELETE (1482) | yes (4 sites) |
| `anrState.demos` | 1722 | `/v3/anr/state` (1821), `/whiteboard` (1845), `/listening` (1856), `/vote/:demoId` (1873), `/stats/:demoId` (1929), `/demos` (1956) | yes (3 sites) |

The workstation UI votes through **both** `/v3/anr/submissions/${id}/vote` and
`/v3/anr/vote/${demo.id}`, against two unrelated arrays with different vote models
(scalar `votes` count vs a `ratings[]` array). There is no reconciliation.

### Other dead code

- `generateToken()` L414 — never called
- `apiCache` L724 — never read or written
- `SpotifyWebApi` re-instantiated at L2692 with the literal strings
  `'your-client-id'` / `'your-client-secret'`, duplicating the properly
  env-configured client in `integrations/spotify.js:9`
- `Server v5.js` — entire legacy server
- `package1.json`, `package-production.json` — manifests for nonexistent entrypoints
- Declared-but-never-required deps: `canvas`, `chart.js`, `pg`
  (`canvas` is a transitive peer of `chartjs-node-canvas`; `pg` is needed only if
  `DB_DIALECT=postgres`, so it is defensible; `chart.js` is genuinely unused server-side)
- `create_sub.json`, `create_sub_2.json` — loose request fixtures, no reference in code
- 6 images (`final.jpeg`, `nope.jpeg`, `unreal.jpeg`, `G6lxjgsWYAA_9GA.jpeg`, ~900KB)
  and 8 committed PDFs/CSVs — build artifacts committed to source

---

## 8. Architectural boundaries missing or violated

1. **No layering at all.** One 3207-line file holds config, chart rendering, ORM models,
   seeding, auth middleware, rate limiting, 63 route handlers, PDF/CSV generation, cron,
   and shell-out printing. No `routes/`, `services/`, `repositories/`, `middleware/`.
2. **No data-access layer.** Handlers reach directly into `labelData`, Sequelize models,
   and module-scope objects interchangeably — sometimes within one handler (L733-740).
3. **No validation layer.** `zod` is installed and used in exactly one place
   (`modules/SafeStatsSchema.js`, applied only to Spotify output at
   `integrations/spotify.js:77`). No request body is validated. `POST /v3/artists`
   (L767) accepts arbitrary JSON into a JSON column.
4. **No authorization layer.** See §6.
5. **No config layer.** `process.env` is read at 40+ sites with inline `||` defaults; no
   central schema; `ALLOWED_ORIGINS` documented but never read.
6. **Integration boundary is leaky.** `integrations/` is a clean module boundary, then
   L2692 bypasses it with a second hardcoded Spotify client.
7. **Mock is a hard dependency of production code**, not a swappable adapter:
   `require('./mock/artistData')` at L276 is unconditional and 39 sites use it directly.
8. **No response contract.** Shapes vary per handler:
   `{artists, total, limit, offset}` (L754), bare arrays, `{success, ...}` (L1285),
   `{error, message}` (L3163). Duplicate keys in one literal (`role` and `artistAccess`
   each appear twice in the login response object, L512-515).
9. **Cluster-unsafe by construction.** `ecosystem.config.js:5-6` runs `instances: 'max'`
   in cluster mode while all A&R state, integration state, sales data, and the
   `NodeCache` are per-process memory. Votes land on random workers; nothing is shared.
10. **Frontend has no build step or module system.** 3826-line and 587-line single-file
    HTML apps with inline JSX/JS; `API_BASE` hardcoded to localhost in both.

---

## 9. Documentation claims that contradict the source

| Doc claim | Reality |
|---|---|
| `README.md:26` "'Grok' AI integration" | Groq (`groq-sdk`, `llama-3.1-8b-instant`), not xAI Grok |
| `README.md:99` "`/reports`: Directory where PDF reports are generated" | Directory absent from repo; created lazily at L2039/L2482 only |
| `README.md:46-51` projections use "12 months of historical revenue data" | `Stats` is never populated (sync loop unregistered); L3087-3090 falls back to mock |
| `README.md:31` "RBAC with JWT authentication" | RBAC is broken for the artist role (§6); `pageAccess` never enforced |
| `README.md:89-91` credentials admin/artist | Matches seed (L188-189), but the artist account cannot read anything (§6) |
| `package.json:5` `node server.js` | File does not exist; verified `EXIT: 1` |
| `PRODUCTION_DEPLOYMENT.md` "Cors: Strict origin checking in production" | `cors({ origin: true })` L246-249 reflects **any** origin with `credentials: true`; `ALLOWED_ORIGINS` never read |
| `PRODUCTION_DEPLOYMENT.md` "app will crash on startup if JWT_SECRET is missing" | True only when `NODE_ENV === 'production'` (L215). Otherwise silently falls back to `'your-secret-key-change-this'` (L411) |
| `PRODUCTION_DEPLOYMENT.md` "In-memory caching for the heavy `/v3/artists` endpoint (5-minute TTL)" | `apiCache` (L724) is dead; `/v3/artists` (L729) is uncached and hits the DB every request |
| `PRODUCTION_DEPLOYMENT.md` "Logs are written to the `logs/` directory" | `logs/` absent, no `mkdirSync` |
| Server banner L3201 `joel@deadmau5.com (mau5123)` | Never seeded. Only 2 users created (L188-189). Also asserted by `MASTER_GUIDE.md:130`, `PRODUCTION_FEATURES.md:50` |
| Banner L3193 "Monthly Report Generation ✓", L3194 "Auto-Printing Enabled ✓" | Cron is registered but printing requires `AUTO_PRINT=true` (L2493); banner prints unconditionally |
| `START_HERE.md` "full source code for the label's operating system" | Canonical entrypoint cannot start via documented command |
