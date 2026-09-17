# PHASE_4A_HANDOFF.md

Execution briefing for the Phase 4B implementation model. You are building the
**Label Intelligence Platform** frontend; **mau5trap is the active reference
profile**, not the product's identity — the shell must obtain every brand
string, mark and theme through `web/src/brand/` (architecture §14), and a
platform file may never contain the word "mau5trap". Read this file, then
`MAU5TRAP_VISUAL_DESIGN_CONTRACT.md` (the reference theme), then
`FRONTEND_ARCHITECTURE.md` — §13 of the architecture file is the Phase 4A
remediation addendum (written against the independent audit
`PHASE_4A_DESIGN_AUDIT.md`), §14 is the platform/brand separation and §15
the backend label-coupling audit; §13/§14 OVERRIDE the contract wherever
they disagree (architecture §13.0 lists every such rule). You do not need to
re-read the legacy HTML files — everything load-bearing is transcribed with
line references in case you want to spot-check; if the HTML and architecture
§13.4 disagree, §13.4 wins (the deviations are signed, do not "restore" HTML
values).

Nothing foundational is left for you to design: routing, API client, auth,
shell, navigation, state boundaries, tokens, brand layer, primitives, AI
abstraction, copy, brand mark, geometry and the first slice are all decided.
Your job is to execute.

---

## 1. Verified current state (do not re-audit)

```
Backend   Phases 1-3 complete, committed (3a95375). npm test 121/121, npm run verify 54/54.
          58 reachable endpoints, 13 route modules under src/routes/. Contracts frozen.
          JWT_SECRET is REQUIRED to boot (>=16 chars). Groq is the working AI provider,
          model openai/gpt-oss-20b via GROQ_MODEL. POST /v3/ai/query verified live.

Frontend  No React/Vite app exists. Root package.json has zero frontend deps.
          Legacy, working, untouched, at repo root:
            mau5trap-frontend-connected.html   3826 lines, React 18 + Babel via CDN, "Workstation"
            mau5trap-terminal-dashboard.html    587 lines, vanilla JS + Tailwind CDN, "Command Center"
          Both hardcode API_BASE to localhost:3000 (workstation) / localhost:3000/v3 (terminal).

Git       Six Phase 4A/audit documents are untracked: FRONTEND_ARCHITECTURE.md,
          PHASE_4A_HANDOFF.md, MAU5TRAP_VISUAL_DESIGN_CONTRACT.md,
          PHASE_4A_DESIGN_AUDIT.md, BRAND_PORTABILITY_AUDIT.md, and
          BRAND_PORTABILITY_AUDIT_RECHECK.md. No other change. Nothing committed yet.

KPI data  GET /v3/label/overview serves { monthlyRevenue, quarterlyProjection, annualProjection,
          activeArtists, topArtists, timestamp } — verified against src/routes/label.js L127-134 and
          tests/snapshots/baseline.json. The legacy StatCards read totalRevenue/totalStreams/avgROI,
          which do not exist → the live page shows $NaNM / NaNM / undefinedx today. See §6 row 5, 39-40.

Brand     The backend is NOT label-neutral yet: architecture §15 catalogs 25 hardcoding sites
          (9 class C — AI label context, KG search prefix, entity-audit prefix, root-admin email, A&R benchmark,
          ROI heuristic phrase, social/alias map, fandom knowledge source, label auditLabel()); the
          independent recheck finds additional debt. Rule: EXTERNALIZE,
          never remove — every mau5trap value stays active and moves into labels/mau5trap/label.config.js
          (architecture §15.3) in a later bounded backend "Phase 4-LABEL" pass (§23). The independent
          portability recheck confirms this debt does NOT block the frontend-only 4B slice; 4B must not
          add backend label coupling, and a real second-label deployment cannot be claimed until the
          backend pass is complete. Frontend brand architecture is in §14; the mau5trap installation
          stays fully featured.
```

## 2. Files inspected during Phase 4A

`mau5trap-frontend-connected.html` (full), `mau5trap-terminal-dashboard.html`
(full), every `src/routes/*.js`, `src/auth/index.js`, `src/models/index.js`,
`src/config/index.js`, `src/validation/index.js`, `src/ai/groqClient.js`,
`src/ai/aiService.js`, `src/ai/prompts.js`, `src/ai/responseParser.js`,
`PHASE_3_VALIDATION.md`, `PHASE_3_HANDOFF.md`, `BACKEND_ARCHITECTURE.md`,
`REFACTOR_PROGRESS.md`, `API_INVENTORY.md`, `FRONTEND_API_MAP.md`,
`SECURITY_AUDIT.md`, `TEST_COVERAGE_AUDIT.md`, root `package.json`, and the
prior Sonnet drafts of the two architecture docs (revised, not preserved
where weak — see final report).

---

## 3. Orphaned-view classification (VERIFIED)

Proof: `setActiveTab(` occurs once (L3464), inside a `.map` over a 5-item nav
array (L3451-3456: dashboard, artists, anr, intelligence, admin). The content
area switches on `activeTab` for 10 values (L3537-3725). `AdminView.ALL_PAGES`
(L726) lists exactly the same 5 perms as the nav — the permission system was
built for the 5 visible tabs and the other 5 fell out of navigation.

| View (tab id) | Implemented | API-wired | Reachable | Roles/perm today | Hidden: intentional or accidental? | New IA destination | Visibility decision |
|---|---|---|---|---|---|---|---|
| `settings` → `IntegrationsPanel` (L1528) | yes | `GET /v3/integrations/status`, `GET /v3/integrations/auth/:service`, `POST /v3/integrations/disconnect` | **no** | any JWT (connections are per-user server-side) | **Ambiguous → probably accidental.** Contains a dead `fetchSubmissions` referencing an undefined setter — copy-paste rot, not curation. | `/settings/integrations` | **Secondary nav** (bottom "Settings" entry), all authenticated users |
| `fans` → `FanEngagementView` (L1211) | yes | `GET /v3/fans/demographics` (+ `ForecastChart`) | **no** | any JWT | **Accidental.** Would CRASH if rendered (`zoomImage` undefined, L1319). Nobody hides a view by leaving a ReferenceError in it. Backend data is a hardcoded mock aggregation. | `/fans` | **Primary nav, NEW perm `fans`** → admin-only by default; port with the crash removed; show `ProvenanceBadge SOURCE: MOCK` |
| `campaigns` → `CampaignsView` (L1341) | yes | `GET /v3/campaigns/stats`, `POST /v3/marketing/campaigns`, `GET /v3/artists` | **no** | any JWT | **Ambiguous.** Fully working 3-step wizard; backend returns a canned plan and persists nothing. Plausibly a demo that was parked. | `/marketing` | **Primary nav, NEW perm `marketing`** → admin-only by default; label the generated plan `PROTOTYPE` via ProvenanceBadge |
| `scouting` → `AnRMasterView` (L2914) = `ScoutPanel` + `InboxPanel` | yes | `GET /v3/anr/scout`, `POST /v3/anr/shortlist`, `GET /v3/anr/submissions` | **no** | any JWT | **Accidental for ScoutPanel** (real, working); **InboxPanel is decorative** (hardcoded demos/stats). Same domain as the visible A&R Room. | `/anr/scouting` (sub-tab of A&R) | **Contextual subview** under existing perm `anr_room`. Ship ScoutPanel + the REAL shortlist list; drop the fabricated "142 / 842 / 92%" numbers and 3 fake demos → `EmptyState` when the shortlist is empty (row 20) |
| `operations` → `OperationsView` (L2601) | yes | `GET /v3/operations/logistics`, `/assets`, `/contracts` (contracts 403 unless admin/manager) | **no** | any JWT; contracts admin/manager | **Ambiguous.** Static fixture tables; complete UI. | `/operations` | **Primary nav, NEW perm `operations`** → admin-only by default; `ProvenanceBadge SOURCE: FIXTURE`; contracts 403 rendered inline |

Not orphaned but relevant: the right-rail AI console (L3726-3796) renders on
every tab except `intelligence`/`admin` — it becomes `CommandConsole` on
`/dashboard` (right rail) and the full-width console on `/intelligence`.

Why "admin-only by default": admins bypass `pageAccess`; nobody else has the
new keys until an admin grants them in Admin › Team. Exposure becomes a
runtime product decision instead of a code decision — no silent drop, no
blind expose.

---

## 4. Route / page map

| Route | Page | Guard | Legacy source |
|---|---|---|---|
| `/login` | `LoginPage` | public | `LoginScreen` L2967 |
| `/dashboard` | `DashboardPage` | authed · `overview` | `App()` dashboard branch L3537 + terminal dashboard KPIs/bars |
| `/artists` | `ArtistsPage` | authed · `roster` | L3596 table + `ArtistManager` L630 |
| `/artists/:artistId?tab=` | `ArtistDetailPage` | authed · `roster` (server 403 → AccessDenied) | `ArtistDetailView` L2007 |
| `/anr` | `AnrLayout` → `AnrRoomView` | authed · `anr_room` | `AnRView` L2506 |
| `/anr/scouting` | `AnrLayout` → `AnrScoutingView` | authed · `anr_room` | `AnRMasterView` L2914 |
| `/intelligence` | `IntelligencePage` | authed · `ai_lab` | L3720 + console L3726 + terminal dashboard AI terminal |
| `/marketing` | `MarketingPage` | authed · `marketing` NEW | `CampaignsView` L1341 |
| `/fans` | `FansPage` | authed · `fans` NEW | `FanEngagementView` L1211 |
| `/operations` | `OperationsPage` | authed · `operations` NEW | `OperationsView` L2601 |
| `/settings` → `/settings/integrations` | `SettingsLayout` → `IntegrationsView` | authed | `IntegrationsPanel` L1528 |
| `/settings/ai` | `SettingsLayout` → `AiSettingsView` | authed (defaults admin) | NEW (multi-provider requirement) |
| `/admin` | `AdminPage` | authed · role admin | `AdminView` L720 |
| `*` | `NotFoundPage` (4C; in 4B `*` redirects to `/dashboard`) | public | — |

## 5. Component map (legacy → new)

