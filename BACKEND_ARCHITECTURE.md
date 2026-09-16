# BACKEND_ARCHITECTURE.md

Current state of the mau5trap backend after the Phase 2 decomposition.
Every claim here was verified against the source; line references point at the
module that now owns the behavior.

---

## 1. Entrypoint and boot sequence

`server.js` is the canonical entrypoint (`package.json` → `main` / `start`).
It is deliberately thin and owns boot ORDER, which the original got wrong.

```
server.js
  1. config.assertProductionSecrets()     // fail fast before any side effect
  2. require('./mau5trap-production-api') // builds the Express app (no listen)
  3. await api.initializeDatabase()       // connect, sync, seed
  4. registerJobs()                       // cron registered explicitly
  5. app.listen(PORT)                     // only now accept traffic
  6. SIGTERM/SIGINT -> graceful close
```

Two ordering bugs from the original are fixed by this sequence:

- **Cold-start race.** The monolith called `initDB()` at module scope and bound
  the listener immediately, so on a fresh database seeded users did not exist
  when the first request arrived. Measured: **1 of 6 cold starts returned 401
  for `admin@mau5trap.com`**. Now init is awaited before `listen`; 6/6 return
  200.
- **Guard ran after the DB connection.** `JWT_SECRET` validation happened
  *after* `initDB()` was dispatched. It is now the first statement executed.

`mau5trap-production-api.js` is no longer a monolith. It is a ~80-line
assembler: middleware → routes → error handlers, plus
`module.exports = { app, initializeDatabase, PORT }`.

---

## 2. Layer map

```
server.js                     canonical entrypoint (boot order, listen, signals)
mau5trap-production-api.js    app assembler (middleware -> routes -> handlers)

src/
  config/
    index.js                  ALL process.env reads; frozen legacy defaults
    logger.js                 winston; creates logs/ if absent
  middleware/
    index.js                  helmet, compression, cors, json, request log,
                              rate limit; terminal error + 404 handlers
  auth/
    index.js                  authenticateToken, hasArtistAccess,
                              filterDataByAccess, checkExportAccess,
                              generateToken (dead, preserved)
  models/
    index.js                  sequelize instance, User/Artist/Stats, initDB
  repositories/
    artistRepository.js       mock lookup, hybrid DB+mock union, cache-aware
                              getArtistData, ranking helpers
    inMemoryStores.js         prospects, anrSubmissions, anrState,
                              userIntegrations, salesData, apiCache(dead)
    operationsRepository.js   static logistics/assets/contracts fixtures
  services/
    cacheService.js           single NodeCache owner; named key builders + TTLs
    emailService.js           nodemailer transport, sendEmail, sendPasswordReset
    entityAuditService.js     orchestrates 5 providers + AI + 2-tier caching
  integrations/
    index.js                  FACADE over all external data sources
    rateLimiter.js            RateLimiter class, SERVICES registry, limiters
    scoutService.js           A&R scout mock provider
  ai/
    groqClient.js             model invocation ONLY; lazy init + timeout
    prompts.js                every prompt string, frozen
    responseParser.js         tolerant JSON parse + zod validation + fallback
    aiService.js              business operations; returns discriminated results
  analytics/
    regression.js             OLS regression + synthetic history generator
  reports/
    monthlyReport.js          379-line pdfkit report builder (verbatim)
  jobs/
    index.js                  registerJobs(); explicit, not a require side effect
    monthlyReportJob.js       cron '0 3 1 * *', autoPrintReport
  routes/
    index.js                  mounts 13 domain modules in the original order
    context.js                dependency bundle passed to each route module
    auth|users|artists|label|ai|integrations|finance|anr|marketing|
    reports|operations|analytics|system .js
  utils/
    charts.js                 4 ChartJSNodeCanvas generators
    dataShape.js              calculateTotalRevenue, flattenData, filterMetrics

LEGACY — still present, canonical app no longer depends on it:
  Server v5.js                orphan v5 server (/api/* surface, plaintext pwds)
  package1.json               manifest for a nonexistent entrypoint
  package-production.json     manifest for the old entrypoint
  mock/artistData.js          STILL LOAD-BEARING (primary read source)
  modules/entityAudit.js      STILL LOAD-BEARING (via integrations facade)
  integrations/*.js           STILL LOAD-BEARING (via facade)
  sync/masterLoop.js          written, never registered
```

### Dependency direction

```
routes -> controllers-in-routes -> services -> repositories -> models
                                      |             |
                                      v             v
                                 integrations    mock data
                                      |
                                      v
                            legacy integrations/*, modules/entityAudit
```

No inward-facing violations remain: `src/models` imports only `config`,
repositories never import routes, and no route handler calls a third-party API
directly. All external traffic passes through `src/integrations/index.js`.

---

## 3. Route organisation and why ORDER is a contract

63 routes are registered across 13 domain modules. `src/routes/index.js` mounts
them in `DOMAIN_ORDER`, which is the first-appearance order of each domain in
the pre-split file.

This matters because Express binds the **first** matching handler and this
application contains five shadowed duplicates:

