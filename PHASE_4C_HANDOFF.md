# PHASE_4C_HANDOFF.md

## 0. Status

**PHASE 4C COMPLETE. Nothing committed; the working tree is left for operator review. Phase 4D NOT started.**

- Repo: `/home/dino/mau5trap-repo`, HEAD `7efb44b` (Phase 4A/4B committed). The Pre-4C Contract Alignment work was
  found uncommitted in the tree, independently verified (§2), and carried forward untouched.
- Session: 2026-09-17. Node v22.23.2, Vite 6.4.3, Chromium 153.0.8010.12 / Playwright 1.63.0.
- Results at a glance: backend `npm test` **127 pass / 0 fail / 27 suites**; `npm run verify` **54/54**;
  frontend production build **PASS**; full live gate **70/70**; static portability gate **9/9** (+ `--self-test` 23/23);
  `npm audit --omit=dev` **2 moderate (React Router 6, unchanged and not suppressed)**;
  legacy HTML **byte-identical (md5 verified against HEAD)**.

---

## 1. What was inherited, and whether it was true

Every Pre-4C claim was re-run rather than accepted from `PHASE_4C_PREREQUISITE_VALIDATION.md`.

| Claim | Verdict | Evidence |
|---|---|---|
| Uncommitted tree IS the Pre-4C alignment work | **TRUE** | `git diff` read in full: `auth.js` parser + 2 additive fields, `permissions.js` role table removed, `AuthContext` 404 narrowing, gate made pageAccess-derived, 2 tests, 4-case additive re-baseline |
| backend 123 pass / 0 fail / 26 suites | **TRUE** | re-ran `npm test` at session start: exactly 123/0/26 |
| deterministic verification 54/54 | **TRUE** | `npm run verify` → `54 passed, 0 failed` |
| full frontend gate 66/66 | **TRUE** | `node validation/gate.mjs` → `66 pass, 0 fail` |
| static gate 9/9 | **TRUE** | `--static-only` → `9 pass, 0 fail` |
| `pageAccess` on login and `/me` | **TRUE** | live curl + the two new snapshot tests |
| hardcoded frontend role table removed | **TRUE** | `permissions.js` carries only `admin → ['all']` |
| `/me` 404 no longer destroys auth | **TRUE** | gate `F19` passes; code reads `401 \|\| 403 → logout(); return;` |
| portability gate made scope-aware | **TRUE** | `static-checks.mjs` S01-S09, and its `--self-test` proves each rule catches a synthetic leak |
| baseline verified, not blindly re-baselined | **TRUE** | the `phase2_baseline.json` diff is +14/−0, additive `pageAccess` keys only |
| React Router 7 deferred | **TRUE** | `web/package.json` unchanged at `^6.30.1`; advisories reported, not suppressed |

**Assessment: the Pre-4C pass was honest.** The one thing it got materially wrong was the severity of its own
recorded debt — see §3.

---

## 2. Evaluation of the Phase 4B reference implementation at 4C scale

The question asked was: *if this pattern is replicated across another 10-20 surfaces, does a weakness multiply?*
Four things did. Classified, not inflated.

| # | Finding | Class | Disposition |
|---|---|---|---|
| E-1 | `Header` resolved the page title with `location.pathname === item.to`. Exact equality has no match for any nested route, so `/artists/:id`, `/anr/scouting` and `/settings/ai` would all silently fall back to the FIRST nav entry and render the H1 "Dashboard". | **MAJOR** — wrong on every 4C detail/sub-route, i.e. it multiplies by construction | Fixed: `resolveNavEntry()` in `nav.js` does a segment-bounded longest match. An unmatched path now resolves to `null` and the header says 404 instead of borrowing a title. |
| E-2 | `ProtectedRoute` checked only for a token. The 4A §4 route map specifies a permission per route, and 4B had no mechanism for it — with one page that was invisible, with twelve it is a parity hole. | **MAJOR** | Added `auth/PermissionRoute.jsx`. It renders ACCESS DENIED **in place** rather than redirecting, because every redirect target is itself a guarded route and a user with an empty grant would loop. Backend authorization is untouched and remains authoritative. |
| E-3 | `useApiQuery(query)` re-runs whenever `query` changes identity, so an inline arrow passed by a careless caller is an infinite request loop. | **MINOR** (real footgun, but the hook is correct and `DashboardPage` demonstrates the right usage) | NOT changed — hardening it by ref would break legitimate re-fetching when a dependency such as `artistId` changes. Every one of the ~25 new call sites uses `useCallback`. Recorded as a convention to keep. |
| E-4 | `format.js` had only `moneyCompact` + `integer`; there was no `EmptyState`, `InlineLoading`, `Badge`, table, inline-confirm or form primitive, all of which 4A §17 requires on every page. | **NOT A DEFECT** — correct 4B scope | Extended, never paralleled (§5). |

