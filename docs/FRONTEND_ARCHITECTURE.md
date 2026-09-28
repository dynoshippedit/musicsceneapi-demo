# FRONTEND_ARCHITECTURE.md

Durable architecture reference for the **Label Intelligence Platform**
frontend (React/Vite). The platform is a generic music-label operations
console; **pulsegrid is the active reference profile** (brand configuration +
reference theme + seed dataset) used to develop and demonstrate it, not the
identity of the software. §14 defines the platform / brand-configuration /
label-data / theme separation; §15 audits what the current backend still
hardcodes. Finalized in Phase 4A (planning only — no code scaffolded).
Companion docs:

- `PULSEGRID_VISUAL_DESIGN_CONTRACT.md` — the **reference theme** contract
  (`pulsegrid-console`: tokens, component rules, FAIL conditions). It is the
  platform's default design language and the visual bar every profile is
  held to; authoritative for anything visual EXCEPT where §13 of this file
  (Phase 4A remediation addendum, written against the independent audit
  `PHASE_4A_DESIGN_AUDIT.md`) or §14 (brand layer) supersedes it — §13.0
  lists every superseded rule. The contract file itself was not modified in
  the remediation passes (outside their authorized scope).
- `PHASE_4A_HANDOFF.md` — the execution briefing for the Phase 4B model
  (matrices, exact file order, gates).

Backend behavior is the source of truth and is UNCHANGED by Phase 4A. Every
route referenced here was verified against the current `src/routes/*.js`
(post Phase 3), not against the pre-Phase-3 `API_INVENTORY.md` /
`FRONTEND_API_MAP.md` — §0 lists where those two are stale.

---

## 0. Verified discrepancies between existing docs/code and reality

### 0.1 Stale claims in `API_INVENTORY.md` / `FRONTEND_API_MAP.md` (pre-Phase-3)

| Doc claim | Actual current behavior |
|---|---|
| `POST /v3/auth/login` empty body → 200 admin token | → **401** |
| `GET/DELETE /v3/auth/me` → 404 (no `id` in JWT) | → **200**, works |
| `GET /v3/artists` as artist role → `[]` | → **200** with the artist's own record |
| `GET /v3/artists/:id`, `/monthly-sales`, `/exports?artistId=<own>`, `/reports/monthly/<own>/…` as artist → 403 | → **200** |
| `GET /v3/exports?format=pdf` → 500 | → **200** valid `%PDF` |
| PDF endpoints crash the Node process (NEW-2) | fixed |
| `POST /v3/users` valid shape → 500 | → **200** |
| Groq model `llama-3.1-8b-instant` | retired; default `openai/gpt-oss-20b` via `GROQ_MODEL` |

