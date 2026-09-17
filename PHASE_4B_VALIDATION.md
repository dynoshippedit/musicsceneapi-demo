# Phase 4B validation — independent live re-verification

**Status:** Phase 4B slice re-verified live against the Phase 4A §15 gate. 54/54 automated gate checks pass on the final run (`web/validation/gate.mjs`; runs 5 and 6 of 6 — the two post-patch runs in §4.2). One genuine defect was found in the slice and fixed inside `web/src` (loader pulse animation never ran). A follow-up **conformance pass** then applied the five 4B-fixable patches from the static audit (`PHASE_4B_STATIC_AUDIT.md` §D: F-03 code half, F-05, F-06, F-07, F-08 code half — §5.3), rebuilt, proved the loader fix is in the production bundle (§5.1), and re-ran the gate twice (§4.2). No backend, legacy HTML, or historical document was modified. No commit was made. **Phase 4C was not started.**

Every value in this document was observed in this validation session (2026-09-16, EDT). Nothing is copied from `PHASE_4B_HANDOFF.md`; where the handoff's numbers reappear it is because they were re-observed.

---

## 1. Scope & method

Scope: the Phase 4B frontend slice under `web/` (Vite + React 18 + React Router 6) — login, protected shell, four-card KPI row, brand layer, two-profile portability — evaluated against `PHASE_4A_HANDOFF.md` §15 (functional, mechanical `[measure]`/`[grep]`/`[diff]`, brand layer, portability) and §19 (MUST NOT), with `PHASE_4B_HANDOFF.md` treated as a set of hypotheses.

Method, in order:

1. Read `PHASE_4B_HANDOFF.md`, `PHASE_4A_HANDOFF.md` §15/§19/§22, `web/README.md`; read every file under `web/src`; grepped `src/models/index.js` and `src/routes/auth.js` for the seeded accounts, roles and auth payload shape (source beats docs).
2. Ran the backend regression suite before any server was started (no port/DB contention).
3. Installed `playwright` as a devDependency of `web/` only, downloaded the matching Chromium build, ran `npm run build` and `npm audit --omit=dev --audit-level=moderate`.
4. Booted the real backend and Vite dev server, probed the live API with `curl` (statuses, payload shape, raw overview numbers).
5. Wrote `web/validation/gate.mjs` (+ `lib.mjs`): a headless Playwright run of every functional/visual/portability box that can be measured mechanically, printing one `PASS|FAIL` line per check with the observed value and exiting non-zero on any FAIL. Expected currency strings are computed in Node from the **live** API response with `Intl.NumberFormat` (never from memory); expected colours/sizes are the §15 / architecture §13-§14 constants; computed colours are compared after parsing (Chromium serialises `color-mix()` results as `color(srgb …)`).
6. Ran the gate four times: run 1 (2 FAIL + script crash → one real defect, one test bug, one script bug), run 2 (2 FAIL → both test bugs), run 3 (54/54), run 4 (54/54, pasted in §4).
7. Independently exercised the network-failure box against a **real** backend stop/start (the gate simulates the outage with request aborts).
8. Ran the §15 `[grep]` boxes read-only and the `[diff]` box for `tokens.css`; inspected the five refreshed screenshots.
9. Recorded discrepancies, the defect fix, dependency change and open decisions below; final repository check in §8.
10. **Conformance pass (same day, later):** read `PHASE_4B_STATIC_AUDIT.md` (findings register + §D minimum-patch list); applied patches D2-D6 inside `web/src` only (§5.3); `npm run build` + `grep` on `dist/assets/*.css` (§5.1); booted both servers again; ran a throwaway Playwright probe for the five patches (§5.3, evidence column); ran `npm run gate` twice (runs 5-6, §4.2); tore down; reconciled every static-audit finding in §9.

Not re-verified here: the `[judge]` screenshot boxes beyond a quick inspection (secondary FAIL class per §15), pixel-level "no blue/indigo/violet pixel" scans (the gate checks element computed colours instead), and hover states.

---

## 2. Environment

| Item | Observed |
|---|---|
| Repository | `/home/dino/mau5trap-repo`, branch `master`, HEAD `3a95375` ("Complete Phase 3 backend hardening and validation") |
| Pre-existing untracked | six Phase 4A/audit docs, `PHASE_4B_HANDOFF.md`, `web/` (66 files before this session) |
| Node / ICU | `v22.23.2` / ICU `78.2` |
| Vite / React / React Router | `vite 6.4.3`, `react 18.3.1`, `react-router-dom 6.30.6` (`react-router 6.30.6`) — from `web/node_modules` |
| Playwright | `1.63.0` (installed this session, `web/` devDependency); Chromium `153.0.8010.12` (playwright build `1243`; the pre-cached `1228` did not match 1.63.0 so `npx playwright install chromium` was run — 114.3 MiB headless shell + chromium downloaded to `~/.cache/ms-playwright`) |
| Backend boot | from repo root: `JWT_SECRET=<32-char dev secret> SCHEDULE_JOBS=false PORT=3000 node server.js` → `GET /health` 200; log: "Database connection established", "[jobs] scheduling disabled" |
| Frontend boot | `cd web && npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` → "VITE v6.4.3 ready in 179 ms", `http://127.0.0.1:5173/` |
| Ports | 3000 (API), 5173 (Vite); both confirmed free before boot and after teardown; the backend regression suite uses 3997/3998 internally |
| Database | backend uses `mau5trap_v5.sqlite` at repo root (pre-existing, gitignored `*.sqlite`); it grew 94 208 → 167 936 bytes across the backend runs. `test.sqlite` (pre-existing, gitignored) untouched. No new DB/journal/probe-backup artifacts were created |
| Seed accounts (from `src/models/index.js` L94-105, fixture data per 4A §22 N5) | `admin@mau5trap.com` — role `admin`, `artistAccess 'all'`, DB `pageAccess ["all"]`; `tours@rezz.com` — role `artist`, `artistAccess 'art_rezz'`, DB `pageAccess ["overview","roster"]`. Passwords are the seeded fixture values documented in §15; not repeated here |
| Auth payload shape (from `src/routes/auth.js` + live `curl`) | seeded-user login returns `{token, user:{id,name,email,role,artistAccess}}`; `GET /v3/auth/me` returns `{id,email,name,role,artistAccess}` — **neither includes `pageAccess`** (only the env-override admin path at L66 does). Missing bearer → **401** `Authentication required`; invalid/expired bearer → **403** `Invalid or expired token` (`src/auth/index.js` L56-63, preserved byte-for-byte) |
| Live overview (admin) | `monthlyRevenue 3202870`, `quarterlyProjection 134773080`, `annualProjection 539092320`, `activeArtists 29` |
| Live overview (artist) | `monthlyRevenue 8464217`, `quarterlyProjection 25392651`, `annualProjection 101570604`, `activeArtists 1` |

---

## 3. Discrepancy table — `PHASE_4B_HANDOFF.md` claims vs observed