Everything else — the API client, `endpoints.js` as the single home of `/v3/…` strings, the session model, the
brand/profile layer, the semantic tokens, the loading/error conventions, the 401/403 behaviour, the portability
gate — **held up without modification**. The token layer in particular carried twelve new surfaces and two themes
with no new colour decisions required.

One further finding, on the backend side of a frontend contract:

| E-5 | `GET /v3/analytics/projections` serves Chart.js datasets with the **default profile's accent hex baked into `borderColor`**. A chart that rendered the payload as served would make a second label's dashboard green. | **MAJOR for portability** | The frontend re-skins the served datasets from theme tokens (`charts/chartDefaults.js` `reskinDatasets`). Only colour is replaced; every label and number renders exactly as served. The backend coupling itself is Phase 4-LABEL and was **not** touched. |

---

## 3. The one BLOCKER, and why the inherited description understated it

Documented debt item 3 read: *"PUT user handling writes a raw pageAccess array to a STRING column."*
That describes silent mis-serialization. The actual behaviour is worse, and it was reproduced before being fixed.

`src/routes/users.js` registers `PUT /v3/users/:id` twice; Express binds the first, at L111. That handler:

1. assigned a raw JS array to `User.pageAccess`, a STRING column — Sequelize rejects it with
   `string violation: pageAccess cannot be an array or an object`; and
2. **had no `try/catch`**, so the rejection escaped as an unhandled promise rejection and the process-level
   handler shut the entire API down (`Received unhandledRejection, closing server`, exit 0).

**Editing any user's permissions took the whole backend offline.** Since that is precisely the Admin › Team
feature Phase 4C had to build, it was a genuine BLOCKER for that feature and nothing else.

Reproduced on a throwaway database (backed up and restored exactly as `tests/support/probe.js` does), then
re-reproduced unintentionally mid-session when a gate run drove the real UI against a server still executing the
pre-fix code — which is the strongest possible evidence the new gate box `F22` does real work.

**Fix (smallest sufficient, `src/routes/users.js` only):**

- the **reachable** `POST` (L48) now persists `pageAccess`, which the `createUser` zod schema already accepted and
  the handler then discarded — new users silently fell back to the column default `["overview"]`;
- the **reachable** `PUT` (L111) serializes through a shared `serializePageAccess()` and is wrapped in
  `try/catch`, so a bad value is now a `400` like every other write failure in the file;
- the two **shadowed** duplicate handlers were left untouched — the file header records that they are preserved
  for parity, and that is an intentional constraint, not rot.

**No response contract changed.** Echoing the stored grant back from `POST` was drafted, tripped the snapshot
case `users_create_valid_shape`, and was **reverted** rather than re-baselined: the fix is the persistence, not
the payload. `tests/snapshots/phase2_baseline.json` still shows only the Pre-4C `+14/−0`.

**Tests added** (`tests/regression/snapshot.test.js`, 4 tests in a new describe block): create persists the grant;
update round-trips **and `/health` still answers**; the edited user can still log in and `/me` agrees; a malformed
grant is a 400, never a process exit.

### The other three debt items