Everything else in those docs (endpoint list, shapes, the two dead frontend
calls, the 21 backend-only routes, the A&R split-brain, 5 shadowed routes)
was re-verified and is still accurate. The docs themselves were not edited
(historical artifacts; not this phase's job).

### 0.2 Frontend findings (verified this phase, not previously documented)

1. **Five orphaned views.** `setActiveTab(` has exactly ONE call site
   (sidebar `onClick`, L3464) driven by a 5-item array. The content area has
   10 `activeTab` branches. `settings`, `fans`, `campaigns`, `scouting`,
   `operations` are implemented, API-wired, and unreachable. Full
   classification in `PHASE_4A_HANDOFF.md` §3.
2. **`FanEngagementView` crashes if rendered.** It references `zoomImage`
   (L1319, L1328), which is declared only inside `ArtistDetailView` (L2012).
   In the browser-Babel setup that is a `ReferenceError` on render with no
   error boundary → whole app white-screens. Strong evidence the orphaning
   was accidental (dead code rots).
3. **No responsive behavior exists.** Zero `@media` rules in the file.
4. **Debug global leak.** `window.dashboardArtists = …` (L3260). Do not port.
5. **Day mode is time-triggered.** `isDayMode` defaults to `true` between
   06:00–18:00 (L3148-3151), so the legacy app opens white/red half the day.
   Retired — see contract §1 "Alternate theme policy".
6. **Two dead functions.** `IntegrationsPanel.fetchSubmissions` (references
   an undefined `setSubmissions`; never called) and `AnRView.handleVote`
   (posts to the OTHER A&R store; never wired to any button). Do not port.
7. **`InboxPanel` is decorative.** Its "DEMO INBOX (142)", 3 demos and
   weekly stats are hardcoded literals; only the `shortlistedArtists` prop
   is real. See handoff matrix row 20 for the disposition.
8. **Three of the four legacy dashboard KPIs render `NaN`/`undefined`
   against the frozen backend** (found in the Phase 4A remediation pass; not
   in the Grok audit). `fetchData()` stores the `/v3/label/overview` body as
   `data.stats` (L3255-3257) and the StatCards read
   `data.stats.totalRevenue`, `.totalStreams`, `.avgROI` (L3542, L3548,
   L3560). The route (`src/routes/label.js` L127-134) and the frozen
   snapshot (`tests/snapshots/baseline.json` → `label_overview_admin`)
   serialize ONLY `monthlyRevenue, quarterlyProjection, annualProjection,
   activeArtists, topArtists, timestamp`. Live result: `$NaNM`, `NaNM`,
   `undefinedx`; only `Active Artists` is real. The three `sub` lines
   `+12% vs last month`, `2.4M daily average`, `Target: 5.0x` (L3543,
   L3549, L3561) are hardcoded literals — fabricated metrics, same class as
   the `InboxPanel` numbers. Disposition: the Phase 4B KPI row shows the
   four fields the endpoint actually serves (§13.5.4); the two unsourced
   legacy cards are logged as blocked (handoff matrix rows 39-40, §20 Q9).
   The reference capture `final.jpeg` labels its KPIs `MONTHLY REVENUE` /
   `ANNUAL PROJECTION`, i.e. the served fields — the endpoint, not the HTML
   glue, reflects the intended product.
   > Amended pre-4C (Decision 4, 2026-09-17): `tests/snapshots/baseline.json` is the
   > Phase-1 capture of the PRE-REFACTOR monolith (`__meta.entry:
   > production-api.js`, 50 cases) and is read by NO test. The deterministic
   > baseline `npm test` compares against is `tests/snapshots/phase2_baseline.json`
   > (91 cases, re-captured after the Phase 3 fixes). The served field set cited here
   > is identical in both; only the artist-role VALUES differ — they are "as served"
   > (Phase 3 HIGH-4 artist-access normalization): seeded artist → activeArtists 1 ·
   > 8464217 · 25392651 · 101570604. See PHASE_4C_PREREQUISITE_VALIDATION.md §6.

---

## 1. Target architecture

| Layer | Decision | Rationale |
|---|---|---|
| Framework | React 18, function components + hooks | Same model as the legacy file; a move, not a rewrite |
| Build | Vite + `@vitejs/plugin-react` | Product requirement; env injection via `import.meta.env` |
| Language | JavaScript (`.jsx`) with JSDoc | No typed contracts exist upstream to derive types from; adding TS is a scope decision left to the user (handoff §20). A cheaper implementation model drifts less with fewer moving parts. |
| Routing | React Router v6, `createBrowserRouter`, nested routes | Converts tab-as-state and modal-as-state into URLs; the only way to make the 5 orphaned views reachable cleanly |
| Data fetching | Two dependency-free hooks: `useApiQuery`, `useApiMutation` | The legacy problem is repeated fetch/loading/error boilerplate, not missing cache semantics. ~100 lines solves it. Call-site shape `{data, loading, error, refetch}` is deliberately TanStack-Query-compatible so a later swap is mechanical. |
| Global state | `AuthContext`, `AiProviderContext`, `BrandContext` (static, from the active profile — §14.3) | Only genuinely cross-page state. No Redux/Zustand/Jotai. |
| Styling | CSS Modules + `tokens.css` (+ brand layer, §14.4) + `global.css` | Zero deps; directly kills inline-style sprawl; tokens make the design contract enforceable by grep; the brand layer makes a rebrand a one-file theme change. No Tailwind/UI kit (contract §4). |
| Brand / label config | `web/src/brand/` — one active profile (data) + one theme file + a marks registry (§14) | The platform never contains a label literal; pulsegrid is the reference profile |
| Charts | `chart.js` + `react-chartjs-2` | Same engine the legacy uses; wrapper fixes manual `destroy()` lifecycle |
| Maps | `leaflet` + `react-leaflet` | Same engine; wrapper owns the DOM ref |
| Icons | `remixicon` npm (same `ri-*` classes) | Removes a CDN; not blocking |
| Fonts | Inter + JetBrains Mono (self-host via `@fontsource/*` or keep the Google `<link>`) | Non-blocking |

No SDK for any AI provider, analytics vendor, or map vendor ships in `web/`.

---

## 2. Directory tree

New sibling `web/` at the repo root. The backend (`src/`, `server.js`,
root `package.json`) is not touched.

```
web/
  package.json                  name "label-intelligence-web"; react, react-dom, react-router-dom, chart.js, react-chartjs-2,
                                leaflet, react-leaflet, remixicon | dev: vite, @vitejs/plugin-react
  vite.config.js
  index.html                    <div id="root">, font links, static <title>Label Intelligence Platform</title>
                                (BrandProvider replaces title + favicon at boot from the active profile)
  .env.example / .env.development / .env.production     VITE_API_BASE_URL, VITE_BRAND_PROFILE (default pulsegrid)
  README.md                     how to run the backend (JWT_SECRET required) + this app + how to switch the brand profile
  public/
    brands/<slug>/favicon.svg   static brand assets, one folder per installed profile
  src/
    main.jsx                    createRoot; <BrandProvider><AuthProvider><AiProviderProvider><App/></…>
    App.jsx                     <RouterProvider router={router}/>
    router.jsx                  route tree (§3)

    brand/                      PLATFORM ↔ BRAND boundary (§14). The only place a label name may appear.
      index.js                  resolves the active profile (VITE_BRAND_PROFILE; dev-only localStorage override), exports
                                { profile, text } — text = platform copy merged with profile.copy overrides
      registry.js               composition root — the ONE platform file that may name a label: defaultSlug, {slug → profile},
                                marks {id → {Mark, Loader}}, and the side-effect imports of brand/themes/*.css
      schema.js                 BrandProfile JSDoc typedef + validateProfile() (dev-time console.error, never throws in prod)
      BrandContext.jsx          BrandProvider + useBrand(); applies body[data-theme], document.title, favicon
      BrandMark.jsx             renders the profile's mark via the registry; fallback defaults/MonogramMark
      BrandLoader.jsx           renders the profile's loader via the registry; fallback defaults/RingLoader
      defaults/                 MonogramMark.jsx, RingLoader.jsx (+ .module.css) — label-neutral fallbacks
      profiles/
        pulsegrid/               REFERENCE PROFILE: profile.js (data), PulseMark.jsx, PulseMarkLoader.jsx, pulsemark.module.css;
                                locations.js (4C: current region/city/venue coordinate data, preserved from legacy)
        example-records/        PORTABILITY TEST PROFILE: profile.js only (uses the defaults)
      themes/
        pulsegrid-console.css    body[data-theme="pulsegrid-console"] {}  — empty by design: the platform defaults ARE this theme
        example-records-magenta.css   body[data-theme="example-records-magenta"] { the 4 brand tokens }

    api/
      client.js                 apiFetch(): base URL, bearer header, JSON, 401 → session clear
      endpoints.js              one thin function per backend route; ONLY place '/v3/…' strings live
      download.js               fetch → blob → <a download> → revoke (PDF/CSV); filename prefix = profile.slug

    copy.js                     PLATFORM VOICE (§13.1, label-neutral strings) — components read `text` from brand/index.js,
                                which merges these with the profile's overrides; never inline identity copy

    auth/
      AuthContext.jsx           {token, user, status, login(), logout()}; hydrate from localStorage,
                                reconcile with GET /v3/auth/me
      useAuth.js
      ProtectedRoute.jsx        no session → <Navigate to="/login"/>
      RoleGate.jsx              renders children if role/pageAccess predicate passes, else <AccessDenied/>
      permissions.js            canSee(user, permKey), isAdmin(user) — mirrors legacy nav filter exactly

    ai/                         provider-neutral AI layer (§8)
      aiClient.js               query(), analyze(), audit(), listProviders() → normalized results
      AiProviderContext.jsx     providers[], defaults, selection, status; persists {providerId, modelId}
      useAiProviders.js
      capabilities.js           capability vocabulary + hasCapabilities(model, required)

    hooks/
      useApiQuery.js            {data, loading, error, refetch}; AbortController on unmount
      useApiMutation.js         {mutate, loading, error, reset}

    styles/
      tokens.css                three blocks, each VERBATIM: contract §1 · §13.9 addendum · §14.4 brand layer. Nothing else.
      global.css                reset, body, identity classes (.panel .label .kpi …), focus ring,
                                scrollbar, keyframes, reduced-motion (NO brand-specific classes — the legacy mark loader
                                CSS lives in brand/profiles/pulsegrid/)

    components/
      primitives/               Panel, StatCard, Badge, Button, Table/{Table,SortableHeader},
                                FormField, Modal, Tabs, LoadingScreen (renders <BrandLoader/>), InlineLoading,
                                ErrorState, EmptyState, ProvenanceBadge, StatusDot
      charts/
        chartDefaults.js        the ONE place chart colors/fonts live (contract §3.11)
        RevenueForecastChart.jsx
        RevenueBarChart.jsx     (terminal dashboard's revenue-by-artist bars, absorbed into Dashboard)
        NetworkGraph.jsx        hand-rolled canvas force graph, ported verbatim
      maps/
        GeoHeatmap.jsx          react-leaflet dark tiles + circleMarker scatter; coordinates from dataset/API
                                or active profile map.centers; no label location table in generic source
      media/
        UniversalPlayer.jsx     Spotify/SoundCloud/YouTube iframe sniffing, verbatim
      ai/
        CommandConsole.jsx      signature console (contract §3.21); consumes aiClient only
        ProviderModelChip.jsx   "PROVIDER · MODEL · ● STATUS" label row
        ProviderSelector.jsx / ModelSelector.jsx / ProviderStatus.jsx   (Settings › AI)

    layout/
      AppShell.jsx              sidebar + header + <Outlet/>
      Sidebar.jsx               renders NAV (§5), filters by permissions.js
      Header.jsx                title, subtitle, user chip
      nav.js                    NAV_PRIMARY, NAV_SECONDARY config

    pages/
      LoginPage/                LoginPage.jsx (login / forgot / reset-token states, as legacy)
      DashboardPage/            DashboardPage.jsx, TopPerformersTable.jsx
      ArtistsPage/              ArtistsPage.jsx, ArtistRow.jsx, ArtistManager.jsx
      ArtistDetailPage/         ArtistDetailPage.jsx (routed overlay, ?tab=), useGoogleKG.js,
                                tabs/{Overview,Revenue,Geography,Touring,Merch,Brand,Network,
                                      Sustainability,EntityAudit}Tab.jsx
      AnrPage/                  AnrLayout.jsx (sub-tabs Room | Scouting),
                                AnrRoomView.jsx, DemoRow.jsx,
                                AnrScoutingView.jsx, ScoutPanel.jsx, ShortlistPanel.jsx
      IntelligencePage/         IntelligencePage.jsx (CommandConsole + NetworkGraph)
      MarketingPage/            MarketingPage.jsx (campaign wizard + CRM stats)
      FansPage/                 FansPage.jsx (demographics, top movers, forecast) — zoomImage bug removed
      OperationsPage/           OperationsPage.jsx (logistics / assets / contracts tables)
      SettingsPage/             SettingsLayout.jsx (sub-tabs Integrations | AI),
                                IntegrationsView.jsx, AiSettingsView.jsx
      AdminPage/                AdminPage.jsx (team mgmt, roster mgmt, command center)
      NotFoundPage/ AccessDeniedPage/

    utils/
      format.js                 money/compact-number/percent/date helpers (replaces ~30 inline toFixed()s)
```

---

## 3. Routing model

```
/login                                  public
/                                       → /dashboard
/dashboard                              authed · perm overview
/artists                                authed · perm roster
/artists/:artistId?tab=…                authed · perm roster   (server enforces per-artist access → 403 → AccessDenied)
/anr                                    authed · perm anr_room   → AnrLayout, index = Room view
/anr/scouting                           authed · perm anr_room   → AnrLayout, Scouting sub-tab
/intelligence                           authed · perm ai_lab
/marketing                              authed · perm marketing   (NEW perm)
/fans                                   authed · perm fans        (NEW perm)
/operations                             authed · perm operations  (NEW perm)
/settings                               authed (no perm)          → /settings/integrations
/settings/integrations                  authed
/settings/ai                            authed (read); default-change controls admin-only (future)
/admin                                  authed · role admin
*                                       NotFound
```

`ArtistDetailPage` keeps the legacy overlay VISUAL (dim backdrop, centered
panel, prev/next artist arrows, 9 tabs) but is a routed page; the 9 tabs are
`?tab=` so every view is bookmarkable. Only the navigation vehicle changes.

---

## 4. Page and component hierarchy

```
AppShell
├─ Sidebar (NAV_PRIMARY filtered · NAV_SECONDARY: Settings · Terminate Session)
├─ Header (title, subtitle, user chip)
└─ <Outlet/>
   ├─ DashboardPage      StatCard×4 (MONTHLY REVENUE · QUARTERLY PROJECTION · ANNUAL PROJECTION · ACTIVE ARTISTS, §13.5.4)
   │                     · RevenueForecastChart · GeoHeatmap · TopPerformersTable · CommandConsole (right rail) — all 4C
   │                     · label-identity banner (renders only if GET /v3/label/entity-audit ever 200s — it 404s today; graceful skip)
   ├─ ArtistsPage        search · SortableHeader table · ArtistRow (VIEW / ARCHIVE) · ArtistManager (admin)
   │  └─ ArtistDetailPage  Tabs(9) · useGoogleKG · GeoHeatmap(dataset) · EntityAuditTab · image override (admin)
   ├─ AnrPage/AnrLayout  Tabs(Room | Scouting)
   │  ├─ AnrRoomView     DemoRow list · UniversalPlayer · submit form
   │  └─ AnrScoutingView ScoutPanel · ShortlistPanel
   ├─ IntelligencePage   CommandConsole (full) · NetworkGraph
   ├─ MarketingPage      CRM stats · 3-step campaign wizard
   ├─ FansPage           RevenueForecastChart · Top Movers · age bars · platform momentum · top regions
   ├─ OperationsPage     Logistics · Asset Vault · Contracts (403 → inline AccessDenied notice)
   ├─ SettingsPage/SettingsLayout  Tabs(Integrations | AI)
   │  ├─ IntegrationsView  service cards · CONNECT / DISCONNECT
   │  └─ AiSettingsView    ProviderSelector · ModelSelector · ProviderStatus · defaults (admin) · BYOK placeholder
   └─ AdminPage          CommandConsole (compact) · ArtistManager · team form (perm checkboxes) · users table
```

Primitives never fetch. Pages fetch via `useApiQuery`/`useApiMutation` and
pass plain data down — the legacy app already works this way; the rewrite
only centralizes the plumbing and the styling.

---

## 5. Navigation / information architecture

Decision reached after classifying the 5 orphaned views (handoff §3):
**not everything becomes primary nav.** Scouting is a contextual sub-tab of
A&R (same domain, same store); Integrations moves under a Settings entry in
the secondary (bottom) nav group alongside the new AI settings; Marketing,
Fans and Operations become primary entries gated by NEW permission keys — so
by default only admins see them (admin bypasses `pageAccess`), and rollout
to other roles is an admin decision made through the existing Admin › Team
permission checkboxes. That is the "soft launch" that satisfies both
"don't silently drop" and "don't blindly expose".

```js
// layout/nav.js
export const NAV_PRIMARY = [
  { id:'dashboard',    label:'Dashboard',    icon:'ri-dashboard-line',   perm:'overview',   to:'/dashboard' },
  { id:'artists',      label:'Artists',      icon:'ri-user-star-line',  perm:'roster',      to:'/artists' },
  { id:'anr',          label:'A&R Room',     icon:'ri-headphone-line',  perm:'anr_room',    to:'/anr' },
  { id:'intelligence', label:'Intelligence', icon:'ri-brain-line',      perm:'ai_lab',      to:'/intelligence' },
  { id:'marketing',    label:'Marketing',    icon:'ri-megaphone-line',  perm:'marketing',   to:'/marketing' },   // NEW perm
  { id:'fans',         label:'Fans',         icon:'ri-group-line',      perm:'fans',        to:'/fans' },        // NEW perm
  { id:'operations',   label:'Operations',   icon:'ri-truck-line',      perm:'operations',  to:'/operations' },  // NEW perm
  { id:'admin',        label:'Admin',        icon:'ri-settings-3-line', perm:'admin', adminOnly:true, to:'/admin' },
];
export const NAV_SECONDARY = [
  { id:'settings',     label:'Settings',     icon:'ri-equalizer-line',  to:'/settings' },   // no perm; integrations are per-user
];
```

Filter (unchanged legacy semantics, `permissions.js`):
`isAdmin(user) || user.pageAccess?.includes('all') || user.pageAccess?.includes(item.perm)`.
`pageAccess` is never validated server-side (verified: no route reads it),
so the three new keys need zero backend change. `AdminPage`'s permission
checkbox list (`ALL_PAGES`) must be extended with `marketing`, `fans`,
`operations` or admins cannot grant them.

---

## 6. Authentication / session

- JWT in `localStorage['authToken']`, user in `localStorage['userData']`
  (same keys as legacy — continuity; different origin during migration so
  no cross-app session bleed).
- Hydrate synchronously from storage → render shell optimistically → call
  `GET /v3/auth/me` → replace `user` with the canonical record. This
  endpoint was broken pre-Phase-3 and works now; using it is a deliberate
  upgrade. On 401/403 from `/me` → `logout()`.
- `api/client.js` handles 401 for EVERY request (clear session, router →
  `/login`). Legacy only checked inside `fetchData()`.
- 24h token, no refresh/revocation server-side (unchanged, out of scope).
  Expiry mid-session → next 401 logs out; that matches legacy.
- Roles: `admin | artist | viewer`. `artistAccess` is enforced server-side;
  the frontend renders API results and shows 403 as `AccessDenied`.
  `pageAccess` (string array) drives nav visibility only (§5).

---

## 7. State and data flow

| Kind | Lives in | Examples |
|---|---|---|
| Global | `AuthContext` | token, user, session status |
| Global | `AiProviderContext` | provider catalog, defaults, current selection (IDs only), availability |
| Global (static) | `BrandContext` | the active brand profile, merged copy, theme id — resolved once at boot, never mutated at runtime (§14.3) |
| Page-local | `useState` + `useApiQuery` | artist list, dashboard stats, submissions, users, integration status |
| Derived (never stored) | render-time | sorted/filtered roster, health-score color/label, tier badge variant |
| URL | router | `activeTab` → route, `selectedArtist` → `/artists/:id`, detail tab → `?tab=`, A&R sub-view → `/anr/scouting` |

Caching: none across pages (matches legacy; nothing demands it). Failures:
hooks return normalized `{status, message}`; pages render `ErrorState` with
retry; 403 renders `AccessDenied`. Downloads: `download.js` only (4 legacy
copies collapse to one). Charts/maps receive shaped props; they never fetch
— except `GeoHeatmap` may self-fetch `/v3/analytics/geography` when no
`dataset` prop is given, mirroring legacy. In 4C, `GeoHeatmap` resolves a
record's supplied `coordinates: [latitude, longitude]` first; the current region-string-only API uses
`useBrand().profile.map?.centers[region]` as its selected-label lookup.
The component owns no venue, market, region, artist, or campaign coordinates.

---

## 8. AI architecture — provider-neutral by contract

### 8.1 Principle

```
React component  →  ai/aiClient.js  →  api/endpoints.js  →  pulsegrid backend /v3/ai/*  →  backend provider router  →  Groq | OpenAI | Anthropic | Gemini | xAI | OpenRouter | …
```

Components depend on **application capabilities** (`query`, `analyze`,
`audit`, `listProviders`), never on a vendor. No provider SDK, key, or URL
exists in `web/`. Vendor names appear in the UI only as data returned by the
backend (`provider.name`), never as literals (contract §4 grep rule).

### 8.2 `ai/aiClient.js` — the frontend contract

```js
listProviders()            // GET /v3/ai/providers  (FUTURE endpoint — see 8.6)
  → { defaultProvider, defaultModel, providers:[{ id, name, status:'ready'|'unconfigured'|'error',
       models:[{ id, name, capabilities:[…], contextWindow?, tier?:'fast'|'balanced'|'strong' }] }] }
  → on 404/501 (endpoint not yet implemented): { providers:[], defaultProvider:null, defaultModel:null,
       selectable:false }        // "system default" mode — UI shows a locked chip, no selectors

query({ prompt, artistId?, forceRefresh?, provider?, model? })   // POST /v3/ai/query
  → { answer, source:'model'|'cache'|'fallback', provider?, model? }
  // provider/model are STRIPPED from the request body unless listProviders().selectable === true.
  // Today's backend zod schema is .strict(): sending them yields 400. This guard is mandatory.

analyze({ query })         // POST /v3/ai/analyze  (deterministic keyword heuristic; NOT a model)
  → { answer, source:'heuristic' }

audit(artistId, { refresh }) // GET /v3/artists/:id/entity-audit[?refresh=true]
  → the existing entity-audit payload, untouched
```

Response normalization lives here so every AI-facing component reads the
same `{answer, source, provider, model}` shape regardless of endpoint.

### 8.3 `ai/AiProviderContext.jsx`

`{ providers, defaultProvider, defaultModel, selectedProvider, selectedModel,
setSelection(providerId, modelId), selectable, status:'loading'|'ready'|'unavailable' }`.
Selection persists to `localStorage['platform.ai.selection']` as IDs only
(never anything secret; key is label-neutral — never `pulsegrid.*`). If the persisted provider is no longer
`status:'ready'`, fall back to defaults and surface a one-line notice.

### 8.4 Capability model — `ai/capabilities.js`

Vocabulary (open set; unknown strings are ignored, never fatal):
`chat` · `json` · `tools` · `vision` · `long_context` · `fast` · `low_cost`.

Each AI feature declares what it needs; `ModelSelector` greys out models
that lack them and explains why in a `.label` line:

| Feature | Required |
|---|---|
| CommandConsole query | `chat` |
| Entity audit analysis | `chat`, `json` |
| PDF report insight (server-side, shown for transparency) | `chat` |

No capability is assumed universal. A provider with zero configured models
renders as `● UNCONFIGURED` and is not selectable.

### 8.5 UI placement

- `ProviderModelChip` under every CommandConsole title: `PROVIDER GROQ · MODEL GPT-OSS-20B · ● READY` (or `SYSTEM DEFAULT · ● READY` when not selectable). Click → `/settings/ai`.
- `/settings/ai` (`AiSettingsView`): provider selector, model selector (filtered by provider then by the currently-focused feature's capabilities), status per provider, current defaults; admin-only "set as default" (future endpoint); a BYOK section that renders as `NOT AVAILABLE — server-managed credentials only` until the backend supports it (8.7). Styled per contract §3.21/§3.13 — a workstation panel, not a chatbot settings sheet.
- Graceful degradation: `unavailable` context → consoles still work against system defaults; settings page shows `// provider catalog unavailable — using system default` in mono.

### 8.6 Backend dependency (documented, NOT implemented in Phase 4A)

Inspected `src/ai/groqClient.js`, `aiService.js`, `prompts.js`,
`responseParser.js`, `src/validation/index.js`, `src/routes/ai.js`:

- `groqClient.complete({messages, model, temperature, maxTokens}) → {content, usage, model}` is already a clean, vendor-neutral provider contract in SHAPE.
- Coupling points: `aiService` imports `groqClient` directly and reads `config.groqModel` at 3 sites; `config` has only `groqApiKey`/`groqModel`; error classes/messages say "Groq"; `routes/ai.js` and `validation.aiQuery` (`.strict()`) know nothing of provider/model; there is no metadata endpoint.
- Verdict: **`aiService` is ~80% provider-neutral; the wiring is not.** Groq stays the default provider.

Target structure (a later, explicitly authorized backend phase):

```
src/ai/
  aiService.js            unchanged surface; accepts { providerId?, modelId? }; resolves via providerRouter
  providerRouter.js       registry from config; getProvider(id), getDefault(), describe() → safe metadata
  prompts.js              unchanged
  responseParser.js       unchanged
  providers/
    groqProvider.js       (rename/adapt of groqClient.js — Groq remains default)
    openaiProvider.js  anthropicProvider.js  geminiProvider.js  xaiProvider.js  openRouterProvider.js
```

Common provider contract: `{ id, name, isConfigured(), listModels() → [{id,name,capabilities}],
complete({messages, model, temperature, maxTokens}) → {content, usage, model} }`.

Config: `AI_DEFAULT_PROVIDER=groq`, `AI_DEFAULT_MODEL=openai/gpt-oss-20b`
(`GROQ_MODEL` kept as an alias), per-provider `*_API_KEY` env vars, none ever
serialized. New route `GET /v3/ai/providers` (JWT) returning only safe
metadata. `POST /v3/ai/query` schema gains OPTIONAL `provider`, `model`; the
response gains `provider` — **that is a contract change to an existing
endpoint and needs the same explicit sign-off + snapshot re-baseline
protocol Phase 3 used.** Sequencing is in `PHASE_4A_HANDOFF.md` §13.

### 8.7 Credential strategy

- **Mode A — system-managed (required first):** keys in server env; never returned; `describe()` exposes booleans only.
- **Mode B — BYOK (later, optional):** server-side submit (`POST /v3/ai/keys {provider, key}`), encrypted at rest (app-level AES-GCM with an `AI_KEYS_ENCRYPTION_KEY` env secret at minimum), never returned after storage (`GET` returns `{provider, masked:'gsk_…ALp0', createdAt}`), per-user ownership, `DELETE /v3/ai/keys/:provider` revoke, redacted logging (`src/middleware` request logger already redacts `api_key`/`token` query params; extend to bodies on these routes), provider calls remain backend-only. The current backend has no encrypted secret storage → BYOK is NOT in Phase 4B/4C scope; the frontend reserves the settings section and nothing else. Never store provider secrets in `localStorage`/`sessionStorage`.

### 8.8 Label neutrality of the AI layer (provider selection ≠ label selection)

```
AI request (prompt, artistId?)            ← frontend: CommandConsole / EntityAuditTab
  → application context                   ← frontend: page, artistId, forceRefresh
  → active label context                  ← BACKEND: activeLabel (config.label — §15.3: ai.systemContext, search.*) — never sent by the browser
  → provider-neutral aiService            ← backend
  → selected provider / model             ← backend providerRouter (Phase 4-AI)
```

- The frontend sends **no label identity** to `/v3/ai/*`: no label name, slug,
  or search prefix in prompts or bodies. `CommandConsole` and `aiClient` are
  label-blind; their copy (`COMMAND CONSOLE`, `// System ready.`) is platform
  voice, not brand.
- Label context is the backend's job, and it stays **pulsegrid-flavoured by
  default**: today it is hardcoded (`src/ai/prompts.js` L37
  `'AI analyst for pulsegrid.'`; `src/routes/integrations.js` L69 and
  `modules/entityAudit.js` L64 prefix searches with `pulsegrid`). §15
  classifies these as business-logic coupling (class C) to be
  **externalized** — the same strings move into the pulsegrid label profile
  (`activeLabel.ai.systemContext`, `activeLabel.search.searchContext`,
  `activeLabel.search.artistQueryPrefix`, §15.3) and the services read them.
  Behavior under the pulsegrid profile is unchanged; a future label supplies
  its own context instead of editing services. The frontend profile's
  `search.searchContext` (§14.2) mirrors the backend value for parity; the
  frontend does not transmit it.
- Provider/model selection (`AiProviderContext`) and brand selection
  (`BrandContext`) are independent contexts with no shared state. Switching
  the brand profile does not change the provider catalog; switching provider
  does not change branding.

---

## 9. Charts and maps

Exactly one Chart.js chart (`ForecastChart`), one custom canvas graph
(`IntelligenceGraph`), one Leaflet map (`FanHeatmap`, reused in the artist
Geography tab) exist in the legacy file, plus the terminal dashboard's bar
chart. Ports: `RevenueForecastChart`, `RevenueBarChart`, `NetworkGraph`,
`GeoHeatmap`. All colors/fonts come from `chartDefaults.js` and tokens
(contract §3.11–3.12). No vendor analytics/map SaaS.

---

## 10. Forms, validation, downloads

Controlled inputs + local state + `useApiMutation`. Client validation mirrors
only what the backend already enforces (`src/validation/index.js`: email
format, required fields). Inline `CONFIRM/CANCEL` replaces every `alert()`/
`confirm()` (contract §3.13). Downloads via `download.js`; PDF report calls
show the long-operation mono status (contract §3.17).

---

## 11. Loading / error / empty / responsive / a11y

Governed by the contract — §3.17 loading (legacy mark full-page, mono
cursor or flat skeleton inline), §3.18 errors (in-place danger panel, no
toasts), §3.19 empty (mono `// …` copy), §3.22 responsive (≥1280 primary,
1024–1279 rail, <1024 best-effort), §3.23 accessibility (labels, focus ring,
color+text pairing, reduced motion) — with the full-viewport vs in-panel
scope rule fixed in §13.6 (audit M5).

---

## 12. Legacy coexistence and migration principles

- `pulsegrid-frontend-connected.html`, `pulsegrid-terminal-dashboard.html`,
  and the two static docs HTML files stay byte-identical and servable for the
  whole of Phase 4B/4C. Retirement is a per-view, user-signed-off decision
  after the replacement passes its acceptance criteria — never implied by
  "Phase X complete".
- The terminal dashboard is **consolidated**, not ported: its KPI cards,
  revenue bars, AI terminal and PDF button become parts of `/dashboard` and
  `/intelligence`. Its AI terminal called the fake keyword route under a
  comment claiming "Grok"; the new console calls the real `/v3/ai/query`.
  Whether a distinct "Executive" role is wanted is open (handoff §20).
- Principles: backend contract is frozen input; nothing dropped silently
  (every feature has a disposition in the handoff matrix); modernizing HOW a
  view is reached is allowed, changing WHAT it does or WHICH endpoint it
  calls is not; the visual contract is a requirement, not a default;
  incremental per-feature cutover behind the Phase 4B vertical-slice gate;
  **platform code never names a label** — brand identity, theme and label
  data enter only through `web/src/brand/` and the API (§14).

---

## 13. Visual contract addendum — Phase 4A remediation (audit reconciliation)

Written against `PHASE_4A_DESIGN_AUDIT.md`. Purpose: remove aesthetic
discretion from the implementation model. Everything below is a value, a
verbatim string, a verbatim markup block, or a yes/no check. Where a rule
here conflicts with `PULSEGRID_VISUAL_DESIGN_CONTRACT.md`, THIS section
wins; §13.0 is the complete list of such conflicts. Source of truth for
every value: `pulsegrid-frontend-connected.html` (line refs given), then the
reference captures, then the contract's already-signed tightenings.

### 13.0 Precedence — rules in the contract that §13 supersedes

| Contract rule | Superseded by | Why |
|---|---|---|
| §3.1 "panels: padding `--panel-pad` (16px), max 20px" + §4 FAIL "any `.panel` with padding > 20px" | §13.3 login exception: the login card is 48px padding | audit M1; legacy L3040 |
| §4 "the legacy login radial glow L3038 is folded into `--gradient-decoration`" | §13.3 / §13.9 `--gradient-login` — a third, login-only gradient | audit M1; `--gradient-decoration` is a linear top wash, not a centered radial |
| §3.21 console title row: `ri-brain-line` + "Intelligence" 16px/600 | §13.8.1: `ri-brain-line` 18px + `COMMAND CONSOLE` as `.label--accent`; no 16px ui title | audit M7 |
| §3.3 panel title "often paired with a `.label` kicker" | §13.5.6: the `.label` kicker is MANDATORY on every panel header; the 16px ui title is optional and sits under it | audit §3 verdict; `final.jpeg` section headers |
| §3.10 StatCard "optional 12px green delta line" (font unspecified) | §13.5.4: 12px `--font-mono` `--color-accent`; Phase 4B renders none | audit N1 |
| §3.17 / §3.18 loading & error (surface unspecified) | §13.6 full-viewport vs in-panel scope | audit M5 |
| §1 tokens block = the whole of `tokens.css` | `tokens.css` = §1 block verbatim + §13.9 addendum block verbatim + §14.4 brand-layer block verbatim | new functional tokens only; brand indirection |
| §5 checklist "tokens.css matches §1 verbatim (diff is empty)" | handoff §15: the §1, §13.9 and §14.4 blocks are each byte-identical | same |
| §1 comment "components use `--color-accent`, never `--green-500` … a future alternate theme swaps ONE line" | §14.4: components use `--color-accent*`; the swap point is the brand layer (`--color-brand-primary` + 3 siblings) set by `brand/themes/<theme>.css` under `body[data-theme]` | brand replaceability |
| §3.14 button hover `--green-300`, active `--green-700`; §3.11 chart primary `--green-500`; §3.12 map points `--green-500` | `--color-accent-bright`, `--color-accent-deep`, `--color-brand-primary` (§14.4). `--green-*` names never appear in component CSS/JS | palette names are theme-internal |
| §2 `.legacy-mark` loader class in `global.css`; §3.17 "the pulsing legacy mark … is brand" | §14.6: the legacy mark is the **pulsegrid profile's** loader (`brand/profiles/pulsegrid/PulseMarkLoader.jsx` + module CSS); `LoadingScreen` renders `<BrandLoader/>`; platform fallback is `RingLoader` (same ring + pulse, no ears). Still never a spinner | brand asset, not platform primitive |
| §3.7 sidebar "legacy mark SVG logo + wordmark `pulsegrid` + sublabel `INTELLIGENCE PLATFORM`" | §14.2/§14.6: `<BrandMark/>` + `profile.displayName` + `profile.tagline`; the pulsegrid profile supplies exactly those values | brand data, not literals |
| §4 grep "color literal outside `tokens.css`, `global.css`, `chartDefaults.js`" | exception list gains `brand/themes/*.css` and `brand/profiles/*/` (theme files and brand marks must hold literal colors) | brand files are the palette source |

Nothing else in the contract is changed. Folding §13 back into the contract
file is handoff §20 Q11 (needs authorization; that file was outside the
remediation pass's write scope).

### 13.1 COPY CANON — platform voice in `web/src/copy.js`, brand strings in the profile (audit B1, M2, M7; §14)

Identity lives in these strings as much as in the palette. Two owners:

- **Platform voice** (`web/src/copy.js`): the operations-console register —
  `ACCESS ID`, `PASSPHRASE`, `INITIALIZE SESSION`, `Terminate Session`,
  `COMMAND CONSOLE`, `// System ready.` … These contain no label name and are
  shared by every profile. A profile MAY override any key via `profile.copy`
  (e.g. a softer label could set `submit: 'SIGN IN'`) — but the pulsegrid
  reference profile overrides nothing, so the gate below applies verbatim.
- **Brand-owned** (`brand/profiles/<slug>/profile.js`, §14.2): wordmark
  (`displayName`), `tagline`, `documentTitle`, `domain` (→ login placeholder),
  `slug` (→ export filenames), `legal.footer`. These are the ONLY strings
  that may name a label, and they appear nowhere else in `web/src`.

Components read `text.<key>` from `brand/index.js` (platform copy merged
with `profile.copy`) and `profile.<field>` from `useBrand()`. No component
inlines either kind, and no component invents siblings ("Sign in",
"Welcome back"). Case is exact.

```
BRAND — from the active profile (pulsegrid reference values shown)
  displayName         pulsegrid                       wordmark; rendered VERBATIM (brand owns casing: pulsegrid is lowercase, always) (L3042, L3445)
  tagline             INTELLIGENCE PLATFORM          sublabel (L3043, L3446)
  documentTitle       pulsegrid Intelligence Platform (L7; set on document.title by BrandProvider)
  domain              pulsegrid.fm                   → login placeholder `user@${domain}` (L3085)
  slug                pulsegrid                       → download filename `${slug}_report.${ext}` (L3372)
  legal.footer        null                           optional third footer line on the login card (none for pulsegrid)

PLATFORM VOICE — web/src/copy.js
LOGIN (L3034-3128)
  accessIdLabel       ACCESS ID
  passphraseLabel     PASSPHRASE                     placeholder  ••••••••
  forgotLink          Forgot Password?
  submit              INITIALIZE SESSION
  submitBusy          AUTHENTICATING...
  footerLine1         RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.
  footerLine2         Authorized personnel only.
  loginFailed         Login failed                   (fallback when the 401 body has no `error`; L3024 — server sends "Invalid credentials")
  forgot: EMAIL FOR RECOVERY · SEND RECOVERY LINK · Back to Login       (L3071-3075; 4C)
  reset:  RESET TOKEN · NEW PASSWORD · RESET PASSWORD                    (L3058-3066; 4C — route is dead, matrix row 3)

SHELL
  nav labels          Dashboard · Artists · A&R Room · Intelligence · Marketing · Fans · Operations · Admin · Settings   (nav.js, §5)
  logout              Terminate Session              (L3514)
  pageTitle           = the nav label of the current route (legacy capitalizes the tab id, L3524)
  dashboardSubtitle   Real-time label performance metrics   (L3526; label-neutral; other pages: §20 Q10)
  userChip            user.name; initials = first letter of the first two words, uppercase
  platformName        Label Intelligence Platform    (static index.html <title> fallback; never rendered in the UI)

DASHBOARD KPIs (§13.5.4)
  MONTHLY REVENUE · QUARTERLY PROJECTION · ANNUAL PROJECTION · ACTIVE ARTISTS

SYSTEM STATES
  loaderCaption       INITIALIZING NEURAL LINK...    (L3411; optional, the ONLY caption LoadingScreen may show)
  errorKicker         CONNECTION FAILURE             (L3397, uppercased per contract §3.18)
  errorRetry          RETRY CONNECTION               (L3406)
  errorNetwork        Failed to connect to Neural Link   (L3249; message when fetch throws / no body)
  errorGeneric        ERR                            (contract §3.18)
  accessDenied        ACCESS DENIED                  (contract §3.18)

COMMAND CONSOLE (4C; L3726-3796)
  title               COMMAND CONSOLE                (replaces vendor-named "Groq Intelligence" L3729; do NOT port "COMMAND CENTER" from the terminal dashboard — one name)
  idle                // System ready.  ⏎  // Waiting for input...          (L3755)
  busy                // Analyzing neural patterns...  ⏎  // Accessing database...   (L3756)
  placeholder         Enter command or query...      (L3766)
  queryFailed         ERR // AI query failed
  chip                PROVIDER {provider.name} · MODEL {model.name} · ● READY      uppercase via CSS; names are API data
  chipDefault         SYSTEM DEFAULT · ● READY

SETTINGS › AI (4C; handoff §12)
  keys                AI PROVIDER · MODEL · DEFAULTS · PROVIDER STATUS · BRING YOUR OWN KEY
  catalogUnavailable  // provider catalog unavailable — using system default
  byokUnavailable     // not available — credentials are server-managed
  statusWords         READY · UNCONFIGURED · ERROR
  setDefault          SET AS DEFAULT
```

**Forbidden strings** — a `[grep]` FAIL anywhere in `web/src` (labels,
placeholders, titles, aria-labels), case as written, word-bounded and
quoted or tag-delimited so state variables like `email`/`password` and
legacy labels like `NEW PASSWORD` do not trip it:

```
grep -rn -E "(>|['\"\`])(Email|Password|Sign [Ii]n|Sign [Oo]ut|Log [Ii]n|Log [Oo]ut|Logout|Continue|Get [Ss]tarted|Welcome[^<'\"]*|Good (morning|afternoon|evening)|Assistant|Chat|Dashboard [Oo]verview|Overview of|Coming [Ss]oon|Switch to (Day|Night))(<|['\"\`]|,)" web/src   → no results
grep -rniE "pulsegrid|lumenveil|novakin" web/src --exclude-dir=brand                                   → no results (platform code never names the label; §14.5)
grep -rniE "pulsegrid|lumenveil|novakin" web/src/brand --exclude-dir=profiles --exclude-dir=themes       → only brand/registry.js (the composition root that lists installed profiles)
grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{1F900}-\x{1F9FF}]" web/src                          → no results (audit N2: no emoji, incl. the terminal dashboard's 👥💰⚡ and final.jpeg's 🔥)
```

(The earlier `Pulsegrid|PULSEGRID` casing grep is subsumed: the string cannot
appear outside the pulsegrid profile at all, and inside it `displayName` is
the single source.)

### 13.2 Brand mark — supplied by the active profile; pulsegrid reference = `brand/profiles/pulsegrid/PulseMark.jsx` (audit B2, §14.6)

Platform components never import a specific mark. `layout/Sidebar.jsx`
renders `<BrandMark size={40}/>` and `LoadingScreen` renders
`<BrandLoader/>`; both resolve through `brand/registry.js` from
`profile.assets.mark` / `profile.assets.loader`. For the pulsegrid profile
those ids are `pulsemark`, which maps to the two marks in the legacy file:

1. **Loader** (`PulseMarkLoader.jsx` + `pulsemark.module.css`; legacy L200-227): CSS-only — 80px ring, 4px
   `--color-accent` border, two 50px ear circles at `top:-30px`,
   `left:-25px` / `right:-25px`, ear background `--color-bg` (legacy
   `var(--bg-dark)` is undefined — audit N3 — do not port the variable),
   `pulse 2s infinite`. Contract §2/§3.17 transcribe it; the CSS moves out of
   `global.css` into the profile folder (§13.0). Used ONLY via `BrandLoader`.
2. **Sidebar mark** (`PulseMark.jsx`; legacy L3429-3443): the SVG below. This is the mark every
   authenticated screen shows under the pulsegrid profile. It is a 15-line component, not an icon font
   glyph. Remixicon has no legacy mark; `ri-headphone-line`, a green circle,
   an "M", or a text logo is a FAIL **for the pulsegrid profile**. (The
   label-neutral `MonogramMark` fallback exists only for profiles that ship
   no mark — §14.6.)

```jsx
// brand/profiles/pulsegrid/PulseMark.jsx — night-mode fills only (day mode retired). No props other than size.
export function PulseMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g fill="var(--color-accent)">
        <circle cx="20" cy="30" r="22" />          {/* left ear */}
        <circle cx="80" cy="30" r="22" />          {/* right ear */}
        <circle cx="50" cy="60" r="32" />          {/* head */}
      </g>
      <ellipse cx="40" cy="55" rx="7" ry="9" fill="var(--color-text)" transform="rotate(15, 40, 55)" />
      <ellipse cx="60" cy="55" rx="7" ry="9" fill="var(--color-text)" transform="rotate(-15, 60, 55)" />
      <path d="M 30 70 Q 50 90 70 70 Q 50 82 30 70" fill="var(--color-text)" />
    </svg>
  );
}
```

Geometry is copied from the HTML exactly. Fills are normalized: legacy
night fill `#00ff00` → `var(--color-accent)` (`#00FF5F`, the single green);
legacy eyes/mouth `#fff` → `var(--color-text)` (`#F5F5F5`) so the component
contains no color literal (contract §4 grep). Size 40px in the sidebar
(L3429), 24px in the collapsed rail. It is never animated, never glowed,
never recolored per status. The wordmark next to it is text, never part of
the SVG.

### 13.3 Login — the ceremonial exception (audit M1, B1)

The login is the strongest identity surface; its words do the work. It is
exempt from the 20px panel-pad FAIL and is the only screen with a third
gradient. Everything else on it obeys the tokens.

```
viewport 1440×900                    body: --color-bg + --gradient-decoration (fixed) + --gradient-login (centered radial)

                    ┌──────────────────────── 420px ────────────────────────┐
                    │  pad 48                                                │
                    │                      pulsegrid                          │  32px / 700 / --font-ui / letter-spacing -1px / --color-text — text = profile.displayName (L3042)
                    │                INTELLIGENCE PLATFORM                   │  12px / 400 / --font-mono / --tracking-wide / --color-text-muted — text = profile.tagline (L3043 — muted here, NOT green)
                    │  ↕ 32                                                  │
                    │  [ ErrorState panel variant — only when error ]        │  danger-dim bg, danger border, 4px radius, 12px pad, 13px centered, mb 24 (L3046-3053)
                    │  ACCESS ID                                             │  .label (11px mono 700 uppercase muted), mb 8
                    │  ┌──────────────────────────────────────────────────┐  │
                    │  │ user@pulsegrid.fm                                │  │  input: 100% wide, 12px pad, 14px --font-mono, --color-input-bg, --border-panel, --radius-control; placeholder = `user@${profile.domain}` (L3081-3091; 6px → 2px)
                    │  └──────────────────────────────────────────────────┘  │
                    │  ↕ 20                                                  │
                    │  PASSPHRASE                          Forgot Password?  │  .label left · 11px --font-ui --color-accent link right (L3094-3097), mb 8
                    │  ┌──────────────────────────────────────────────────┐  │
                    │  │ ••••••••                                         │  │  type=password, same input spec (L3098-3108)
                    │  └──────────────────────────────────────────────────┘  │
                    │  ↕ 32                                                  │
                    │  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
                    │  ┃              INITIALIZE SESSION                  ┃  │  primary button, 100% wide, 48px tall, 14px/700 --font-mono --tracking-label, black on --color-accent (L3110-3120)
                    │  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │  busy: text AUTHENTICATING..., opacity .7, disabled, no spinner
                    │  ↕ 32                                                  │
                    │  ───────────────────── hairline ───────────────────    │  border-top --border-panel, pt 24
                    │  RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE   │  11px --font-mono --color-text-muted, line-height 1.6, centered (L3125-3128)
                    │  TERMINATED.                                           │
                    │  Authorized personnel only.                            │  (+ optional third line = profile.legal.footer, same style; null for pulsegrid)
                    │  pad 48                                                │
                    └────────────────────────────────────────────────────────┘
                     card: .panel geometry (4px radius, --color-panel), border --border-panel-accent (L3040 --primary-dim → accent hairline), NO shadow, NO blur
```

Rules:
- Card `max-width: var(--login-card-width)` (420px), `padding: var(--login-card-pad)` (48px), vertically and horizontally centered in the viewport (`min-height: 100vh` flex). Rendered height ≈ 520px; it never stretches.
- Page background stacks exactly three layers: `--color-bg`, `--gradient-decoration`, `--gradient-login`. No other gradient, no image, no particles, no grid pattern, no scanlines.
- No logo/mark on the login card (legacy has none — the wordmark alone is the mark here). No "remember me", no SSO buttons, no sign-up link, no language picker, no footer links, no version string.
- Inputs use the global `:focus-visible` ring. Autofill styling is overridden to keep `--color-input-bg`.
- Forgot/reset states (4C) reuse this card with the strings in §13.1; they are not separate pages.
- The login page does NOT render the sidebar, header, or `LoadingScreen`; the only busy indicator is the button text.

### 13.4 Signed deviations from the legacy HTML — do not "fix" these back (audit M6, N3, N4)

The contract intentionally tightens legacy geometry toward the identity
already visible in the reference capture `final.jpeg` (0-radius hairline
cards, all-uppercase mono labels, one green). A model spot-checking the HTML
via the line references in the handoff must NOT restore these values. When
the HTML and this table disagree, the table wins.

| Property | Legacy HTML | New value | Legacy ref |
|---|---|---|---|
| Panel radius | 16px `.glass-panel` | `--radius-panel` 4px | L129 |
| Control / input radius | 6px (login), 8px (console input/well) | `--radius-control` 2px | L3059, L3088, L3735, L3771 |
| Nav item radius | 8px | `--radius-control` 2px | L3467 |
| Roster search input radius | 20px pill | `--radius-control` 2px (pills only ≤22px badges) | L3611 |
| Login error box radius | 8px | `--radius-panel` 4px | L3049 |
| Sidebar width / padding | 260px / 32px 24px | `--sidebar-width` 224px / 24px 16px | L3417, L3423 |
| Brand block bottom margin / nav gap | 48px / 8px | 32px / 4px | L3427, L3450 |
| Main padding (page gutter) | 40px | `--page-gutter` 24px | L3520 |
| Header bottom margin | 40px | 24px | L3521 |
| Panel padding | 24px | `--panel-pad` 16px (login 48px, §13.3) | L245, L3597, L3726 |
| KPI grid gap / bottom margin | 24px / 32px | 16px / 16px | L3539 |
| StatCard label | 13px Inter, tracking 1px, uppercase | `.label` 11px mono 700 | L251 |
| Login labels / footer / button font | 12px & 11px Inter bold / 14px Inter | `--font-mono` (`.label`, 11px, 14px) | L3080, L3095, L3125, L3116 |
| Console title | 18px/600 Inter "Groq Intelligence" | `.label--accent` `COMMAND CONSOLE` | L3729 |
| Sidebar SVG fill / eyes | `#00ff00` / `#fff` | `var(--color-accent)` / `var(--color-text)` | L3430, L3439-3442 |
| Login radial | `rgba(0,255,0,0.05)` | `--gradient-login` `rgba(0,255,95,0.05)` | L3038 |
| Error reds | `#ff3333`, `#ff4444`, `rgba(255,0,0,.1/.3)` | `--color-danger` family | L3396, L3402, L3048-3049 |
| Console idle text / empty send icon | `#555` / `#444` | `--color-text-dim` / `--color-text-faint` | L3755, L3788 |
| Avatar | `ui-avatars.com` image | initials circle (contract §3.8) | L3529 |
| Theme toggle "Switch to Day/Night" | present | REMOVED (contract §1 policy) | L3489-3502 |
| `var(--glass)`, `var(--primary-glow)`, `var(--bg-dark)` | referenced, never defined (resolve to nothing) | not ported: loader bg `--color-bg`; `.text-neon` uses `--glow-accent`; blur only sidebar/modals | L111, L126, L141, L193, L218 |
| `* { outline: none }` | global | FORBIDDEN; `:focus-visible` ring | L83 |
| KPI value color | white | white (kept). `final.jpeg`'s green KPI values are NOT adopted — green is signal, not data | L254 |
| Layout model | fixed left sidebar + header | kept. `final.jpeg`'s horizontal nav and `G6lxjgsWYAA_9GA.jpeg`'s blue tags / star ratings are prototype chrome, NOT adopted | L3416 |

### 13.5 Authenticated shell + Phase 4B dashboard — drawn (audit M3, B3)

#### 13.5.1 Wireframe at 1440×900 (the slice; ±4px tolerance on every dimension)

```
x=0            224                                                                                        1440
┌──────────────┬───────────────────────────────────────────────────────────────────────────────────────────┐ y=0
│ pad 24/16    │ pad 24 (--page-gutter)                                                                     │
│ ◉ pulsegrid   │ Dashboard                                                          ┌──────────────────┐  │ 24   header 56px tall
│   INTELLIG.. │ Real-time label performance metrics                                │ (A) Admin User   │  │      h1 28/700 · subtitle 14 muted · chip
│ ↕ 32         │                                                                    └──────────────────┘  │ 80
│ ▣ Dashboard  │ ↕ 24                                                                                       │
│   Artists    │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                        │ 104  KPI row: 4 × 280px, gap 16
│   A&R Room   │ ▎MONTHLY REVE… │ ▎QUARTERLY PR… │ ▎ANNUAL PROJE… │ ▎ACTIVE ARTIS… │                        │      card 88–112px tall, align-items:start
│   Intelligen │ ▎$3.2M         │ ▎$134.8M       │ ▎$539.1M       │ ▎29            │                        │
│   Marketing  │ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                        │ ~193
│   Fans       │                                                                                            │
│   Operations │                                                                                            │
│   Admin      │                     (4B ONLY: empty — plain body background, nothing drawn)                │
│              │                                                                                            │
│              │                                                                                            │
│ ⚙ Settings   │                                                                                            │
│ ─ hairline ─ │                                                                                            │
│ ⏻ Terminate  │                                                                                            │
│   Session    │                                                                                            │
└──────────────┴───────────────────────────────────────────────────────────────────────────────────────────┘ 900
```

Admin values shown are the frozen snapshot (`tests/snapshots/baseline.json`
→ `label_overview_admin`: 3202870 / 134773080 / 539092320 / 29) formatted
by §13.5.4 — they are the expected render, not illustrations.

> Amended pre-4C (Decision 4, 2026-09-17): the admin values above are correct and are
> also what the deterministic baseline `tests/snapshots/phase2_baseline.json`
> (the file `npm test` reads) and a clean-seed server serve today. Note however that
> `tests/snapshots/baseline.json` itself is a Phase-1 capture of the pre-refactor
> monolith read by no test; the authoritative snapshot is `phase2_baseline.json`.
> For the ARTIST role the values are "as served" (Phase 3 HIGH-4): seeded artist →
> activeArtists 1 · 8464217 · 25392651 · 101570604, not zeros. The gate compares the
> rendered KPIs against the live `/v3/label/overview` body formatted with Node Intl.
> See PHASE_4C_PREREQUISITE_VALIDATION.md §6.

#### 13.5.2 Sidebar (`layout/Sidebar.jsx`; legacy L3416-3517)

| Element | Spec |
|---|---|
| Container | `position: fixed; left:0; top:0; height:100vh; width: var(--sidebar-width)`; `background: var(--color-panel)` + `background-image: var(--gradient-decoration)` (size 100% 100%); `border-right: var(--border-panel)`; `backdrop-filter: blur(20px)`; `padding: var(--space-6) var(--space-4)`; flex column; `z-index: 10` |
| Brand block | flex row, `gap: 12px`, `align-items: center`, `height: var(--brand-mark-size)` (40px), `margin-bottom: var(--space-7)` (32px). `<BrandMark size={40}/>` (pulsegrid profile → `PulseMark`) then a column: wordmark = `profile.displayName` 20px/800 `--font-ui` `--color-text` letter-spacing -0.5px (L3445); sublabel = `profile.tagline` as `.label--accent` (11px/700 `--font-mono` uppercase `--color-accent`) with `letter-spacing: var(--tracking-wide)` (L3446 is 10px — contract §3.7's 11px `.label` stands; green HERE, muted on login). Nothing else in the block: no version, no environment tag, no collapse chevron |
| Nav list | `<nav aria-label="Primary">`, `<ul>` column, `gap: var(--space-1)` (4px). Items are `<NavLink>`s: `height: var(--nav-item-height)` 40px; `padding: 0 var(--space-4)`; `gap: 12px`; `border-radius: var(--radius-control)`; icon Remixicon `ri-*-line` 18px; label 14px `--font-ui` 400. Inactive: `--color-text-muted`, transparent. Hover: `--color-text`, transparent (legacy has no hover fill — do not add one). Active (`aria-current="page"`): `--color-text` (#F5F5F5), 600, `background: var(--color-accent-dim)`. No left bar, no dot, no chevron, no counter badge, no tooltip at ≥1280. Transition `--dur-base` |
| Nav content | exactly `NAV_PRIMARY` filtered by `canSee` — nothing grouped under section headers ("MAIN", "WORKSPACE" are a FAIL), no dividers between primary items, no collapsible groups |
| Bottom group | `margin-top: auto`. Settings item (same item spec, icon `ri-equalizer-line`) → `padding-top: var(--space-4)` above a `border-top: var(--border-panel)` → `Terminate Session` row: 40px, 14px `--font-ui` `--color-text-muted`, icon `ri-logout-box-line` 18px, hover `--color-text`, no background ever, it is a `<button>` (L3504-3516). No user avatar/name in the sidebar (that is the header chip); no theme toggle; no "v3.0" |
| Rail (1024–1279) | `width: var(--sidebar-rail-width)` 56px; brand block = `<BrandMark size={24}/>` only; items icon-only, centered, `title` attribute as tooltip; active tint identical |

#### 13.5.3 Header (`layout/Header.jsx`; legacy L3521-3532)

- `height: var(--header-height)` 56px, flex, `justify-content: space-between`, `align-items: center`, `margin-bottom: var(--space-6)` (24px). Not sticky, no border, no background (legacy has none).
- Left: `<h1>` = page title (nav label) 28px/700 `--font-ui` line-height 1.2, then subtitle 14px `--font-ui` `--color-text-muted` (`/dashboard`: `Real-time label performance metrics`). No breadcrumb, no icon before the title, no `.label` kicker above it.
- Right: the user chip ONLY — `.panel` geometry, `padding: var(--space-2) var(--space-4)`, flex `gap: 8px`; 24px circle `--color-surface-1` with initials 10px/700 `--font-mono` `--color-accent`; `user.name` 14px/500 `--font-ui`. The chip is `<div>`, not a button: no dropdown, no caret, no menu. The header has no search field, no notification bell, no help icon, no date picker, no "New" button, no theme toggle.

#### 13.5.4 KPI row — the one real widget (`primitives/StatCard.jsx`; legacy L241-259, L3539-3564)

Data: `GET /v3/label/overview` → `{ monthlyRevenue, quarterlyProjection, annualProjection, activeArtists, topArtists, timestamp }` (frozen; §0.2 item 8). Exactly four cards, in this order, from these fields:

| # | Label (`.label`) | Field | Format (`utils/format.js`, locale/currency from `profile.locale` — §14.2) | Admin (snapshot) |
|---|---|---|---|---|
| 1 | `MONTHLY REVENUE` | `monthlyRevenue` | `moneyCompact`: `new Intl.NumberFormat(locale.numberLocale, { style:'currency', currency: locale.currency, notation:'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 })` → en-US/USD gives `$3.2M`, `$12.5K`, `$0` (verified Node 22 ICU; `minimumFractionDigits: 0` is required or zero renders `$0.0`) | `$3.2M` |
| 2 | `QUARTERLY PROJECTION` | `quarterlyProjection` | `moneyCompact` | `$134.8M` |
| 3 | `ANNUAL PROJECTION` | `annualProjection` | `moneyCompact` | `$539.1M` |
| 4 | `ACTIVE ARTISTS` | `activeArtists` | `integer`: `new Intl.NumberFormat(locale.numberLocale)` | `29` |

- Missing/non-numeric field → render `—` (em dash) in the value slot; never `NaN`, `undefined`, `null`, `0` -as-fallback. Zero from the server renders as `$0` / `0` (the snapshot's artist-role response is all zeros — that is the frozen backend, render it).
  > Amended pre-4C (Decision 4, 2026-09-17): the "all zeros" artist-role response is the Phase-1 monolith capture in
  > `tests/snapshots/baseline.json`, read by no test. The deterministic baseline (`tests/snapshots/phase2_baseline.json`) and a
  > clean-seed server give the seeded artist activeArtists 1 · 8464217 · 25392651 · 101570604 (Phase 3 HIGH-4). The rendering
  > rule stands: zero from the server still renders as `$0` / `0`; the values are "as served", not a constant. See
  > PHASE_4C_PREREQUISITE_VALIDATION.md §6.
- `topArtists` and `timestamp` are NOT rendered in 4B (no "top performer" mini-list, no "updated at" line).
- Sub/delta line: 12px `--font-mono` `--color-accent`, `margin-top: var(--space-1)`, rendered ONLY when derived from a served field. **Phase 4B renders none** — the legacy `+12% vs last month` / `2.4M daily average` / `Target: 5.0x` are hardcoded literals (L3543-3561) and are not ported; `N Flagship` needs `/v3/artists` (4C).
- Grid: `display:grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); align-items: start;` — `start` is mandatory so cards are content-height (88–112px), never stretched to fill.
- Card anatomy (top → bottom): `.panel` (`position: relative; overflow: hidden; padding: var(--panel-pad)`), 2px absolute left rule `--color-accent` at `opacity: .5` full height (L250) → `.label` `margin-bottom: var(--space-2)` → `.kpi` (32px/700 `--font-mono`, `tabular-nums`, `--color-text`, line-height 1.2) → optional delta. Nothing else: no icon, no icon-in-tinted-circle, no sparkline, no trend arrow, no tooltip, no "vs last period" pill, no footer link. Not interactive: no hover lift, scale, glow, or border change. Entrance animation: none in 4B (legacy `delay` prop was unused).
- Below the KPI row in Phase 4B: nothing. Plain body background to the bottom of the viewport. No dashed placeholders, skeletons, "coming soon", empty `.panel`s, sample chart, welcome text, or filler. The contract §3.4 density rule ("≥ legacy data points above the fold") is **waived for the 4B slice only**, because charts/table/console are 4C; it applies unchanged to every 4C screen.

#### 13.5.5 Slice typography — complete list (every text node on the three slice screens)

| Text node | Size / weight | Family | Color | Transform / tracking |
|---|---|---|---|---|
| Login wordmark | 32 / 700 | ui | text | letter-spacing -1px |
| Login sublabel | 12 / 400 | mono | text-muted | uppercase, tracking-wide |
| Login field labels | 11 / 700 | mono (`.label`) | text-muted | uppercase, tracking-label |
| Login inputs | 14 / 400 | mono | text (placeholder text-dim) | — |
| `Forgot Password?` | 11 / 400 | ui | accent (hover green-300) | — |
| Login button | 14 / 700 | mono | text-on-accent | uppercase, tracking-label |
| Login footer (2 lines) | 11 / 400 | mono | text-muted | line-height 1.6 |
| Login error message | 13 / 400 | ui | danger | centered |
| Sidebar wordmark | 20 / 800 | ui | text | letter-spacing -0.5px |
| Sidebar sublabel | 11 / 700 | mono (`.label--accent`) | accent | uppercase, tracking-wide |
| Nav item | 14 / 400 (active 600) | ui | text-muted (active text) | — |
| `Terminate Session` | 14 / 400 | ui | text-muted | — |
| Page H1 | 28 / 700 | ui | text | line-height 1.2 |
| Page subtitle | 14 / 400 | ui | text-muted | — |
| User chip name / initials | 14 / 500 · 10 / 700 | ui · mono | text · accent | initials uppercase |
| KPI label | 11 / 700 | mono (`.label`) | text-muted | uppercase, tracking-label |
| KPI value | 32 / 700 | mono (`.kpi`) | text | tabular-nums |
| Error kicker (full-viewport / panel) | 16 / 700 · 11 / 700 | mono | danger | uppercase, tracking-label |
| Error message | 14 / 400 | ui | text-muted | — |
| `RETRY CONNECTION` | 12 / 700 | mono | danger | uppercase |
| Loader caption (optional) | 11 / 700 | mono | text-muted | uppercase, tracking-label |

Anything not in this table does not appear on the slice. Only two families
are loaded (Inter, JetBrains Mono); a third `@font-face`/`<link>` is a FAIL.

#### 13.5.6 Panel header convention (all phases)

Every `.panel` that has a header carries a `.label` (or `.label--accent`)
kicker as its first row. A 16px/600 `--font-ui` title may sit under the
kicker only when the panel is named after an entity (artist name, modal
title); dashboard/roster/console panels use the kicker alone (`TOP
PERFORMERS`, `COMMAND CONSOLE`, `PREDICTIVE ANALYTICS`). StatCards' `.label`
IS their header. The kicker row may hold, right-aligned, at most one
compact button or one `ProvenanceBadge`.

#### 13.5.7 Whitespace and density budget (shell + dashboard)

- The largest vertical spacing token used anywhere in the shell or on
  `/dashboard` is `--space-7` (32px), and only for the sidebar brand-block
  margin. Header→content and panel→panel are `--space-6`/`--space-4`
  (24/16). `--space-8` (40px) is unused in 4B; `--login-card-pad` is the
  only 48px value in the app.
- Panels sit edge-to-edge in their grid cells; no inner `max-width`
  wrapper, no centered content column narrower than `<main>`, no
  `margin: auto` containers. Content width at 1440 = 1440 − 224 − 48 = 1168px.
- No `min-height: 100vh` / "hero" sections inside `<main>`; no vertical
  centering of dashboard content.
- Density check (4C+, per contract §3.4): at 1440×900, `/dashboard` shows
  4 KPIs + chart + map + ≥5 table rows + the console well above the fold.
  4B: the four KPIs, rows 104→~193px, then empty (waived).

#### 13.5.8 Responsive behavior for the slice

| Viewport | Sidebar | Header | KPI grid | Login |
|---|---|---|---|---|
| ≥1280 (gated) | 224px full | as drawn | 4 × 1fr | 420px card centered |
| 1024–1279 (must not break) | 56px rail (§13.5.2) | as drawn; `<main>` margin-left 56px | `repeat(2, 1fr)` | same |
| <1024 (best effort, not gated) | hidden; ghost icon button `ri-menu-line` 18px at header left toggles an overlay sidebar (backdrop `rgba(0,0,0,.9)`) | title truncates with ellipsis | 1 column | card `max-width: calc(100% - 32px)`, padding `--space-6` |

No fixed pixel widths in component CSS other than `--sidebar-width`,
`--sidebar-rail-width`, `--login-card-width`, avatar/icon sizes.

### 13.6 Loading / error / empty — surface scope (audit M5)

| Situation | Component / variant | Surface | Legacy |
|---|---|---|---|
| Initial data load of a routed page (no data yet) | `LoadingScreen` — fixed `inset:0`, `background: var(--color-bg)`, `z-index: 9999`, centered `<BrandLoader/>` (pulsegrid profile → the CSS `.legacy-mark`; fallback `RingLoader`); optional caption `INITIALIZING NEURAL LINK...` 11px `.label` 24px below the mark. Nothing else — no progress bar, no percentage, no spinner, no "Loading…" | full viewport, covers the shell | L3388-3392 |
| Initial data load FAILS (no data yet) | `ErrorState variant="fullscreen"` — same fixed container; column, centered: `ri-error-warning-line` 48px `--color-danger` → `margin 20px` → kicker `CONNECTION FAILURE` (`.label` at `--text-lg` 16px, `--color-danger`) → message 14px `--color-text-muted` (`error.message`, else `Failed to connect to Neural Link`), `margin-bottom: var(--space-6)` → `danger` variant button `RETRY CONNECTION` (default 32px size, 12px/700 mono uppercase) calling `refetch`. Sidebar/header hidden underneath, as in legacy | full viewport | L3394-3409 |
| Refetch fails while data is on screen | `ErrorState variant="panel"` (contract §3.18) placed where the failed widget's data would be; existing data elsewhere stays | in place | contract |
| Widget/secondary fetch (4C: chart, map, console, table) | `InlineLoading` (mono `// loading …█`) then `ErrorState variant="panel"` | inside that `.panel` | contract §3.17-3.18 |
| Login submit | button text `AUTHENTICATING...`, `opacity: .7`, `disabled`; failure → `ErrorState variant="panel"` inside the card above the first field | inside the card | L3046-3053, L3119 |
| 401 anywhere | `client.js` clears the session → `/login`. No error UI, no toast, no "session expired" modal | — | L3244-3247 |
| 403 on a scoped resource (4C) | `ErrorState variant="panel"` kicker `ACCESS DENIED`, no retry | in place | contract §3.18 |
| Empty result (4C) | `EmptyState` `// …` mono line, optional one `outline` button | inside the `.panel` | contract §3.19 |

`ErrorState` therefore has exactly three variants: `fullscreen`, `panel`,
`field` (12px danger text under an input). Each variant's copy comes from
`copy.js`. Nothing in the app renders a toast, snackbar, banner strip,
modal alert, or browser dialog for an error.

### 13.7 Anti-generic-SaaS rules — translated into component behavior

Prohibitions alone are not enforceable; each generic pattern below has the
pulsegrid rule that replaces it and how a reviewer checks it. A FAIL on any
row fails the page.

| Generic pattern | pulsegrid rule | Check |
|---|---|---|
| Top navigation bar / horizontal tabs as primary nav | Primary nav is the fixed left sidebar only; `<header>` contains h1 + subtitle + user chip and nothing navigable | `[judge]` header has no links; `[grep]` no `<NavLink` outside `layout/Sidebar.jsx` (Tabs in 4C are sub-navigation inside `<main>`) |
| Sidebar section headers, group labels, collapsible groups, counters, chevrons | Flat list of `NAV_PRIMARY` items; bottom group is Settings + hairline + Terminate Session | `[grep]` `nav.js` objects have exactly `id,label,icon,perm,to[,adminOnly][,subtitle]`; `[judge]` |
| Header search, bell, help, avatar dropdown, breadcrumbs, date-range picker, "Create" button | Header = h1, subtitle, non-interactive chip (+ the <1024 `ri-menu-line` toggle only) | `[grep]` `Header.jsx` contains no `<input`, `<select`, `<a `, `ri-notification`, `ri-search`; its only `<button` is the `ri-menu-line` toggle hidden at ≥1024 |
| Greeting / "Welcome back" / date banner / onboarding checklist | Page title is the nav label; subtitle from `copy.js` | `[grep]` §13.1 forbidden strings |
| KPI card with icon-in-tinted-circle, sparkline, colored delta pill, footer link, hover lift | Anatomy fixed in §13.5.4 | `[grep]` `StatCard.jsx` contains no `<i `, `<svg`, `<a `, `onClick`; `[grep]` `StatCard.module.css` has no `:hover`, `transform`, `box-shadow` |
| Cards stretched to equal height / to fill the viewport | `align-items: start`; card 88–112px | `[measure]` |
| Soft geometry: ≥8px radius, drop shadows, 24px+ padding, 2px borders | tokens `--radius-*`, no shadow at rest, `--panel-pad`, 1px hairlines | `[grep]` contract §5 radius/shadow greps; `[measure]` computed padding ≤20px (login exempt) |
| Empty regions filled with placeholders, skeleton grids, illustrations, "coming soon" | Empty = body background | `[grep]` `Coming soon`, `placeholder.svg`, `<img` on `/dashboard`; `[judge]` |
| Blue/indigo/violet accents, multi-hue chart palettes, gradient text or buttons | Green is the only signal hue; gradients are the three tokens | `[grep]` contract §4 hue grep; `[grep]` `linear-gradient\|radial-gradient` in `web/src` outside `tokens.css` → none |
| Green as decoration only (logo + one button) | Green MUST appear in every one of these roles on the slice: sidebar sublabel text, active nav tint, all four StatCard left rules, `:focus-visible` ring, login primary button, `Forgot Password?` link, PulseMark fill. Green must NOT appear as: page/panel background fill, KPI value color, body text, panel borders (except login card), heading color | `[judge]` checklist of the 7 roles; `[grep]` `.kpi` color is `--color-text` |
| Pill search inputs, rounded composer bars | All inputs `--radius-control` 2px | `[grep]` radius |
| Shimmer skeletons, circular spinners, progress bars | legacy mark / mono cursor / flat skeleton | `[grep]` `shimmer`, `spinner`, `<progress`, `animation: *spin` in `web/src` → none |
| Toasts / snackbars / alert dialogs | `ErrorState` in place (§13.6) | `[grep]` `toast`, `snackbar`, `alert(`, `confirm(` → none; `package.json` clean |
| Title-case metric labels ("Total Revenue") | `.label` uppercase mono on every KPI/panel/table header | `[grep]` every `StatCard` label passes through `.label`; `[judge]` |
| Text-only or icon-font logo | `<BrandMark/>` resolved from the profile (§14.6); pulsegrid → `PulseMark.jsx` SVG per §13.2 | `[grep]` `Sidebar.jsx` imports `BrandMark` (never a profile component directly); no `ri-headphone` in the brand block; under the pulsegrid profile the rendered SVG is the §13.2 markup |
| Label literals baked into platform code ("pulsegrid", artist names/ids, `@pulsegrid.fm`, `pulsegrid.*` storage keys) | Platform code is label-blind; brand strings come from the profile, label data from the API (§14.5) | `[grep]` §13.1 label greps → no results outside `brand/`; `[grep]` `art_[a-z0-9]+` in `web/src` → no results |
| Theme toggle / light mode / system-theme switch | none; night is the identity; the only theme mechanism is the boot-time brand profile (§14.3) | `[grep]` `Switch to`, `prefers-color-scheme` → none; `data-theme` appears only in `brand/BrandContext.jsx` and `brand/themes/*.css`, never in a component |
| Sentence-case chatty microcopy, exclamation marks, "Let's…" | All identity copy from `copy.js`; new strings need review | `[grep]` `!"` and `!'` in JSX string literals → none; `[grep]` §13.1 |
| Emoji as decoration/status/watermark | text labels only | `[grep]` §13.1 emoji ranges |
| Consumer AI: chat bubbles, avatars, typing dots, suggested-prompt chips, model picker in the composer, vendor logos, provider marketplace cards | §13.8 | §13.8 checks |

### 13.8 AI surfaces — operations-console language, not a chatbot (audit M4, M7)

Architecture (§8) is unchanged: capability-based `aiClient`, provider
metadata from the backend, credentials backend-only, `selectable:false`
guard against the `.strict()` schema. This section fixes what the surfaces
look like so 4C cannot drift into a ChatGPT/Claude clone.

#### 13.8.1 `CommandConsole` (dashboard rail, `/intelligence` full width, admin compact)

- Title row: `ri-brain-line` 18px `--color-accent` + `COMMAND CONSOLE` as `.label--accent`. Nothing else in the row except, right-aligned, the `ProviderModelChip`. No "v3.0", no traffic-light dots (terminal dashboard L237-244 — not ported), no clear/history/settings icons.
- `ProviderModelChip`: one `.label` row (11px mono muted, `text-transform: uppercase` applied by CSS to API-provided names): `PROVIDER {name} · MODEL {name} · ● READY` or `SYSTEM DEFAULT · ● READY`; the dot is `.status-dot--on/--warn/--off`. It is a `<Link to="/settings/ai">`; it is NOT a dropdown, popover, or inline picker. **Model/provider selection never happens inside the console.**
- Output well: `.panel--well`, mono 13px `--leading-console`, `--color-text-muted`, `min-height: 200px`, `padding: var(--space-4)`, scanline overlay, idle/busy lines from `copy.js` in `--color-text-dim` / `--color-accent`. The response is a single mono text block (type-write allowed), NOT a list of message rows. No user/assistant bubbles, no avatars, no timestamps per turn, no copy/thumbs buttons, no "regenerate", no markdown rendering beyond line breaks, no conversation history pane, no "new chat".
- Input row: one mono 14px input (`--color-input-bg`, `--radius-control`, `padding: 12px 16px`, `padding-right: 48px`, placeholder `Enter command or query...`) + ghost `ri-send-plane-fill` 18px (`--color-accent` when non-empty, `--color-text-faint` when empty). Enter submits. No attach, mic, slash-command menu, or suggested-prompt chips above or below it.
- Errors: `ERR // AI query failed` as a mono line inside the well (not an `ErrorState` panel, not a toast).

#### 13.8.2 `/settings/ai` (`AiSettingsView`) — one panel, a definition list, native controls

```
┌ .panel ──────────────────────────────────────────────────────────────────────────────────────┐
│ AI PROVIDER          [ Groq                        ▾ ]   ● READY                              │  row 32px
│ MODEL                [ GPT-OSS 20B                 ▾ ]   chat · json · fast                   │  row 32px
│ DEFAULTS             provider groq · model openai/gpt-oss-20b          [ SET AS DEFAULT ]     │  compact outline, disabled until backend phase
│ PROVIDER STATUS      groq ● READY                                                              │  one mono 12px line per provider, N lines
│                      openai ○ UNCONFIGURED                                                     │
│                      anthropic ○ UNCONFIGURED                                                  │
│ BRING YOUR OWN KEY   // not available — credentials are server-managed                        │  one --color-text-dim mono line
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Layout: ONE `.panel`; inside it a CSS grid `grid-template-columns: 160px 1fr; row-gap: var(--space-3); column-gap: var(--space-4)`. Keys are `.label`. Zero nested `.panel`s, zero per-provider cards, zero tabs.
- Selectors: native `<select>` styled 32px tall, mono 13px, `--color-input-bg`, `--border-panel`, `--radius-control`, chevron `ri-arrow-down-s-line` muted, `max-width: 320px`. `<option>` text = `name` from API metadata (+ ` — UNCONFIGURED` suffix and `disabled` when not selectable). No image cards, no radio-card grids, no model descriptions, no pricing, no context-window marketing, no "recommended" badges, no vendor logos or brand colors.
- Status vocabulary (text mandatory, dot secondary): `● READY` (`--color-accent`), `○ UNCONFIGURED` (`--color-text-faint`, hollow), `● ERROR` (`--color-danger`) + the backend's last error string in mono after it. One line per provider, in catalog order; the list grows with providers automatically — no per-provider code path, icon, or branch exists in the frontend.
- Capabilities render as lowercase mono words joined by ` · ` (`chat · json · fast`). A model lacking the focused feature's requirement is `disabled` in the select with the reason appended in a `.label` line under the select: `// lacks: json`.
- Defaults row: `provider {id} · model {id}` mono; `SET AS DEFAULT` is a compact (24px) `outline` button, `disabled` with `title="requires backend provider phase"` until `GET /v3/ai/providers` and the default-setting route exist; admin-only.
- BYOK row: exactly one `.label` key + one `--color-text-dim` mono line. No input, no "Add key" button, no masked-key row until the backend phase in §8.7 ships. Never a key field in the browser before that.
- `selectable === false` (today's backend): rows 1–3 collapse to a single mono line `// provider catalog unavailable — using system default`; the status row shows `system default ● READY`; BYOK row unchanged.
- FAIL `[grep]` for `components/ai/*` and `AiSettingsView.jsx`: `<img`, `<svg` (other than `PulseMark` — never used here), `avatar`, `bubble`, `message-`, `typing`, `role="log"` with per-turn children, `suggest`, `<select` inside `CommandConsole.jsx`, a `.panel` count > 1 in `AiSettingsView.jsx`, any vendor name literal (contract §4).

### 13.9 Token addendum — appended to `web/src/styles/tokens.css` after the contract §1 block, verbatim

Only tokens that carry a rule from this addendum. No decorative tokens.

```css
:root {
  /* ============ PHASE 4A ADDENDUM — FRONTEND_ARCHITECTURE.md §13.9 ============ */
  /* login ceremony (§13.3) — the ONLY screen allowed a third gradient and 48px padding */
  --gradient-login:      radial-gradient(circle at 50% 50%, rgba(0, 255, 95, 0.05) 0%, transparent 50%);
  --login-card-width:    420px;
  --login-card-pad:      48px;

  /* shell geometry (§13.5) — measurable, not adjectival */
  --brand-mark-size:     40px;    /* PulseMark in the sidebar; 24px in the rail */
  --nav-item-height:     40px;
  --kpi-height-min:      88px;    /* StatCard content height without delta; max 112px with delta; never stretched */

  /* charts / maps (contract §3.11-3.12) — chartDefaults.js reads these via getComputedStyle so canvas colors have ONE source */
  --chart-grid:          rgba(255, 255, 255, 0.05);
  --chart-series-2:      #666666;                 /* historical / secondary series */
  --chart-tooltip-bg:    rgba(0, 0, 0, 0.80);
}
```

Chart/map colors that already exist as tokens are not duplicated:
primary series `--color-brand-primary` (never `--green-500` — §14.4), projection dashed `--color-brand-primary`, ticks
`--color-text-dim`, map points `--color-brand-primary` at 0.6 opacity, well
`--color-bg-deep`. `chartDefaults.js` is the only file permitted to read
these at runtime with `getComputedStyle(document.documentElement)`; it
exports a frozen palette object and the shared options. `tokens.css` has a
third block after this one — the brand layer, §14.4 — also verbatim.

### 13.10 Multi-provider AI — architecture guarantees restated (unchanged, made explicit)

| Requirement | Where it is satisfied |
|---|---|
| Provider selection | `AiProviderContext.setSelection(providerId, modelId)`; UI only at `/settings/ai` (§13.8.2) |
| Model selection | same; filtered by provider then by the focused feature's capabilities (§8.4) |
| Provider availability/status | `providers[].status` from `GET /v3/ai/providers`; rendered as the status list (§13.8.2) and the chip dot (§13.8.1) |
| Default provider/model | `defaultProvider`/`defaultModel` from the same endpoint; `DEFAULTS` row; `SET AS DEFAULT` gated on a future admin route |
| Future providers | zero per-provider frontend code: the catalog is data; adding a provider is a backend registry entry (§8.6) |
| Backend-only credentials | no key, fragment, or base URL ever reaches the browser; BYOK section is a placeholder line until §8.7's encrypted store exists; `localStorage` holds IDs only (§8.3) |
| Same visual language as the rest of the console | §13.8 — `.label` keys, mono values, native 32px selects, status dots, one `.panel`; nothing chat-shaped |

Not implemented in Phase 4A or 4B; 4C ships the console in system-default
mode; the backend provider phase is authorized separately (handoff §13).

---

## 14. Platform vs brand separation — active label configuration, theme profiles, label data

### 14.1 Principle — four layers, one dependency direction

```
PLATFORM (code)            web/src/** except brand/        components, routing, hooks, api client, platform voice (copy.js)
        ▲ reads
BRAND CONFIGURATION (data) web/src/brand/profiles/<slug>/  one active profile: names, tagline, domain, locale, theme id, asset ids
        ▲ selects
VISUAL THEME (tokens)      web/src/brand/themes/<id>.css   overrides of the brand-layer tokens only (§14.4)
LABEL DATA (runtime)       the backend API                 artists, KPIs, users, submissions — never constants in web/
```

- The application means **Label Intelligence Platform**. It has an *active
  profile*; today that is `pulsegrid`. Nothing in `web/src` outside `brand/`
  may contain the string `pulsegrid` (any case), `legacy`, an artist name, an
  artist id (`art_*`), a label domain, or a `pulsegrid.*` storage key
  (§13.1 greps). Rebranding = add a profile folder + one theme file + one
  registry entry + static assets, then set `VITE_BRAND_PROFILE`. Zero page or
  component edits (§14.7 proves it).
- **Externalize, never remove.** Portability is achieved by moving
  label-specific intelligence *into the active profile*, not by deleting or
  diluting it. The default installation stays a fully featured pulsegrid
  project: the legacy mark, the neon-green console, the pulsegrid search
  context, the lumenveil knowledge sources, the artist handle mappings, the
  A&R benchmark artist and the AI label context all remain **active** — as
  data owned by the pulsegrid profile (frontend §14.2, backend §15.3) that
  the platform's algorithms consume. No generic substitute data is invented;
  where a pulsegrid value is useful it is preserved verbatim under the
  pulsegrid profile.

  ```
  BAD       business logic contains        `pulsegrid ${query}`
  ALSO BAD  drop "pulsegrid" from the query and degrade search quality
  TARGET    business logic consumes        `${activeLabel.search.searchContext} ${query}`
            pulsegrid profile supplies      searchContext: 'pulsegrid'
  ```
  The same rule covers benchmark artists, knowledge sources, aliases/social
  mappings, AI context, report/email branding and seed datasets.
- The pulsegrid console (contract + §13) is the **reference theme and the
  quality bar**, not the software's identity. Its geometry, density, type
  scale and voice are the *platform's* design language — every profile
  inherits them. A profile changes colors, marks, brand strings and locale.
  It may not weaken the bar: any profile must still pass contract §4/§5 and
  the §13.7 anti-generic table (a purple-blue "SaaS" theme fails the same
  hue grep a component would).
- Scope is **single-label configurability**: one deployment, one active
  profile, resolved once at boot. No tenant switching, no per-tenant data,
  no runtime profile picker in the product UI. Nothing below prevents
  multi-tenancy later (the profile is serializable data and could be served
  by the backend — §14.3 step 4), but none of it is built.

### 14.2 Active label configuration — `BrandProfile` schema (`brand/schema.js`)

Pure data, JSON-serializable (components are referenced by id, never
embedded), versioned. Required keys are marked ●; `validateProfile()` logs a
`console.error` per missing/invalid key in dev and never throws.

```js
/** @typedef {object} BrandProfile */
export default {
  schemaVersion: 1,                                   // ●
  slug: 'pulsegrid',                                   // ● [a-z0-9-]+ ; asset folder, export-filename prefix, registry key
  name: 'pulsegrid',                                   // ● full name used in prose
  displayName: 'pulsegrid',                            // ● wordmark text, rendered VERBATIM (brand owns casing)
  shortName: 'pulsegrid',                              // ● ≤12 chars: rail tooltip (4B); reserved for compact chrome
  tagline: 'INTELLIGENCE PLATFORM',                   // ● sublabel under the wordmark
  documentTitle: 'pulsegrid Intelligence Platform',    // ● document.title
  domain: 'pulsegrid.fm',                             // ● login placeholder `user@${domain}`; link targets
  website: 'https://pulsegrid.fm',                    //   null → no link rendered
  contact: { support: 'admin@pulsegrid.fm', privacy: null },        // display only; null → row hidden
  email:   { fromName: 'pulsegrid OS', fromAddress: 'notify@pulsegrid.fm' },  // DISPLAY ONLY (Settings › about, 4C).
                                                      //   The backend's EMAIL_FROM is what actually sends; the two must match by ops discipline (§15)
  locale:  { language: 'en-US', numberLocale: 'en-US', currency: 'USD', timeZone: 'America/Toronto' },   // ● format.js reads these
  theme: 'pulsegrid-console',                          // ● body[data-theme]; brand/themes/<theme>.css
  assets: {                                           // ●
    mark:    'pulsemark',                              //   registry id → Mark component; unknown/null → MonogramMark
    loader:  'pulsemark',                              //   registry id → Loader component; unknown/null → RingLoader
    favicon: '/brands/pulsegrid/favicon.svg',          //   static path under web/public
    logo:    null                                     //   optional raster/svg URL for places a component mark cannot go (PDF/email previews, 4C+)
  },
  search: { searchContext: 'pulsegrid', artistQueryPrefix: 'pulsegrid artist' },   // same keys as backend activeLabel.search (§15.3); NOT transmitted by the frontend (§8.8)
  copy: {},                                           //   overrides of platform-voice keys (§13.1); pulsegrid overrides none
  legal: { footer: null, copyright: null },           //   optional login-footer line / about-page line
  features: {}                                        //   reserved for profile-level feature flags (e.g. executiveView); unused in 4B/4C
};
```

In 4C, `BrandProfile` accepts an optional `map: { centers: { [locationKey]:
[latitude, longitude] } }` value. The pulsegrid `profile.js` imports its
unchanged legacy lookup from `./locations.js` and sets
`map: { centers: pulsegridLocations }`. The key is absent in the 4B slice;
each future profile can provide its own JSON-serializable lookup.

Every field's consumer:

| Field | Consumed by |
|---|---|
| `displayName`, `tagline` | `LoginPage` wordmark/sublabel; `Sidebar` brand block |
| `documentTitle`, `assets.favicon` | `BrandProvider` → `document.title`, `<link rel="icon">` |
| `domain` | `LoginPage` placeholder |
| `slug` | `download.js` filenames; `public/brands/<slug>/` |
| `locale.*` | `utils/format.js` (`moneyCompact`, `integer`, dates in 4C) |
| `theme` | `BrandProvider` → `document.body.dataset.theme` |
| `assets.mark`, `assets.loader` | `BrandMark`, `BrandLoader` via `registry.js` |
| `map?.centers` (4C, optional) | `GeoHeatmap` fallback for API/dataset records that contain a region or venue name but no coordinates; selected profile data, not generic map constants |
| `copy` | `brand/index.js` → `text` (merged over `copy.js`) |
| `legal.footer` | `LoginPage` optional third footer line |
| `name`, `website`, `contact`, `email`, `search`, `features`, `assets.logo` | not rendered in 4B; reserved for 4C (Settings › about, exports) and backend parity |

### 14.3 Profile resolution and `BrandProvider` (`brand/index.js`, `brand/BrandContext.jsx`)

1. **Selection:** `VITE_BRAND_PROFILE` (build-time env; when unset,
   `registry.defaultSlug`, which the registry sets to `pulsegrid`).
   In `import.meta.env.DEV` only, `localStorage['platform.brandProfile']`
   overrides it so the portability test (§14.7) needs no rebuild. Unknown
   slug → fall back to `registry.defaultSlug` and `console.error` once.
   `brand/index.js` itself never names a label. No query-string switch, no
   in-app picker.
2. **Registry:** `brand/registry.js` is the composition root and the ONLY
   platform-side file allowed to name a label: `defaultSlug: 'pulsegrid'`, a
   static profile map `{ pulsegrid: pulsegridProfile, 'example-records': exampleProfile }`,
   a marks map `{ pulsemark: { Mark: PulseMark, Loader: PulseMarkLoader } }`,
   and the side-effect imports of every `brand/themes/*.css` (scoped by
   `body[data-theme="…"]`, so co-loading is harmless). Static imports (two
   profiles; nothing to tree-shake). Adding a profile = one folder + one
   registry entry (profile line + theme import [+ marks line]).
3. **Provider:** `BrandProvider` (outermost provider in `main.jsx`) computes
   `{ profile, text, formatters }` once, sets `document.title`, swaps the
   favicon `href` and sets `document.body.dataset.theme = profile.theme`.
   It imports nothing from `profiles/` or `themes/` and contains no label
   string. `useBrand()` returns the frozen object. No re-renders after boot.
4. **Future backend-served profile (not built):** `GET /v3/label/profile`
   returning the same schema (minus nothing secret — the schema has no
   secrets) would let `BrandProvider` hydrate at runtime and make rebranding
   a backend-config change without a frontend rebuild. The schema is
   JSON-serializable and component-free for exactly this reason. Listed in
   §15.2 as step L6; not authorized.

### 14.4 Theme architecture — the brand layer in `tokens.css`

Design intent: the contract's palette (`--green-*`) is the reference theme's
private scale; components consume semantic tokens only (`--color-accent*`,
`--color-text*`, `--color-bg*`, `--border-*`, `--glow-*`, `--radius-*`,
`--space-*`, `--text-*`, `--font-*`). A brand theme overrides **four**
tokens; every derived value follows via `color-mix()`.

**Block 3 of `tokens.css` — append verbatim after the §13.9 block:**

```css
:root {
  /* ============ BRAND LAYER — FRONTEND_ARCHITECTURE.md §14.4 ============ */
  /* The theme contract. A brand theme file (brand/themes/<id>.css, scoped to body[data-theme="<id>"])
     overrides ONLY the four --color-brand-* tokens below (fonts/surfaces: see §14.4 "theme surface").
     Reference values = pulsegrid-console = the contract §1 palette. */
  --color-brand-primary:        var(--green-500);
  --color-brand-primary-bright: var(--green-300);
  --color-brand-primary-deep:   var(--green-700);
  --color-on-brand:             #000000;          /* text on a solid brand fill; literal on purpose (no cycle with --color-text-on-accent) */

  /* derived alphas — automatic for any brand primary */
  --color-brand-primary-a20:    color-mix(in srgb, var(--color-brand-primary) 20%, transparent);
  --color-brand-primary-muted:  color-mix(in srgb, var(--color-brand-primary) 10%, transparent);
  --color-brand-primary-faint:  color-mix(in srgb, var(--color-brand-primary)  5%, transparent);

  /* rebind every accent alias the contract defines onto the brand layer, so components
     (which use --color-accent*, never --green-*) follow the active theme automatically */
  --color-accent:          var(--color-brand-primary);
  --color-accent-bright:   var(--color-brand-primary-bright);   /* primary-button hover, link hover (was --green-300) */
  --color-accent-deep:     var(--color-brand-primary-deep);     /* primary-button pressed (was --green-700) */
  --color-accent-a20:      var(--color-brand-primary-a20);
  --color-accent-dim:      var(--color-brand-primary-muted);
  --color-accent-faint:    var(--color-brand-primary-faint);
  --color-text-on-accent:  var(--color-on-brand);
  --color-success:         var(--color-brand-primary);
  --border-color-accent:   color-mix(in srgb, var(--color-brand-primary) 35%, transparent);
  --glow-accent:           0 0 10px color-mix(in srgb, var(--color-brand-primary) 50%, transparent);
  --glow-accent-soft:      0 0 6px  color-mix(in srgb, var(--color-brand-primary) 35%, transparent);
  --gradient-decoration:   linear-gradient(to bottom, var(--color-brand-primary-muted), transparent);
  --gradient-scanline:     linear-gradient(to bottom, transparent, var(--color-brand-primary-muted) 50%, transparent);
  --gradient-login:        radial-gradient(circle at 50% 50%, var(--color-brand-primary-faint) 0%, transparent 50%);
}
```

Under the pulsegrid profile every rebound value is numerically identical to
the contract §1 literal (`color-mix(in srgb, #00FF5F 35%, transparent)` =
`rgba(0,255,95,.35)`; gradients ending in `transparent` interpolate in
premultiplied alpha, i.e. identically to `rgba(0,255,95,0)`), so the
reference render does not change; the handoff §15 gate's measured values
stay exactly as written.

**Theme surface** — what a `brand/themes/<id>.css` file MAY set (inside
`body[data-theme="<id>"] { … }`):

| May override | Must NOT override (platform-locked in 4B/4C) |
|---|---|
| `--color-brand-primary`, `-bright`, `-deep`, `--color-on-brand` | text tiers, status colors (`--color-warning/-danger/-info/-tier-dev`), all radii, spacing, type scale, layout constants, motion |
| surfaces `--color-bg`, `--color-bg-deep`, `--color-surface-1/2`, `--color-panel`, `--color-input-bg` — dark only: page background must stay ≤ `#141414` (contract §4) | `--font-ui` / `--font-mono` — fonts are platform-locked until font loading is profile-driven (§20 Q15) |

A theme that touches a locked token is a FAIL for that profile (grep the
theme file for any `--` name outside the allowed list). The brand primary
must not fall in the blue/indigo/violet hue band the contract forbids
(200–290°): the anti-generic rule is a platform rule, not a pulsegrid rule.

**Reference theme file** — `brand/themes/pulsegrid-console.css`:
```css
/* pulsegrid-console: the platform defaults in tokens.css ARE this theme. Intentionally empty. */
body[data-theme="pulsegrid-console"] {}
```

**Portability test theme** — `brand/themes/example-records-magenta.css`:
```css
/* example-records-magenta: PORTABILITY TEST ONLY (§14.7). Not a production design. Hue 330° — outside the forbidden 200–290° band. */
body[data-theme="example-records-magenta"] {
  --color-brand-primary:        #FF2D95;
  --color-brand-primary-bright: #FF66B3;
  --color-brand-primary-deep:   #B3005E;
  --color-on-brand:             #000000;
}
```

Browser floor for `color-mix()`: Chromium 111+, Firefox 113+, Safari 16.2+
(all 2023). Acceptable for an internal operations console; recorded as
handoff §20 Q14 with the fallback (theme files set the nine derived tokens
literally) if a lower floor is ever required.

### 14.5 Label data vs application logic

| Concern | Rule | Check |
|---|---|---|
| Artist identities (names, `art_*` ids, social handles, images) | Runtime data from `/v3/artists*`; never a constant, default, fixture, placeholder or test id in `web/src` | `grep -rnE "art_[a-z0-9]+" web/src` → none; §13.1 label greps |
| Label KPIs, roster, submissions, users | API only (`endpoints.js`) | matrix §6 |
| Seed credentials (`admin@pulsegrid.fm`, `tours@novakin.band`) | appear ONLY in the handoff gate and `web/README.md` (fixtures for the test procedure), never in `web/src` — no prefilled login, no dev shortcut button | `grep -rn "@pulsegrid.fm\|@novakin.band" web/src` → none |
| Label name in headings, titles, placeholders, filenames | `profile.*` via `useBrand()` | §13.1 greps |
| Label-specific search/entity context | backend concern; the profile mirrors it for parity, the frontend never sends it (§8.8) | `grep -rn "searchContext\|artistQueryPrefix" web/src --exclude-dir=brand` → none |
| Venue, market, region, artist, and campaign coordinates | Prefer coordinates in the supplied map dataset/API record; otherwise resolve its location key through active `profile.map?.centers`. In 4C copy the current legacy table intact to `brand/profiles/pulsegrid/locations.js` and reference it from that profile. A second label supplies its own lookup under its profile; no `components/maps/geoCenters.js` or label-specific coordinate table in generic source. | `GeoHeatmap.jsx` imports no profile folder or coordinate table; an Example Records-only location in a supplied dataset renders from its profile lookup with no edit outside `web/src/brand/`. |
| Currency / number / date formatting | `profile.locale` through `utils/format.js`; no `'$'` or `'en-US'` literal in components | `grep -rn "'\$'\|\"\$\"\|en-US" web/src --exclude-dir=brand --exclude=format.js` → none |
| Legacy label prose (`Pulsegrid is fully indexed on Wikipedia…`, L3578) | belongs to the blocked label-identity banner (matrix row 6); if ever revived it renders `profile.name` + API data | — |
| Example dashboards / reports / demo content | none in `web/`; the demo dataset lives in the backend `mock/` (reference seed — §15 class A) | — |
| Storage keys | `platform.*` and the two legacy auth keys; never `pulsegrid.*` | `grep -rn "localStorage\[" web/src` → keys in {`authToken`, `userData`, `platform.ai.selection`, `platform.brandProfile`} |

### 14.6 Marks and loaders — registry, not imports

- `BrandMark({ size })` looks up `registry.marks[profile.assets.mark]?.Mark`
  → else `defaults/MonogramMark`: a `size×size` square, `--color-accent`
  fill, `--radius-control`, the first character of `displayName` in
  `--color-on-brand`, `--font-mono` 700 at `size*0.55`. Label-neutral,
  passes every contract rule, deliberately plain — a real profile ships its
  own SVG.
- `BrandLoader()` looks up `registry.marks[profile.assets.loader]?.Loader`
  → else `defaults/RingLoader`: the contract §3.17 loader minus the ears —
  80px ring, 4px `--color-accent` border, `pulse 2s infinite`. Not a
  rotating spinner (contract §4 still holds for every profile).
- The pulsegrid profile registers `pulsemark: { Mark: PulseMark, Loader: PulseMarkLoader }`
  (§13.2). Profile components live under their profile folder and are
  imported by `registry.js` only. `Sidebar.jsx`, `LoadingScreen.jsx` and
  `LoginPage.jsx` import `BrandMark`/`BrandLoader` and nothing from
  `profiles/`.

### 14.7 Portability acceptance test (Phase 4 criterion)

> If the active brand profile is switched from `pulsegrid` to the fictional
> `example-records` profile, the login, application shell, navigation,
> headings, branding, theme tokens and the dashboard widget keep working
> **without editing any file under `web/src` outside `web/src/brand/`.**

Fixture — `brand/profiles/example-records/profile.js` (test data, not a
product; never the default):

```js
export default {
  schemaVersion: 1, slug: 'example-records', name: 'Example Records', displayName: 'Example Records',
  shortName: 'Example', tagline: 'LABEL OPERATIONS', documentTitle: 'Example Records — Label Operations',
  domain: 'example-records.test', website: null, contact: { support: 'ops@example-records.test', privacy: null },
  email: { fromName: 'Example Records', fromAddress: 'noreply@example-records.test' },
  locale: { language: 'en-GB', numberLocale: 'en-GB', currency: 'GBP', timeZone: 'Europe/London' },
  theme: 'example-records-magenta',
  assets: { mark: null, loader: null, favicon: '/brands/example-records/favicon.svg', logo: null },
  search: { searchContext: 'Example Records', artistQueryPrefix: 'Example Records artist' },
  copy: {}, legal: { footer: '© Example Records — portability test profile', copyright: null }, features: {}
};
```

Procedure and pass conditions are in the handoff §15 "PORTABILITY" block.
Expected observable differences vs the pulsegrid run, and nothing else:
wordmark `Example Records`, sublabel `LABEL OPERATIONS`, monogram `E`
instead of the legacy mark, ring loader, magenta accents (the sublabel's
computed color is `rgb(255, 45, 149)`), placeholder `user@example-records.test`,
third footer line, title `Example Records — Label Operations`, favicon path,
KPI values formatted `£3.2m` · `£134.8m` · `£539.1m` (en-GB/GBP compact —
lowercase `m` is ICU's en-GB output, verified; same backend numbers,
profile currency is a *display* setting and does not convert). Platform
voice (`ACCESS ID`, `INITIALIZE SESSION`, `RESTRICTED ACCESS…`, `Terminate
Session`, `CONNECTION FAILURE`) is unchanged. `document.body.innerText`
contains no `pulsegrid`.

The pulsegrid theme is not redesigned around this fixture; the fixture exists
to prove the seam.

At the end of 4C, also exercise `GeoHeatmap` with a dataset location absent
from the pulsegrid lookup and present only in the Example Records profile's
`map.centers`. Its marker must render without editing generic map source.
Under pulsegrid, the profile-local `locations.js` must preserve the legacy
region, city, and venue coordinates. The 4B slice has no map and needs no
location fixture.

### 14.8 What stays pulsegrid-specific — by design, inside the profile

`brand/profiles/pulsegrid/`: `profile.js` (the values in §14.2), `PulseMark.jsx`,
`PulseMarkLoader.jsx`, `pulsemark.module.css`, and in 4C `locations.js` (the
current map's region/city/venue coordinates, unchanged as label data);
`brand/themes/pulsegrid-console.css`
(empty); `public/brands/pulsegrid/favicon.svg`; the three `pulsegrid`/`pulsemark`
entries in `brand/registry.js` (default slug, profile map, marks map) and its
theme import. Plus, outside `web/`: the
backend seed dataset and the hardcodings catalogued in §15. That is the
complete list. `PULSEGRID_VISUAL_DESIGN_CONTRACT.md` keeps its name — it
documents the reference theme — but the software it describes is the
platform.

---

## 15. Backend label-coupling audit (documented, NOT refactored in Phase 4A)

Rule for every row: **externalize, do not remove.** Each pulsegrid-specific
value below is useful intelligence for the current installation and stays
active; the remediation moves it out of service code into the pulsegrid
label profile (§15.3) and makes the service read `activeLabel.*`. No row
proposes deleting a source, prefix, benchmark or mapping, and no row
invents generic replacement data. Under the pulsegrid profile every
externalized value is identical to today's literal, so behavior — and the
frozen response snapshots — do not change.

Method: `grep -rniE "pulsegrid|lumenveil|novakin|@pulsegrid.fm"` over `src/`,
`server.js`, `production-api.js`, `mock/`, `modules/`,
`integrations/`, `scripts/`, `.env.example`, `tests/`, then reading each
runtime hit. Classes: **A** demo/seed data (acceptable if isolated) ·
**B** brand configuration (move behind centralized config) · **C** business
logic coupling (behavior depends on the current label; must be externalized)
· **D** documentation/test fixture (no runtime portability impact).

### 15.1 Findings

| # | Location | What | Class | Remediation |
|---|---|---|---|---|
| 1 | `mock/artistData.js` (29 artists, `labelTotals`) | the pulsegrid reference roster + label totals | A | keep intact; relocate to `labels/pulsegrid/roster.js`, loaded via `activeLabel.datasets.roster` (L4) |
| 2 | `scripts/generate_roster.js` L10-45, L122 | roster generator with `lumenveil`/`NOVAKIN`/`STATIC BLOOM` flagship rule, `"Pulsegrid Sound"` influence | A | keep; move under `labels/pulsegrid/tools/`; the flagship list and influence strings become fields of the label dataset it generates |
| 3 | `src/models/index.js` L94-105 | seed users `admin@pulsegrid.fm`/`admin123`, `tours@novakin.band`/`novakin123` (`artistAccess:'art_novakin'`) | A (→ C via #12) | keep the same accounts; seed from `labels/pulsegrid/users.js` via `activeLabel.datasets.users`; root admin = `activeLabel.rootAdminEmail` (config already has unused `ADMIN_EMAIL`/`ADMIN_PASS` env, L76-77) |
| 4 | `src/repositories/operationsRepository.js` L45-74 | logistics/asset/contract fixtures naming NOVAKIN, lumenveil | A | keep; move to `labels/pulsegrid/operations.js` |
| 5 | `src/repositories/inMemoryStores.js` L77-83 | A&R seed demos (`soundcloud.com/pulsegrid/…`, `submittedBy: 'lumenveil'/'novakin'`) | A | keep; move to `labels/pulsegrid/anr-seeds.js` |
| 6 | `integrations/index.js` L13-27 | artist → social-handle map keyed by `art_lumenveil`, `art_novakin` **in code** (Spotify/Instagram/Ticketmaster/Twitter/TikTok identities — the label's entity aliases) | **C** | keep every mapping; move to `labels/pulsegrid/socials.js` (or a `socials` field on each artist record) and have `integrations/index.js` look up `activeLabel.datasets.socials[artistId]` |
| 7 | `src/config/index.js` L115 | `EMAIL_FROM` default `"pulsegrid OS" <notify@pulsegrid.fm>` | B | default = `activeLabel.email.from` (same string); env still overrides |
| 8 | `src/config/index.js` L82 | SQLite file `pulsegrid_v5.sqlite` | B | `activeLabel.db.sqliteFile` (same filename) / `DB_STORAGE` env |
| 9 | `src/routes/auth.js` L135, `src/services/emailService.js` L75 | email subject `pulsegrid OS - Password Reset Request` | B | `activeLabel.email.resetSubject` (same string) |
| 10 | `src/reports/monthlyReport.js` L45, L54, L446; `src/routes/reports.js` L149, L175 | PDF brand color `#00FF00`, header `pulsegrid`, footer `PULSEGRID INTELLIGENCE • CONFIDENTIAL`, `pulsegrid Intelligence Report`, `Generated by pulsegrid OS v5.0` | B | `activeLabel.reports.{accent, header, footer, title, generatedBy}` (same strings); PDF bytes unchanged under pulsegrid |
| 11 | `src/config/logger.js` L31 | `defaultMeta.service: 'pulsegrid-api'` | B | `activeLabel.logging.service` (same string) |
| 12 | `src/routes/auth.js` L161 | `DELETE /v3/auth/me` refuses to delete `user.email === 'admin@pulsegrid.fm'` | **C** | `activeLabel.rootAdminEmail` = `'admin@pulsegrid.fm'` in the pulsegrid profile; rule and response text unchanged |
| 13 | `src/ai/prompts.js` L37 | system prompt `'AI analyst for pulsegrid. Concise, data-driven insights.'` | **C** | `activeLabel.ai.systemContext` — the whole sentence is profile data (same string), so a label can enrich its AI context without touching `prompts.js` |
| 14 | `src/routes/integrations.js` L65-69 | Google KG fallback query `` `pulsegrid ${query}` `` | **C** | `` `${activeLabel.search.searchContext} ${query}` `` with `searchContext: 'pulsegrid'` — the audit's canonical example; the fallback stays |
| 15 | `modules/entityAudit.js` L63-64, L141 | artist entity-audit fallback search `` `pulsegrid artist ${artistName}` `` | **C** | `` `${activeLabel.search.artistQueryPrefix} ${artistName}` `` with `artistQueryPrefix: 'pulsegrid artist'`; the tertiary fallback stays |
| 16 | `modules/entityAudit.js` L546-661 `auditLabel()` | `labelName = 'Pulsegrid'`; Wikipedia summary URL + fallback summary/thumbnail; Fandom `lumenveil.fandom.com/wiki/Pulsegrid`; Discogs `86878-Pulsegrid-Recordings` | **C** (currently unreachable) | keep the function and every source; read `activeLabel.knowledge.{wikipedia, fandom, discogs}` (§15.3 preserves the URLs, page titles and the verbatim fallback summary). It is exported but no route calls it (`/v3/label/entity-audit` does not exist — matrix row 6); wiring a route is a separate sign-off |
| 17 | `modules/entityAudit.js` L684-732 | `lumenveil.fandom.com` used as the wiki/roster/image source for **every** artist lookup | **C** | keep the source; host + pages from `activeLabel.knowledge.fandom` (`host: 'lumenveil.fandom.com'`); a label with no fandom sets `fandom: null` and the step is skipped — pulsegrid keeps it |
| 18 | `modules/entityAudit.js` L180, L206, L228, L287, L621 | `User-Agent: PulsegridIntelligence/1.0 (admin@pulsegrid.fm)`, `pulsegrid-api/1.0`, `PulsegridBot/1.0 (bot@pulsegrid.fm)` | B | `activeLabel.http.{userAgent, apiUserAgent, botUserAgent}` (same strings) |
| 19 | `src/routes/anr.js` L171 | `/v3/anr/evaluate` report `benchmark: 'lumenveil'` | **C** | `activeLabel.anr.benchmarkArtist` = `'lumenveil'` in the pulsegrid profile — the benchmark is label intelligence, kept as data; response identical under pulsegrid |
| 20 | `src/ai/aiService.js` L133 | `/v3/ai/analyze` heuristic appends `"Novakin is second at 6.5x."` (hardcoded label-authored insight) | **C** | `activeLabel.ai.heuristics.roiRunnerUp` = that exact sentence in the pulsegrid profile; the analyzer appends `activeLabel.ai.heuristics.roiRunnerUp ?? ''`. Response identical under pulsegrid (snapshot `ai_analyze_*` unchanged). Whether 6.5x is still accurate against the roster is a **data-quality note for the profile owner**, not a code decision |
| 21 | `server.js` L62, L77-79 | boot banner `pulsegrid Production API`; seeded-account list — L79 `demo@novakin.band (demopass123)` is **not** seeded by `src/models/index.js` (stale) | B / D | banner name from `activeLabel.name`; account list derived from `activeLabel.datasets.users` so it cannot drift again (which resolves the stale L79 line either way — §20 Q19 asks whether that third account should exist) |
| 22 | `production-api.js` (filename; `server.js` L33 requires it) | the monolith is brand-named | D (B if renamed) | rename to `app.js` in a mechanical refactor with the require updated; no behavior change |
| 23 | `.env.example` L21, L31 | `pulsegrid_db`, `EMAIL_FROM` example | D | reword to `<label>_db` once L1 lands |
| 24 | `integrations/spotify.js` L36-37, L61; `integrations/ticketmaster.js` L15, L35; `src/auth/index.js` L13, L73-86; ~30 file headers "extracted from production-api.js" | comments | D | none required |
| 25 | `tests/support/cases.js` L28-29 (+ snapshots, `units.test.js` L37-59, `services.test.js`) | tests encode the pulsegrid seeds and `art_novakin`/`art_lumenveil` ids | D | re-baseline together with L4; tests should read the fixture, not literals |

Not present (verified): no label literal in `src/routes/label.js` logic
(comment only), `hasArtistAccess`/`checkExportAccess` are id-agnostic, no
label-specific CORS origins, no label-specific JWT claims.

### 15.2 Remediation sequence (a later backend phase — "Phase 4-LABEL"; needs explicit authorization; may be merged with Phase 4-AI)

Every step is an externalization with the pulsegrid values carried over
verbatim, so under the pulsegrid profile the JSON responses, PDFs and
emails are byte-for-byte what they are today. Response snapshots change
only if a step *moves fixture files* and the probe reads them differently
— re-baseline then, with the diff kept, per the Phase-3 protocol.

| Step | Change | Contract impact under pulsegrid |
|---|---|---|
| L1 | `labels/pulsegrid/label.config.js` created with the §15.3 values; `src/config/index.js` loads it as `config.label` (alias `activeLabel`) from `LABEL_SLUG` env (default `pulsegrid`), env vars overriding individual fields | none |
| L2 | Class-B sites (#7-#11, #18, #21) read `activeLabel.*` | none (identical strings) |
| L3 | Class-C sites #12-#17 read `activeLabel.rootAdminEmail`, `.ai.systemContext`, `.search.*`, `.knowledge.*` | none (identical strings; KG/model *inputs* identical) |
| L4 | Datasets relocated intact to `labels/pulsegrid/` (#1, #2, #4, #5); seeds from `activeLabel.datasets.users` (#3); social/entity aliases from `activeLabel.datasets.socials` (#6) | none if files move byte-identical; `npm run snapshot:baseline` run to prove it, diff kept |
| L5 | Class-C response-text sites #19, #20 read `activeLabel.anr.benchmarkArtist` / `activeLabel.ai.heuristics.roiRunnerUp` | none (identical values). Editing those *values* later is a profile-data change owned by the label, not a code change |
| L6 | Optional: `GET /v3/label/profile` serving the presentation subset of §15.3 (no secrets, no seeds) so the frontend can hydrate at runtime | new endpoint; additive |
| L7 | Optional: rename `production-api.js` → `app.js` (#22) | none |

Until L1-L3 land, a *different* label deployed on this backend would still
receive pulsegrid-flavoured AI answers (#13), pulsegrid-prefixed entity
searches (#14, #15), pulsegrid-branded PDFs (#10) and password-reset emails
(#9), and would inherit the `admin@pulsegrid.fm` root-admin rule (#12).
For the pulsegrid installation itself nothing is missing or degraded before
or after Phase 4-LABEL — the phase changes *where the values live*, not
what they are. The frontend architecture is label-neutral now; the
*deployment* is label-neutral only after Phase 4-LABEL.

### 15.3 Backend label profile — `labels/pulsegrid/label.config.js` (target schema; every value is today's literal, preserved)

```js
// Target for Phase 4-LABEL (L1). Selected by LABEL_SLUG (default 'pulsegrid'); exposed as config.label / activeLabel.
// Nothing here is a secret. Every string below is the literal the code uses TODAY, moved — not rewritten.
module.exports = {
  schemaVersion: 1,
  slug: 'pulsegrid', name: 'pulsegrid', displayName: 'pulsegrid', domain: 'pulsegrid.fm',
  contactEmail: 'admin@pulsegrid.fm',
  rootAdminEmail: 'admin@pulsegrid.fm',                                             // #12 undeletable root account
  email:   { from: '"pulsegrid OS" <notify@pulsegrid.fm>',                            // #7  (EMAIL_FROM env still overrides)
             resetSubject: 'pulsegrid OS - Password Reset Request' },                 // #9
  reports: { header: 'pulsegrid', title: 'pulsegrid Intelligence Report',              // #10
             footer: 'PULSEGRID INTELLIGENCE • CONFIDENTIAL', generatedBy: 'Generated by pulsegrid OS v5.0',
             accent: '#00FF00' },
  http:    { userAgent: 'PulsegridIntelligence/1.0 (admin@pulsegrid.fm)',             // #18
             apiUserAgent: 'pulsegrid-api/1.0', botUserAgent: 'PulsegridBot/1.0 (bot@pulsegrid.fm)' },
  logging: { service: 'pulsegrid-api' },                                               // #11
  db:      { sqliteFile: 'pulsegrid_v5.sqlite' },                                      // #8  (DB_STORAGE env overrides)
  search:  { searchContext: 'pulsegrid', artistQueryPrefix: 'pulsegrid artist' },       // #14, #15 — KG/query context
  knowledge: {                                                                        // #16, #17 — label knowledge sources
    wikipedia: { title: 'Pulsegrid', pageUrl: 'https://en.wikipedia.org/wiki/Pulsegrid',
                 summaryApi: 'https://en.wikipedia.org/api/rest_v1/page/summary/Pulsegrid',
                 fallbackSummary: /* verbatim string from entityAudit.js L639 */ '…',
                 fallbackThumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Pulsegrid_logo.png/220px-Pulsegrid_logo.png' },
    fandom:    { host: 'lumenveil.fandom.com', labelPage: 'Pulsegrid',
                 labelUrl: 'https://lumenveil.fandom.com/wiki/Pulsegrid', labelTitle: 'Pulsegrid (Wiki)' },   // also the per-artist wiki/roster/image source (#17)
    discogs:   { url: 'https://www.discogs.com/label/86878-Pulsegrid-Recordings' },
  },
  anr:     { benchmarkArtist: 'lumenveil' },                                           // #19 — A&R benchmark artist
  ai:      { systemContext: 'AI analyst for pulsegrid. Concise, data-driven insights.',   // #13 — AI label context
             heuristics: { roiRunnerUp: 'Novakin is second at 6.5x.' } },                // #20 — label-authored canned insight (owner to verify 6.5x)
  datasets: { roster: './roster.js',            // #1  mock/artistData.js, intact
              socials: './socials.js',          // #6  integrations/index.js L13-27 map, intact (entity aliases: Spotify/Instagram/Ticketmaster/Twitter/TikTok)
              operations: './operations.js',    // #4
              anrSeeds: './anr-seeds.js',       // #5
              users: './users.js' },            // #3  seeded accounts (hashes computed at seed time as today)
};
```

Relationship to the frontend profile (§14.2): two files, one label. The
frontend profile carries presentation (`displayName`, `tagline`, theme,
marks, locale); the backend profile carries intelligence and server
branding. Shared keys (`slug`, `name`, `displayName`, `domain`,
`search.searchContext`, `search.artistQueryPrefix` — identical key names on both sides) must agree — a
gate check in the handoff compares them — until L6 lets the frontend
hydrate from the backend and removes the duplication. Adding a label =
`labels/<slug>/` + `web/src/brand/profiles/<slug>/`; the services and
components are untouched.