| Legacy (line) | New file | Disposition |
|---|---|---|
| `StatCard` 241 | `primitives/StatCard.jsx` | anatomy per architecture §13.5.4 (left rule kept; label → `.label`; NO hardcoded `sub` literals; fields remapped to what `/v3/label/overview` serves) |
| `ArtistRow` 261 | `pages/ArtistsPage/ArtistRow.jsx` | verbatim logic; inline confirm replaces `confirm()` |
| `IntelligenceGraph` 331 | `charts/NetworkGraph.jsx` | verbatim canvas loop; tier colors from tokens |
| `DemoRow` 439 | `pages/AnrPage/DemoRow.jsx` | verbatim; already has inline CONFIRM/CANCEL |
| `ArtistManager` 630 | `pages/ArtistsPage/ArtistManager.jsx` | verbatim; replace `alert()`s; drop `window.location.reload()` (use refetch) |
| `AdminView` 720 | `pages/AdminPage/AdminPage.jsx` | verbatim; `ALL_PAGES` += `marketing`,`fans`,`operations` |
| `FanHeatmap` 934 | `maps/GeoHeatmap.jsx` + `brand/profiles/mau5trap/locations.js` (4C) | react-leaflet; preserve the legacy region/city/venue coordinate table as mau5trap profile data. The generic map reads supplied coordinates or `useBrand().profile.map?.centers[region]`; no generic venue table (architecture §14.5) |
| `ForecastChart` 1087 | `charts/RevenueForecastChart.jsx` | react-chartjs-2; options → `chartDefaults.js` |
| `FanEngagementView` 1211 | `pages/FansPage/FansPage.jsx` | port; DELETE the `zoomImage` lightbox block (L1317-1336) |
| `CampaignsView` 1341 | `pages/MarketingPage/MarketingPage.jsx` | verbatim |
| `IntegrationsPanel` 1528 | `pages/SettingsPage/IntegrationsView.jsx` | port; DELETE `fetchSubmissions` (L1550-1562) |
| `EntityAuditTab` 1648 | `pages/ArtistDetailPage/tabs/EntityAuditTab.jsx` | verbatim incl. cost-confirm; calls `aiClient.audit` |
| `useGoogleKG` 1976 | `pages/ArtistDetailPage/useGoogleKG.js` | verbatim |
| `ArtistDetailView` 2007 | `pages/ArtistDetailPage/ArtistDetailPage.jsx` + `tabs/*` | split 9 tab bodies; overlay visual kept; routed |
| `UniversalPlayer` 2481 | `media/UniversalPlayer.jsx` | verbatim |
| `AnRView` 2506 | `pages/AnrPage/AnrRoomView.jsx` | port; DELETE dead `handleVote` (L2539-2548) |
| `OperationsView` 2601 | `pages/OperationsPage/OperationsPage.jsx` | verbatim + provenance badge + inline 403 |
| `ScoutPanel` 2747 | `pages/AnrPage/ScoutPanel.jsx` | verbatim |
| `InboxPanel` 2832 | `pages/AnrPage/ShortlistPanel.jsx` | REWORK: real shortlist only; fabricated demos/stats removed; EmptyState |
| `AnRMasterView` 2914 | `pages/AnrPage/AnrScoutingView.jsx` | port; `alert()` → inline notice |
| `LoginScreen` 2967 | `pages/LoginPage/LoginPage.jsx` | verbatim behavior (reset step will 404, see row 3); wordmark/tagline/placeholder from `useBrand()` (architecture §13.3, §14.2) |
| `App()` 3134 | `layout/*`, `router.jsx`, pages | the split; `handleAI` command parsing → `CommandConsole` |
| sidebar SVG 3429-3443 + `.mau5-head` loader 200-227 | `brand/profiles/mau5trap/{Mau5Head,Mau5HeadLoader}.jsx` | brand assets of the mau5trap profile, reached only via `<BrandMark/>` / `<BrandLoader/>` (architecture §14.6) |
| `<title>` L7, wordmark L3042/L3445, sublabel L3043/L3446, placeholder L3085, download name L3372 | `brand/profiles/mau5trap/profile.js` | brand DATA (`documentTitle`, `displayName`, `tagline`, `domain`, `slug`); never literals in components |
| terminal dashboard KPIs/bar chart/AI terminal/PDF button | `DashboardPage`, `charts/RevenueBarChart.jsx`, `IntelligencePage`, `download.js` | consolidated |

---

## 6. Feature migration matrix

Risk L/M/H. "Vis" = visibility decision: P primary nav · S secondary nav ·
C contextual subview · A admin-only · U unsurfaced (no legacy UI) · B blocked.