| # | Debt | Verified? | Blocks 4C? |
|---|---|---|---|
| 1 | ADMIN_EMAIL override JWT carries no `id` claim, so `/me` 404s for it | **Yes** — `auth.js` L74 signs `{email, role, artistAccess, integrationCount}` only | **No.** Pre-4C Decision 5 already made a `/me` 404 non-fatal. The override session survives; its `userData` simply never reconciles. Unchanged. |
| 2 | `POST /v3/users` drops `pageAccess` | **Yes** — probed: requested `["overview","marketing","fans"]`, stored `["overview"]` | **Yes**, for Admin only. Fixed above. |
| 3 | `PUT` pageAccess serialization | **Yes, and understated** | **Yes** — see above. Fixed. |
| 4 | React Router 6.30.6 advisories | **Yes** — GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg | **No.** Stayed on 6. Not suppressed, not "fixed", reported verbatim in §11. |

---

## 4. Migration inventory

Built from `PHASE_4A_HANDOFF.md` §3/§4/§5/§6, `FRONTEND_API_MAP.md`, the legacy frontend, and the live API.
"Vis" uses the 4A vocabulary: **P** primary nav · **S** secondary · **C** contextual subview · **A** admin-only ·
**U** unsurfaced · **B** blocked.

| 4A row | Feature | Legacy source | Destination | Real endpoint(s) | Auth / perm | Vis | Status |
|---|---|---|---|---|---|---|---|
| 1,2,3 | Login / forgot / reset | `LoginScreen` L2967 | `LoginPage` | `POST /v3/auth/login` | public | — | 4B. Reset still **B** (no route) — §8 |
| 4 | Authenticated shell | `App()` | `AppShell` | — | authed | — | 4B, extended (E-1, E-2) |
| 5 | Dashboard KPIs | dashboard branch | `DashboardPage` | `GET /v3/label/overview` | `overview` | P | 4B, unchanged |
| 7 | Revenue forecast + log sale | `ForecastChart` L1087 | `charts/RevenueForecastChart` | `GET /v3/analytics/projections`, `POST /v3/analytics/sales` | `overview` | P | **NEW** |
| 8 | Global heatmap | `FanHeatmap` L934 | `components/maps/GeoHeatmap` | `GET /v3/analytics/geography` | `overview` | P | **NEW** — coordinates externalized (§7) |
| 9,10 | Roster table + search/sort | L3596 + `ArtistRow` L261 | `ArtistsPage` | `GET /v3/artists` | `roster` (server-filtered) | P | **NEW** |
| 11,12 | Sign / archive / restore | `ArtistManager` L630 | `ArtistsPage` | `POST /v3/artists`, `…/archive`, `…/restore` | admin (server 403) | A | **NEW** |
| 13 | Artist detail, 9 tabs, prev/next | `ArtistDetailView` L2007 | `ArtistDetailPage?tab=` | `GET /v3/artists/:id`, `GET /v3/integrations/google-kg` | `roster`; 403 → ACCESS DENIED | C | **NEW** |
| 14 | Image override | detail overview | `OverviewTab` | `PUT /v3/artists/:id/image` | admin | A | **NEW** |
| 15 | Entity audit + paid refresh | `EntityAuditTab` L1648 | `EntityAuditTab` | `GET /v3/artists/:id/entity-audit[?refresh]` | `roster` | C | **NEW** — refresh behind two-step confirm |
| 17 | A&R demos: list/submit/vote/tally | `AnRView` L2506 | `AnrRoomView` | `GET /v3/anr/state`, `POST /v3/anr/submissions`, `POST /v3/anr/vote/:demoId`, `GET /v3/anr/demos/:id/rating` | `anr_room` | P | **NEW** |
| 18,19,20 | Scout / shortlist / inbox | `AnRMasterView` L2914 | `AnrScoutingView` | `GET /v3/anr/scout`, `POST /v3/anr/shortlist`, `GET /v3/anr/submissions` | `anr_room` | C | **NEW** — inbox reworked (§8) |
| 21,22 | AI console + `archive/restore/sign` | console L3726 + `handleAI` L3268 | `components/ai/CommandConsole` | `POST /v3/ai/query` (+ artist routes for commands) | `ai_lab` / page perm | P | **NEW** |
| 23 | Network graph | `IntelligenceGraph` L331 | `charts/NetworkGraph` | roster payload | `ai_lab` | P | **NEW** |
| 24 | Campaign wizard + CRM stats | `CampaignsView` L1341 | `MarketingPage` | `GET /v3/campaigns/stats`, `POST /v3/marketing/campaigns` | `marketing` (**new perm**) | P | **NEW** — `PROTOTYPE` badge |
| 25 | Fan demographics / top movers | `FanEngagementView` L1211 | `FansPage` | `GET /v3/fans/demographics` | `fans` (**new perm**) | P | **NEW** — `SOURCE: MOCK`; `zoomImage` crash deleted |
| 26 | Operations tables | `OperationsView` L2601 | `OperationsPage` | `GET /v3/operations/{logistics,assets,contracts}` | `operations` (**new perm**); contracts admin/manager | P | **NEW** — `SOURCE: FIXTURE`; contracts 403 inline |
| 27 | Integrations connect/disconnect | `IntegrationsPanel` L1528 | `SettingsPage/IntegrationsView` | `GET /v3/integrations/status`, `…/auth/:service`, `POST …/disconnect` | authed | S | **NEW** — dead `fetchSubmissions` not ported |
| 28 | AI provider/model settings | none | `SettingsPage/AiSettingsView` | `GET /v3/ai/providers` (absent → system default) | authed | S | **NEW** |
| 29,30 | Team management + admin console | `AdminView` L720 | `AdminPage` | `GET/POST/PUT/DELETE /v3/users` | role admin | A | **NEW** — required the §3 backend fix |
| 31 | Exports CSV/PDF | `downloadReport` | `components/reports/ExportControls` + `api/download.js` | `GET /v3/exports` | server `checkExportAccess` | P | **NEW** — Dashboard + Admin |
| 36,37 | Logout, loading/error/empty | — | primitives | — | — | — | 4B, extended |
| 16, 32, 33, 34 | monthly-sales, per-artist PDF, royalties, rights | none | — | exist, unconsumed | — | **U** | **Deliberately not built** (4A §20 Q2 unanswered) |
| 6 | Label identity banner | dashboard branch | — | `GET /v3/label/entity-audit` **does not exist** | — | **B** | Not built. Legacy skips the banner on non-OK; the exact skip is preserved by rendering nothing. No route invented. |
| 35 | Day/red theme | `isDayMode` | — | — | — | **B** | Retired, per 4A §20 Q1 |
| 39,40 | `TOTAL STREAMS`, `AVG ROI` KPIs | L3546/L3558 | — | fields the endpoint never serves | — | **B** | Not built; they render `NaNM` / `undefinedx` in legacy |
| 41 | `TOTAL REVENUE` → `MONTHLY REVENUE` | L3540 | `DashboardPage` card 1 | `GET /v3/label/overview` | — | P | 4B relabel stands |
| 38 | Terminal dashboard | whole file | consolidated into 5 / 21 / 31 | — | — | — | Consolidated; file untouched. `RevenueBarChart` not built (§8) |