| # | Handoff claim | Observed this session | Verdict |
|---|---|---|---|
| 1 | Created `web/` (66 files), modified no existing file, no commit | `git status --short --untracked-files=all web` = 66 entries before this session; `git diff --stat` empty; HEAD still `3a95375` | CONFIRMED |
| 2 | `npm run build` → Vite 6.4.3, 80 modules, ≈2 s | `✓ 80 modules transformed`, `✓ built in 1.36s`, exit 0, `dist/` produced (`index.html` 0.78 kB, `index-*.css` 147.25 kB, `index-*.js` 227.85 kB). After the conformance pass (one new module, `hooks/useMediaQuery.js`): `✓ 81 modules transformed`, `✓ built in 1.37s`, exit 0 (§4.1) | CONFIRMED (time 1.36 s vs "about two seconds") |
| 3 | `npm audit --omit=dev --audit-level=moderate` → 2 moderate React Router advisories GHSA-wrjc-x8rr-h8h6 and GHSA-337j-9hxr-rhxg; the command does not pass | `{"moderate":2,"total":2}`; `react-router 6.0.0 - 7.17.0`: GHSA-wrjc-x8rr-h8h6 (open redirect via backslash, range `>=6.0.0 <7.18.0`) and GHSA-337j-9hxr-rhxg (SSR `deserializeErrors()` constructor injection, range `>=6.4.0 <7.18.0`); fix offered = `react-router-dom@7.18.4` (breaking); exit code 1 | CONFIRMED |
| 4 | Admin KPI row `$3.2M, $134.8M, $539.1M, 29` | Rendered exactly `MONTHLY REVENUE $3.2M · QUARTERLY PROJECTION $134.8M · ANNUAL PROJECTION $539.1M · ACTIVE ARTISTS 29`; equals Node `Intl` en-US/USD of the live numbers | CONFIRMED |
| 5 | Same numbers under Example Records `£3.2m, £134.8m, £539.1m, 29` | Rendered exactly `£3.2m · £134.8m · £539.1m · 29`; equals Node `Intl` en-GB/GBP (lowercase compact `m` reproduced by both ICU 78.2 in Node and Chromium 153) | CONFIRMED |
| 6 | Artist row `$8.5M, $25.4M, $101.6M, 1`; the 4A snapshot `$0 · $0 · $0 · 0` is stale | Rendered `$8.5M · $25.4M · $101.6M · 1` from live artist overview; 4A §15 snapshot value not reproduced by the current backend | CONFIRMED (4A gate text is stale on this line) |
| 7 | Artist primary nav shows only Dashboard and Artists | `primary=[Dashboard, Artists] secondary=[Settings] bottom="Terminate Session"`; header chip `IR Isabelle Rezazadeh` | CONFIRMED |
| 8 | Login and `/me` payloads omit `pageAccess`; role defaults used | `pageAccess-in-payload=false` for both accounts on live login; `/me` body has no `pageAccess`; `permissions.js` falls back to role defaults | CONFIRMED |
| 9 | "invalid token/401" clears session → `/login` | Garbage `authToken` + reload → `/login`, both keys null — **but the backend answered 403, not 401** (run 1 captured `backend=[/v3/label/overview:403, /v3/auth/me:403]`; run 4 captured `backend=[/v3/auth/me:403]` before the redirect). The redirect is produced by `AuthContext`'s `/me` catch (`401/403/404 → logout`), not by the 401 hook in `api/client.js`. A synthetic 401 on `/v3/label/overview` (route interception) does trigger the client hook and also ends at `/login` | CHANGED — outcome holds, mechanism differs from the wording; see decision 3 |
| 10 | Intercepted 403 → ACCESS DENIED without retry | `kicker="ACCESS DENIED" buttons=[] position fixed, path /dashboard, kpis=0, token kept` | CONFIRMED |
| 11 | Network failure → CONNECTION FAILURE with working retry | Simulated (route abort) and **real** (backend process killed, exited in 50 ms): `CONNECTION FAILURE` / `Failed to connect to Neural Link` / `RETRY CONNECTION`, fixed inset 0 on `rgb(10, 10, 10)`, `#root` non-empty, session kept; after backend restart, RETRY rendered `$3.2M · $134.8M · $539.1M · 29` with `window` marker intact (no reload) | CONFIRMED |
| 12 | Measured 420 px login width / 48 px padding / 224 px sidebar / 24 px main gutter / four cards at 1440 | `width=420 padding=48px`; `sidebar=224px pad=24px 16px`; `main pad=24px ml=224px`; `cards=4 cols=4 gap=16px`; card heights `91.4px` ×4 | CONFIRMED |
| 13 | 1024 px rail / two-column layout | `1024x768: cols=2 sidebar=56 visibleMarks=[24] navLabelsVisible=0 wordmarkVisible=false main-ml=56px scrollWidth=1024` | CONFIRMED |
| 14 | Loader: mau5-head "80px ring + 2 ears, pulse" via `<BrandLoader/>`; RingLoader for Example Records | Geometry confirmed (80×80, 4 px accent border, two 50×50 ears at top −30 px / ±25 px) **but `animationName` computed to `_pulse_16n6j_1` / `_pulse_1pzk3_1` and `getAnimations().length === 0` for both loaders, in dev and in the production CSS** — the pulse never ran. Fixed in this session (§5); after the fix `anim=pulse running=1` | REJECTED as shipped → fixed |
| 15 | "Scripts exited 0 with no page errors" | Zero `pageerror` events and zero unexpected `console.error` across all four gate runs and the real-outage run. Chromium's `Failed to load resource` resource lines appear only during deliberately provoked 401/403/ECONNREFUSED phases (listed by the gate). 24 `console.warning` React Router v7 future-flag warnings per run | CONFIRMED (with the warning noise recorded) |
| 16 | Deviation 1: theme override scoped to `:root[data-theme]`, theme set on root and body | `example-records-magenta.css` selector is `:root[data-theme="example-records-magenta"]` (arch §14.4 text says `body[…]`); both `documentElement.dataset.theme` and `body.dataset.theme` set; magenta resolves on real elements (`rgb(255, 45, 149)`, `rgba(255, 45, 149, 0.35)`, `…0.1`) | CONFIRMED (necessary: `--color-accent` is aliased on `:root`, so a body-scoped override would not reach it); doc-only follow-up = decision 5 |
| 17 | Deviation 2: sidebar brand block uses `min-height` not fixed 40 px | `.brand { min-height: var(--brand-mark-size) }`; block text `["mau5trap","INTELLIGENCE PLATFORM"]`, no overlap observed at 224 px | CONFIRMED |
| 18 | `tokens.css` is byte-for-byte the three required blocks, nothing else | `tokens.css` (9 330 bytes) = contract §1 code block (5 977 B) + `\n` + architecture §13.9 block (959 B) + `\n` + architecture §14.4 first block (2 392 B), with zero trailing bytes | CONFIRMED |
| 19 | Brand-leak greps clean except verbatim `tokens.css` comments and `ri-headphone-line` (A&R nav icon) | Outside `brand/`: only 4 `tokens.css` comment lines mention the label; inside `brand/` outside `profiles/`+`themes/`: only `registry.js` (7 lines). `ri-headphone-line` at `layout/nav.js:6` is the prescribed A&R icon, so the literal §15 grep `ri-headphone… web/src/layout → no results` cannot pass as written | CONFIRMED; §15 grep wording conflicts with §13 nav spec = decision 6 |
| 20 | No `@mau5trap.com` literal in `web/src` | `brand/profiles/mau5trap/profile.js` L12-13 contains `admin@mau5trap.com` / `notify@mau5trap.com` (schema-required `contact.support`, `email.fromAddress`). Generic source: none | CHANGED — the §15 grep `grep -rn "@mau5trap.com" web/src → no results` is violated by the profile the architecture requires; decision 6 |
| 21 | `Forgot Password?` present and disabled | `text="Forgot Password?" disabled=true 11px rgb(0, 255, 95)` | CONFIRMED |
| 22 | Backend regression suite unaffected | `JWT_SECRET=… npm test` → `tests 121 · suites 26 · pass 121 · fail 0 · skipped 0`, 9 753 ms (REFACTOR_PROGRESS.md last recorded 114/26 after Phase 2; Phase 3 added 7) | CONFIRMED |

---

## 4. Gate results

### 4.1 Checkbox table (observed values; "how" = gate check ID or manual step)

Build / audit / suite:

| ✓ | Item | Observed | How |
|---|---|---|---|
| ✅ | `cd web && npm run build` exit 0, `dist/` produced | Final (post-conformance-patch) build: `✓ 81 modules transformed … ✓ built in 1.37s`, exit 0; `dist/index.html` 0.78 kB, `dist/assets/index-5LZDk4Jh.css` 147.22 kB (gzip 24.07), `dist/assets/index-CL5iseGn.js` 228.41 kB (gzip 75.24), remixicon fonts, `dist/brands/`. Production-bundle proof of the §5.1 fix: `grep -o 'animation:[^;}]*' dist/assets/*.css` → `animation:pulse 2s infinite` ×2; `grep -c '_pulse_'` → 0; `grep -c '@keyframes pulse'` → 1; `grep -c 'body\[data-theme'` → 0 | terminal (§5.1, §5.3) |
| ⚠️ | `npm audit --omit=dev --audit-level=moderate` | 2 moderate: GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg (react-router 6.30.6); exit 1 | terminal — expected per handoff; decision 1 |
| ✅ | Backend `npm test` | 121 pass / 0 fail / 26 suites / 9 753 ms; no new sqlite artifacts | terminal |

Functional (4A §15 / README):

| ✓ | Item | Observed | How |
|---|---|---|---|
| ✅ | unauthenticated `/` and `/dashboard` → `/login` | both landed on `http://127.0.0.1:5173/login` | F01, F02 |
| ✅ | wrong password → in-card panel with server `error`, button back to INITIALIZE SESSION | `alert="Invalid credentials" submit="INITIALIZE SESSION" disabled=false path=/login`; panel `rgba(255, 50, 50, 0.1)` bg, `1px solid rgba(255, 50, 50, 0.3)`, 4px, 12px pad, 13px centered | F03, V07 |
| ✅ | seeded admin → `/dashboard` | `http://127.0.0.1:5173/dashboard` | F04 |
| ✅ | four KPI cards = live `GET /v3/label/overview` | `MONTHLY REVENUE $3.2M · QUARTERLY PROJECTION $134.8M · ANNUAL PROJECTION $539.1M · ACTIVE ARTISTS 29` | F05 |
| ✅ | no `NaN`/`undefined`/`null` on page | body text 286 chars, none present | F06 |
| ✅ | admin nav = full list + Settings + Terminate Session | `[Dashboard, Artists, A&R Room, Intelligence, Marketing, Fans, Operations, Admin]` / `[Settings]` / `Terminate Session`; header `Dashboard · Real-time label performance metrics · AU Admin User` | F07 |
| ✅ | seeded artist → filtered nav + that token's values | `[Dashboard, Artists]` / `[Settings]` / `Terminate Session`; `$8.5M · $25.4M · $101.6M · 1` (4A snapshot `$0…` is stale) | F10 |
| ✅ | persisted session survives reload; `/me` reconciled | still `/dashboard`, token unchanged, `userData={"id":1,"name":"Admin User","email":"admin@mau5trap.com","role":"admin","artistAccess":"all"}` | F08 |
| ✅ | Terminate Session → `/login`, keys cleared | `authToken=null userData=null` | F09 |
| ✅ | garbage token + reload → `/login`, session cleared | backend answered **403** on `/me` and overview; ended on `/login` with both keys null | F11 |
| ✅ | 401 from any call clears session | synthetic 401 on overview → `/login`, keys null | F12 |
| ✅ | 403 on overview → ACCESS DENIED, no retry | `kicker="ACCESS DENIED" buttons=[]`, token kept | F13 |
| ✅ | backend unreachable → CONNECTION FAILURE fullscreen; RETRY renders KPIs without reload | simulated: `kicker="CONNECTION FAILURE" message="Failed to connect to Neural Link" button="RETRY CONNECTION" white-screen=false … after retry: reload=false kpi=$3.2M · $134.8M · $539.1M · 29`; real stop/start: identical (§3 row 11) | F14 + manual real-outage run |
| ✅ | unbuilt route → `/dashboard`, no 404, no console error | `Artists->/dashboard Settings->/dashboard /anr->/dashboard /does-not-exist->/dashboard 404text=false newErrors=0` | F15 |
| ✅ | Forgot Password? present + disabled | `disabled=true 11px rgb(0, 255, 95)` | F16 |
| ✅ | localStorage keys ⊆ allowed set | `[authToken, userData]` (+ `platform.brandProfile` only while the dev override is set); source writes exactly `authToken`, `userData`, `platform.brandProfile` | F17 + grep |