| # | Feature | Legacy location | API | Target | Roles | Risk | Vis | Verification |
|---|---|---|---|---|---|---|---|---|
| 1 | Login | `LoginScreen` | `POST /v3/auth/login` | `LoginPage` | all | L | — | seeded admin/artist log in; `{}` → 401 text shown |
| 2 | Forgot password | `LoginScreen` | `POST /v3/auth/forgot-password` | `LoginPage` | all | L | — | generic 200 message for any email |
| 3 | Reset password | `LoginScreen` token step | `POST /v3/auth/reset-password` | `LoginPage` | all | H | **B** | route does not exist; port UI as-is, it fails exactly as today. Do NOT invent a route |
| 4 | Authenticated shell | `App()` | — | `AppShell` | all | L | — | sidebar filtered by role/perm; user chip; logout |
| 5 | Dashboard KPIs | dashboard branch | `GET /v3/label/overview` | `DashboardPage` StatCard×4: `MONTHLY REVENUE` · `QUARTERLY PROJECTION` · `ANNUAL PROJECTION` · `ACTIVE ARTISTS` (architecture §13.5.4) | all | L | P | 4 real values, no `NaN`/`undefined`; admin = `$3.2M · $134.8M · $539.1M · 29` (snapshot); mono `.kpi`; `.label` headers; no sub lines |
| 6 | Label identity banner | dashboard branch | `GET /v3/label/entity-audit` | `DashboardPage` | all | H | **B** (graceful) | route does not exist; legacy skips banner on non-OK — preserve exact skip, no error UI |
| 7 | Revenue forecast chart + log sales | `ForecastChart` | `GET /v3/analytics/projections`, `POST /v3/analytics/sales`, `GET /v3/artists` | `RevenueForecastChart` on Dashboard + Fans | all | M | P | 2 datasets render; sales modal (inline, no `alert`) writes then refetches |
| 8 | Global heatmap | `FanHeatmap` | `GET /v3/analytics/geography` | `GeoHeatmap` on Dashboard | all | M | P | dark tiles, scatter points, no double-init errors; mau5trap locations from profile data, Example Records-only dataset location from its profile without generic map edits (§17) |
| 9 | Roster table | L3596 + `ArtistRow` | `GET /v3/artists` | `ArtistsPage` | all (server-filtered) | M | P | admin ≥29 rows; artist role sees own artist only |
| 10 | Search / sort | `getSortedArtists` | client-side | `ArtistsPage` | all | L | P | search filters; header click toggles ↑/↓ |
| 11 | Sign artist | `ArtistManager` | `POST /v3/artists` | `ArtistsPage` (+Admin) | admin | L | A | new row appears using the SERVER-returned id |
| 12 | Archive / restore | `ArtistRow`, `ArtistManager` | `POST /v3/artists/:id/archive|restore` | `ArtistsPage` (+Admin) | admin | L | A | inline confirm; status flips; archives list |
| 13 | Artist detail (9 tabs, prev/next) | `ArtistDetailView` | `GET /v3/integrations/google-kg` + list payload | `ArtistDetailPage?tab=` | all | M | C | `/artists/:id` opens overlay; tabs bookmarkable; 403 → AccessDenied |
| 14 | Image override | detail overview | `PUT /v3/artists/:id/image` | `OverviewTab` (admin) | admin | L | A | optimistic update |
| 15 | Entity audit (+ paid refresh) | `EntityAuditTab` | `GET /v3/artists/:id/entity-audit[?refresh]` via `aiClient.audit` | `EntityAuditTab` | all | M | C | gauge renders; refresh requires inline CONFIRM PAY |
| 16 | Monthly sales per artist | none | `GET /v3/artists/:id/monthly-sales` | — | all | L | **U** | no legacy UI; do not build (see §20 Q2) |
| 17 | A&R demos: list, submit, vote | `AnRView`+`DemoRow` | `GET /v3/anr/state`, `POST /v3/anr/submissions`, `POST /v3/anr/vote/:demoId`, `GET /v3/anr/demos/:id/rating` | `AnrRoomView` | all; delete admin | M | P | submit adds; vote toggles optimistically with rollback; tally reveal |
| 18 | A&R shortlist (store #1) | `AnRMasterView` | `GET /v3/anr/submissions`, `POST /v3/anr/shortlist` | `AnrScoutingView`/`ShortlistPanel` | all | M | C | keep split-brain as two stores; never merge client-side |
| 19 | Scout search | `ScoutPanel` | `GET /v3/anr/scout` | `ScoutPanel` | all | L | C | mock results render; shortlist button works |
| 20 | Demo inbox | `InboxPanel` | none (literals) | `ShortlistPanel` | all | L | C (reworked) | fabricated counts removed; real shortlist or EmptyState. Recorded as a deliberate change |
| 21 | AI query console | L3726 console + `handleAI` | `POST /v3/ai/query` via `aiClient.query` | `CommandConsole` (Dashboard rail, Intelligence, Admin) | all | M | P | real answer; provider chip shows `SYSTEM DEFAULT` until §13 backend lands |
| 22 | Console commands `archive|restore|sign <name>` | `handleAI` | `/v3/artists…` then AI fallthrough | `CommandConsole` command parser | admin (server 403 otherwise) | M | P | commands execute; unknown text falls through to `aiClient.query` |
| 23 | Network graph | `IntelligenceGraph` | roster payload | `NetworkGraph` | all | L | P | animates; cleanup on unmount; legend only place cyan/purple appear |
| 24 | Campaign wizard + CRM stats | `CampaignsView` | `GET /v3/campaigns/stats`, `POST /v3/marketing/campaigns` | `MarketingPage` | perm `marketing` | M | P (new perm) | 3 steps; plan renders with `PROTOTYPE` badge |
| 25 | Fan demographics / top movers | `FanEngagementView` | `GET /v3/fans/demographics` | `FansPage` | perm `fans` | M | P (new perm) | renders WITHOUT the zoomImage crash; `SOURCE: MOCK` badge |
| 26 | Operations tables | `OperationsView` | `GET /v3/operations/{logistics,assets,contracts}` | `OperationsPage` | perm `operations`; contracts admin/manager | M | P (new perm) | 3 tables; contracts 403 → inline notice |
| 27 | Integrations connect/disconnect | `IntegrationsPanel` | `GET /v3/integrations/status`, `GET …/auth/:service`, `POST …/disconnect` | `IntegrationsView` | all | M | S | cards toggle; quota bar; dead code not ported |
| 28 | AI provider/model settings | none | `GET /v3/ai/providers` (future) | `AiSettingsView` | all read / admin defaults | M | S | renders "system default" mode today; selectors appear once §13 lands |
| 29 | Team management | `AdminView` | `GET/POST/PUT/DELETE /v3/users` | `AdminPage` | admin | M | A | CRUD; perm checkboxes incl. 3 new keys |
| 30 | Admin command center | `AdminView` aiState | shared with 21/22 | `AdminPage` `CommandConsole compact` | admin | L | A | same component, not a second implementation |
| 31 | Exports CSV/PDF | `downloadReport` ×2 | `GET /v3/exports?format=csv|pdf[&artistId]` | `download.js` from Dashboard/Admin | all (server `checkExportAccess`) | M | P | files download; PDF starts `%PDF`; long-op status shown |
| 32 | Monthly report PDF per artist | none | `GET /v3/reports/monthly/:id/:month` | — | all | L | **U** | no legacy UI (§20 Q2) |
| 33 | Royalty calculator | none | `POST /v3/royalties/calculate` | — | all | L | **U** | no legacy UI |
| 34 | Rights/contracts generator | none | `GET /v3/rights/contracts` | — | all | L | **U** | no legacy UI |
| 35 | Day/red theme | `isDayMode` | client | — | all | L | **B** (retired) | not built; tokens keep a swap point; §20 Q1 |
| 36 | Logout | `handleLogout` | client | `AuthContext.logout` | all | L | S | clears storage → `/login` |
| 37 | Loading / error / empty | ad hoc | — | primitives | all | L | — | every page uses `LoadingScreen`/`InlineLoading`/`ErrorState`/`EmptyState` |
| 38 | Terminal dashboard (whole file) | `mau5trap-terminal-dashboard.html` | `/v3/label/overview`, `/v3/ai/analyze`, `/v3/exports?format=pdf` | consolidated into 5, 21, 31 + `RevenueBarChart` | admin/exec | L | — | its AI terminal switches from the keyword route to the real `/v3/ai/query`; file itself untouched; its 👥💰⚡ KPI watermarks and `grok-intelligence — v3.0` traffic-light chrome are NOT ported |
| 39 | Legacy KPI `TOTAL STREAMS` (+ sub `2.4M daily average`) | L3546-3551 | reads `stats.totalStreams` — field does not exist in `/v3/label/overview` | — | all | L | **B** | renders `NaNM` today; no served field, no roster aggregate in scope. Not built. §20 Q9 |
| 40 | Legacy KPI `AVG ROI` (+ sub `Target: 5.0x`) | L3558-3563 | reads `stats.avgROI` — exists in `mock/artistData.js` `labelTotals.avgROI` (5.3) but is NOT serialized by the route | — | all | L | **B** | renders `undefinedx` today; adding the field is a response-contract change (sign-off + snapshot re-baseline). Not built. §20 Q9 |
| 41 | Legacy KPI `TOTAL REVENUE` (+ sub `+12% vs last month`) | L3540-3545 | reads `stats.totalRevenue` — does not exist; the served revenue figure is `monthlyRevenue` | row 5 card 1 `MONTHLY REVENUE` | all | L | P (relabelled) | renders `$NaNM` today; relabelled to the field actually served (matches `final.jpeg` KPI naming). Recorded as a deliberate change |

---

## 7. API client

`web/src/api/client.js`:

```js
export async function apiFetch(path, { method='GET', body, token, signal } = {}) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
    method, signal,
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) onUnauthorized();   // injected by AuthProvider: clears session → /login
  return res;                                  // caller chooses .json() / .blob()
}
```

`endpoints.js` = one thin function per route; the ONLY file containing
`'/v3/…'` strings. Base URL has no `/v3`; every path starts with `/v3/`
except `/health`. `download.js` = one blob helper for PDF/CSV.

## 8. Environment configuration

```
web/.env.example       VITE_API_BASE_URL=http://localhost:3000
web/.env.development   VITE_API_BASE_URL=http://localhost:3000
web/.env.production    VITE_API_BASE_URL=            # set at deploy
```

Read once in `client.js`. Backend dev CORS (`src/config/index.js`
`buildCorsConfig`) already allows any `localhost:<port>` → Vite's 5173
works with zero backend change. LAN/tunnel testing needs `ALLOWED_ORIGINS`
set on the backend (env only).

## 9. Auth / session

- `localStorage['authToken']`, `localStorage['userData']` (legacy keys).
- Boot: hydrate → render → `GET /v3/auth/me` (works post-Phase-3) → canonical user; 401/403 → logout.
- Global 401 handling in `client.js`. 24h token, no refresh (server, out of scope).
- Different origin than legacy during migration → sessions don't bleed; expected.

## 10. Roles and permissions

Roles: `admin | artist | viewer`. `artistAccess` enforced server-side (render
API result; 403 → `AccessDenied`). `pageAccess` = nav visibility only, never
server-validated (verified). Vocabulary after 4B:

| Key | Nav | Status |
|---|---|---|
| `all` | bypass | existing |
| `overview` | Dashboard | existing |
| `roster` | Artists (+ detail) | existing |
| `anr_room` | A&R Room + Scouting sub-tab | existing |
| `ai_lab` | Intelligence | existing |
| `admin` | Admin (also `role==='admin'`) | existing |
| `marketing` | Marketing | **NEW** |
| `fans` | Fans | **NEW** |
| `operations` | Operations | **NEW** |
| (none) | Settings | secondary, all users |

`permissions.js`: `canSee(user, perm) = isAdmin(user) || pageAccess.includes('all') || pageAccess.includes(perm)`.
`AdminPage` checkbox list = the 8 grantable keys (all but `all`).

## 11. State ownership

Global: `AuthContext`, `AiProviderContext`, `BrandContext` (static; the
active profile + merged copy, resolved once at boot — architecture §14.3).
Page-local: everything else via
`useApiQuery`/`useApiMutation`. URL: current view, artist id, detail tab,
A&R sub-view, settings sub-view. Derived at render: sorting, filtering,
color/label mapping. No cross-page cache. No state library. If a real
caching need appears, flag it — don't add a dependency silently.

---

## 12. AI frontend architecture (provider-neutral, multi-provider ready)

Full design in `FRONTEND_ARCHITECTURE.md` §8. Execution summary:

**Files:** `ai/aiClient.js`, `ai/AiProviderContext.jsx`, `ai/useAiProviders.js`,
`ai/capabilities.js`, `components/ai/{CommandConsole,ProviderModelChip,ProviderSelector,ModelSelector,ProviderStatus}.jsx`,
`pages/SettingsPage/AiSettingsView.jsx`.

**Contract components depend on (never a vendor):**
```
aiClient.listProviders()                       → { defaultProvider, defaultModel, providers[], selectable }
aiClient.query({prompt, artistId?, forceRefresh?, provider?, model?})  → { answer, source, provider?, model? }
aiClient.analyze({query})                      → { answer, source:'heuristic' }
aiClient.audit(artistId, {refresh})            → entity-audit payload
```

**Hard rule for Phase 4B (current backend):** `GET /v3/ai/providers` does not
exist → `listProviders()` catches 404 and returns `selectable:false`.
`POST /v3/ai/query` is validated by a `.strict()` zod schema
(`src/validation/index.js` `aiQuery`) → `aiClient.query` MUST strip
`provider`/`model` from the body when `selectable===false`, or every AI call
400s. This is the difference between "works today" and "broken today".

**Provider metadata the frontend may receive (and nothing else):** provider
`id`, `name`, `status` (`ready|unconfigured|error`), `models[]` with `id`,
`name`, `capabilities[]`, optional `contextWindow`, `tier`; plus
`defaultProvider`/`defaultModel`. Never a key, never a key fragment, never a
provider base URL.

**Capabilities:** `chat json tools vision long_context fast low_cost`. Console
requires `chat`; entity audit requires `chat`+`json`. `ModelSelector` greys
out non-qualifying models with a `.label` reason.

**Selection state:** `AiProviderContext` → `localStorage['platform.ai.selection']`
= `{providerId, modelId}` only. Stale/unready selection → fall back to
defaults + one mono notice line.

**Label neutrality (architecture §8.8):** the frontend sends no label name,
slug or search context to `/v3/ai/*`; label context is injected by the
backend (today hardcoded — architecture §15 #13-#15). Provider selection
(`AiProviderContext`) and brand selection (`BrandContext`) share no state.

**Settings › AI IA** (`/settings/ai`; exact geometry, control types and
anti-chatbot FAIL list in `FRONTEND_ARCHITECTURE.md` §13.8.2 — one `.panel`,
a `160px 1fr` definition grid, native 32px `<select>`s, text-first status):
```
.label  AI PROVIDER          [ Groq                 ▼ ]   ● READY
.label  MODEL                [ GPT-OSS 20B           ▼ ]   chat · json · fast
.label  DEFAULTS             provider groq · model openai/gpt-oss-20b     [SET AS DEFAULT] (admin, future; disabled)
.label  PROVIDER STATUS      groq ● READY  ⏎  openai ○ UNCONFIGURED  ⏎  anthropic ○ UNCONFIGURED  (one mono line each)
.label  BRING YOUR OWN KEY   // not available — credentials are server-managed   (until §13 BYOK)
```
When `selectable===false`: selectors replaced by a single mono line
`// provider catalog unavailable — using system default`, chip reads
`SYSTEM DEFAULT · ● READY`. Nothing breaks.

**Console title and chip** (architecture §13.8.1): title row is
`ri-brain-line` + `COMMAND CONSOLE` (`.label--accent`); the
`ProviderModelChip` is a `<Link to="/settings/ai">`, never a dropdown —
provider/model selection happens ONLY on `/settings/ai`. No chat bubbles,
avatars, typing indicators, suggested prompts, vendor logos, provider cards,
or composer-bar model pickers anywhere (architecture §13.8 FAIL greps).

**Graceful degradation matrix:** provider `unconfigured` → not selectable,
dot `○`; provider `error` → dot `●` danger + last error label; catalog fetch
failed → system-default mode; model lacks required capability → disabled +
reason; query 500 → `ErrorState` in the console well (`ERR // AI query failed`).

---

## 13. Backend dependency for provider neutrality (NOT done in 4A — documented for sequencing)

**Current coupling (inspected):** `aiService.js` imports `groqClient` and reads
`config.groqModel` (3 sites); `config` knows only `groqApiKey/groqModel`;
error text says "Groq"; `routes/ai.js` + `aiQuery` schema have no
provider/model; no metadata route. `groqClient.complete()`'s shape is already
the right provider contract. **Verdict: service logic ~80% neutral; wiring
Groq-bound. Groq stays the default.**

**Target (later backend phase, explicit authorization required):**
```
src/ai/aiService.js         accept {providerId?, modelId?}; resolve via providerRouter
src/ai/providerRouter.js    registry, getProvider(id), getDefault(), describe() → safe metadata
src/ai/providers/groqProvider.js  openaiProvider.js  anthropicProvider.js  geminiProvider.js  xaiProvider.js  openRouterProvider.js
   each: { id, name, isConfigured(), listModels(), complete({messages, model, temperature, maxTokens}) → {content, usage, model} }
config: AI_DEFAULT_PROVIDER=groq, AI_DEFAULT_MODEL=openai/gpt-oss-20b (GROQ_MODEL alias), *_API_KEY per provider
routes: GET /v3/ai/providers (JWT, metadata only); POST /v3/ai/query schema += optional provider, model; response += provider
```
The `/v3/ai/query` response change is a CONTRACT change → same sign-off +
`npm run snapshot:baseline` re-baseline protocol as Phase 3, with the diff
kept.

**BYOK (optional, after the above):** `POST /v3/ai/keys`, `GET /v3/ai/keys`
(masked), `DELETE /v3/ai/keys/:provider`; AES-GCM at rest with
`AI_KEYS_ENCRYPTION_KEY`; per-user; body redaction in the request logger;
provider calls backend-only. Backend has no encrypted secret store today →
out of 4B/4C scope.

**Sequencing:**
1. Phase 4B — frontend vertical slice (no AI required).
2. Phase 4C — bulk frontend migration; AI console ships in system-default mode against today's contract.
3. Phase 4-AI (backend, authorized separately) — provider router + `GET /v3/ai/providers` + optional query fields + snapshot re-baseline. Frontend flips to `selectable:true` automatically; zero frontend rewrite.
4. Optional — BYOK backend + `AiSettingsView` BYOK section activation.

---

## 14. Design contract

`MAU5TRAP_VISUAL_DESIGN_CONTRACT.md` is the **reference theme**
(`mau5trap-console`) and the platform's default design language — every
profile inherits its geometry, density, type scale and voice; a profile
changes only colors, marks, brand strings and locale (architecture §14.4
"theme surface"). It is authoritative, EXCEPT where
`FRONTEND_ARCHITECTURE.md` §13 (the Phase 4A remediation addendum) or §14
(brand layer) supersedes it — §13.0 is the complete list (login 48px
padding exception, `--gradient-login`, console title `COMMAND CONSOLE` as
`.label--accent`, mandatory `.label` panel kickers, KPI delta font,
loading/error surface scope, the three-block `tokens.css`, the
`--color-accent-bright/-deep` aliases, the mau5-head as a profile asset,
brand strings from the profile). Everything else in the contract stands.
Copy §1 into `tokens.css` verbatim, then append architecture §13.9 verbatim,
then architecture §14.4 verbatim; implement §2 identity classes (minus
`.mau5-head`, which moves to the mau5trap profile); obey §3 per component;
run §5's checklist before declaring any page done. Key locks: `#0A0A0A`
background, one brand hue as the only signal color (`#00FF5F` under the
mau5trap profile), mono for every number/label, radius 2/4px (pills only
for ≤22px badges), sidebar 224px (≤240), panel padding ≤20px (login card
48px is the ONE exception), no shadows on panels, no `alert()`, no vendor
names as literals, no CSS framework.

Identity is carried by four things the tokens cannot encode — all fixed in
architecture §13/§14 and all gated in §15 below:
1. **Copy** — platform voice in `web/src/copy.js` (§13.1): `ACCESS ID` /
   `PASSPHRASE` / `INITIALIZE SESSION` / `AUTHENTICATING...` /
   `RESTRICTED ACCESS…` / `Terminate Session` / the four KPI labels /
   `CONNECTION FAILURE` + `RETRY CONNECTION`; brand strings (`mau5trap`,
   `INTELLIGENCE PLATFORM`, title, domain) in the profile.
2. **Mark** — `<BrandMark/>` → the mau5trap profile's `Mau5Head.jsx`
   (§13.2, §14.6): the legacy sidebar SVG, token fills. Not a Remixicon
   glyph.
3. **Login ceremony** — §13.3: 420px card, 48px padding, accent hairline,
   centered radial, wordmark + muted sublabel, mono inputs, black-on-brand
   48px button, hairline footer.
4. **Composition** — §13.5: sidebar/header/KPI geometry drawn at 1440×900
   with expected values; the rest of `/dashboard` empty in 4B.

Signed deviations from the HTML (16→4px radius, 260→224 sidebar, 40→24
gutter, 24→16 panel pad, Inter→mono labels, etc.) are in architecture
§13.4. Do not copy radius, padding, width, or color values from the HTML.

---

## 15. Phase 4B vertical slice — scope and gate

**Build exactly this, nothing else, first:**
1. `web/` scaffold (Vite, React 18, React Router) — §16 files 1-4.
2. `tokens.css` (contract §1 + architecture §13.9 + architecture §14.4, each verbatim) + `global.css` (contract §2 classes minus `.mau5-head`) — night theme live.
3. **Brand layer** (architecture §14): `brand/schema.js`, `brand/registry.js`, `brand/index.js`, `brand/BrandContext.jsx`, `brand/BrandMark.jsx`, `brand/BrandLoader.jsx`, `brand/defaults/*`, the **mau5trap** profile (`profile.js`, `Mau5Head.jsx`, `Mau5HeadLoader.jsx`, `mau5head.module.css`), the **example-records** test profile (`profile.js`), both theme files, both favicons; `copy.js` (platform voice, architecture §13.1).
4. `api/client.js`, `api/endpoints.js` (`login`, `getMe`, `getLabelOverview`), `auth/*`, `hooks/*`, `utils/format.js` (`moneyCompact`, `integer` reading `profile.locale`).
5. `LoginPage` — real login, per architecture §13.3; wordmark/tagline/placeholder/legal footer from `useBrand()` (forgot/reset states stubbed to 4C).
6. `AppShell` + `Sidebar` (full NAV from `nav.js`, filtered; `<BrandMark/>` + `profile.displayName`/`tagline`; unbuilt routes redirect to `/dashboard`) + `Header` — per architecture §13.5.2-13.5.3.
7. `DashboardPage` with ONE real widget: the 4-card KPI row from `GET /v3/label/overview` per architecture §13.5.4. Nothing below it.
8. `LoadingScreen` (renders `<BrandLoader/>`) + `ErrorState` (`fullscreen` / `panel` / `field`) per architecture §13.6.
9. `npm run dev` works; `npm run build` exits 0; the portability run (below) passes with zero edits outside `brand/`.

**Slice composition is closed** (audit B3/M3): `/dashboard` = header + exactly
four StatCards + empty body background. No chart, map, table, console,
banner, filter bar, date picker, welcome text, placeholder, skeleton, or
"coming soon". The contract §3.4 density rule is waived for the 4B slice
only; inventing fillers to satisfy it is a FAIL. The `[judge]` screenshot
line is a secondary FAIL; the mechanical copy/mark/composition boxes below
are the primary gate.

**The slice must prove the platform/brand seam:** login → shell → nav →
dashboard widget obtain label identity and theme ONLY through
`web/src/brand/` (architecture §14). The PORTABILITY block below is part of
the gate, not an optional extra.

**FUNCTIONAL PASS (all required):**
```
[ ] cd web && npm install && npm run dev  → starts, zero errors
[ ] unauthenticated visit to / or /dashboard → redirected to /login
[ ] admin@mau5trap.com / admin123 (backend running with JWT_SECRET) → lands on /dashboard
[ ] admin KPI row reads exactly: MONTHLY REVENUE $3.2M · QUARTERLY PROJECTION $134.8M · ANNUAL PROJECTION $539.1M · ACTIVE ARTISTS 29
    (frozen snapshot label_overview_admin; mock data unchanged) — no NaN / undefined / null anywhere on the page
[ ] tours@rezz.com / rezz123 → primary nav shows ONLY Dashboard and Artists (seeded pageAccess overview+roster); bottom group still shows
    Settings + Terminate Session; the four cards render that token's /v3/label/overview values (snapshot: $0 · $0 · $0 · 0), never NaN
[ ] wrong password → ErrorState panel variant inside the login card with the server's `error` text ("Invalid credentials"); button returns to INITIALIZE SESSION
[ ] stop backend, reload /dashboard → full-viewport ErrorState (icon + CONNECTION FAILURE + message + RETRY CONNECTION), no white screen, no uncaught console error;
    start backend, click RETRY CONNECTION → KPI row renders without a page reload
[ ] Terminate Session → /login, localStorage authToken/userData cleared; refresh while logged in → session persists (rehydration, /v3/auth/me reconciled)
[ ] 401 from any call clears session (edit localStorage.authToken to garbage, reload → /login)
[ ] clicking an unbuilt nav item (e.g. Artists) → /dashboard (redirect), no 404 page, no console error
[ ] npm run build → exit 0, dist/ produced
[ ] git diff -- src server.js mau5trap-production-api.js package.json → empty
[ ] git diff -- mau5trap-frontend-connected.html mau5trap-terminal-dashboard.html → empty
[ ] git status shows web/ as the only new path beyond the six existing Phase 4A/audit documents listed in §1; nothing else outside web/ created or modified
```

**VISUAL PASS — mechanical (all required; `[grep]` run from repo root, `[measure]` in DevTools at 1440×900):**
```
TOKENS / CLASSES
[ ] [diff]    web/src/styles/tokens.css block 1 is byte-identical to contract §1; block 2 to architecture §13.9; block 3 to architecture §14.4; nothing else in the file
[ ] [grep]    contract §5 greps all clean: no raw hex/rgb outside tokens.css/global.css/chartDefaults.js/brand/themes/*.css/brand/profiles/**; no border-radius literal;
              no box-shadow/text-shadow outside .text-neon/.status-dot--*/:focus-visible/modal; no alert(/confirm(/prompt(; no localhost:3000;
              no outline:none without :focus-visible; no CSS framework / toast lib in web/package.json
[ ] [grep]    grep -rn "linear-gradient\|radial-gradient" web/src --include=*.jsx --include=*.module.css  → no results (gradients live only in tokens.css)
[ ] [grep]    grep -rn "\-\-green-" web/src --include=*.jsx --include=*.module.css --include=*.js → no results (components use --color-accent* / --color-brand-primary only)
[ ] [grep]    grep -rn "prefers-color-scheme\|Switch to" web/src → no results; "data-theme" appears only in brand/BrandContext.jsx and brand/themes/*.css

COPY (architecture §13.1)
[ ] [grep]    every PLATFORM-VOICE string below exists in web/src/copy.js and is imported where rendered (grep the literal in *.jsx → only copy.js):
              "ACCESS ID" "PASSPHRASE" "INITIALIZE SESSION" "AUTHENTICATING..." "RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED."
              "Authorized personnel only." "Forgot Password?" "Terminate Session" "Real-time label performance metrics"
              "MONTHLY REVENUE" "QUARTERLY PROJECTION" "ANNUAL PROJECTION" "ACTIVE ARTISTS" "CONNECTION FAILURE" "RETRY CONNECTION"
[ ] [grep]    every BRAND string lives only under brand/profiles/mau5trap/ — "INTELLIGENCE PLATFORM", "mau5trap Intelligence Platform", "mau5trap.com" appear nowhere else in web/src;
              the bare slug "mau5trap" may additionally appear only as the registry.js keys/defaultSlug and the theme file name/selector
[ ] [grep]    forbidden-string grep from architecture §13.1 → no results (no Email / Password / Sign in / Log in / Sign out / Continue / Welcome / Assistant …)
[ ] [grep]    grep -rniE "mau5trap|mau5|deadmau5|rezz" web/src --exclude-dir=brand → no results; same grep on web/src/brand --exclude-dir=profiles --exclude-dir=themes → only registry.js
[ ] [grep]    grep -rnE "art_[a-z0-9]+" web/src → no results; grep -rn "@mau5trap.com\|@rezz.com" web/src → no results
[ ] [grep]    emoji grep from architecture §13.1 → no results
[ ] [grep]    grep -rn "Total Revenue\|Total Streams\|Avg ROI\|TOTAL REVENUE\|TOTAL STREAMS\|AVG ROI" web/src → no results (rows 39-41)
[ ] [measure] under the mau5trap profile the wordmark renders lowercase "mau5trap" on login and sidebar (profile.displayName verbatim)

MARK (architecture §13.2, §14.6)
[ ] [grep]    web/src/brand/profiles/mau5trap/Mau5Head.jsx exists; contains the three <circle>, two <ellipse>, one <path d="M 30 70 Q 50 90 70 70 Q 50 82 30 70">;
              fills are var(--color-accent) / var(--color-text) only
[ ] [grep]    layout/Sidebar.jsx and components/primitives/LoadingScreen.jsx import BrandMark / BrandLoader from brand/, and import NOTHING from brand/profiles/;
              grep -rn "from.*brand/profiles" web/src → only brand/registry.js
[ ] [grep]    grep -rn "ri-headphone\|ri-music\|ri-disc" web/src/layout → no results
[ ] [measure] sidebar brand block: rendered mark is the Mau5Head SVG 40×40, wordmark 20px/800, sublabel 11px mono green uppercase (.label--accent, tracking-wide); nothing else in the block
[ ] [measure] full-page loader is the mau5-head (80px ring + 2 ears, pulse) rendered via <BrandLoader/>, background #0A0A0A, no spinner, no text other than (optionally) INITIALIZING NEURAL LINK...

LOGIN (architecture §13.3)
[ ] [measure] card width 420px, computed padding 48px, border 1px rgba(0,255,95,.35), radius 4px, no box-shadow, centered in the viewport
[ ] [measure] login page: body carries #0A0A0A + --gradient-decoration (as everywhere); the .login-page wrapper adds --gradient-login (centered radial, legacy L3038) — 3 layers total;
              no other route renders --gradient-login
[ ] [measure] wordmark 32px/700 Inter letter-spacing -1px; sublabel 12px JetBrains Mono muted (NOT green) uppercase
[ ] [measure] labels ACCESS ID / PASSPHRASE are .label (11px mono 700 uppercase muted); inputs 14px JetBrains Mono, radius 2px, bg rgba(0,0,0,.3)
[ ] [measure] "Forgot Password?" 11px green, right-aligned on the PASSPHRASE label row
[ ] [measure] button 100% wide, 48px tall, #00FF5F fill, #000 text 14px/700 mono uppercase; busy state shows AUTHENTICATING... at opacity .7, no spinner
[ ] [measure] footer: hairline top, two centered 11px mono muted lines; card contains no logo, no "remember me", no SSO, no sign-up, no version string
[ ] [judge]   the login page renders no sidebar/header and nothing outside the card

SHELL (architecture §13.5.2-13.5.3)
[ ] [measure] sidebar 224px fixed, padding 24px 16px, right hairline, blur(20px), gradient wash visible at top; main padding 24px; header 56px, margin-bottom 24px
[ ] [measure] nav items 40px tall, radius 2px, icon 18px + label 14px; inactive #B5B5B5; active #F5F5F5 weight 600 on rgba(0,255,95,.1); hover changes text color only (no fill)
[ ] [judge]   nav is a flat list: no section headers, dividers between primary items, counters, chevrons, collapse control, user block, theme toggle, version string
[ ] [measure] bottom group: Settings item → hairline → Terminate Session (ri-logout-box-line, 14px muted, no fill) pinned to the bottom
[ ] [judge]   header contains ONLY: h1 28px/700 page title ("Dashboard"), 14px muted subtitle, user chip (initials circle + name); no search, bell, breadcrumb, menu, date picker, button
[ ] [grep]    layout/Header.jsx contains no <input, <select, <a ; grep -rn "ui-avatars" web/src → no results

KPI ROW (architecture §13.5.4)
[ ] [measure] exactly 4 .panel cards in a repeat(4,1fr) grid, gap 16px, align-items start; each 88-112px tall, padding 16px, radius 4px, 1px hairline border, no box-shadow
[ ] [measure] each card: 2px left rule #00FF5F at opacity .5 full height; .label 11px mono uppercase muted; .kpi 32px/700 JetBrains Mono #F5F5F5 tabular-nums
[ ] [grep]    StatCard.jsx renders no <i , <svg, <a , onClick; StatCard.module.css has no :hover, transform, box-shadow; StatCard receives label/value props only (no hardcoded sub text)
[ ] [judge]   nothing renders below the KPI row: no placeholder, skeleton, empty panel, chart, "coming soon", welcome text
[ ] [judge]   the 4 cards do not stretch to fill the row height or viewport

STATES (architecture §13.6)
[ ] [measure] fullscreen ErrorState: fixed inset 0 on #0A0A0A; ri-error-warning-line 48px #FF4444; CONNECTION FAILURE 16px mono uppercase danger; message 14px muted;
              RETRY CONNECTION = danger variant button (rgba(255,50,50,.1) fill, #FF4444 text, 2px radius, 32px tall, mono uppercase)
[ ] [measure] login error = panel variant inside the card (danger-dim bg, danger border, 4px radius, 12px pad, 13px centered)
[ ] [grep]    grep -rn "toast\|snackbar\|spinner\|shimmer\|<progress" web/src → no results
[ ] [measure] Tab key shows the green focus ring (2px #00FF5F outline + soft glow) on every control on both screens; no control has outline:none

GREEN AS SIGNAL, NOT DECORATION (architecture §13.7)
[ ] [judge]   green appears in ALL of: sidebar sublabel, active nav tint, Mau5Head fill, all 4 StatCard left rules, focus ring, login button fill, Forgot Password? link
[ ] [judge]   green appears in NONE of: KPI values, body text, headings, page/panel backgrounds, panel borders (login card excepted), the wordmark
[ ] [measure] no pixel in the blue/indigo/violet families on any slice screen; red only inside error states

RESPONSIVE (architecture §13.5.8)
[ ] [measure] 1280×800: identical layout, 4 KPI columns
[ ] [measure] 1024×768: 56px icon rail (BrandMark 24px only), KPIs 2×2, nothing overflows horizontally

BRAND LAYER — mau5trap run (architecture §14)
[ ] [grep]    web/src/brand/{index.js,registry.js,schema.js,BrandContext.jsx,BrandMark.jsx,BrandLoader.jsx} exist; brand/defaults/{MonogramMark,RingLoader}.jsx exist
[ ] [grep]    brand/profiles/mau5trap/profile.js contains every ● key of architecture §14.2 with the values listed there; validateProfile() logs nothing for it
[ ] [grep]    brand/themes/mau5trap-console.css is the empty scoped block; brand/themes/example-records-magenta.css sets exactly the 4 brand tokens and nothing else
[ ] [measure] document.title === "mau5trap Intelligence Platform"; <link rel="icon"> href ends /brands/mau5trap/favicon.svg; document.body.dataset.theme === "mau5trap-console"
[ ] [measure] brand tokens resolve to the contract values on real elements: sidebar sublabel color → rgb(0, 255, 95); login card border-color → rgba(0, 255, 95, 0.35);
              active nav background → rgba(0, 255, 95, 0.1) — the brand layer reproduces the contract exactly (measure on elements, not via getPropertyValue of the custom property)
[ ] [grep]    localStorage keys written by the app ⊆ { authToken, userData, platform.ai.selection, platform.brandProfile }; no "mau5trap." key
[ ] [grep]    utils/format.js is the only file calling Intl.NumberFormat; no '$' / 'en-US' literal in components (grep from architecture §14.5)
[ ] [grep]    web/package.json "name" is label-neutral (label-intelligence-web); index.html static <title> is "Label Intelligence Platform"

PORTABILITY — example-records run (architecture §14.7; the Phase 4 acceptance criterion)
Procedure: with the mau5trap run passing, EITHER `VITE_BRAND_PROFILE=example-records npm run dev` OR (dev only) set localStorage['platform.brandProfile']='example-records' and reload.
Make NO file edits between the two runs. Then:
[ ] [diff]    git status / git diff show no change under web/src outside web/src/brand/ between the two runs (the switch is configuration, not code)
[ ] [measure] login: wordmark "Example Records", sublabel "LABEL OPERATIONS", placeholder "user@example-records.test", third footer line "© Example Records — portability test profile";
              platform voice unchanged (ACCESS ID / PASSPHRASE / INITIALIZE SESSION / RESTRICTED ACCESS… / Authorized personnel only.)
[ ] [measure] shell: brand block shows the MonogramMark "E" (40×40 square, brand fill, mono glyph) + "Example Records" + "LABEL OPERATIONS"; nav, header, Terminate Session identical to the mau5trap run
[ ] [measure] sidebar sublabel color → rgb(255, 45, 149); login card border-color → rgba(255, 45, 149, 0.35); active nav tint, StatCard left rules, focus ring, login button and Forgot Password? link are all magenta; no green pixel remains
[ ] [measure] document.title === "Example Records — Label Operations"; favicon href ends /brands/example-records/favicon.svg; body.dataset.theme === "example-records-magenta"
[ ] [measure] full-page loader is the RingLoader (80px ring, pulse, no ears); fullscreen ErrorState unchanged except the button/ring hue
[ ] [measure] admin KPI row reads MONTHLY REVENUE £3.2m · QUARTERLY PROJECTION £134.8m · ANNUAL PROJECTION £539.1m · ACTIVE ARTISTS 29 (en-GB/GBP display formatting of the same backend numbers; lowercase m is ICU's en-GB compact suffix)
[ ] [measure] document.body.innerText contains no "mau5trap" (case-insensitive) on /login and /dashboard; no element has a class containing "mau5"
[ ] [grep]    contract §4/§5 greps and the §13.7 hue rule still pass for the example-records theme (magenta is hue 330°, outside the forbidden 200-290° band)
[ ] [judge]   the example-records screens are recognisably the same console (geometry, density, mono labels, voice) in a different brand — NOT a redesign, NOT generic
[ ] [measure] switch back to mau5trap (unset the env / remove the localStorage key) → every mau5trap box above passes again with no edits
```

**VISUAL PASS — judgment (secondary FAIL; answered from screenshots with the logo cropped out):**
```
[ ] Login: reads as an access terminal (ACCESS ID / PASSPHRASE / INITIALIZE SESSION / RESTRICTED ACCESS), not "Sign in to your account"
[ ] Shell: reads as the legacy mau5trap workstation tightened (same sidebar/header/KPI arrangement, sharper), not a Linear/Vercel/shadcn admin template
[ ] Dashboard: four hairline cards with green left rules and mono uppercase labels on near-black; nothing a crypto-admin template would add (icons, sparklines, delta pills)
[ ] Typography: the uppercase mono .label hierarchy is the first thing you notice; Inter appears only in nav labels, h1/subtitle, chip name, error message
[ ] Reviewer's one-line answer to "what product is this?" is "the mau5trap console" — not "an analytics dashboard"
```

**FAIL** if any mechanical box is unchecked (including every BRAND LAYER
and PORTABILITY box); if two or more judgment boxes
fail; if a second page was started before all boxes passed; if a legacy
HTML file changed; if a backend file changed; if a state/CSS framework or
TypeScript was added without asking the user; if any file was committed
without the user's authorization; if the portability run required editing
any file outside `web/src/brand/`; or if the implementer had to invent a
color, size, radius, string, icon or layout not given in the contract or
architecture §13/§14 — in that case stop and report the gap instead of
guessing.

---

## 16. Phase 4B file creation order

Create in this order; each file's single responsibility is fixed.

| # | File | Responsibility |
|---|---|---|
| 1 | `web/package.json` | name `label-intelligence-web`; deps: react, react-dom, react-router-dom · dev: vite, @vitejs/plugin-react · scripts dev/build/preview |
| 2 | `web/vite.config.js` | react plugin; default port; no proxy |
| 3 | `web/index.html` | `#root`, Inter + JetBrains Mono links (the only two families), static `<title>Label Intelligence Platform</title>`, `<link rel="icon" id="brand-favicon">` placeholder |
| 4 | `web/.env.example`, `web/.env.development` | `VITE_API_BASE_URL`, `VITE_BRAND_PROFILE=mau5trap` |
| 5 | `web/src/styles/tokens.css` | block 1 = contract §1 verbatim; block 2 = architecture §13.9 verbatim; block 3 = architecture §14.4 verbatim; nothing else |
| 6 | `web/src/styles/global.css` | contract §2: reset, body (3-layer background only on `.login-page`; 2-layer elsewhere), `.panel .label .kpi .value .status-dot`, `:focus-visible`, scrollbar, `@keyframes pulse/scanline/blink/fadeIn`, reduced-motion. NO `.mau5-head` (profile-owned) |
| 7 | `web/src/copy.js` | platform voice, architecture §13.1 verbatim — label-neutral; components read it through `brand/index.js` `text` |
| 8 | `web/src/brand/schema.js` | `BrandProfile` JSDoc typedef (architecture §14.2) + `validateProfile()`; contains NO label values (examples live in the profiles) |
| 9 | `web/src/brand/profiles/mau5trap/profile.js` | the reference profile — architecture §14.2 values verbatim |
| 10 | `web/src/brand/profiles/mau5trap/{Mau5Head.jsx, Mau5HeadLoader.jsx, mau5head.module.css}` | architecture §13.2 verbatim (SVG) + contract §2/§3.17 loader CSS moved here |
| 11 | `web/src/brand/profiles/example-records/profile.js` | the portability test profile — architecture §14.7 verbatim |
| 12 | `web/src/brand/themes/{mau5trap-console.css, example-records-magenta.css}` | architecture §14.4 verbatim (empty scoped block; 4-token override) |
| 13 | `web/public/brands/{mau5trap,example-records}/favicon.svg` | mau5trap: the §13.2 head on transparent; example-records: the monogram "E" square. Both use the theme's brand primary as a literal (static assets) |
| 14 | `web/src/brand/defaults/{MonogramMark.jsx, RingLoader.jsx}` (+ `.module.css`) | label-neutral fallbacks, architecture §14.6 |
| 15 | `web/src/brand/registry.js` | `{ defaultSlug: 'mau5trap', profiles: { mau5trap, 'example-records' }, marks: { mau5head: { Mark, Loader } } }` + side-effect `import './themes/mau5trap-console.css'` / `'./themes/example-records-magenta.css'` — the only platform file that names a label or imports from `profiles/`/`themes/` |
| 16 | `web/src/brand/index.js` | resolve `VITE_BRAND_PROFILE` (+ dev-only `localStorage['platform.brandProfile']`), fallback to `registry.defaultSlug`, export `{ profile, text }` (text = copy.js ⊕ profile.copy); no label string in this file |
| 17 | `web/src/brand/BrandContext.jsx` | `BrandProvider` (sets `document.title`, favicon href, `body.dataset.theme`) + `useBrand()`; imports nothing from `profiles/`/`themes/` |
| 18 | `web/src/brand/{BrandMark.jsx, BrandLoader.jsx}` | registry lookup by `profile.assets.mark/loader` with the §14.6 fallbacks |
| 19 | `web/src/utils/format.js` | `moneyCompact(n)`, `integer(n)` via `Intl.NumberFormat(profile.locale…)`; `dash` fallback (`—`) per architecture §13.5.4 |
| 20 | `web/src/api/client.js` | `apiFetch` + 401 hook |
| 21 | `web/src/api/endpoints.js` | `login`, `getMe`, `getLabelOverview` (grow per page later) |
| 22 | `web/src/auth/permissions.js` | `isAdmin`, `canSee` |
| 23 | `web/src/auth/AuthContext.jsx` + `useAuth.js` | session state, hydrate, `/me` reconcile, login/logout, registers 401 handler |
| 24 | `web/src/auth/ProtectedRoute.jsx` | redirect guard |
| 25 | `web/src/hooks/useApiQuery.js`, `useApiMutation.js` | data hooks with abort |
| 26 | `web/src/components/primitives/{Panel,StatCard,Button,LoadingScreen,ErrorState}.jsx` (+ `.module.css`) | the 5 primitives the slice needs — StatCard per §13.5.4, LoadingScreen renders `<BrandLoader/>`, ErrorState (3 variants) per §13.6, Button variants per contract §3.14 using `--color-accent-bright/-deep` |
| 27 | `web/src/layout/nav.js` | `NAV_PRIMARY`, `NAV_SECONDARY` exactly as architecture §5; per-route `subtitle` field (dashboard: `text.dashboardSubtitle`) |
| 28 | `web/src/layout/{AppShell,Sidebar,Header}.jsx` (+ `.module.css`) | shell per architecture §13.5.2-13.5.3 (Sidebar renders `<BrandMark/>` + `profile.displayName` + `profile.tagline`; Header renders the chip, no controls) |
| 29 | `web/src/pages/LoginPage/LoginPage.jsx` (+ `.module.css`) | login per architecture §13.3 with `profile.displayName/tagline/domain/legal.footer`; forgot/reset states stubbed until 4C |
| 30 | `web/src/pages/DashboardPage/DashboardPage.jsx` | `useApiQuery(getLabelOverview)` → `LoadingScreen` / `ErrorState fullscreen` / KPI row (§13.5.4). Nothing else rendered |
| 31 | `web/src/router.jsx` | `/login`, `/`→`/dashboard`, `/dashboard`, `*`→`<Navigate to="/dashboard" replace/>` (4B only; `NotFoundPage` arrives with 4C) |
| 32 | `web/src/App.jsx`, `web/src/main.jsx` | `<BrandProvider>` outermost, then Auth, then AiProvider (may be a no-op shell until 4C), then router |
| 33 | `web/README.md` | run backend (`JWT_SECRET=… npm start`), run web, switch brand profile (`VITE_BRAND_PROFILE`), the §15 gate checklists verbatim |

→ **Run §15 gate — mau5trap run, then the PORTABILITY run, then back.** Only then continue, one page at a time, in this order:
Artists → ArtistDetail (9 tabs) → A&R (Room, then Scouting sub-tab) →
Intelligence (`ai/*` + `CommandConsole`, system-default mode, architecture §13.8.1) → Settings
(Integrations, then AI view in system-default mode, architecture §13.8.2) → Marketing → Fans →
Operations → Admin → exports on Dashboard/Admin → the rest of `/dashboard`
(chart, map, Top Performers, console rail — the §3.4 density rule applies
from here). Add `Badge`, `Table`, `FormField`, `Modal`, `Tabs`,
`EmptyState`, `InlineLoading`, `ProvenanceBadge`, `StatusDot`, `NotFoundPage`,
charts, maps, media as each page needs them. Every panel header from here on
carries a `.label` kicker (architecture §13.5.6).

---

## 17. Phase 4B/4C acceptance criteria (beyond the slice)

- Every matrix row has its disposition applied; none silently dropped.
- All 10 authenticated views reachable via real nav/sub-tabs (5 orphans fixed).
- `FanEngagementView` crash, dead `fetchSubmissions`, dead `handleVote`, `window.dashboardArtists`, all `alert()/confirm()`, `ui-avatars.com` call, `window.location.reload()` — none present in `web/`.
- Legacy HTML files byte-identical; backend untouched; `npm test` + `npm run verify` still pass.
- Contract §5 checklist clean on every page; density ≥ legacy at 1440×900 (rule waived only for the 4B slice).
- Every identity string rendered comes from `copy.js` (platform voice) or the active profile (brand); the §15 forbidden-string, label-literal, artist-id and emoji greps stay clean on every page.
- **Portability (Phase 4 acceptance criterion):** with `VITE_BRAND_PROFILE=example-records`, every page built so far renders with the test brand — wordmark, tagline, mark, loader, theme tokens, locale formatting, title/favicon — and no file under `web/src` outside `web/src/brand/` changes. Re-run the §15 PORTABILITY block at the end of 4C, not only in 4B.
- **Map portability (4C only):** keep the current region/city/venue lookup intact in `brand/profiles/mau5trap/locations.js`, referenced by `profile.map.centers`; generic `GeoHeatmap` accepts coordinates supplied by its dataset/API or resolves a location key through the active profile. Test a location supplied only by the Example Records profile and dataset: its marker renders with no edit to `web/src/components/maps/` or any other generic source. No map is built in 4B.
- **Specialization preserved:** under the default `mau5trap` profile nothing mau5trap-specific is removed or diluted — the mau5-head, the neon console, the wordmark/tagline, and (backend-side, unchanged until Phase 4-LABEL) the mau5trap search context, deadmau5 knowledge sources, artist alias/social mappings, A&R benchmark and AI label context stay active. Portability is achieved by externalizing, never by deleting (architecture §14.1, §15).
- **Profile parity (from Phase 4-LABEL onward):** `web/src/brand/profiles/<slug>/profile.js` and `labels/<slug>/label.config.js` agree on `slug`, `name`, `displayName`, `domain`, `search.searchContext` and `search.artistQueryPrefix` (identical key names; a 10-line node script diff in `web/README.md`), until `GET /v3/label/profile` removes the duplication.
- Every panel header carries a `.label` kicker (architecture §13.5.6); every AI surface passes the architecture §13.8 FAIL greps and sends no label context (architecture §8.8).
- Split-brain A&R preserved as two surfaces. `reset-password` and `label/entity-audit` behave exactly as legacy (fail / graceful skip).
- AI console works in system-default mode; no vendor literal in JSX; `provider/model` never sent while `selectable===false`.

## 18. Known risks

| Risk | Mitigation |
|---|---|
| PDF report/export is chart-heavy server-side (native canvas) → slow | long-op mono status; generous fetch timeout; don't spam |
| A&R vote endpoints mutate scalars non-idempotently | disable while in flight; optimistic + rollback (legacy pattern) |
| `POST /v3/artists` derives `id` server-side and ignores client id | always use returned `artist.id` for follow-ups |
| `?refresh=true` entity audit costs real money (HIGH-7, no server quota) | keep inline CONFIRM PAY; never one-click |
| `aiQuery` schema is `.strict()` | strip `provider/model` unless `selectable` |
| Dev CORS regex is localhost-only | `ALLOWED_ORIGINS` env on backend for LAN/tunnel |
| `JWT_SECRET` required to boot backend | document in `web/README.md` |
| Cheaper model drifting to generic SaaS look | architecture §13 (copy canon, mark, login exception, drawn composition, anti-generic table) + §15 mechanical gate; run per page |
| Implementer "restores" HTML values (16px radius, 260px sidebar, Inter labels, `#00ff00`) after spot-checking line refs | architecture §13.4 deviation register is explicit; §15 greps catch radius/hex; reviewer checks §13.4 rows |
| Legacy KPI glue reads fields the endpoint never served (`totalRevenue/totalStreams/avgROI` → NaN) | KPIs remapped to served fields (architecture §13.5.4); `format.js` renders `—` for missing numbers; gate asserts exact admin values |
| Artist-role `/v3/label/overview` returns all zeros in the frozen snapshot | render zeros honestly (`$0`, `0`); do not special-case, do not hide cards, do not "fix" the backend |
| Slice looks sparse (KPI row + empty canvas) and the implementer fills it | density rule explicitly waived for 4B; fillers are a FAIL (§15) |
| Implementer types "mau5trap" into a component (title, alt text, aria-label, comment, class name, storage key) | §15 label greps run over ALL of `web/src` outside `brand/`, including comments and class names; `copy.js` is label-neutral by construction |
| A profile theme picks a blue/violet primary and the console turns generic | the hue rule is a platform rule (architecture §14.4); theme files are grepped like components |
| `color-mix()` unsupported on an older browser | modern evergreen browsers are the supported floor; `color-mix()` is permitted and semantic theme tokens remain authoritative. If older-browser support is required later, generate or handle fallback values centrally, never per component (§20 resolved Q14) |
| Rebranded frontend, un-rebranded backend | expected until Phase 4-LABEL (architecture §15.2); document in `web/README.md` that AI answers, PDFs and reset emails stay mau5trap-flavoured until then |

## 19. Phase 4B MUST NOT

- Touch `src/`, `server.js`, `mau5trap-production-api.js`, `mock/`, `modules/`, `integrations/`, `sync/`, tests, or Phase 1-3 docs.
- Invent or "fix" backend routes (`reset-password`, `label/entity-audit`, `ai/providers`).
- Send `provider`/`model` to `/v3/ai/query` against the current backend.
- Merge the two A&R stores client-side.
- Add TypeScript, a state library, a CSS framework, a toast library, or any AI/provider SDK without asking.
- Hardcode vendor names, `localhost:3000`, or raw colors in components.
- Build day/red mode, or time-based theme switching.
- Delete/rename/edit any legacy HTML file.
- Add new backend label coupling; the existing backend debt is a later bounded Phase 4-LABEL pass and does not block 4B (§23).
- Skip the §15 gate.
- Inline an identity string (anything in architecture §13.1) in a component instead of importing it from `copy.js`; or render `Email` / `Password` / `Sign in` / `Welcome` / `Assistant` anywhere.
- Substitute a Remixicon glyph, text, or image for `Mau5Head.jsx`.
- Port the legacy KPI `sub` literals (`+12% vs last month`, `2.4M daily average`, `Target: 5.0x`) or the `TOTAL STREAMS` / `AVG ROI` cards; render `NaN`/`undefined` in any KPI.
- Add anything to `/dashboard` beyond the KPI row before the §15 gate passes.
- Copy a radius, width, padding, or color value from the legacy HTML (architecture §13.4).
- Render a model/provider picker inside `CommandConsole`, or any chat-bubble/avatar/typing-indicator/suggested-prompt UI (architecture §13.8).
- Edit `MAU5TRAP_VISUAL_DESIGN_CONTRACT.md` or `PHASE_4A_DESIGN_AUDIT.md` (folding §13 into the contract is §20 Q11, user-authorized).
- Commit anything without the user's explicit authorization.
- Write "mau5trap", "mau5", an artist name, an `art_*` id, `@mau5trap.com`, or a `mau5trap.*` storage key anywhere in `web/src` outside `brand/` — including comments, class names, test ids and alt text.
- Import from `brand/profiles/*` anywhere except `brand/registry.js`; import a profile component (`Mau5Head`) into a page or layout.
- Hardcode `$`, `en-US`, a currency or a time zone in a component (use `profile.locale` via `format.js`).
- Add a runtime brand switcher, tenant picker, per-tenant data path, or any multi-tenant machinery (single active profile only — architecture §14.1; the dev-only `localStorage['platform.brandProfile']` override is a test hook, not UI).
- Redesign the mau5trap theme around the example-records fixture, or ship example-records as a default anywhere.
- Let a theme file override a platform-locked token (architecture §14.4 table).
- Touch the backend label hardcodings catalogued in architecture §15 — that is Phase 4-LABEL, separately authorized.
- Delete, blank, or genericize mau5trap-specific intelligence anywhere (search context, knowledge sources, alias/social mappings, A&R benchmark, AI label context, report/email branding, seed datasets). The only permitted operation on such a value — in any phase — is moving it verbatim into the mau5trap profile and reading it from there (architecture §14.1 "externalize, never remove").
- Invent generic substitute data ("Label Records", "Artist A", neutral prompts) for the default installation. The fictional `example-records` profile exists for the portability test only.

## 20. Product decisions (Q14 resolved; remaining questions do not block the slice)

1. **Alternate theme.** Red/white day mode is retired from scope. Keep it dead, or rebuild later as an explicit opt-in toggle (never time-based)?
2. **Unsurfaced endpoints** (rows 16, 32, 33, 34): monthly-sales per artist, per-artist monthly PDF, royalty calculator, rights/contracts. Surface any of them (e.g. as ArtistDetail tabs / an Admin › Reports panel), or leave unsurfaced?
3. **Executive role.** Terminal dashboard is consolidated into `/dashboard` + `/intelligence`. Is a distinct executive role/view wanted (would need a backend role — none exists)?
4. **Default visibility of the 3 new perms** (`marketing`, `fans`, `operations`): admin-only until granted (current plan), or also seed them into the artist/viewer defaults?
5. **`InboxPanel` fabricated numbers** removed in favor of the real shortlist + EmptyState. Confirm, or keep as clearly-labelled sample data?
6. **TypeScript** for `web/`? Plan is JS + JSDoc.
7. **Backend AI provider phase** (§13) — authorize as its own phase after 4B? It includes a contract change to `/v3/ai/query`.
8. **BYOK** — wanted at all? If yes, it needs encrypted secret storage the backend doesn't have.
9. **`AVG ROI` / `TOTAL STREAMS` KPIs** (matrix rows 39-40). The legacy cards read fields `/v3/label/overview` never serves (live: `undefinedx`, `NaNM`). 4B ships the four served fields. Options for later: (a) backend serializes `labelTotals.avgROI` (one line in `src/routes/label.js`, but a response-contract change → sign-off + snapshot re-baseline), (b) leave both dead, (c) add a streams aggregate to the route (bigger contract change). `TOTAL STREAMS` has no label-level source at all. Decide before 4C's dashboard completion; not needed for the slice.
10. **Header subtitle on non-dashboard pages.** Legacy shows `Real-time label performance metrics` under EVERY page title (L3526). 4B uses it for `/dashboard` only. For 4C: keep the legacy behavior (same string everywhere), give each route its own one-liner (needs copy from you), or drop the subtitle off-dashboard? Until answered, 4C defaults to the legacy behavior.
11. **Fold architecture §13 into `MAU5TRAP_VISUAL_DESIGN_CONTRACT.md`.** The remediation pass was authorized to edit only the architecture and handoff files, so the visual fixes live in architecture §13 with a precedence rule (§13.0). Recommended: authorize a small doc-only pass that merges §13 into the contract (copy canon as a contract appendix, login exception into §3.1/§4, `COMMAND CONSOLE` into §3.21, the §13.9 tokens into §1) so the contract is single-source again. Zero design change; a pure move.
12. **KPI value color.** The HTML renders KPI values white (L254); the reference capture `final.jpeg` renders them neon green. The spec keeps white (green stays a signal, not a data color). Confirm, or switch `.kpi` to `--color-accent` (one token change, no layout impact)?
13. **Backend label phase ("Phase 4-LABEL").** Architecture §15 catalogues 25 hardcoding sites (9 class C). All are externalizations into `labels/mau5trap/label.config.js` (§15.3) with today's values preserved verbatim — no response, PDF or email changes under mau5trap. Authorize it as its own phase (L1-L5, optionally L6-L7), merge it with the AI provider phase (Q7), or defer? Until it runs, a *different* label deployed on this backend would still get mau5trap-flavoured AI answers, PDFs, reset emails and entity searches; the mau5trap installation is unaffected either way.
14. **RESOLVED — `color-mix()` browser floor.** Support modern evergreen browsers. CSS `color-mix()` is permitted; semantic theme tokens remain the source of truth. No per-component legacy color fallback is required. If older-browser support is required later, generate or handle fallback values centrally rather than duplicating them across components.
15. **Fonts per profile.** Inter + JetBrains Mono are platform-locked in 4B/4C; a profile cannot change fonts because font loading is static in `index.html`. Keep locked, or add `profile.assets.fonts` + `BrandProvider` font injection later?
16. **Platform voice ownership.** `ACCESS ID` / `PASSPHRASE` / `INITIALIZE SESSION` / `RESTRICTED ACCESS…` are treated as the platform's default voice (every label inherits them; a profile may override via `profile.copy`). Confirm, or make the console voice itself part of the mau5trap profile so a new label starts from neutral strings?
17. **Backend-served profile (`GET /v3/label/profile`, §15.2 L6).** Wanted, so a rebrand needs no frontend rebuild? Additive endpoint, no secrets in the schema.
18. **Legacy HTML files** (`mau5trap-frontend-connected.html`, `mau5trap-terminal-dashboard.html`) are brand-named and brand-bound by nature; they stay untouched through 4B/4C as agreed. Confirm they are retired (not rebranded) when their replacements pass acceptance.
19. **Third seeded account.** `server.js` L79 advertises `joel@deadmau5.com (mau5123) - deadmau5 only`, but `src/models/index.js` seeds only the admin and REZZ accounts. When the seeds move into `labels/mau5trap/users.js` (Phase 4-LABEL L4): add the deadmau5 account to the mau5trap profile so the banner is true, or remove the banner line? (Adding it changes nothing in the API contract; it is profile data.)
20. **`Rezz is second at 6.5x`** (`/v3/ai/analyze` heuristic). It becomes `activeLabel.ai.heuristics.roiRunnerUp` in the mau5trap profile, preserved verbatim. The current roster shows REZZ at 8.7x ROI (snapshot `label_overview_admin.topArtists`), so the sentence may be stale. Keep as-is (byte-identical responses), or have the profile owner update the *data* after Phase 4-LABEL? Not a code decision.

## 21. Exact starting point for the Phase 4B model

1. Read: this file → `MAU5TRAP_VISUAL_DESIGN_CONTRACT.md` → `FRONTEND_ARCHITECTURE.md` (§13, §14 and §15 last and most carefully — §13/§14 override the contract where §13.0 says so; §15 tells you what the backend will still get wrong for a non-mau5trap profile). `PHASE_4A_DESIGN_AUDIT.md` is optional background; it is fully reconciled in §22 below.
2. `git status` shows the six untracked Phase 4A/audit documents listed in §1 and no other changes; the modern-evergreen `color-mix()` decision is already closed (§20 Q14). Backend boots: `JWT_SECRET=$(openssl rand -hex 32) npm start` (root) → `GET /health` 200; `curl -s -X POST localhost:3000/v3/auth/login -H 'content-type: application/json' -d '{"email":"admin@mau5trap.com","password":"admin123"}'` → token; `GET /v3/label/overview` with it → the six fields in §1.
3. Obtain explicit user authorization to begin Phase 4B.
4. Execute §16 files 1-33 in order. Run the §15 functional + mechanical (incl. BRAND LAYER) + PORTABILITY + judgment gates. Report results with the checklists filled in, plus 1440×900 screenshots of `/login` and `/dashboard` (admin) under BOTH profiles and one of the fullscreen error state.
5. Stop and report before Phase 4C bulk migration. Do not commit.

---

## 22. Audit reconciliation register (`PHASE_4A_DESIGN_AUDIT.md`)

Every finding, its verdict, and where the fix lives. "Arch" = `FRONTEND_ARCHITECTURE.md`.

| # | Sev | Finding | Verdict | Resolution |
|---|---|---|---|---|
| B1 | BLOCKER | Login copy not locked | **ACCEPTED** — verified L3080/L3095/L3119/L3126 | Arch §13.1 copy canon (`ACCESS ID`, `PASSPHRASE`, `INITIALIZE SESSION`, `AUTHENTICATING...`, footer ×2, `Forgot Password?`); `copy.js` file (§16 #7); forbidden-string grep; §15 COPY + LOGIN boxes |
| B2 | BLOCKER | Brand mark described, not specified | **ACCEPTED** — verified L3429-3443; no SVG in any 4A file | Arch §13.2 verbatim `Mau5Head.jsx` (token fills, `#00ff00`→accent, `#fff`→`--color-text`); loader vs sidebar mark distinguished; §16 #8; §15 MARK boxes |
| B3 | BLOCKER | Slice can pass as a 4-KPI crypto-admin template | **ACCEPTED**, with a correction the audit missed | Arch §13.5 drawn composition + closed scope; KPI anatomy fixed; "nothing below the row" rule; §15 mechanical boxes primary, `[judge]` secondary. **Correction:** the audit's "lock the four live KPI labels" would have locked cards that read fields the endpoint never serves (`$NaNM`/`NaNM`/`undefinedx`; Arch §0.2 #8, snapshot evidence). Labels remapped to the served fields `MONTHLY REVENUE · QUARTERLY PROJECTION · ANNUAL PROJECTION · ACTIVE ARTISTS` (matrix rows 5, 39-41; `final.jpeg` uses the same naming) |
| M1 | MAJOR | Login geometry vs panel-pad rule; radial not in `--gradient-decoration` | **ACCEPTED** — verified L3038, L3040 | Arch §13.0 precedence + §13.3 login exception (420/48, accent hairline), `--gradient-login` token (§13.9); §15 LOGIN boxes |
| M2 | MAJOR | Distinctive chrome copy scattered | **ACCEPTED** — verified L3411, L3526, L3514, L3729 | Arch §13.1 (adds `INITIALIZING NEURAL LINK...`, header subtitle, wordmark-case rule, `Failed to connect to Neural Link`, console/settings strings); greps in §13.1 and §15 |
| M3 | MAJOR | `/dashboard` slice layout not drawn; density rule unmeetable | **ACCEPTED** | Arch §13.5.1 wireframe at 1440×900 with expected values; §13.5.4 `align-items:start`, 88-112px cards; density rule waived for 4B only (§13.5.4, §15, §17); fillers = FAIL |
| M4 | MAJOR | AI settings has a chatbot-shaped hole | **ACCEPTED** | Arch §13.8.2 (one panel, `160px 1fr` grid, native 32px selects, text-first status, BYOK one line, FAIL greps); §12 updated; Arch §13.10 restates the multi-provider guarantees |
| M5 | MAJOR | Full-page vs in-panel error ambiguous | **ACCEPTED** — verified L3388-3409 | Arch §13.6 surface table; `ErrorState` = `fullscreen`/`panel`/`field`; initial load = full viewport; §15 STATES boxes. Colors/copy unchanged (contract danger tokens, `CONNECTION FAILURE`/`RETRY CONNECTION`) |
| M6 | MAJOR | 16px→4px radius is an undocumented deviation | **ACCEPTED** — extended beyond radius | Arch §13.4 signed-deviation register (24 rows: radii, widths, paddings, fonts, colors, removed toggle, undefined vars); "do not restore HTML values" in the handoff preamble, §14, §19 |
| M7 | MAJOR | Console title / right-rail unspecified | **ACCEPTED** | Title = `ri-brain-line` + `COMMAND CONSOLE` `.label--accent` (Arch §13.8.1, §13.0 precedence over contract §3.21); `COMMAND CENTER` explicitly not ported; chip is a link, never a picker |
| N1 | MINOR | KPI `sub` font unspecified | **ACCEPTED** | 12px `--font-mono` `--color-accent` (Arch §13.5.4, §13.0); 4B renders none because the legacy subs are hardcoded literals |
| N2 | MINOR | No global anti-emoji rule | **ACCEPTED** — verified terminal dashboard L163/171/179, `final.jpeg` 🔥 | Emoji grep (Arch §13.1, §13.7); matrix row 38 note |
| N3 | MINOR | `--glass`/`--primary-glow`/`--bg-dark` undefined in live CSS | **ACCEPTED** (informational) | Arch §13.4 row: not ported; loader bg `--color-bg`, glow via `--glow-accent`, blur sidebar/modals only |
| N4 | MINOR | Nav radius 8px vs 2px | **ACCEPTED** | Covered in Arch §13.4 (row "Nav item radius") |
| N5 | MINOR | Gate lists seeded passwords | **REJECTED (no change)** — evidence: `src/models/index.js` L94-105 seeds exactly these credentials; `tests/support/cases.js` L28-29 already uses them; they are fixture data, not secrets, and the gate cannot be executed without them. Not spread further (they appear only in §15 and the README gate copy) |
| §0 | — | Screenshots are prototype/marketing captures, not the live app | **ACCEPTED** — verified by inspection: `final.jpeg` = horizontal-nav CRT mock (all-mono, 0-radius green-bordered cards, 🔥), `G6lxjgsWYAA_9GA.jpeg` = web-builder preview with blue tags/star ratings | HTML structure remains primary. The captures are used as *corroborating* evidence for the tightening direction (uppercase mono labels, hairline sharp cards, `MONTHLY REVENUE`/`ANNUAL PROJECTION` naming) and explicitly NOT adopted for layout, radius 0, green KPI values, blue tags, star ratings (Arch §13.4 last two rows; §20 Q12) |

Minimum Required Patches 1-8 from the audit: all eight applied (1→§13.1,
2→§13.2, 3→§13.3/§13.9, 4→§13.5/§15, 5→§15, 6→§13.4, 7→§13.6, 8→§13.8),
in `FRONTEND_ARCHITECTURE.md` + this file rather than the contract file
(write scope), with the precedence rule in Arch §13.0 and §20 Q11 to merge.

**Reconciliation with the label-neutrality requirement (added after the
audit pass).** None of the audit fixes is weakened; three are re-homed:
B1/M2's copy canon splits into platform voice (`copy.js`) + brand strings
(profile) — same verbatim values under the mau5trap profile; B2's
`Mau5Head.jsx` moves from `components/brand/` into
`brand/profiles/mau5trap/` and is reached via `<BrandMark/>` — same SVG,
same gate check; the `Mau5trap|MAU5TRAP` casing grep is replaced by the
stronger "no label literal outside `brand/`" grep. The `.mau5-head` loader
becomes the mau5trap profile's loader (contract §2 rule superseded, Arch
§13.0). Everything else in §13 is unchanged and applies to every profile.

**Clarification applied (externalize, never remove).** Portability does not
genericize the mau5trap installation. Every mau5trap-specific value —
frontend (wordmark, tagline, mau5-head, theme) and backend (search context,
knowledge sources, alias/social mappings, A&R benchmark, AI label context,
report/email branding, seed datasets) — stays active and moves verbatim
into the mau5trap profile (Arch §14.2 frontend, §15.3 backend). No audit
fix and no §15 row deletes or dilutes label intelligence; earlier wording
that offered generic substitutes (computing a benchmark from ROI, "last
remaining admin" rule, parametrize-or-delete) was withdrawn in favour of
profile data with today's values.

---

## 23. Post-4A work queue — brand/label neutrality (NOT authorized; sequencing only)

| Item | Phase | Blocking? |
|---|---|---|
| Frontend brand layer (`web/src/brand/`, §16 #8-#18) + portability test | **4B** (in the slice) | required for the 4B gate |
| Re-run the PORTABILITY block on every 4C page | **4C** | required for 4C acceptance (§17) |
| Backend `labels/mau5trap/label.config.js` (Arch §15.3) + class-B/C **externalizations** with values preserved (Arch §15.2 L1-L3) | **4-LABEL** (later bounded backend pass, separate authorization; may merge with 4-AI) | not blocking 4B/4C; required before claiming the full application can be deployed for another label; no new backend coupling in 4B |
| Datasets relocated intact to `labels/mau5trap/` (roster, socials/aliases, operations, A&R seeds, users) (L4); benchmark + ROI heuristic phrase read from the profile (L5) | **4-LABEL** | not blocking 4B/4C; required for a real second-label deployment; preserve mau5trap behavior and run `snapshot:baseline` to prove it |
| `GET /v3/label/profile` (L6), `app.js` rename (L7) | optional | — |
| Merge Arch §13/§14 into `MAU5TRAP_VISUAL_DESIGN_CONTRACT.md`; retitle it as the reference-theme contract | doc-only pass (§20 Q11) | — |
| Decide remaining §20 Q13 and Q15-Q20 | user | none blocks 4B; Q14 (`color-mix()`) is resolved in §20 |