### Routes added (12 new paths)

`/artists` · `/artists/:artistId` · `/anr` · `/anr/scouting` · `/intelligence` · `/marketing` · `/fans` ·
`/operations` · `/settings` (→ `/settings/integrations`) · `/settings/integrations` · `/settings/ai` · `/admin`,
plus `*` → `NotFoundPage` replacing the 4B redirect-to-dashboard.

### Orphaned legacy views — what was and was not surfaced

All five 4A-classified orphans are now reachable, each at the visibility 4A specified — **not** by adding
everything to the primary nav:

- `settings`/`IntegrationsPanel` → **secondary** nav, every authenticated user.
- `fans`, `campaigns`, `operations` → **primary** nav behind the three NEW permissions, which no seeded
  non-admin account holds. Admins see them because admins bypass `pageAccess`; everyone else sees them only when
  an admin grants the key in Admin › Team. Exposure stays a runtime product decision.
- `scouting`/`AnRMasterView` → **contextual sub-tab** under the existing `anr_room` permission, not a ninth nav
  entry.

---

## 5. Architecture: extended, never paralleled

No second API client, session store, router, token set or formatting layer was created. New shared code:

- **Extended:** `api/endpoints.js` (+38 functions, still the only file containing `/v3/…`), `utils/format.js`
  (+`money`, `compact`, `percent`, `signedPercent`, `multiplier`, `date`, `dateTime`, `text`), `copy.js`
  (+~150 platform-voice strings), `layout/nav.js` (+`resolveNavEntry`), `router.jsx`, `Header.jsx`.