Visual geometry (1440×900 unless stated):

| ✓ | Item | Observed | How |
|---|---|---|---|
| ✅ | login card 420 / 48 px / 1 px accent .35 / 4 px / no shadow / centered | `width=420 padding=48px border=1px solid color(srgb 0 1 0.372549 / 0.35) radius=4px shadow=none centerOffset=(0.00,0.00)` | V02 |
| ✅ | wordmark 32/700 Inter −1 px; sublabel 12 px mono muted | `"mau5trap" 32px/700 ls=-1px Inter; "INTELLIGENCE PLATFORM" 12px rgb(181, 181, 181) JetBrains Mono` | V03 |
| ✅ | button 100 % / 48 px / accent fill / black 14/700 mono | `w=322 (card inner 322) h=48 bg=rgb(0, 255, 95) color=rgb(0, 0, 0) 14px/700 JetBrains Mono uppercase` | V04 |
| ✅ | labels 11/700 mono muted; inputs 14 px mono, 2 px, `rgba(0,0,0,.3)` | as specified; placeholder `user@mau5trap.com` | V05 |
| ✅ | footer hairline + two 11 px mono muted lines; body #0A0A0A + decoration gradient; login radial | `borderTop=1px 11px rgb(181, 181, 181)`; `bodyBg=rgb(10, 10, 10)` linear-gradient; `.login-page` radial-gradient | V06 |
| ✅ | focus ring 2 px accent + glow | `access-id / passphrase / INITIALIZE SESSION: 2px solid rgb(0, 255, 95) +glow` | V15 |
| ✅ | sidebar 224 px, `24px 16px`, right hairline, blur(20px), fixed; main 24 px; header 56 px + 24 px mb | all exactly as listed | V08 |
| ✅ | header h1 28/700 "Dashboard", 14 px subtitle, chip; no input/select/a | `chip=["AU","Admin User"] input/select/a=0` | V09 |
| ✅ | nav item 40 px / 2 px / 18 px icon / 14 px label; inactive `#B5B5B5`; active `#F5F5F5` 600 on accent .1 | `active bg=color(srgb 0 1 0.372549 / 0.1) color=rgb(245, 245, 245) w=600; inactive rgb(181, 181, 181) w=400 bg transparent` | V10 |
| ✅ | bottom group Settings → hairline → Terminate Session pinned | `ri-logout-box-line 14px rgb(181, 181, 181) bg transparent divider=1px gap-to-viewport-bottom=24px` | V11 |
| ✅ | brand block: Mau5Head 40×40 (3 circle / 2 ellipse / 1 path `M 30 70 Q 50 90 70 70 Q 50 82 30 70`), wordmark 20/800, sublabel 11 px mono accent | `fill=rgb(0, 255, 95) eyes=rgb(245, 245, 245)`; `"mau5trap" 20px/800`; `"INTELLIGENCE PLATFORM" 11px rgb(0, 255, 95) uppercase` | V12 |
| ✅ | KPI grid 4 cols, gap 16, align start; cards 88-112 px, 16 px pad, 4 px, hairline, no shadow, no icons | `heights=[91.4,91.4,91.4,91.4] border=1px solid rgba(255, 255, 255, 0.1) shadow=none` | V13 |
| ✅ | 2 px accent left rule @ .5 full inner height; `.label` 11 px mono muted; `.kpi` 32/700 mono `#F5F5F5` tabular | `rule=2px rgb(0, 255, 95) op=0.5 h=89.3906px (card inner 89.3906px)`; `kpi 32px/700 JetBrains Mono rgb(245, 245, 245) tabular-nums` | V14 |
| ✅ | nothing below the KPI row | `main children=[HEADER, DIV]`, no Vite overlay | V16 |
| ✅ | loader = mau5-head 80 px ring + 2 ears, **pulse running**, #0A0A0A, no text | `ring=80x80 border=4px solid rgb(0, 255, 95) anim=pulse running=1 ears=2 (50px×50px 4px accent, top −30 px, ±25 px) text=""` — after fix | V17 |
| ✅ | fullscreen ErrorState anatomy | `inset=0px 0px 0px 0px bg=rgb(10, 10, 10) icon=ri-error-warning-line 48px rgb(255, 68, 68); kicker 16px rgb(255, 68, 68) mono; msg 14px rgb(181, 181, 181); button bg=rgba(255, 50, 50, 0.1) color=rgb(255, 68, 68) r=2px h=32 uppercase` | V18 |
| ✅ | 1280×800 identical, 4 columns | `cols=4 sidebar=224 scrollWidth=1280` | R01 |
| ✅ | 1024×768 rail 56 px, 24 px mark, 2×2, no overflow | `cols=2 sidebar=56 visibleMarks=[24] main-ml=56px scrollWidth=1024` | R02 |

Brand layer + portability:

| ✓ | Item | Observed | How |
|---|---|---|---|
| ✅ | mau5trap `document.title` / favicon / `data-theme` | `"mau5trap Intelligence Platform"`, `/brands/mau5trap/favicon.svg`, `mau5trap-console` on both `html` and `body` | V01 |
| ✅ | brand tokens on real elements | sublabel `rgb(0, 255, 95)`; login border `rgba(0,255,95,.35)` (as `color(srgb 0 1 0.372549 / 0.35)`); active nav `…/ 0.1` | V02, V10, V12 |
| ✅ | example-records via `localStorage['platform.brandProfile']` — **no file edits between runs** | key set → reload; `git diff` under `web/src` unchanged by the switch | P00 |
| ✅ | title / favicon / theme | `"Example Records — Label Operations"`, `/brands/example-records/favicon.svg`, `example-records-magenta` (html + body) | P01 |
| ✅ | login wordmark / sublabel / placeholder / 3rd footer line; platform voice unchanged | `"Example Records"`, `"LABEL OPERATIONS"`, `user@example-records.test`, footer `[RESTRICTED ACCESS…, Authorized personnel only., © Example Records — portability test profile]`; all six voice strings present | P02 |
| ✅ | accent colour (computed) magenta on card border / button / Forgot link | `border=color(srgb 1 0.176471 0.584314 / 0.35)` (= `rgba(255, 45, 149, 0.35)`), `button=rgb(255, 45, 149)/rgb(0, 0, 0)`, `forgot=rgb(255, 45, 149)` | P03 |
| ✅ | currency format en-GB/GBP, lowercase compact `m` (expected produced by `node -e` Intl first) | `£3.2m · £134.8m · £539.1m · 29` | P04 |
| ✅ | shell: MonogramMark "E" 40×40 magenta mono, no svg; wordmark/sublabel from profile | `glyph="E" bg=rgb(255, 45, 149) color=rgb(0, 0, 0) JetBrains Mono r=2px svgs=0; sub rgb(255, 45, 149)` | P05 |
| ✅ | nav/header/Terminate Session identical to mau5trap run; active tint + rules magenta | `nav-identical=true activeBg=color(srgb 1 0.176471 0.584314 / 0.1) rules=[rgb(255, 45, 149)]` | P06 |
| ✅ | no "mau5trap" in body text on `/login` + `/dashboard`; no class containing "mau5"; no green element colour | all zero on both routes | P07 |
| ✅ | loader = RingLoader 80 px pulse, no ears | `ring=80x80 border=4px solid rgb(255, 45, 149) anim=pulse running=1 ears=0` — after fix | P08 |
| ✅ | fullscreen ErrorState unchanged except hue | `CONNECTION FAILURE` / `RETRY CONNECTION`, danger button colours unchanged | P09 |
| ✅ | restore default → mau5trap boxes pass again with no edits | title/theme/favicon mau5trap, green sublabel, `40x40 circles=3` mark, lowercase wordmark, `$3.2M · $134.8M · $539.1M · 29`, key removed | P10 |

Console hygiene:

| ✓ | Item | Observed | How |
|---|---|---|---|
| ✅ | no `pageerror` for the whole run | none (4/4 runs) | C01 |
| ✅ | no unexpected `console.error` | none; 8 expected Chromium resource lines only during provoked phases: `401 (Unauthorized)`, `403 (Forbidden)`, `net::ERR_CONNECTION_REFUSED` | C02 |
| ℹ️ | warnings | 24 × React Router "Future Flag Warning … v7_startTransition" per run (decision 2) | gate INFO |

`[grep]`/`[diff]` boxes (read-only, from repo root; hits shown are the complete set):

| ✓ | Box | Result |
|---|---|---|
| ✅ | `tokens.css` byte-identical to contract §1 + arch §13.9 + arch §14.4 block 1, nothing else | identical (5 977 + 1 + 959 + 1 + 2 392 = 9 330 bytes) |
| ✅ | gradients outside `tokens.css`; `--green-` in components; `prefers-color-scheme`/`Switch to`; `data-theme` only in `BrandContext.jsx`/themes | 0 / 0 / 0 hits; `data-theme` string appears in the two theme files and (as a comment) in `tokens.css`; set from `BrandContext.jsx` via `dataset.theme` |
| ✅ | no `art_*` id; no legacy KPI labels; no forbidden voice words; no toast/snackbar/spinner/shimmer/progress; no `alert(`/`confirm(`/`prompt(`/`localhost:3000`; no `ui-avatars`; no emoji | 0 hits each |
| ✅ | raw hex/rgb, `border-radius` literal, `box-shadow`/`text-shadow`, `outline: none` outside allowed files | 0 hits each |
| ✅ | `Intl.NumberFormat` only in `utils/format.js`; no `'$'`/`en-US` in components | 2 hits, both `format.js`; 0 |
| ✅ | `StatCard.jsx` no `<i`/`<svg`/`<a`/`onClick`; module css no `:hover`/`transform`/`box-shadow`; `Header.jsx` no `<input`/`<select`/`<a` | 0 hits each |
| ✅ | `from …brand/profiles` only in `registry.js` | 4 hits, all `registry.js` |
| ✅ | `Mau5Head.jsx`: 3 `<circle>`, 2 `<ellipse>`, 1 `<path>` with the exact `d`; fills only `var(--color-accent)`/`var(--color-text)` | confirmed |
| ✅ | example theme sets exactly 4 tokens; mau5trap theme is the empty scoped block | `--color-brand-primary, -bright, -deep, --color-on-brand`; `:root[data-theme="mau5trap-console"] {}` (selector aligned with `example-records-magenta.css` in the conformance pass — §5.3 F-03) |
| ✅ | `web/package.json` name `label-intelligence-web`; `index.html` title `Label Intelligence Platform` | confirmed |
| ⚠️ | `grep -rniE "mau5trap|mau5|deadmau5|rezz" web/src --exclude-dir=brand → no results` | 4 hits, all comments inside the verbatim `tokens.css` blocks (L11, L50, L114, L128) — required by the `[diff]` box; not runtime |
| ⚠️ | `grep -rn "ri-headphone…" web/src/layout → no results` | 1 hit: `nav.js:6 ri-headphone-line` = the prescribed A&R Room icon (decision 6) |
| ⚠️ | `grep -rn "@mau5trap.com" web/src → no results` | 2 hits in `brand/profiles/mau5trap/profile.js` (schema-required contact/email identity) (decision 6) |

### 4.2 `npm run gate` — final run (run 6 of 6), verbatim

Run history. Runs 1-4 (live re-verification pass): run 1 → `FAIL V14` (test bug: rule height compared to border-box instead of padding-box), `FAIL V17` (**real defect** — pulse animation not running), then the script crashed on `route.continue: Route is already handled!` (delayed continue after a StrictMode-aborted request); run 2 → `FAIL V17` (test regex bug; the fixed animation was already `anim=pulse running=1`), `FAIL P05` (test matched the 40×40 wrapper span, not the leaf monogram); run 3 → `54 pass, 0 fail`; run 4 → `54 pass, 0 fail`. Runs 5-6 (conformance pass, after the §5.3 patches and a fresh `npm run build`, both against freshly booted servers): run 5 → `54 pass, 0 fail`, exit 0; run 6 (below) → `54 pass, 0 fail`, exit 0. The per-check PASS/FAIL ids of runs 5 and 6 are identical (`diff` of the id columns is empty); the only textual difference between the two runs is the F11 observed value (run 5 recorded `backend=[/v3/label/overview:403, /v3/auth/me:403]`, run 6 `backend=[/v3/auth/me:403]` — a race on which 403 lands first, already described in §3 row 9). Both runs recorded `expected resource errors=9` in C02 (run 4 had 8; the extra line is inside a deliberately provoked 401/403/ECONNREFUSED phase).

No gate check had to be corrected in the conformance pass: no check encoded the invented `height: 42px` (V05 asserts font, radius, background and placeholder only), and no geometry check regressed after the F-05 padding change.

