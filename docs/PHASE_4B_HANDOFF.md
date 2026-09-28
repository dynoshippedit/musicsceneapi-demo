# Phase 4B handoff — frontend reference slice

**Status:** Complete for the Phase 4B slice. Phase 4C has not started. The legacy HTML and backend are unchanged; the full application is **not** ready for a different label's backend deployment.

## Scope and repository changes

The work started from commit `3a95375` with six untracked Phase 4A/audit documents and no tracked diff. This phase created `web/` (66 files) and this handoff. It modified **no existing file**. `REFACTOR_PROGRESS.md`, all Phase 4A documents, backend contracts and sources, and `pulsegrid-frontend-connected.html` remain untouched. No commit was made.

Every file created under `web/` is listed here:

```text
web/.env.development
web/.env.example
web/.env.production
web/README.md
web/index.html
web/package-lock.json
web/package.json
web/public/brands/example-records/favicon.svg
web/public/brands/pulsegrid/favicon.svg
web/src/App.jsx
web/src/api/client.js
web/src/api/endpoints.js
web/src/auth/AuthContext.jsx
web/src/auth/ProtectedRoute.jsx
web/src/auth/permissions.js
web/src/auth/useAuth.js
web/src/brand/BrandContext.jsx
web/src/brand/BrandLoader.jsx
web/src/brand/BrandMark.jsx
web/src/brand/defaults/MonogramMark.jsx
web/src/brand/defaults/RingLoader.jsx
web/src/brand/defaults/defaults.module.css
web/src/brand/index.js
web/src/brand/profiles/example-records/profile.js
web/src/brand/profiles/pulsegrid/PulseMark.jsx
web/src/brand/profiles/pulsegrid/PulseMarkLoader.jsx
web/src/brand/profiles/pulsegrid/pulsemark.module.css
web/src/brand/profiles/pulsegrid/profile.js
web/src/brand/registry.js
web/src/brand/schema.js
web/src/brand/themes/example-records-magenta.css
web/src/brand/themes/pulsegrid-console.css
web/src/components/primitives/Button.jsx
web/src/components/primitives/Button.module.css
web/src/components/primitives/ErrorState.jsx
web/src/components/primitives/ErrorState.module.css
web/src/components/primitives/LoadingScreen.jsx
web/src/components/primitives/LoadingScreen.module.css
web/src/components/primitives/Panel.jsx
web/src/components/primitives/StatCard.jsx
web/src/components/primitives/StatCard.module.css
web/src/copy.js
web/src/hooks/useApiMutation.js
web/src/hooks/useApiQuery.js
web/src/layout/AppShell.jsx
web/src/layout/AppShell.module.css
web/src/layout/Header.jsx
web/src/layout/Header.module.css
web/src/layout/Sidebar.jsx
web/src/layout/Sidebar.module.css
web/src/layout/nav.js
web/src/main.jsx
web/src/pages/DashboardPage/DashboardPage.jsx
web/src/pages/DashboardPage/DashboardPage.module.css
web/src/pages/LoginPage/LoginPage.jsx
web/src/pages/LoginPage/LoginPage.module.css
web/src/router.jsx
web/src/styles/global.css
web/src/styles/tokens.css
web/src/utils/format.js
web/validation/phase4b-error.png
web/validation/phase4b-example-dashboard.png
web/validation/phase4b-example-login.png
web/validation/phase4b-pulsegrid-dashboard.png
web/validation/phase4b-pulsegrid-login.png
web/vite.config.js
```

## Foundation and dependencies

`web/` is a standalone Vite 6, React 18, React Router 6 application. Its runtime dependencies are `react`, `react-dom`, `react-router-dom`, and `remixicon`; development dependencies are `vite` and `@vitejs/plugin-react`. It has `dev`, `build`, and `preview` scripts, a lockfile, and no state manager, CSS framework, toast library, or provider SDK. `.env.development` points to the existing `http://localhost:3000` backend. `.env.production` leaves `VITE_API_BASE_URL` blank for same-origin deployment or build-time override. `web/README.md` has local run and profile-selection instructions and the verbatim Phase 4A §15 gate.

The implemented structure follows handoff §16: `src/brand` resolves identity; `src/api` owns requests; `src/auth` owns session and route protection; `src/hooks` owns reusable request state; `src/components/primitives` owns the five slice primitives; `src/layout` owns navigation and shell; `src/pages` contains only Login and Dashboard; `src/styles` owns semantic tokens and global classes. No Phase 4C pages, charts, maps, reports, exports, or AI surfaces were created.