- **New, following existing conventions:** `auth/PermissionRoute.jsx`; `api/download.js`; primitives
  `EmptyState`, `InlineLoading`, `Badge`/`ProvenanceBadge`, `DataTable`, `ConfirmAction`, `Field`/`TextInput`/
  `SelectInput`/`CheckGroup`, `Section`, `SubNav`; `charts/chartDefaults.js`, `RevenueForecastChart`,
  `NetworkGraph`; `components/maps/GeoHeatmap`; `components/ai/{CommandConsole,ProviderModelChip}`;
  `ai/{aiClient,useAiProviders}`; `components/reports/ExportControls`; `utils/artist.js`.
- **Dependencies added:** `leaflet@1.9.4`, `chart.js@4.5.1`, `react-chartjs-2@5.3.0`. No state manager, CSS
  framework, toast library or provider SDK. `npm audit` gained nothing (§11).

### `alert()` / `confirm()` / dead-code sweep (4A §17)

`web/src` contains no `alert(`, `confirm(`, `window.location.reload()`, `window.dashboardArtists`,
`ui-avatars.com`, `zoomImage`, `fetchSubmissions` or dead `handleVote`. Destructive actions use the two-step
`ConfirmAction` primitive instead.

---

## 6. Auth and pageAccess result

- **Backend remains authoritative.** `pageAccess` is never consulted by `src/auth/index.js` or any route guard;
  nothing in this phase changed that.
- The frontend carries **no role→permission table**. `PermissionRoute` and `Sidebar` share the one `canSee()`
  rule, fed by the array the backend serves.
- Verified live as the seeded artist (`pageAccess ["overview","roster"]`): nav shows exactly Dashboard + Artists;
  `/artists` renders one server-filtered row; direct navigation to `/marketing`, `/fans`, `/operations`,
  `/admin`, `/anr`, `/intelligence` renders ACCESS DENIED in place, on the requested path, with no redirect loop.
  Pinned as gate box **F21**.
- Admin grant round-trip verified through the real UI and pinned as gate box **F22**, including a `/health`
  assertion after the write — the box that would have caught the §3 blocker.
- 401/403 behaviour unchanged from 4B; `/me` 404 still non-fatal (F19).

---

## 7. Brand portability result

**The map rule is satisfied, and `BRAND_PORTABILITY_AUDIT` W04 is closed.**

- The legacy 44-entry region/city/venue coordinate table was **moved verbatim**, not deleted, to
  `web/src/brand/profiles/mau5trap/locations.js`, and is referenced through `profile.map.centers`. The venue
  rows — the rooms this label's audience is measured in — travel with the profile.
- `components/maps/GeoHeatmap.jsx` contains **no coordinate of its own**. It resolves a point from, in order:
  coordinates on the dataset row, then the ACTIVE profile's `centers`. Rows resolving to neither are counted and
  surfaced as `UNMAPPED LOCATIONS: n` — never silently dropped.
- Marker colour is read from the computed `--color-accent` token, and the basemap URL is overridable via
  `profile.map.tileUrl` or `VITE_MAP_TILE_URL` (§8 records the provider watermark).
- Chart series colours are re-skinned from tokens so the backend's baked-in accent hex cannot leak a hue (E-5).

### Example Records result — PASS

With `VITE_BRAND_PROFILE=example-records` (dev override) and **zero edits to any file outside
`web/src/brand/`**: magenta accent throughout nav, chart projection, console chip and KPI rules; `£3.2m /
£134.8m / £539.1m` en-GB compact from the same numeric API response; monogram "E" in place of the mau5-head;
document title and favicon from the profile.