```text
> label-intelligence-web@0.1.0 gate
> node validation/gate.mjs

Phase 4B gate — BASE_URL=http://127.0.0.1:5173 API_URL=http://localhost:3000 viewport=1440x900 headless=true
node v22.23.2 icu 78.2 chromium 153.0.8010.12 playwright 1.63.0
PASS | G01 frontend reachable | GET http://127.0.0.1:5173/login -> 200
PASS | G02 backend health | GET http://localhost:3000/health -> 200
PASS | G03 live API overview (admin) | login 200 pageAccess-in-payload=false; overview 200 monthlyRevenue=3202870 quarterlyProjection=134773080 annualProjection=539092320 activeArtists=29
PASS | G04 live API overview (artist) | login 200 role=artist pageAccess-in-payload=false; overview 200 monthlyRevenue=8464217 quarterlyProjection=25392651 annualProjection=101570604 activeArtists=1
INFO | expected (Node Intl) admin en-US/USD: $3.2M · $134.8M · $539.1M · 29 | admin en-GB/GBP: £3.2m · £134.8m · £539.1m · 29 | artist en-US/USD: $8.5M · $25.4M · $101.6M · 1
PASS | F01 unauthenticated / -> /login | http://127.0.0.1:5173/login
PASS | F02 unauthenticated /dashboard -> /login | http://127.0.0.1:5173/login
PASS | V01 mau5trap identity (title/favicon/theme) on /login | {"title":"mau5trap Intelligence Platform","favicon":"/brands/mau5trap/favicon.svg","bodyTheme":"mau5trap-console","htmlTheme":"mau5trap-console"}
PASS | V02 login card geometry (420/48/1px accent .35/4px/no shadow/centered) | width=420 padding=48px border=1px solid color(srgb 0 1 0.372549 / 0.35) radius=4px shadow=none centerOffset=(0.00,0.00) sidebar/header=false logo/img=0
PASS | V03 login wordmark lowercase 32px/700 -1px Inter; tagline 12px mono muted (not green) | wordmark="mau5trap" 32px/700 ls=-1px Inter; tagline="INTELLIGENCE PLATFORM" 12px rgb(181, 181, 181) "JetBrains Mono"
PASS | V04 login button full-width 48px accent fill, black 14px/700 mono uppercase | w=322 (card inner 322) h=48 bg=rgb(0, 255, 95) color=rgb(0, 0, 0) 14px/700 "JetBrains Mono" uppercase
PASS | F16 Forgot Password? present, disabled, 11px accent | text="Forgot Password?" disabled=true 11px rgb(0, 255, 95)
PASS | V05 login labels 11px/700 mono muted; inputs 14px mono radius 2px bg rgba(0,0,0,.3); placeholder from profile | labels=ACCESS ID 11px/700 rgb(181, 181, 181); PASSPHRASE 11px/700 rgb(181, 181, 181) input=14px "JetBrains Mono" r=2px bg=rgba(0, 0, 0, 0.3) placeholder=user@mau5trap.com
PASS | V06 login footer: hairline top, two 11px mono muted lines (mau5trap has no legal line); body bg #0A0A0A + decoration gradient; login radial gradient | footer=["RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.","Authorized personnel only."] borderTop=1px 11px rgb(181, 181, 181); bodyBg=rgb(10, 10, 10) bodyImg=linear-gradient(color(srgb 0 1 0.372549 … loginImg=radial-gradient(circle, color(srgb 0 1 0…
PASS | V15 keyboard focus ring (2px accent outline) on login controls | access-id: 2px solid rgb(0, 255, 95) +glow; passphrase: 2px solid rgb(0, 255, 95) +glow; INITIALIZE SESSION: 2px solid rgb(0, 255, 95) +glow; mau5trapINTELLIGENCE: 3px none rgb(245, 245, 245)
PASS | F03 wrong password -> inline server error, button restored, still /login | alert="Invalid credentials" submit="INITIALIZE SESSION" disabled=false path=/login
PASS | V07 login error = panel variant (danger-dim bg, danger border, 4px, 12px pad, 13px centered) | bg=rgba(255, 50, 50, 0.1) border=1px solid rgba(255, 50, 50, 0.3) radius=4px pad=12px msg=13px center
PASS | F04 seeded admin login -> /dashboard | http://127.0.0.1:5173/dashboard
PASS | F05 admin KPI row === live API formatted en-US/USD | MONTHLY REVENUE $3.2M · QUARTERLY PROJECTION $134.8M · ANNUAL PROJECTION $539.1M · ACTIVE ARTISTS 29 (expected $3.2M · $134.8M · $539.1M · 29)
PASS | F06 no NaN/undefined/null on /dashboard | body text 286 chars, tokens absent=true
PASS | F07 admin nav: 8 primary + Settings + Terminate Session | primary=[Dashboard, Artists, A&R Room, Intelligence, Marketing, Fans, Operations, Admin] secondary=[Settings] bottom="Terminate Session" header="Dashboard Real-time label performance metrics AU Admin User"
PASS | V08 shell geometry: sidebar 224 / 24px 16px / hairline / blur(20px); main 24px; header 56 + 24mb | sidebar=224px pad=24px 16px border-right=1px solid rgba(255, 255, 255, 0.1) blur(20px) fixed; main pad=24px ml=224px; header=56px mb=24px
PASS | V09 header: h1 28px/700 "Dashboard", 14px subtitle, user chip; no input/select/a | h1="Dashboard" 28px/700; subtitle="Real-time label performance metrics" 14px; chip=["AU","Admin User"]; input/select/a=0
PASS | V10 nav items 40px, 2px radius, 18px icon, 14px label; inactive muted; active text 600 on accent .1 | active "Dashboard" h=40 r=2px icon=18px label=14px bg=color(srgb 0 1 0.372549 / 0.1) color=rgb(245, 245, 245) w=600; inactive "Artists" color=rgb(181, 181, 181) w=400 bg=rgba(0, 0, 0, 0)
PASS | V11 bottom group: Settings -> hairline -> Terminate Session (ri-logout-box-line, 14px muted, no fill) pinned bottom | "Terminate Session" icon=ri-logout-box-line 14px rgb(181, 181, 181) bg=rgba(0, 0, 0, 0) divider=1px gap-to-viewport-bottom=24px
PASS | V12 brand block: Mau5Head SVG 40x40 (3 circle/2 ellipse/1 path, accent+text fills), wordmark 20px/800 lowercase, sublabel 11px mono accent uppercase; nothing else | svg 40x40 circles=3 ellipses=2 paths=1 d="M 30 70 Q 50 90 70 70 Q 50 82 30 70" fill=rgb(0, 255, 95) eyes=rgb(245, 245, 245) (rail copy width=0); wordmark="mau5trap" 20px/800; sub="INTELLIGENCE PLATFORM" 11px rgb(0, 255, 95) uppercase; block text=["mau5trap","INTELLIGENCE PLATFORM"]
PASS | V13 KPI row: 4 cards, 4 columns, gap 16, align start, 88-112px, pad 16, 4px, hairline, no shadow, no icons | cards=4 cols=4 gap=16px align=start; heights=[91.4,91.4,91.4,91.4] pad=16px r=4px border=1px solid rgba(255, 255, 255, 0.1) shadow=none
PASS | V14 KPI anatomy: 2px accent left rule @.5 full height; .label 11px mono muted uppercase; .kpi 32px/700 mono text tabular-nums | rule=2px rgb(0, 255, 95) op=0.5 h=89.3906px (card inner 89px); label 11px rgb(181, 181, 181) uppercase; kpi 32px/700 "JetBrains Mono" rgb(245, 245, 245) tabular-nums
PASS | V16 nothing below the KPI row (main = header + grid), no Vite error overlay | main children=[HEADER, DIV] overlay=false
PASS | F08 persisted session survives reload; userData reconciled with /v3/auth/me | path=/dashboard token-unchanged=true userData={"id":1,"name":"Admin User","email":"admin@mau5trap.com","role":"admin","artistAccess":"all"}
PASS | F15 unbuilt routes redirect to /dashboard (nav click + direct) | Artists->/dashboard Settings->/dashboard /anr->/dashboard /does-not-exist->/dashboard 404text=false newErrors=0
PASS | F17 localStorage keys ⊆ {authToken,userData,platform.brandProfile} | keys=[authToken, userData]
PASS | V17 full-page loader is the mau5-head (80px ring + 2 ears, pulse) on #0A0A0A, no spinner text | fixed=true bg=rgb(10, 10, 10) ring=80x80 border=4px solid rgb(0, 255, 95) anim=pulse running=1 ears=2 (50pxx50px 4px rgb(0, 255, 95) top=-30px left=-25px; 50pxx50px right=-25px) text="" svg/img=0
PASS | F09 Terminate Session -> /login, authToken/userData cleared | path=/login authToken=null userData=null
PASS | F10 seeded artist: nav ONLY Dashboard+Artists, Settings+Terminate Session; KPI === live artist API en-US/USD; no NaN | primary=[Dashboard, Artists] secondary=[Settings] bottom="Terminate Session" kpi=$8.5M · $25.4M · $101.6M · 1 (expected $8.5M · $25.4M · $101.6M · 1) header="Dashboard Real-time label performance metrics IR Isabelle Rezazadeh"
PASS | F11 garbage authToken + reload -> back to /login, session cleared (records backend status) | path=/login authToken=null userData=null backend=[/v3/auth/me:403]
PASS | F12 intercepted 401 on overview -> session cleared -> /login | path=/login authToken=null userData=null
PASS | F13 intercepted 403 on overview -> fullscreen ACCESS DENIED, no retry, session kept | kicker="ACCESS DENIED" message="Access denied: insufficient permissions" buttons=[] fixed path=/dashboard kpis=0 token-kept=true
PASS | F14 API unreachable on reload -> CONNECTION FAILURE fullscreen; RETRY CONNECTION renders KPIs without reload | kicker="CONNECTION FAILURE" message="Failed to connect to Neural Link" button="RETRY CONNECTION" white-screen=false overlay=false session-kept=true; after retry: reload=false kpi=$3.2M · $134.8M · $539.1M · 29 alert=false
PASS | V18 fullscreen ErrorState anatomy: fixed inset 0 #0A0A0A; 48px danger icon; 16px mono danger kicker; 14px muted message; danger button (dim fill, danger text, 2px, 32px, mono uppercase) | inset=0px 0px 0px 0px bg=rgb(10, 10, 10) icon=ri-error-warning-line 48px rgb(255, 68, 68); kicker 16px rgb(255, 68, 68); msg 14px rgb(181, 181, 181); button bg=rgba(255, 50, 50, 0.1) color=rgb(255, 68, 68) r=2px h=32 uppercase
PASS | R01 1280x800: 4 KPI columns, full 224px sidebar | cols=4 sidebar=224 scrollWidth=1280
PASS | R02 1024x768: 56px icon rail (24px mark only), KPIs 2x2, no horizontal overflow | cols=2 sidebar=56 visibleMarks=[24] navLabelsVisible=0 wordmarkVisible=false main-ml=56px scrollWidth=1024
PASS | P00 switch to example-records via localStorage override (dev hook), session cleared | keys=[platform.brandProfile]
PASS | P01 example-records identity (title/favicon/theme) | {"title":"Example Records — Label Operations","favicon":"/brands/example-records/favicon.svg","bodyTheme":"example-records-magenta","htmlTheme":"example-records-magenta"}
PASS | P02 example login: wordmark/sublabel/placeholder/3rd footer line; platform voice unchanged | wordmark="Example Records" tagline="LABEL OPERATIONS" placeholder=user@example-records.test footer=["RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.","Authorized personnel only.","© Example Records — portability test profile"] voice-present=true
PASS | P03 example login: card border, button fill, Forgot link are magenta; card geometry unchanged | width=420 pad=48px border=color(srgb 1 0.176471 0.584314 / 0.35) button=rgb(255, 45, 149)/rgb(0, 0, 0) forgot=rgb(255, 45, 149)
PASS | P04 example dashboard: admin KPI === live API formatted en-GB/GBP (lowercase m) | MONTHLY REVENUE £3.2m · QUARTERLY PROJECTION £134.8m · ANNUAL PROJECTION £539.1m · ACTIVE ARTISTS 29 (expected £3.2m · £134.8m · £539.1m · 29)
PASS | P05 example shell: MonogramMark "E" 40x40 magenta mono (no svg), wordmark/sublabel from profile, sublabel magenta | glyph="E" bg=rgb(255, 45, 149) color=rgb(0, 0, 0) "JetBrains Mono" r=2px svgs=0; wordmark="Example Records" sub="LABEL OPERATIONS" rgb(255, 45, 149); block=["E","Example Records","LABEL OPERATIONS"]
PASS | P06 example shell: nav/header/Terminate Session identical to mau5trap run; active tint + StatCard rules magenta | nav-identical=true header="Dashboard Real-time label performance metrics AU Admin User" activeBg=color(srgb 1 0.176471 0.584314 / 0.1) rules=[rgb(255, 45, 149)]
PASS | P07 example: no "mau5trap" in body text (/login + /dashboard), no class containing "mau5", no green element colour | dashboard: mau5trap-in-text=false mau5-classes=0 green-elements=0; login: mau5trap-in-text=false mau5-classes=0 green-elements=0
PASS | P08 example: full-page loader is the RingLoader (80px ring, pulse, no ears) | ring=80x80 border=4px solid rgb(255, 45, 149) anim=pulse running=1 ears=0 bg=rgb(10, 10, 10)
PASS | P09 example: fullscreen ErrorState unchanged except hue (kicker/button copy identical, button magenta-free danger) | kicker="CONNECTION FAILURE" button="RETRY CONNECTION" btn=rgba(255, 50, 50, 0.1)/rgb(255, 68, 68) bg=rgb(10, 10, 10)
PASS | P10 remove override -> mau5trap identity, accent, mark, wordmark and $ KPIs return with no edits | title="mau5trap Intelligence Platform" theme=mau5trap-console favicon=/brands/mau5trap/favicon.svg wordmark="mau5trap" sub="INTELLIGENCE PLATFORM" rgb(0, 255, 95) mark=40x40 circles=3 kpi=$3.2M · $134.8M · $539.1M · 29 keys=[authToken, userData]
PASS | C01 no uncaught page errors during the run | none
PASS | C02 no unexpected console.error during the run (resource errors during provoked 401/403/network phases are listed separately) | none; expected resource errors=9 [Failed to load resource: the server responded with a status of 401 (Unauthorized) | Failed to load resource: the server responded with a status of 403 (Forbidden) | Failed to load resource: net::ERR_CONNECTION_REFUSED]
INFO | console warnings (24): ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` futur
INFO | screenshots written to /home/dino/mau5trap-repo/web/validation: phase4b-mau5trap-login.png phase4b-mau5trap-dashboard.png phase4b-example-login.png phase4b-example-dashboard.png phase4b-error.png
GATE SUMMARY: 54 pass, 0 fail, 54 checks
```

Exit code: `0`.

---

## 5. Defects found and fixes applied

### 5.1 Loader pulse animation never ran (fixed)

- **Files:** `web/src/brand/defaults/defaults.module.css` (RingLoader `.ring`), `web/src/brand/profiles/mau5trap/mau5head.module.css` (Mau5Head loader `.head`).
- **Symptom (observed):** `getComputedStyle(loader).animationName === "_pulse_16n6j_1"` (mau5head) / `"_pulse_1pzk3_1"` (ring); `element.getAnimations().length === 0`; the only `@keyframes` rules in the document are `pulse, scanline, blink, fadeIn` (from `global.css`). The dev-served module CSS and the production `dist/assets/index-*.css` both contained `animation:_pulse_<hash> 2s infinite` with no matching keyframes. Root cause: CSS Modules localises `animation-name` identifiers, so `animation: pulse` inside a `.module.css` file was rewritten to a hashed name that no rule defines; the contract's `@keyframes pulse` lives in the global stylesheet.
- **Fix (one token, both files):**

  ```diff
  -  animation: pulse 2s infinite;
  +  animation: global(pulse) 2s infinite; /* @keyframes pulse is declared in styles/global.css; global() stops CSS Modules localising the name */
  ```

- **Why this is a fix and not a design change:** §15 MARK box and architecture §13.2 specify the loader as "80px ring + 2 ears, **pulse**"; `global.css` (contract §2) defines `@keyframes pulse` for exactly this. No size, colour, timing, or token changed. Verified after the fix via the dev-server transform (`animation: pulse 2s infinite;` for both modules) and live: `anim=pulse running=1` for the mau5-head loader (V17) and the RingLoader (P08).
- **Production build re-run (conformance pass):** `cd web && npm run build` → `✓ 81 modules transformed`, `✓ built in 1.37s`, exit 0. On the fresh `dist/assets/index-5LZDk4Jh.css`: `grep -o 'animation:[^;}]*'` → exactly two lines, both `animation:pulse 2s infinite`; `grep -c '_pulse_'` → `0` (no CSS-Modules-localised name survives); `grep -c '@keyframes pulse'` → `1`. The dev-server transforms of both module files (`curl http://127.0.0.1:5173/src/brand/defaults/defaults.module.css`, `…/mau5head.module.css`) also serve `animation: pulse 2s infinite`. The earlier note that the post-fix build had not been re-run is therefore closed; `web/dist` on disk is now the post-fix, post-conformance build (gitignored).