## Brand and design system

`BrandProfile` is described and checked in `brand/schema.js`. The registry declares `pulsegrid` as `defaultSlug`, maps both profiles, owns the legacy mark mark/loader registration, and imports the two theme files. Resolution uses `VITE_BRAND_PROFILE`; development alone can override it with `localStorage['platform.brandProfile']`. An unknown slug falls back to pulsegrid and is reported in the console. `BrandProvider` supplies `{ profile, text, formatters }` and sets the document title, favicon, and theme attribute. `BrandMark` and `BrandLoader` use the active profile with monogram/ring fallbacks. No user-facing label switcher exists.

The default profile retains the lowercase pulsegrid wordmark, legacy mark SVG and ear loader, `pulsegrid-console` theme, black/near-black environment, neon green signals, pulsegrid domain/search context, and USD locale. The Example Records test profile supplies its own name, title, favicon, magenta four-token theme, GBP locale, domain, email identity, and search fields. Generic components obtain brand values from `useBrand()` and styling from semantic tokens. `tokens.css` contains the three required blocks copied byte-for-byte from the visual contract and architecture; `global.css` contains the shared classes and focus treatment. The result keeps sharp panels, compact mono KPI values, a 224px sidebar/56px rail, and responsive four-column/two-column KPI layout.

## Authentication, API client, and navigation

The central `apiFetch` reads `VITE_API_BASE_URL`, attaches a bearer token, invokes the registered session invalidation hook on 401, and exposes typed status/message errors. `endpoints.js` defines only the existing `POST /v3/auth/login`, `GET /v3/auth/me`, and `GET /v3/label/overview` calls. Login stores `authToken` and `userData`, then routes to `/dashboard`; reload reconciles the stored session with `/me`; logout and a 401 clear both keys. Protected routes send anonymous users to `/login`. Wrong credentials render the backend's error inline; 403 overview responses render ACCESS DENIED without retry; network failures render CONNECTION FAILURE with a working retry. Frontend visibility does not replace backend authorization.

The current login and `/me` payloads omit `pageAccess`. `permissions.js` honors it when present; until then, it uses the existing seeded role defaults (admin all, artist overview/roster, viewer overview) for navigation. This is a visibility limitation for custom grants, and it is **not** a backend permission change. The shell renders the documented full nav list filtered by visibility, with Settings and Terminate Session at the bottom. Unbuilt routes redirect to `/dashboard` in 4B. Header and sidebar obtain profile text through context; the shell contains no label literal or profile import.

## Real backend vertical slice

`DashboardPage` makes an authenticated `GET /v3/label/overview` through `getLabelOverview` and `useApiQuery`. The four cards render `monthlyRevenue`, `quarterlyProjection`, `annualProjection`, and `activeArtists`, with `Intl.NumberFormat` driven by the active profile's locale/currency and an em dash for invalid or missing numbers. The page includes initial loading, fullscreen error, retry, and the prescribed empty canvas below the KPI row. It does not add a chart, map, console, banner, or second API widget.

Live seeded admin results were **$3.2M, $134.8M, $539.1M, 29** under pulsegrid. The same numeric backend response formatted **£3.2m, £134.8m, £539.1m, 29** under Example Records. The live seeded artist response was **$8.5M, $25.4M, $101.6M, 1** and its primary nav showed only Dashboard and Artists. The Phase 4A handoff's zero-valued artist snapshot is stale in the current repository; this implementation reports the live API without modifying it.

## Verification record

