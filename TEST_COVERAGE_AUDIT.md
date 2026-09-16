# TEST_COVERAGE_AUDIT.md

> **SUPERSEDED by Phase 2/3.** This audit was written against the pre-refactor
> tree, which had no test infrastructure. Phase 2 added a 26-suite regression
> suite (`npm test`, 120 assertions) and a 54-check operational verifier
> (`npm run verify`); Phase 3 added the security/contract assertions. The
> "nothing is tested" findings below are historical. Current coverage is
> documented in `REFACTOR_PROGRESS.md` and `PHASE_3_VALIDATION.md`.

## Summary

There is **no test infrastructure**. There are 18 standalone scripts that must be run by
hand, one at a time, most against a live server, with hardcoded credentials and no
assertions.

| Property | Finding |
|---|---|
| Test framework | **none** — no jest/mocha/vitest/tap/supertest/chai in any manifest |
| `npm test` (canonical `package.json`) | **script does not exist** |
| `package-production.json` `test` | `node test-api.js` — see below, targets 3 nonexistent endpoints with a placeholder token |
| `package1.json` `test` | `echo "Tests coming soon" && exit 0` |
| CI configuration | none (no `.github/`, no workflow files) |
| Scripts total | 18 (10 `test_*`, 7 `verify_*`, 1 `check_*`) |
| Scripts with any assertion or non-zero exit | 8 of 18 |
| Scripts requiring a running server on `localhost:3000` | 6 |
| Live route coverage (name mention, not assertion) | **13 of 58 = 22%** |

---

## Script-by-script

| Script | Lines | Needs server | Has assertion | Exits non-zero | Exercises |
|---|---|---|---|---|---|
| `test-api.js` | 101 | yes | no | no | HTTP smoke, 7 endpoints |
| `check_api_health.js` | 39 | yes | yes | yes | login + health |
| `verify_admin_permissions.js` | 83 | yes | yes | yes | admin user CRUD |
| `verify_anr_hidden.js` | 70 | yes | yes | yes | A&R visibility |
| `verify_anr_rating.js` | 69 | yes | yes | yes | A&R vote weighting |
| `verify_fandom_api.js` | 31 | yes | no | no | fandom roster route |
| `test_safestats.js` | 78 | no | yes | yes | `SafeStatsSchema` |
| `test_sync_draft.js` | 58 | no | yes | no | `masterLoop` + schema |
| `test_sync.js` | 40 | no | no | no | `masterLoop` |
| `test_db_insert.js` | 37 | no | no | no | raw sequelize |
| `verify_dependencies.js` | 64 | no | yes | yes | module resolution |
| `test_discogs.js` | 12 | no | no | no | `entityAudit.auditDiscogs` |
| `test_googlekg.js` | 35 | no | no | no | `entityAudit.auditGoogleKG` |
| `test_wiki.js` | 11 | no | no | no | `entityAudit.auditWikipedia` |
| `test_fandom.js` | 102 | no | yes | no | raw axios against fandom.com |
| `test_image_fallback.js` | 49 | no | no | no | `entityAudit` image path |
| `verify_entity_audit_integration.js` | 37 | no | no | no | `entityAudit` composite |
| `verify_label_audit.js` | 43 | no | no | no | `entityAudit.auditLabel` |

The 10 scripts with no assertion are `console.log` inspection harnesses: they print a
response and exit 0 regardless of outcome. They cannot fail, so they cannot detect
regression.

---

## Nothing runs in the repo as cloned

`node_modules/` is absent (verified: 0 entries) and `npm install` was never run. Every
script fails at `require`:

```
$ node test_safestats.js        Error: Cannot find module 'zod'
$ node verify_dependencies.js   Error: Cannot find module 'pdfkit'
$ node test_sync.js             Error: Cannot find module 'zod'
```

Note these scripts also **exit 0 on a module-resolution crash** when piped, so even the
assertion-bearing ones do not reliably signal failure to a CI runner.

---

## `test-api.js` — the only script wired to an `npm test`, and it is broken three ways

`package-production.json` sets `"test": "node test-api.js"`.

**1. Three of seven target endpoints do not exist:**

| Probe | `test-api.js` | Server |
|---|---|---|
| `/health` | L14 | yes (L3149) |
| `/v3/artists?limit=5` | L20 | yes (L729) |
| `/v3/artists/art_deadmau5` | L26 | yes (L921) |
| `/v3/artists/art_deadmau5/revenue?timeframe=30d` | L32 | **no such route** |
| `/v3/label/overview` | L38 | yes (L2895) |
| `/v3/rotation/status` | L44 | **no such route** |
| `/v3/analytics/compare?artist_ids=...&metrics=...` | L~50 | **no such route** |

**2. Authentication is a placeholder literal:**

```js
const API_KEY = 'your_api_key_here';                        // L5
? { 'Authorization': `Bearer ${API_KEY}` }                  // L61
```