| Route | Registrations | Live | Dead |
|---|---|---|---|
| `POST /v3/users` | 3 | 1st | 2nd, 3rd |
| `PUT /v3/users/:id` | 2 | 1st | 2nd |
| `DELETE /v3/users/:id` | 2 | 1st | 2nd |
| `POST /v3/ai/analyze` | 2 | 1st | 2nd |

Two properties were verified before grouping, and are now asserted by
`tests/regression/routes.test.js`:

1. **Every duplicate pair lives in ONE domain**, so intra-domain order (which
   each module preserves verbatim) still decides the winner.
2. **No route pattern in one domain shadows a literal path in another** — there
   is no `/v3/:x` catch-all.

`GET /v3/exports` retains its `checkExportAccess` guard; the suite asserts the
middleware chain by name.

---

## 4. AI/LLM boundary

Previously: `new Groq()` at module load, three `groq.chat.completions.create`
calls inside route handlers, `JSON.parse` on raw model text, no timeout.

Now four modules with one responsibility each:

| Concern | Module | Notes |
|---|---|---|
| Prompt construction | `ai/prompts.js` | 3 templates, byte-frozen |
| Model invocation | `ai/groqClient.js` | **lazy** construction, 20s timeout, injectable transport |
| Parsing + validation | `ai/responseParser.js` | tolerant parse (fences/prose) then zod; falls back to the verbatim original stub |
| Business operations | `ai/aiService.js` | `query`, `analyzeEntityHealth`, `analyzeByKeyword`, `reportInsight` |

Improvements that cannot change a response body:

- **Lazy client.** The SDK throws at construction when `GROQ_API_KEY` is unset
  (empty string is fine), which previously made the entire app fail to load.
  Verified on git HEAD. Now the failure is deferred to the first AI request.
- **Timeout.** A hung completion used to hang the request forever; it now
  rejects into the handler's existing catch, producing the same body.
- **Recovery, not rewrite.** `parseJsonLoose` tries the original strict
  `JSON.parse` first; only on failure does it try fenced-block/prose
  extraction. It can turn a former failure into a success, never the reverse.
- Diagnostics ride on a **non-enumerable** `_meta`, so they cannot leak into
  JSON responses.

`aiService.query()` returns a discriminated result (`cached | ok | fallback |
error`); the route maps it to the pre-existing bodies and status codes.

### Preserved AI defects

- `POST /v3/ai/analyze` performs **no model call** — substring matching with a
  hardcoded `confidence: 0.98` and the literal "Rezz is second at 6.5x". It is
  now named `analyzeByKeyword()` so the fake is explicit.
- The **dev fallback fabricates analytics**: outside production a failed call
  returns `200 {success:true, answer:"[Dev Fallback] Growth is stable at
  2.5%..."}`. Only `source:'fallback'` distinguishes it.
- The entity-audit prompt still asks for JSON in prose with no
  `response_format` and no schema.
- No per-user AI quota — see §7.

---

## 5. Data access and persistence

Unchanged schema, unchanged persistence behavior.

| Model | Key | Notes |
|---|---|---|
| `User` | INTEGER autoincrement | `pageAccess` is stringified JSON in a STRING column; `artistAccess` is a STRING |
| `Artist` | STRING (`art_*`) | entire domain object in a JSON `data` column |
| `Stats` | INTEGER autoincrement | `artistId` is a STRING with **no FK**; table is never written |

`sequelize.sync({ alter: true })` still runs on every boot (no migrations).

### Three sources of truth — preserved, now visible

1. **SQLite/Postgres** via Sequelize.
2. **`mock/artistData.js`** — 29 artists; still the primary read source for most
   endpoints and the seed for `Artist`.
3. **Process memory** — `inMemoryStores.js`: A&R (two stores), sales, campaigns,
   integration connections. Lost on restart, not shared across PM2 workers.

`artistRepository.findAllHybrid()` keeps the union that `GET /v3/artists`
performed: read the DB, then append every mock artist absent from it.

Two repository notes worth knowing:

- **Ranking helpers sort the shared array IN PLACE**, exactly as before. Copy-
  first is *not* equivalent: the `/v3/ai/analyze` "tour" branch reads
  `artists[1]` *after* sorting, so its output depends on the mutation. I
  measured that the mutation is not observable through any endpoint
  (`tests/support/sort_side_effect_check.js` → "OBSERVABLE THROUGH API? NO"),
  because after seeding the mock-only union is empty.
- `getAllArtists()` had **zero call sites** and is retained, not deleted.

---

## 6. Integrations

`src/integrations/index.js` is a facade; `createIntegrationFacade({...})` makes
every provider injectable, which is how the service tests run with no network.

| Group | Providers | Entered via |
|---|---|---|
| Social/streaming | spotify, instagram, ticketmaster, youtube, twitter, tiktok | `fetchArtistData` (gated by `USE_REAL_DATA`) |
| Metadata/identity | Google KG, Wikipedia, Discogs, Genius, Fandom | audit\* passthroughs |
| A&R scouting | mock fixtures | `searchScouts` |

