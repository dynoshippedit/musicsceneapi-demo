# FRONTEND_API_MAP.md

Four HTML files exist. Only two are applications; two are static documentation.

| File | Lines | Type | API base | Live calls |
|---|---|---|---|---|
| `pulsegrid-frontend-connected.html` | 3826 | React app (inline, no build) | `http://localhost:3000` (L~) | 37 distinct paths, 47 occurrences |
| `pulsegrid-terminal-dashboard.html` | 587 | Vanilla JS dashboard | `http://localhost:3000/v3` | **3** endpoints |
| `lumenveil-api-docs.html` | 47453 B | static docs, zero `fetch` | — | 0 |
| `artist-analytics-api-docs.html` | 22266 B | static docs, zero `fetch` | — | 0 |

Both apps hardcode `localhost`. Neither has a build step, module system, or environment
injection — `API_BASE` is a literal in a `<script>` block, so neither can be deployed to
`dashboard.pulsegrid.fm` as `PRODUCTION_DEPLOYMENT.md` describes without editing source.

Note the two apps use **different base conventions**: the workstation's `API_BASE` omits
`/v3` and each call re-adds it; the terminal's `API_BASE` includes `/v3`. Any shared
config refactor must reconcile this.

---

## 1. Workstation — `pulsegrid-frontend-connected.html`

Role per `README.md:13-16`: "Full Operational Control", managers & A&R.

### Endpoints consumed (37)

| Endpoint | Server | Notes |
|---|---|---|
| `POST /v3/auth/login` | L478 | ok |
| `POST /v3/auth/forgot-password` | L572 | ok |
| `POST /v3/auth/reset-password` | **MISSING** | FE L2998. Route never defined → 404. Reset flow dead |
| `GET /v3/artists` (5 sites) | L729 | returns `[]` for artist role (broken `filterDataByAccess`) |
| `POST /v3/artists` | L767 | admin-only |
| `POST /v3/artists/:id/archive` (2 sites) | L802 | admin-only; mutates `labelData`, not `Artist.status` |
| `POST /v3/artists/:id/restore` (2 sites) | L821 | admin-only |
| `PUT /v3/artists/:id/image` | L840 | admin-only |
| `GET /v3/artists/:id/entity-audit` (3 sites) | L1037 | Groq + 5 external APIs |
| `GET /v3/label/entity-audit` | **MISSING** | FE L3241. `entityAudit.auditLabel()` exists (module L611) but is unrouted |
| `GET /v3/label/overview` | L2895 | |
| `GET /v3/analytics/geography` | L2925 | |
| `GET /v3/analytics/projections` | L3058 | regresses on mock; `Stats` empty |
| `POST /v3/analytics/sales` | L3044 | writes to `salesData` (L3041) — lost on restart |
| `GET /v3/fans/demographics` | L1614 | |
| `GET /v3/campaigns/stats` | L1974 | |
| `POST /v3/marketing/campaigns` | L1572 | in-memory |
| `GET /v3/operations/logistics` | L2878 | |
| `GET /v3/operations/assets` | L2883 | |
| `GET /v3/operations/contracts` | L2888 | |
| `GET /v3/exports` | L2595 | `checkExportAccess` |
| `POST /v3/ai/query` | L1224 | real Groq |
| `GET /v3/integrations/status` | L1169 | |
| `GET /v3/integrations/auth/:service` | L1186 | writes `userIntegrations[undefined]` |
| `POST /v3/integrations/disconnect` | L1207 | same defect |
| `GET /v3/integrations/google-kg` | L967 | |
| `GET /v3/anr/scout` | L2698 | uses the hardcoded-credential Spotify client (L2692) |
| `POST /v3/anr/shortlist` | L2761 | |
| `GET /v3/anr/state` (2 sites) | L1821 | store #2 |
| `GET /v3/anr/submissions` (2 sites) | L1422 | store #1 |
| `DELETE /v3/anr/submissions/:id` | L1482 | store #1 |
| `POST /v3/anr/submissions/:id/vote` | L1449 | store #1 — scalar `votes` |
| `POST /v3/anr/vote/:demoId` | L1873 | store #2 — `ratings[]` |
| `GET /v3/anr/demos/:demoId/rating` | L1494 | reads `anrState.demos` |
| `GET /v3/users`, `POST /v3/users`, `PUT/DELETE /v3/users/:id` | L1760/677/1691/1710 | admin-only |