No other defect was found in the live pass. Everything else that failed during runs 1-4 was a bug in the new gate script and was fixed in the script, not in `web/src`.

### 5.2 Gate-script-only fixes (no product effect)

`web/validation/gate.mjs`: V14 compares the left rule to `clientHeight` (padding box); delayed `route.continue()` wrapped in `.catch()` (React StrictMode aborts the first fetch in dev); V17/P08 assert `getAnimations().length ≥ 1` and `animationName === "pulse"`; P05 selects the leaf monogram span; V15 starts tabbing from outside the card. The gate script was **not** changed in the conformance pass.

### 5.3 Conformance patches from the static audit (applied this pass, `web/src` only)

These bring 4B into line with the already-approved 4A architecture; none is a new design decision. Finding ids refer to `PHASE_4B_STATIC_AUDIT.md`; patch numbers to its §D list. Rendered user-visible strings are unchanged. "Evidence" is from a throwaway Playwright probe run against the live dev server between gate runs 5 and 6 (not committed; the gate itself has no check for these items).

| Id | File:line | Before → after | Why (spec) | Evidence (live) |
|---|---|---|---|---|
| **F-03** (code half, D2) | `web/src/brand/themes/mau5trap-console.css:2` | `body[data-theme="mau5trap-console"] {}` → `:root[data-theme="mau5trap-console"] {}` | Matches `example-records-magenta.css:2` and the working selector from 4B handoff deviation 1: semantic aliases are declared on `:root`, so a `body`-scoped theme block can never override them; a 4C theme author copying the mau5trap file would reproduce the broken selector. Spec half (arch §14.4 / §15 / `tokens.css:126` comment) is an operator decision (§7 #5, §9) | dev transform of the file serves `:root[data-theme="mau5trap-console"]`; dist CSS has `0` `body[data-theme` (the minifier unquotes the attribute and elides the empty rule, so only `:root[data-theme=example-records-magenta]{…}` survives in `dist`); example theme still resolves on real elements (`rgb(255, 45, 149)`, both `html` and `body` carry `data-theme`) |
| **F-05** (D3) | `web/src/pages/LoginPage/LoginPage.module.css:16` | `height: 42px; padding: 0 var(--space-3);` → `padding: var(--space-3);` | Arch §13.3 L757: "input: 100% wide, **12px pad**, 14px `--font-mono`" (legacy `padding: '12px'`); `42px` appears in no spec and §15 L597-600 makes an invented size a FAIL. `--space-3` = 12px (`tokens.css:80`) | computed `padding = 12px` on both inputs; rendered height is now the intrinsic **45px** (Chromium's text-input inner editor uses the font's natural line box ≈19px for 14px JetBrains Mono, ignoring `line-height: 1`, + 24 pad + 2 border) instead of the forced 42px. No gate geometry check depends on input height (V05 passes unchanged); focus rings (V15) and error panel (V07) unchanged |
| **F-06** (D4) | `web/src/layout/Sidebar.jsx:19,35,49` (+ new `web/src/hooks/useMediaQuery.js`) | `title={label}` / `title={profile.shortName}` / `title={text.logout}` unconditionally → `title={railTitle(…)}` where `railTitle = (v) => (isRail ? v : undefined)` and `isRail = useMediaQuery('(max-width: 1279px) and (min-width: 1024px)')` — the exact `@media` block of `Sidebar.module.css:45` | Arch §13.5.2 L859 "**no tooltip at ≥1280**"; L862 rail (1024-1279): "`title` attribute as tooltip"; §14.2 L1153 `shortName` = "rail tooltip". Hook = `matchMedia` + `change` listener with cleanup (same shape as the other `hooks/*`). The breakpoint string is duplicated from CSS on purpose (comment in `Sidebar.jsx`); see §7 #12 | @1440: `brand=null links=[null×9] logout=null`; @1024: `brand="mau5trap" links=[Dashboard, Artists, A&R Room, Intelligence, Marketing, Fans, Operations, Admin, Settings] logout="Terminate Session"`; @1279: titles present; @1280: all `null` again (listener fires both directions without reload). R02 (1024 rail) and V08/V10/V11 unchanged |
| **F-07** (D5) | `web/src/copy.js` (+`passphrasePlaceholder: '••••••••'`), `web/src/pages/LoginPage/LoginPage.jsx:45` | `placeholder="••••••••"` → `placeholder={text.passphrasePlaceholder}` | `••••••••` is an arch §13.1 canon value (L631) and §19 L706 forbids inlining anything from §13.1 | `#passphrase.placeholder === "••••••••"` |
| **F-08** (code half, D6) | `web/src/copy.js` (−`openNavigation`, −`closeNavigation` at top level; +`a11y: { loading: 'Loading', openNavigation: 'Open navigation', primaryNav: 'Primary', secondaryNav: 'Secondary' }`); `web/src/layout/Header.jsx:20` `aria-label={text.openNavigation}` → `text.a11y.openNavigation`; `web/src/layout/Sidebar.jsx:43,47` `aria-label="Primary"`/`"Secondary"` → `text.a11y.primaryNav`/`secondaryNav`; `web/src/components/primitives/LoadingScreen.jsx:5` `aria-label="Loading"` → `text.a11y.loading` (via `useBrand`); `web/src/brand/BrandLoader.jsx:8` passes `label={text.a11y.loading}`; `web/src/brand/defaults/RingLoader.jsx:4` and `web/src/brand/profiles/mau5trap/Mau5HeadLoader.jsx:4` `aria-label="Loading"` → `aria-label={label}` (prop) | Arch §13.7 L997 "new strings need review" and §15 L597-600: every rendered string must be reviewable in one place; `closeNavigation` was unused. The loaders receive the label as a prop (like `Mau5Head({ size })`) so profile components stay context-free and `registry.js` remains the only importer of `profiles/` (arch §14.6 L1342-1345). The spec half (an `A11Y` block in §13.1) is an operator decision (§9) | `nav aria-labels = ["Primary","Secondary"]`, header menu `aria-label="Open navigation"`, `[role=status][aria-label="Loading"] > [role=img][aria-label="Loading"]` for both the mau5-head loader and the example-records RingLoader; gate selectors `nav[aria-label=Primary]`/`[…=Secondary]` (F07, F10, F15, P06) pass unchanged; `grep -rn "Loading\|Primary\|Secondary\|Open navigation" web/src` → hits only in `copy.js` |

Re-checked: F-01 (`animation: global(pulse) 2s infinite;`) is present in both `defaults.module.css:19` and `mau5head.module.css:7`.

**Not applied on purpose — F-09 (D7):** adding the §13.1 4C copy keys (forgot/reset, `COMMAND CONSOLE`/idle/busy/placeholder/`queryFailed`/chip, Settings › AI, `platformName`) to `copy.js` is deferred to Phase 4C: they have no consumer in the 4B slice, and adding dead keys now is exactly the kind of 4C-scope creep this pass is fenced from. `copy.js` carries the 4B subset; 4C appends the rest (see §9).

---

## 6. Dependencies changed

| Package | Location | Change | Exact version |
|---|---|---|---|
| `playwright` | `web/package.json` → `devDependencies` (+ `web/package-lock.json`) | added | `^1.63.0` (lock: `1.63.0`, `playwright-core 1.63.0`) |

Also added: `"gate": "node validation/gate.mjs"` under `web/package.json` → `scripts`. No runtime dependency changed; no root `package.json` change. Browser binaries live outside the repo (`~/.cache/ms-playwright/chromium-1243`, `chromium_headless_shell-1243`).

Files created this session: `web/validation/gate.mjs`, `web/validation/lib.mjs`, `PHASE_4B_VALIDATION.md`, and (conformance pass) `web/src/hooks/useMediaQuery.js`. Files modified: `web/package.json`, `web/package-lock.json`, `web/src/brand/defaults/defaults.module.css`, `web/src/brand/profiles/mau5trap/mau5head.module.css`, the five `web/validation/phase4b-*.png` captures (overwritten in place by every gate run, same names, 1440×900), and (conformance pass, §5.3) `web/src/brand/themes/mau5trap-console.css`, `web/src/pages/LoginPage/LoginPage.module.css`, `web/src/pages/LoginPage/LoginPage.jsx`, `web/src/copy.js`, `web/src/layout/Sidebar.jsx`, `web/src/layout/Header.jsx`, `web/src/components/primitives/LoadingScreen.jsx`, `web/src/brand/BrandLoader.jsx`, `web/src/brand/defaults/RingLoader.jsx`, `web/src/brand/profiles/mau5trap/Mau5HeadLoader.jsx`. `web/` is now 69 untracked paths (66 + `gate.mjs` + `lib.mjs` + `useMediaQuery.js`). No dependency changed in the conformance pass.

---

## 7. Unresolved decisions for the operator

1. **React Router advisories (moderate ×2).** `react-router 6.30.6` carries GHSA-wrjc-x8rr-h8h6 (backslash open redirect in `<Link>`/`useNavigate`) and GHSA-337j-9hxr-rhxg (SSR `deserializeErrors()` constructor injection). The only fix npm offers is `react-router-dom@7.18.4` (major, breaking) which changes the Phase 4A "React Router 6" choice. The slice is client-rendered with static nav targets, so neither advisory is currently reachable; `npm audit --omit=dev --audit-level=moderate` will keep exiting 1 until you either upgrade, pin an exception, or accept. Decide before 4C adds user-controlled navigation or SSR.
2. **React Router v7 future-flag warnings.** Every run logs 24 `console.warning`s ("`v7_startTransition`"). Opt in via `createBrowserRouter(routes, { future: { v7_startTransition: true } })`, silence, or leave. Not changed here (behavioural opt-in).
3. **401 vs 403 for an invalid/expired token.** The backend (preserved byte-for-byte) answers **403** `Invalid or expired token` to a bad bearer and reserves **401** for a missing one. The frontend still ends on `/login` because `AuthContext` logs out on `/me` 401/403/404, but the `api/client.js` 401 hook is not what fires, and a valid-token-but-forbidden 403 on `/me` would also log the user out. Options: (a) leave (works today), (b) extend the client hook to treat 403 `Invalid or expired token` as session loss (frontend-only string match — brittle), (c) a later backend contract change to return 401 for invalid tokens (out of 4B/4C scope, snapshot re-baseline). Also note the momentary ACCESS DENIED flash on `/dashboard` before the `/me` 403 redirect resolves.
4. **`pageAccess` absent from login and `/me` payloads.** Confirmed in `src/routes/auth.js` L92-101 and L183-189. Navigation visibility uses role defaults (`admin → all`, `artist → overview,roster`, `viewer → overview`); a custom per-user grant cannot be shown until the backend serialises the field (additive response change; needs sign-off). Backend still authorises every request.
5. **Architecture §14.4 text vs implemented theme selector.** Implementation uses `:root[data-theme="…"]` for the four alternate brand tokens (necessary — semantic aliases are declared on `:root`), while §14.4's example block says `body[data-theme]`. *Conformance pass:* the code half is now consistent — both theme files use `:root[data-theme]` (§5.3 F-03). The **spec half remains open**: a doc-only pass should update §14.4 (L1240, L1280, L1295, L1301), §15 L558/L573, and decide whether the verbatim `tokens.css:126` comment ("scoped to `body[data-theme]`") is re-baselined (which changes the `[diff]` block) or accepted as lagging.
6. **Three §15 `[grep]` boxes conflict with other 4A requirements as written:** (a) `ri-headphone…` in `web/src/layout` hits the prescribed A&R Room icon in `nav.js`; (b) `@mau5trap.com` hits the schema-required `contact.support`/`email.fromAddress` in `brand/profiles/mau5trap/profile.js`; (c) the label-literal grep outside `brand/` hits the four comment lines the `[diff]` box forces into `tokens.css`. Re-scope the greps (exclude `nav.js` icon field, `brand/profiles/**`, and `tokens.css` comments) in a doc-only pass, or accept the recorded exceptions.
7. **Forgot / reset password stub.** `Forgot Password?` is rendered disabled; the backend has `POST /v3/auth/forgot-password` but no `reset-password` route (4A §19 forbids inventing it). Decide when 4C addresses the flow.
8. **Stale 4A §15 line for the artist snapshot.** `tours@rezz.com` now receives `$8.5M · $25.4M · $101.6M · 1`, not `$0 · $0 · $0 · 0`. Update the gate text (doc-only) or re-baseline the snapshot expectation.
9. **Requests have no client-side timeout.** During a backend *graceful* shutdown window (`server.close()` + 5 s fallback in `server.js` L85-90) a browser reusing a keep-alive socket sat on the LoadingScreen until the process exited (observed once while killing the server mid-session; a fully stopped backend produces CONNECTION FAILURE in ≈0.7 s). Whether `apiFetch` should adopt an `AbortSignal.timeout(...)` is a product decision — not changed here.
10. **Post-fix production build — RESOLVED in the conformance pass.** `cd web && npm run build` was re-run (81 modules, 1.37 s, exit 0) and the two `animation:pulse 2s infinite` occurrences confirmed in `dist/assets/index-5LZDk4Jh.css` with zero `_pulse_` (§5.1). `dist/` is current.
11. **Login input height is now intrinsic (45px in Chromium 153), not 42px.** Removing the invented `height: 42px` (§5.3 F-05) leaves the inputs at `12px` padding + the font's natural line box; Chromium ignores `line-height: 1` for a text input's inner editor, so 14px JetBrains Mono renders ≈19px tall → 45px total. This is what the spec (§13.3, legacy `padding: '12px'`) yields; no spec names an input height. If a fixed height is wanted, it must be added to arch §13.3 first, then implemented — not the other way round.
12. **Rail breakpoint is now declared twice.** `Sidebar.module.css:45` (`@media (max-width: 1279px) and (min-width: 1024px)`) and `Sidebar.jsx` `RAIL_QUERY` (same string, for the `title` gating in §5.3 F-06) must be kept in sync by hand; there is no single-source mechanism in the 4B stack (CSS custom properties cannot be used in `@media`). Alternatives for 4C: a shared `breakpoints.js` consumed by the hook plus a build-time media-query plugin, or dropping the JS gate and relying on CSS `pointer-events`/`display` only (which cannot remove a `title` attribute). Left as is; the comment in `Sidebar.jsx` points at the CSS.
13. **F-09 — `copy.js` carries the 4B subset of §13.1, not the whole canon.** Deferred to 4C by this pass (§5.3): forgot/reset, `COMMAND CONSOLE` strings, Settings › AI and `platformName` are appended when their consumers are built. The 4B handoff's "§13.1 verbatim" wording should be read as "verbatim for the strings it carries".

---

## 8. Final repository check

Taken from repo root after the conformance pass, with both servers killed.

`git status --short`:

```text
 M REFACTOR_PROGRESS.md
?? BRAND_PORTABILITY_AUDIT.md
?? BRAND_PORTABILITY_AUDIT_RECHECK.md
?? FRONTEND_ARCHITECTURE.md
?? MAU5TRAP_VISUAL_DESIGN_CONTRACT.md
?? PHASE_4A_DESIGN_AUDIT.md
?? PHASE_4A_HANDOFF.md
?? PHASE_4B_HANDOFF.md
?? PHASE_4B_STATIC_AUDIT.md
?? PHASE_4B_VALIDATION.md
?? web/
```

`git diff --stat`:

```text
 REFACTOR_PROGRESS.md | 12 ++++++++++--
 1 file changed, 10 insertions(+), 2 deletions(-)
```

`M REFACTOR_PROGRESS.md` is the **parent's** phase-status edit (it references this file and `PHASE_4B_STATIC_AUDIT.md`; mtime 23:31:59, seconds after the parent copied the static audit in at 23:31:45). The conformance pass did not touch it — its only writes outside `web/` were to this document.

`git diff --stat -- src server.js mau5trap-production-api.js package.json tests mau5trap-frontend-connected.html mau5trap-terminal-dashboard.html` → *(empty)* — no backend file and neither legacy HTML changed.

`git status --short --untracked-files=all web | wc -l` → `69` (the 66 Phase 4B files + `validation/gate.mjs` + `validation/lib.mjs` + `src/hooks/useMediaQuery.js`; `web/node_modules`, `web/dist` are gitignored).

Historical documents untouched (mtimes all predate the conformance pass): `PHASE_4A_HANDOFF.md` 20:43, `PHASE_4A_DESIGN_AUDIT.md` 07:14, `PHASE_4B_HANDOFF.md` 22:24, `MAU5TRAP_VISUAL_DESIGN_CONTRACT.md` 06:57, `FRONTEND_ARCHITECTURE.md` 19:44, `BRAND_PORTABILITY_AUDIT.md` 19:19, `BRAND_PORTABILITY_AUDIT_RECHECK.md` 19:40.

Teardown: backend and Vite processes killed (the Vite child outlived its `npm run dev` parent once and was killed by pid); `ss -ltnp | grep -E ':3000|:5173'` → nothing; no `*.sqlite-journal`, `*.probe-backup`, or new `*.sqlite` created (checked at repo root and under `web/`); the pre-existing gitignored `mau5trap_v5.sqlite` (167 936 bytes, unchanged size) was written by the backend runs and left in place; `test.sqlite` untouched.

No commit was made. **Phase 4C NOT started.**

---

## 9. Static audit reconciliation

The static audit is `PHASE_4B_STATIC_AUDIT.md` at repo root (the parent copied `/tmp/mau5trap_4b_static_audit.md` there unchanged). Its verdict was **PHASE 4B STATIC VERDICT: FAIL / 4C SAFE TO BEGIN: NO**, driven by two items: **F-01** (loader never pulses — §15 L510/L574 mechanically unpassable) and **F-02** (`pageAccess` nav-permission model undecided). F-01 is fixed and proven in the production bundle (§5.1); F-02 is an open product/backend decision (§7 #4). Per the audit's own closing line, once both are closed "the static view is a PASS" — F-01 is closed here; F-02 is not something 4B code can close.

| Finding | Disposition | Where / rationale |
|---|---|---|
| **F-01** loader never pulses (CSS Modules localised `animation: pulse`) | **FIXED** (live pass; proven in `dist` this pass) | `web/src/brand/defaults/defaults.module.css:19`, `web/src/brand/profiles/mau5trap/mau5head.module.css:7` → `animation: global(pulse) 2s infinite`; `dist/assets/*.css` has `animation:pulse 2s infinite` ×2, `_pulse_` ×0, `@keyframes pulse` ×1 (§5.1); gate V17/P08 `anim=pulse running=1` |
| **F-02** `pageAccess` never reaches the client; role table lives in `permissions.js` | **OPERATOR DECISION** | Needs a backend response change (`src/routes/auth.js` login + `/me`) or a 4A §10/§15/§18 amendment plus a 4C note that Admin › Team permission checkboxes are display-only. Backend is a hard wall for 4B; not touchable here (§7 #4) |
| **F-03** theme selector `body[data-theme]` vs `:root[data-theme]` | **FIXED — code half** (this pass) / **OPERATOR DECISION — spec half** | Code: `web/src/brand/themes/mau5trap-console.css:2` → `:root[data-theme="mau5trap-console"] {}` (§5.3). Spec: arch §14.4 L1240/L1280/L1295/L1301, §15 L558/L573 and the verbatim `tokens.css:126` comment still say `body[data-theme]` — doc-only change, and re-baselining the comment alters the `[diff]` block (§7 #5) |
| **F-04** sidebar tagline wraps at the specified 11px/`--tracking-wide` | **OPERATOR DECISION** | Spec choice between legacy 10px, `--tracking-label`, or "may wrap" (arch §13.5.2 L858, §15 L509). Any code change without the spec change would itself be an invented value |
| **F-05** invented `height: 42px` on login inputs | **FIXED** (this pass) | `web/src/pages/LoginPage/LoginPage.module.css:16` → `padding: var(--space-3)` (12px, arch §13.3 L757); live `padding=12px` (§5.3). Consequence recorded as §7 #11 (intrinsic 45px) |
| **F-06** native `title` tooltips at all widths | **FIXED** (this pass) | `web/src/layout/Sidebar.jsx:19,35,49` gated on `useMediaQuery('(max-width: 1279px) and (min-width: 1024px)')` (new `web/src/hooks/useMediaQuery.js`); live: no `title` at 1280/1440, `title` present at 1024/1279 (§5.3). Maintenance note §7 #12 |
| **F-07** `••••••••` placeholder inlined | **FIXED** (this pass) | `web/src/copy.js` `passphrasePlaceholder`; `web/src/pages/LoginPage/LoginPage.jsx:45` reads `text.passphrasePlaceholder` (§5.3) |
| **F-08** invented a11y strings outside the canon; unused `closeNavigation` | **FIXED — code half** (this pass) / **OPERATOR DECISION — spec half** | Code: `closeNavigation` removed; `Loading`/`Open navigation`/`Primary`/`Secondary` moved to `copy.js` `a11y` group and read via `text.a11y.*` in `LoadingScreen.jsx`, `BrandLoader.jsx` (→ `RingLoader.jsx`, `Mau5HeadLoader.jsx` as `label` prop), `Header.jsx`, `Sidebar.jsx`; rendered strings identical (§5.3). Spec: add an `A11Y` block to arch §13.1 (doc-only) |
| **F-09** `copy.js` is not "§13.1 verbatim" (omits 4C-only strings) | **DEFERRED TO 4C** | The missing keys (forgot/reset, console, Settings › AI, `platformName`) have no consumer in the 4B slice; adding them now would be 4C scope. `copy.js` = 4B subset; 4C appends (§5.3, §7 #13) |
| **F-10** `/me` 404 logs the user out (admin-override token has no `id`) | **OPERATOR DECISION** | Either amend 4A §9 L241 to "401/403/404 → logout" and note the override consequence, or narrow `AuthContext.jsx:41` to 401/403 (changes behaviour for deleted users with a valid JWT). Behavioural choice, not a conformance fix (§7 #3 is the sibling 401/403 question) |
| **F-11** three §15 `[grep]` boxes contradict other 4A rules as written | **OPERATOR DECISION** | Doc-only re-scoping of the §15 gate text (`--exclude=tokens.css`, exclude `nav.js`, `--exclude-dir=brand`); recorded exceptions in §4.1 (§7 #6). Historical docs are a hard wall for this pass |
| **F-12** stale 4A artist snapshot (`$0 · $0 · $0 · 0`) vs live values; backend `baseline.json` stale | **OPERATOR DECISION** | §15 L465 / §18 L687 doc fix plus a backend-owned re-baseline of `tests/snapshots/baseline.json` (`label_overview_artist_role`). Backend and 4A docs are hard walls (§7 #8) |
| **F-13** 4A docs untracked → "no 4A doc edited" is not `git diff`-able | **OPERATOR DECISION** (commit) | Commit the six 4A documents, `PHASE_4B_HANDOFF.md`, `PHASE_4B_STATIC_AUDIT.md` and this file before authorising 4C. This pass does not commit (parent owns commits); mtimes in §8 are the interim evidence |

Summary: **6 fixed** in `web/src` (F-01, F-03 code, F-05, F-06, F-07, F-08 code), **1 deferred to 4C** (F-09), **8 operator decisions** (F-02, F-03 spec, F-04, F-08 spec, F-10, F-11, F-12, F-13). No backend, historical document, gate script, or legacy HTML was changed to reach this state. **Phase 4C NOT started.**