**Rogue client removed.** The monolith built a second `SpotifyWebApi` with
literal `'your-client-id'` / `'your-client-secret'`. I verified it was **never
invoked** — the scout handler returns hardcoded mocks inside a `setTimeout`. The
fixtures moved to `scoutService.js` and the fake-credential client is gone. No
response changed.

Preserved integration defects: only `art_deadmau5` and `art_rezz` have external
id mappings (27 of 29 artists are permanently mock); failures degrade silently
to mock with no `source` flag on the response; the rate limiters are wired to a
diagnostic endpoint only and throttle no real call; the registry lists four
services with no module (`shopify`, `bandsintown`, `chartmetric`, `revelator`).

---

## 7. Preserved defects (deliberate, each pinned by a test)

| ID | Issue | Where |
|---|---|---|
| CRITICAL-1 | Empty login body yields an admin token when `ADMIN_EMAIL`/`ADMIN_PASS` are unset | `routes/auth.js`, `config/index.js` |
| CRITICAL-2 | `JWT_SECRET` falls back to a hardcoded literal outside production | `config/index.js` |
| HIGH-4 | `artistAccess` is a STRING but checked with `Array.isArray`, so artists are denied their own data (fail-closed) | `auth/index.js` |
| HIGH-5 | `cors({origin:true, credentials:true})`; `ALLOWED_ORIGINS` never read | `middleware/index.js` |
| HIGH-6 | `autoPrintReport` interpolates a client-influenced path into `exec()` | `jobs/monthlyReportJob.js` |
| HIGH-7 | No per-user quota on AI or `?refresh=true` entity audits | `ai/aiService.js`, `services/entityAuditService.js` |
| MEDIUM-8 | `forgot-password` 404s on unknown emails (enumeration); reset token is unredeemable (no route) | `routes/auth.js` |
| MEDIUM-9 | Error handler returns `err.message` to clients | `middleware/index.js` |
| MEDIUM-11 | No request validation anywhere | all routes |
| — | JWT carries no `id`, so `req.user.id` is `undefined`; `/v3/auth/me`, GDPR delete and change-password cannot resolve a user, and `userIntegrations` shares one `undefined` bucket | `routes/auth.js`, `inMemoryStores.js` |
| NEW-1 | `POST /v3/users` writes a STRING id into an INTEGER PK → always 500 | `routes/users.js` |
| NEW-2 | `addBackground` called with 4 positional args instead of a rect object → unhandled rejection **kills the process** on PDF endpoints | `reports/monthlyReport.js` |
| — | Split-brain A&R: two demo stores with incompatible vote models, both written by one UI | `inMemoryStores.js` |
| — | `Stats` never populated; projections regress `Math.random()` synthetic data | `analytics/regression.js` |
| — | Five shadowed duplicate routes | `routes/users.js`, `routes/ai.js` |

---

## 8. Testing architecture

Zero new dependencies: Node 22's built-in `node:test` and global `fetch`.

| Layer | File | What it guards |
|---|---|---|
| Behavioral equivalence | `tests/regression/snapshot.test.js` | 91 request cases vs a pre-Phase-2 baseline; 77 byte-compared, status compared on all 91 |
| Route table | `tests/regression/routes.test.js` | count, duplicate ordering, cross-domain shadowing, auth surface, middleware chains |
| Phase 2 layers | `tests/regression/services.test.js` | repositories, cache, AI (injected transport), analytics, integrations, jobs, email, reports |
| Phase 1 layers | `tests/regression/units.test.js` | config, auth helpers, models, data shaping |
| Shared catalogue | `tests/support/cases.js` | the 91 cases + the 14 known-nondeterministic ones |
| Probe harness | `tests/support/probe.js` | boots an entrypoint, replays cases, writes a normalized snapshot |
| Operational check | `tests/support/verify_phase2.js` | 53 live checks: health, auth, authz, DB CRUD, integrations, AI, exports, analytics |
| Legacy harness | `tests/support/run_legacy_scripts.sh` | runs the 18 pre-existing ad-hoc scripts |

The 14 excluded cases are nondeterministic **in the original** (`Math.random()`,
`Date.now()` ids, timing) — verified by diffing two consecutive runs of
unmodified source.

---

## 9. Known runtime hazards

1. **PDF endpoints crash the process** (NEW-2). `GET /v3/reports/monthly/...`
   and `GET /v3/exports?format=pdf` trigger an unhandled rejection inside
   pdfkit-table's async loop, which Node 22 treats as fatal. Pre-existing and
   verified on git HEAD. CSV export is unaffected.
2. **Cluster incoherence.** `ecosystem.config.js` runs `instances: 'max'` while
   A&R/campaign/sales/integration state is per-process memory.
3. **`SCHEDULE_JOBS=false`** disables cron; without it a long-lived process will
   attempt report generation on the 1st at 03:00, which will hit NEW-2.
4. **`npm test` needs no `--test-force-exit` for route tests any more** because
   requiring the app no longer starts timers, but the flag is retained in the
   scripts so a stray handle cannot hang CI.