### The split-brain A&R problem

This single app votes through two unrelated backends:

```
POST /v3/anr/submissions/:id/vote   -> anrSubmissions[] (L1398), field: votes (number)
POST /v3/anr/vote/:demoId           -> anrState.demos[] (L1722), field: ratings[] (array)
```

and reads demo lists from both `GET /v3/anr/submissions` and `GET /v3/anr/state`. There
is no reconciliation between the two stores, so the A&R view shows two disjoint demo
sets with incompatible vote semantics.

---

## 2. Command Center — `pulsegrid-terminal-dashboard.html`

Role per `README.md:18-21`: "Executive Overview", executives & LUMEN VEIL. Advertised features:
"Hoarde Terminal aesthetic, High-level KPI monitoring, AI Query Terminal, One-click PDF
Reports."

It consumes **three** endpoints:

| Call | Site | Server | Reality |
|---|---|---|---|
| `GET ${API_BASE}/label/overview` | L334 | L2895 | ok |
| `POST ${API_BASE}/ai/analyze` | L492 | L891 | comment at FE L492 says "Calls your backend Grok endpoint" — L891 is a **keyword `if`-chain, no LLM**. The route that would reach Groq (L1311) is shadowed and unreachable |
| `GET ${API_BASE}/exports?format=pdf&timeframe=30d` | L529 | L2595 | ok |

So the "AI Query Terminal" — the headline feature of the executive dashboard — is
answered by hardcoded string templates including the literal
`"Novakin is second at 6.5x"` (L901) and a fixed `confidence: 0.98` (L916).

FE L358 carries its own admission: `listeners: '--', // API doesn't return this in
overview yet`.

### Auth bypass in preview mode

```js
const isPreview = window.location.protocol === 'blob:' ||
                  window.location.href.includes('googleusercontent');   // L102
if (!token) {
  if (isPreview) {
    token = "SIMULATION_TOKEN_123";                                     // L107
    userData = { name: 'Preview Admin', role: 'admin' };                // L108
  } else { window.location.href = 'login.html'; }                       // L113
}
```

Two problems:
1. The client self-assigns `role: 'admin'`. Harmless server-side (the fake token fails
   `jwt.verify` at L437 → 403), but the UI renders a full admin shell against an API
   that rejects every call — an unbounded broken-state surface.
2. The non-preview branch redirects to **`login.html`, which does not exist in the
   repo**. An unauthenticated visit to the Command Center is a dead end.

---

## 3. Server routes with no frontend consumer (21)

Dead surface — authenticated, reachable, untested, unconsumed:

`DELETE /v3/auth/me` (607) · `GET /v3/auth/me` (629) · `POST /v3/auth/change-password`
(649) · `GET /v3/tours` (866) · `POST /v3/ai/analyze` (891, TERM only) ·
`GET /v3/artists/:id` (921) · `GET /v3/integrations/fandom/roster` (1011) ·
`GET /v3/integrations/fandom/audit` (1022) · `GET /v3/artists/:id/monthly-sales` (1143) ·
`POST /v3/royalties/calculate` (1323) · `GET /v3/rights/contracts` (1359) ·
`POST /v3/anr/evaluate` (1534) · `GET /v3/artists/:id/development` (1552) ·
`GET /v3/integrations/test-limit/:service` (1592) · `POST /v3/anr/whiteboard` (1845) ·
`POST /v3/anr/listening` (1856) · `GET /v3/anr/stats/:demoId` (1929) ·
`POST /v3/anr/demos` (1956) · `GET /v3/reports/monthly/:artistId/:month` (2003) ·
`POST /v3/reports/generate-all` (2027)

Notable: `GET /v3/artists/:id` (the single-artist detail endpoint) has no caller — the
workstation renders detail views from the list payload instead. And the three
routes an artist would most need (`/v3/auth/me`, `/v3/artists/:id/monthly-sales`,
`/v3/reports/monthly/...`) are all unconsumed.

---

## 4. Missing frontend assets

| Referenced | By | Present |
|---|---|---|
| `login.html` | terminal dashboard L113 | **no** |
| `public/index.html` | `Server v5.js:98` SPA fallback | **no** (`public/` does not exist) |
| `/reports` directory | `README.md:99` | **no** (created lazily at runtime) |