The server expects a JWT (L437). Every `requiresAuth: true` probe gets 403 from L439.
So 5 of 7 probes fail on auth before the missing-route problem even applies.

**3. No assertions.** It prints results; it never fails the process.

Effect: the "production" manifest's test command exercises exactly one thing
successfully — `GET /health`, a route that returns a static object literal.

---

## What is genuinely covered

Only two areas have real assertions against real logic:

**`test_safestats.js` (78 lines)** — the best test in the repo. Exercises
`SafeStatsSchema` accept/reject paths and calls `process.exit(1)` on failure. Correctly
validates the `.strict()` behaviour. Blocked only by the missing `zod` install.

**`verify_anr_rating.js` (69 lines)** — asserts A&R vote weighting for two roles
(comments at L24-25 indicate admin weight 10, rezz weight 5). Requires a live server and
logs in with `admin123` / `rezz123` hardcoded at L24-25.

Both test code paths that are **not** the production risk surface.

---

## Route coverage: 13 of 58 live routes (22%)

Name-matched in any script (mention only — several are unasserted prints):

`GET /health` · `POST /v3/auth/login` · `GET /v3/artists` · `POST /v3/artists` ·
`GET /v3/artists/:id` · `POST /v3/artists/:id/archive` · `POST /v3/artists/:id/restore` ·
`PUT /v3/artists/:id/image` · `GET /v3/artists/:id/development` ·
`GET /v3/artists/:id/entity-audit` · `GET /v3/artists/:id/monthly-sales` ·
`GET /v3/integrations/fandom/roster` · `GET /v3/label/overview`

### Zero coverage on every critical finding

Nothing in the repo tests:

| Untested | Where | Why it matters |
|---|---|---|
| Admin-override login branch | L481-488 | **CRITICAL-1**: empty body grants admin. A single assertion on `POST /v3/auth/login` with body `{}` would have caught it |
| `hasArtistAccess` with a scalar string | L447 | **HIGH-4**: the seeded artist cannot read their own data. A unit test on the function alone would have caught it |
| JWT fallback secret | L411 | CRITICAL-2 |
| Missing `id` claim in JWT | L483, L500 | breaks `/v3/auth/me`, GDPR delete, change-password, per-user integrations |
| `POST /v3/auth/reset-password` | absent | frontend calls it; route does not exist |
| CORS origin policy | L246 | HIGH-5 |
| Shadowed routes | L1671, L1771, L1311, L1785, L1805 | duplicate registration is invisible without a route-table assertion |
| `labelData.artists` in-place sort | L900-906, L2582 | global state corruption |
| Groq `JSON.parse` on prose | L1117 | silent degradation to a stub |
| Restart durability of A&R / campaigns / sales | L1398, L1722, L2796, L3041 | all in-memory |
| `POST /v3/royalties/calculate` | L1323 | money maths, entirely untested |
| PDF/CSV export | L2595 | binary output, untested |
| `sync/masterLoop` in the real app | — | `test_sync.js` tests the module; the app never registers it |
| Every one of the 21 frontend-orphan routes | — | |

`verify_dependencies.js` is the closest thing to a build check — it `require`s `fs`,
`pdfkit`, `axios`, `sqlite3` to confirm resolution. It does not check the 24 other
declared dependencies.

---

## Missing test categories entirely

- **Unit tests** — no pure-function tests (`calculateTotalRevenue`, `hasArtistAccess`,
  `flattenData`, `filterMetrics`, `calculateGrowthRate`, `calculateHealthScore` are all
  testable without I/O and none are tested).
- **Integration tests** — nothing uses `module.exports = app` (L3207) with `supertest`,
  despite the export existing precisely for that.
- **Contract tests** — no check that frontend call sites resolve to real routes. Three
  frontend 404s (`/v3/auth/reset-password`, `/v3/label/entity-audit`) and three
  `test-api.js` 404s would all be caught by one route-table diff.
- **Auth/authz matrix tests** — no role × endpoint matrix. This is the single highest-value
  missing suite given HIGH-4 and CRITICAL-1.
- **Migration/schema tests** — `sync({ alter: true })` (L179) runs unguarded on every boot.
- **Fixtures** — `create_sub.json` / `create_sub_2.json` are loose request bodies with no
  referencing code.

---

## Recommended test order (for later — not part of this audit)

1. `POST /v3/auth/login` with `{}` → must be 401. (Pins CRITICAL-1.)
2. `hasArtistAccess({role:'artist',artistAccess:'art_rezz'}, 'art_rezz')` → must be true.
   (Pins HIGH-4 and guards against a fail-open fix.)
3. Route-table snapshot: assert 58 unique method+path pairs, zero duplicates.
   (Pins the 5 shadowed routes and prevents new ones.)
4. Role × endpoint authz matrix via `supertest` against the existing `module.exports`.
5. Restart-durability test per in-memory store.
6. Then broaden.