The map acceptance test (gate box **P11**): the dashboard map plots **1** marker — `Example Arena, Leeds`, a
location that exists only in the Example Records profile — and reports **42** unmapped locations, because the
mau5trap venue names the live API returns are not resolvable by that profile's lookup. That asymmetry is the
proof: the coordinates cannot be coming from generic source.

`P07` confirms no "mau5trap" text, no `mau5*` class and no green element anywhere in the Example Records render;
`P10` confirms the default profile returns intact.

**Scope honesty:** this is frontend presentation portability. The backend is still mau5trap-flavoured — AI label
context, `mau5trap ${query}` Google-KG prefix (`src/routes/integrations.js` L68), PDF titles, reset emails, A&R
benchmarks. That is Phase 4-LABEL and was deliberately not touched. Do **not** claim end-to-end second-label
deployment readiness.

**Specialization preserved:** under the default profile nothing mau5trap-specific was removed or diluted — the
mau5-head, neon console, wordmark, tagline, venue table, search context and backend intelligence all remain
active. Every portability move in this phase was an externalization.

---

## 8. Parity gaps and deliberate behaviour changes

Recorded, not hidden.

| Item | Kind | Detail |
|---|---|---|
| A&R "Demo Inbox" fabricated counters | **Deliberate change (4A row 20)** | Legacy `InboxPanel` rendered three hardcoded demos and invented "142 / 842 / 92%" statistics. Replaced by the real shortlist (store #1, `status === 'shortlisted'`) or an EmptyState. |
| Split-brain A&R | **Deliberately preserved** | The Room reads store #2 (`ratings[]`) and Scouting reads store #1 (scalar `votes`). They are never reconciled client-side. Submitting a demo writes store #1, which the UI states on the form. |
| Reset password | **Blocked, unchanged** | `POST /v3/auth/reset-password` does not exist. `Forgot Password?` remains present and disabled as in 4B. The legacy token step was **not** ported — a gap against 4A row 3, which asked for the UI to be ported so it fails as today. Deferred deliberately rather than shipping a control whose only outcome is a 404. |
| Label identity banner | **Blocked, graceful** | `GET /v3/label/entity-audit` does not exist; legacy skips the banner on non-OK, so nothing is rendered. No route invented. |
| `RevenueBarChart` | **Gap** | The terminal dashboard's bar chart was not built; its KPI, AI-terminal and PDF roles are consolidated into the line forecast, console and exports. |
| `UniversalPlayer` | **Gap** | Demo/track URLs render as links rather than an embedded player. |
| Roster revenue column | **Correctness fix** | `GET /v3/artists` serves a `revenue` OBJECT and no `totalRevenue`; the legacy roster read `artist.totalRevenue` and rendered `$NaNk` on every row. `utils/artist.js` mirrors the server's own `calculateTotalRevenue` so the roster agrees with `/v3/artists/:id` and `label/overview.topArtists`. |
| Header sub-line on every page | **Documented default** | 4A §20 Q10 is still unanswered and states 4C defaults to legacy behaviour, which repeats the same sub-line under every title. Implemented as specified; still a product question. |
| Basemap watermark | **External dependency** | The legacy tile provider now watermarks unkeyed tiles "API KEY REQUIRED". Markers and data are unaffected. A keyed URL can be supplied via `profile.map.tileUrl` or `VITE_MAP_TILE_URL` with no code change. |
| `npm run verify` is not idempotent | **Pre-existing, not a 4C regression** | It creates a `Verify Artist <ts>` row per run (`verify_phase2.js` L123) and never removes it, so its `total === 29` assertion fails on any second run against a persistent DB. A clean single run passes 54/54. Its artifacts were removed from `mau5trap_v5.sqlite`, which is back to 29 artists. |

---

## 9. Architectural deviations from the Phase 4A plan

1. **Plain `leaflet` instead of `react-leaflet`** (4A §5 named the latter). `react-leaflet` wraps the same
   library; the legacy implementation is an imperative `L.map` in an effect that ports directly, and this avoids
   a second dependency. Behaviour, tile source and marker maths are the legacy ones. Recorded, reversible.
2. **`PermissionRoute` renders ACCESS DENIED rather than redirecting.** A redirect target is itself a guarded
   route, so redirecting loops for a user whose grant is empty — which `permissions.js` documents as the state
   between login and `/me` reconciliation. Rendering in place is loop-free and more honest.
3. **Two gate boxes were rewritten for 4C scope** (§10). Both are scope changes driven by the 4A route map, not
   relaxations, and both are marked `AMENDED FOR PHASE 4C` in `gate.mjs` with the reason.

---

## 10. Validation

All commands run from a clean process against the live backend and Vite dev server.

| Check | Result |
|---|---|
| `npm test` (backend) | **127 pass / 0 fail / 27 suites** (was 123/26; +4 pageAccess write tests in a new describe) |
| `npm run verify` (deterministic) | **54 passed, 0 failed** (single run, clean DB) |
| `npm run build` (frontend prod) | **PASS**, 111→~160 modules, `dist/` in ~3s |
| `node validation/gate.mjs` (full live) | **70 pass, 0 fail, 70 checks** (was 66) |
| `node validation/gate.mjs --static-only` | **9 pass, 0 fail** |
| `node validation/static-checks.mjs --self-test` | **23 pass, 0 fail** (9 rules × real tree + 14 synthetic leaks) |
| `npm audit --omit=dev --audit-level=moderate` | **2 moderate**, both React Router 6 (§11) |
| Legacy HTML integrity | `md5sum` of `mau5trap-frontend-connected.html` **matches `git show HEAD:`**; `git diff` empty for both legacy files |
| Snapshot baseline | `phase2_baseline.json` diff still **+14 / −0** (Pre-4C only); **not** re-baselined for 4C |

### Gate boxes added or amended for 4C

| Box | Change | Reason |
|---|---|---|
| `F15` | **Amended** | 4B asserted every route redirected because none were built. Now asserts all 8 primary targets plus Settings resolve to their own paths and render. |
| `V16` | **Amended** | 4B asserted the dashboard was a KPI row over an empty canvas. 4C specifies what fills it (rows 7, 8, 21, 31), so the box now asserts the KPI row is first and everything below is one of those surfaces — still failing on filler. |
| `F20` | **New** | Unknown path renders the 404 page in place (4A §4 replaces the 4B redirect). |
| `F21` | **New** | Artist role: ungranted routes render ACCESS DENIED in place; granted routes still render. |
| `F22` | **New** | Admin pageAccess round-trips through create + edit **and the API is still alive afterwards** — the §3 blocker box. |
| `P11` | **New** | Map portability: profile-only location plots, default-profile venues do not resolve. |
| C02 classifier | **Extended** | A 404 on `/v3/ai/providers` is named as a documented-absent route (4A §12 specifies probing it and degrading). Named by URL, not by loosening the rule. |

Two genuine defects were found by these boxes and fixed rather than whitelisted: Leaflet requesting
out-of-range tiles at the world edge (HTTP 400 × 4 per map view — fixed with an explicit `bounds`), and
`RETRY CONNECTION` refetching only the KPI query while the chart, map and console rail kept stale errors
(fixed with a page-level `retryAll`).

### Visual assessment against the design contract

Captured at 1440×900: `web/validation/phase4c-{dashboard,artists,artist-detail,anr,anr-scouting,intelligence,
marketing,fans,operations,settings,admin}.png` and `phase4c-example-{dashboard,artists}.png`.
**Operational note:** `gate.mjs` writes its five `phase4b-*.png` captures on every run (`SCREENSHOT_DIR`
defaults to `web/validation`), so a gate run always dirties those committed files. They were restored with
`git checkout -- web/validation/phase4b-*.png` after the final run, so 4B's evidence is not rewritten. Set
`SCREENSHOT_DIR` to a scratch path, or restore them afterwards, when running the gate in future.

Reads as a technical label-intelligence console, not generic SaaS: `#0A0A0A` environment; neon green used
structurally (active nav, KPI rules, console prompt, status dots, chart projection) and not decoratively;
mono for every number and label; 2/4px radii with pills only on ≤18px badges; dense 10px table rows; no panel
shadows; high contrast; data-first. No drift toward rounded cards, excess whitespace, soft consumer UI, or
unrelated purple/blue — the restricted cyan/violet tokens appear only in the `NetworkGraph` legend, which is the
one place `tokens.css` permits them.

Two issues the visual pass caught and fixed: the roster's view action read `OVERVIEW` where legacy said `VIEW`,
and the basemap watermark (now configurable).

---

## 11. `npm audit` — actual result, not a claim

```
react-router  6.0.0 - 7.17.0   Severity: moderate
  GHSA-wrjc-x8rr-h8h6  Open redirect via backslash in <Link>/useNavigate
  GHSA-337j-9hxr-rhxg  Arbitrary constructor injection via deserializeErrors() in SSR hydration
2 moderate severity vulnerabilities
fix available via `npm audit fix --force` → react-router-dom@7.18.4 (breaking)
```

Unchanged from the Pre-4C report and **not suppressed**. React Router stayed on 6 per instruction. The three
dependencies added in this phase introduced no new advisory. This app is client-rendered with static nav targets,
which is the mitigating context for both advisories — it is not a claim that the tree is clean. **The dependency
tree is not clean.**

---

## 12. Known debt carried forward

1. **ADMIN_EMAIL override JWT has no `id` claim** — `/me`, GDPR delete and change-password 404 for it. Non-fatal
   since Decision 5. Unfixed by design.
2. **Two shadowed duplicate handlers each** for `POST /v3/users`, `PUT` and `DELETE /v3/users/:id` — preserved
   for parity. The reachable `DELETE` (L130) also lacks the self-delete guard its shadowed twin has; the UI does
   not offer self-deletion, and the server stays authoritative. **MINOR**, untouched.
3. **Backend label coupling** — AI label context, `mau5trap ${query}` KG prefix, PDF/report titles, reset-email
   identity, A&R benchmarks, and the accent hex in `analytics/projections` datasets. All Phase 4-LABEL.
4. **React Router 6 advisories** (§11).
5. **`useApiQuery` memoization discipline** (E-3) — every call site uses `useCallback`; a future contributor who
   forgets gets an infinite request loop.
6. **`npm run verify` non-idempotence** (§8).
7. **Unsurfaced endpoints** — monthly-sales, per-artist monthly PDF, royalty calculator, rights/contracts
   (4A §20 Q2 still unanswered).
8. **Bundle size** — the production JS chunk is ~617 kB (~200 kB gzipped) and Vite warns above 500 kB. No code
   splitting was introduced. **MINOR**, a good first Phase 4D task.

---

## 13. Phase 4D recommendation

**Phase 4D is safe to review.** The reference architecture carried twelve surfaces without a structural rewrite,
the one blocker is fixed with tests, and every gate is green.

Recommended order:

1. **Answer the open 4A product questions** that 4C had to default: Q10 (header sub-line), Q2 (the four
   unsurfaced endpoints), Q9 (`AVG ROI` / `TOTAL STREAMS`), Q12 (KPI value colour). These are decisions, not work.
2. **Phase 4-LABEL** (backend externalization) — the single largest remaining portability item, and the only way
   the Example Records profile becomes a real deployment rather than a presentation test.
3. **Phase 4-AI** (provider router + `GET /v3/ai/providers`) — the frontend already flips to `selectable: true`
   with no rewrite the moment that route exists.
4. **Code splitting** for the 617 kB chunk, and a React Router 7 evaluation as its own bounded change.
5. Only after the legacy replacements have passed their own acceptance gate should
   `mau5trap-frontend-connected.html` be retired. It is untouched and remains the parity reference.

---

## 14. Repository state

Nothing committed. `git status --short` shows the Pre-4C files carried forward, this phase's modifications, and
the new `web/src` surfaces. `mau5trap-frontend-connected.html` and `mau5trap-terminal-dashboard.html` are
byte-identical to HEAD. `mau5trap_v5.sqlite` (gitignored) was left with its original 29 artists and 2 seeded
users after test artifacts were removed. No Phase 4D work was started.