- `npm install` completed (70 packages). The first sandboxed attempt had a registry DNS error; the approved retry completed.
- Backend `npm start` with a development `JWT_SECRET` and `SCHEDULE_JOBS=false` started normally on port 3000. Vite `npm run dev -- --host 127.0.0.1` started on port 5173. Both served the browser validation.
- `npm run build` passed after the final source edit: Vite 6.4.3 transformed 80 modules and produced `dist/` in about two seconds.
- No frontend test suite was added; the slice was checked with external, temporary Playwright browser scripts, not repo tests. They exercised unauthenticated redirect, invalid and valid login, admin/artist nav, persisted session, logout, invalid token/401, intercepted 403, network failure and retry, unbuilt-route redirect, both profiles, currency formatting, theme/title/favicon/mark/loader, and a 1024px rail/two-column layout. The scripts exited 0 with no page errors. They also measured 420px login width/48px padding, 224px sidebar, 24px main gutter, and four cards at 1440px.
- Pulsegrid visuals were inspected in [login](web/validation/phase4b-pulsegrid-login.png) and [dashboard](web/validation/phase4b-pulsegrid-dashboard.png) captures. Example Records was inspected in [login](web/validation/phase4b-example-login.png) and [dashboard](web/validation/phase4b-example-dashboard.png), with an [error-state capture](web/validation/phase4b-error.png). The default was restored to pulsegrid after testing.
- The Example Records run used the development profile override with **zero generic source edits**. It showed the alternate wordmark, monogram/ring, magenta accent, title, favicon, placeholder, GBP formatting, and dashboard frame; the body did not leak pulsegrid copy. This validates frontend presentation only: its backend data still comes from the pulsegrid runtime.
- Brand-leak searches found no pulsegrid/lumenveil/Novakin literal, artist ID, seeded address, profile/theme import, raw brand color, or vendor API call in generic React source. The exception is the required verbatim `tokens.css` comments naming the reference label; those comments do not influence runtime. The broad `ri-headphone` gate pattern also matches the prescribed A&R nav icon, so the mark check was scoped to the sidebar brand block. No backend URL is scattered into components.
- `git diff` for backend files and both legacy HTML frontends is empty; the final repository check is recorded below.

## Phase 4A deviations and known limits

1. **Theme selector correction.** Architecture §14.4 puts the four alternate brand-token overrides on `body[data-theme]`, while the semantic aliases in the required `tokens.css` are declared on `:root`. Live browser testing showed the alternate title and GBP format with a still-green accent. The minimal working resolution sets the active theme on both the root and body and scopes the four alternate overrides to `:root[data-theme]`. The schema, token names, four-token limit, profile mechanism, and component contracts remain unchanged.
2. **Sidebar brand block height.** The reference tagline wraps within the specified 224px sidebar at its specified 11px mono typography. The block uses a minimum height rather than forcing a fixed 40px height, so it does not overlap the first nav item. Other shell geometry remains as specified.
3. **Current auth payload lacks `pageAccess`.** Role fallback keeps seeded navigation usable, but a custom non-admin page grant cannot be shown accurately until a future backend response supplies the field. All protected requests remain server-authorized. This mismatch was encountered in the existing backend, not introduced by 4B.
4. **Forgot/reset remains a stub.** `Forgot Password?` is present and disabled, as the 4B slice allows. The backend reset-password route is absent. Complete these states only when 4C addresses the documented flow.
5. **Dependency advisory.** `npm audit --omit=dev --audit-level=moderate` reports two moderate React Router 6 advisories: GHSA-wrjc-x8rr-h8h6 (backslash open redirect) and GHSA-337j-9hxr-rhxg (SSR hydration constructor injection). The suggested major-version update would replace the Phase 4A React Router 6 choice. This 4B app is client-rendered and uses static nav targets; review the dependency before accepting untrusted navigation targets or SSR in a later phase. The audit command itself does not pass.

The backend label portability audit remains accurate: existing AI prompts/search prefixes, source domains, A&R benchmarks, reports, email identity, auth/admin identity, and other label data still need their separately bounded externalization. Phase 4B introduced no new backend coupling and made no backend changes. Do not claim end-to-end second-label deployment readiness yet. The application still uses the current pulsegrid intelligence and data by default.

## Exact Phase 4C starting point

Start from the verified pulsegrid/Example Records shell and the Phase 4A handoff §16 post-gate order. The first new page is **Artists**: add the roster route/page against the existing `GET /v3/artists`, preserve server-filtered access and profile styling, and extend `endpoints.js` rather than fetching from the component. Add only primitives that page needs. Next migrate ArtistDetail, then A&R Room/Scouting, Intelligence, Settings, Marketing, Fans, Operations, Admin, exports, and only then the rest of Dashboard, following the Phase 4A matrix. Re-run the two-profile gate after each surface. The Phase 4C map must read venue coordinates from active label data (`brand/profiles/pulsegrid/locations.js` for current pulsegrid locations), never a generic map constant. Keep the legacy HTML available until its replacement reaches its own acceptance gate.

## Final repository check

`git status --short` shows the same six pre-existing Phase 4A/audit documents plus only `?? PHASE_4B_HANDOFF.md` and `?? web/` from this phase. `git diff --stat` is empty because no tracked file changed. A targeted `git diff` over `src`, `server.js`, `production-api.js`, the root `package.json`, and both legacy HTML frontends is empty. The `web/` manifest above contains no Phase 4C page. No backend contract changed and no commit was made.
