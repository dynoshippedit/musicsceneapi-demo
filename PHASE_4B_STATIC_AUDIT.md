# Phase 4B — static audit of `web/` against 4A handoff / visual contract / 4A design audit

Date: 2026-09-16 (EDT) · Repo: `/home/dino/pulsegrid-repo` · HEAD `3a9537513e081e5c27faff0a9fce5c337c3cf18a` (Phase 3) · `web/` + all Phase 4A/4B docs are untracked (`??`) · Read-only pass: nothing in the repo was created, edited, run or installed. Evidence from the committed `web/dist/` build output and `web/validation/*.png` is used where it proves a static claim.

Sources read in order: `PHASE_4A_DESIGN_AUDIT.md` → `PHASE_4A_HANDOFF.md` §7–§10, §14–§16, §19, §22 → `PULSEGRID_VISUAL_DESIGN_CONTRACT.md` → `FRONTEND_ARCHITECTURE.md` §3–§6, §13, §14 → `PHASE_4B_HANDOFF.md` → every file under `web/` (66 files, 1 192 LOC under `web/src`) → backend `src/routes/auth.js`, `src/routes/label.js`, `src/models/index.js` (grep only) → legacy HTML L3081–3091, L3452–3461.

---

## A. Summary

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 0 | — |
| MAJOR | 2 | F-01, F-02 |
| MINOR | 11 | F-03 … F-13 |
| NOISE (listed, killed) | 17 | N-01 … N-17 |

Headline: the slice is a faithful, label-blind implementation of the 4A spec — tokens byte-identical, copy canon rendered verbatim, brand seam clean, MUST-NOT list clean. Two real problems: (F-01) **the brand loader never pulses** — CSS Modules localized `animation: pulse` in both loader modules, proven by the build output; and (F-02) **`pageAccess` never leaves the backend**, so the §15 nav gate rests on a role→permission table hardcoded into platform code, which will neuter the 4C Admin permission UI. Everything else is spec hygiene (three self-contradicting §15 greps, stale snapshot values, a theme-selector doc fix) and small 4B nits.

---

## B. Findings by check

### B1. Audit closure — `PHASE_4A_DESIGN_AUDIT.md` minimum patches + B1/B2/B3 → §22 → 4B code

| Audit item | §22 disposition (PHASE_4A_HANDOFF.md) | 4B implementation | Status |
|---|---|---|---|
| **Patch 1 — COPY CANON** (audit L478–486) | L780–781 "1→§13.1"; L763 B1 row: "Arch §13.1 copy canon … `copy.js` file (§16 #7); forbidden-string grep; §15 COPY + LOGIN boxes" | `web/src/copy.js:2-23` holds every 4B string verbatim (`'ACCESS ID'`, `'PASSPHRASE'`, `'INITIALIZE SESSION'`, `'AUTHENTICATING...'`, footer ×2, `'Terminate Session'`, 4 KPI labels, `'CONNECTION FAILURE'`, `'RETRY CONNECTION'`); each literal greps to `copy.js` only (see B4); §13.1 forbidden-string grep → 0 hits. Audit's `TOTAL REVENUE/TOTAL STREAMS/AVG ROI` were replaced by served fields — §22 L765 justifies (backend `src/routes/label.js:127-133` serves `monthlyRevenue/quarterlyProjection/annualProjection/activeArtists`, no streams/ROI) | **CLOSED** (4C keys missing from copy.js — F-09) |
| **Patch 2 — paste sidebar SVG as PulseMark** (L488–489) | L764 "Arch §13.2 verbatim `PulseMark.jsx` (token fills…); §16 #8; §15 MARK boxes" | `web/src/brand/profiles/pulsegrid/PulseMark.jsx:1-14` = arch §13.2 markup (3 `<circle>`, 2 `<ellipse>`, `<path d="M 30 70 Q 50 90 70 70 Q 50 82 30 70">`, fills `var(--color-accent)`/`var(--color-text)` only). Reached via `brand/registry.js:15` → `BrandMark.jsx:7`; `layout/Sidebar.jsx:2` imports `BrandMark`, nothing from `profiles/` | **CLOSED** |
| **Patch 3 — Login exception** (L491–493) | L766 "Arch §13.0 precedence + §13.3 login exception (420/48, accent hairline), `--gradient-login` token (§13.9)" | `LoginPage.module.css:9` `width: min(var(--login-card-width), …); padding: var(--login-card-pad); border: var(--border-panel-accent)`; `:6` `background-image: var(--gradient-login)`; tokens.css:109-111 define the three tokens | **CLOSED** |
| **Patch 4 — Slice composition closed** (L495–497) | L768; §15 L444–450 "Slice composition is closed … No chart, map, table, console, banner … density rule waived for 4B" | `DashboardPage.jsx:22-31`: one grid of exactly four `<StatCard>`, nothing else (error panel only on refetch failure, per §13.6 row 3); `DashboardPage.module.css:1` `repeat(4, minmax(0,1fr)); gap 16; align-items: start`; screenshot `web/validation/phase4b-pulsegrid-dashboard.png` shows empty canvas below the row | **CLOSED** |
| **Patch 5 — mechanical gate boxes** (L499–503) | L781 "5→§15"; §15 L489–536 | Boxes exist (L490–493 copy, L504 SVG, L532 exactly-4 cards, L496 forbidden strings). Static greps pass; `[measure]` boxes are the live agent's | **CLOSED** (static) |
| **Patch 6 — radius deviation sentence** (L505–506) | L771 "Arch §13.4 signed-deviation register (24 rows)"; §14 L427 "Do not copy radius, padding, width, or color values from the HTML" | `grep border-radius web/src --include=*.css \| grep -v 'var(--radius-'` → 0; no legacy 16/8/6px anywhere | **CLOSED** |
| **Patch 7 — error scope sentence** (L508–509) | L770 "Arch §13.6 surface table; `ErrorState` = fullscreen/panel/field; initial load = full viewport" | `ErrorState.jsx:5-16` three variants; `DashboardPage.jsx:18-19` `LoadingScreen` / `ErrorState variant="fullscreen"` on initial load; `LoginPage.jsx:35` panel variant in-card | **CLOSED** |
| **Patch 8 — AI settings anti-chatbot list** (L511–513) | L769 "Arch §13.8.2 … FAIL greps" | Not a 4B surface; no `components/ai/*` exists (correct) | **CLOSED (spec) / N/A (4B)** |
| **B1 Login copy not locked** | L763 ACCEPTED | Rendered strings transcribed from `phase4b-pulsegrid-login.png`: `pulsegrid / INTELLIGENCE PLATFORM / ACCESS ID / user@pulsegrid.fm / PASSPHRASE / Forgot Password? / INITIALIZE SESSION / RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED. / Authorized personnel only.` — exact | **CLOSED** |
| **B2 Brand mark unspecified** | L764 ACCEPTED | see Patch 2 | **CLOSED** |
| **B3 4-KPI crypto-admin template** | L765 ACCEPTED + correction | see Patch 4; KPI values white (`global.css:22`), left rules `StatCard.module.css:6-13`; `StatCard.jsx` has no `<i`, `<svg`, `<a`, `onClick`; `.module.css` no `:hover/transform/box-shadow`. `[judge]` line remains live-only | **CLOSED** (static) |
| M1 login geometry | L766 | see Patch 3 | CLOSED |
| M2 chrome copy scattered | L767 | copy.js:13 subtitle, :18 `INITIALIZING NEURAL LINK...`, :21 `Failed to connect to Neural Link` | CLOSED |
| M3 slice layout | L768 | `align-items:start`, `min-height: var(--kpi-height-min)` (`StatCard.module.css:4`), empty canvas | CLOSED |
| M4 / M7 AI surfaces | L769 / L772 | 4C | N/A |
| M5 error surface | L770 | see Patch 7 | CLOSED |
| M6 radius deviation | L771 | see Patch 6 | CLOSED |
| N1 KPI sub font | L773 "4B renders none" | `StatCard.jsx:4` takes `label, value` only | CLOSED |
| N2 emoji | L774 | emoji grep → 0 | CLOSED |
| N3 undefined legacy vars | L775 | `pulsemark.module.css:17` ear bg `var(--color-bg)` | CLOSED |
| N4 nav radius | L776 | `Sidebar.module.css:32` `var(--radius-control)` | CLOSED |
| N5 seeded passwords | L777 REJECTED | creds in `web/README.md:21,65,68` only; none in `web/src` | CLOSED |

Verdict: §22 reconciles every audit item with a quoted resolution; the 4B code satisfies every 4B-scope item. No OPEN rows.

### B2. Token fidelity — `tokens.css` vs contract §1 + arch §13.9 + arch §14.4

Method: extracted the three fenced `css` blocks programmatically (contract L34–139; arch L1043–1061; arch L1237–1270), concatenated with single blank lines, `difflib` against `web/src/styles/tokens.css`.

- Result: **byte-identical** (155 lines, trailing newline included; each block also matches standalone). §15 L481 `[diff]` box passes; "nothing else in the file" holds.
- `brand/themes/pulsegrid-console.css` = arch L1294–1295 verbatim.
- `brand/themes/example-records-magenta.css` drift (declared deviation #1): line 2 `body[data-theme="example-records-magenta"]` → `:root[data-theme="example-records-magenta"]`. Four tokens unchanged. See F-03 for the residue.

### B3. Brand-leak greps over generic code (all of `web/src` except `brand/**`, plus `index.html`, `public/`, `package.json`, `.env.*`)

| Grep | Hits | Classification |
|---|---|---|
| `-iE "pulsegrid\|lumenveil\|novakin"` | `tokens.css:11` `/* pulsegrid neon… */`, `:50` `…the legacy mark loader */`, `:114` `/* PulseMark in the sidebar… */`, `:128` `Reference values = pulsegrid-console…` | Allowed exception — these lines are inside the byte-for-byte-mandated blocks (B2). But §15 L497 says "→ no results": spec self-contradiction → **F-11** |
| same grep on `web/src/brand` `--exclude-dir=profiles --exclude-dir=themes` | `registry.js:1,3,4,5,9,11,15` only | Allowed (composition root, §14.3 step 2, §15 L497) |
| brand strings outside `brand/profiles/pulsegrid/` (`INTELLIGENCE PLATFORM`, `pulsegrid Intelligence Platform`, `pulsegrid.fm`) | `tokens.css:74` `/* "INTELLIGENCE PLATFORM" wordmark sublabel */` | Same verbatim-comment exception (§15 L494 as written fails) → **F-11** |
| `@pulsegrid.fm\|@novakin.band` over all `web/src` (§15 L498) | `brand/profiles/pulsegrid/profile.js:12` `support: 'admin@pulsegrid.fm'`, `:13` `fromAddress: 'notify@pulsegrid.fm'` | Allowed: values mandated verbatim by arch §14.2 L1158–1159. Gate L498 is not scoped to exclude `brand/` → **F-11**. Not seed credentials, not a prefilled login |
| `art_[a-z0-9]+` | 0 | clean |
| raw `#hex` / `rgb(` / `hsl(` in `*.jsx`, `*.js`, `*.css` outside `tokens.css`, `global.css`, `brand/themes/`, `brand/profiles/` | 0 | clean (`public/brands/*/favicon.svg` hold literals — static assets, §16 #13 allows) |
| blue/indigo/violet hex list (contract §4) over `web/` incl. `dist/` | 0 | clean |
| `from …brand/profiles` / `…brand/themes` | `brand/registry.js:1-6` only | clean (§19 L715) |
| `'$'`, `"$"`, `en-US`, `en-GB`, `USD`, `GBP`, `timeZone`, `toLocaleString`, `Intl.NumberFormat` outside `brand/` | `utils/format.js:4,11` (`Intl.NumberFormat(locale.numberLocale…)`) | clean — the single permitted site (§15 L562) |
| `localhost`, `http://`, `:3000`, `:5173` in `web/src` + `index.html` | `index.html:6-8` Google Fonts preconnect/stylesheet; `brand/profiles/pulsegrid/profile.js:11` `website`; `PulseMark.jsx:3` `xmlns` | Fonts links are mandated by §16 #3; profile URL is §14.2 data; xmlns is SVG. `.env.*` hold `http://localhost:3000` per §8 (allowed; not in `src`) |
| `ri-*` classes | `nav.js:4-15` (8 nav icons per arch §5), `Sidebar.jsx:50` `ri-logout-box-line`, `Header.jsx:21` `ri-menu-line`, `ErrorState.jsx:10` `ri-error-warning-line` | No Remixicon used as a logo. `nav.js:6` `ri-headphone-line` is the arch §5 A&R icon but trips §15 L508 (`grep ri-headphone web/src/layout → no results`) → **F-11** |
| `linear-gradient\|radial-gradient` in `*.jsx`/`*.module.css`/`*.js` | 0 | clean |
| `--green-` outside `tokens.css` | 0 | clean |
| `data-theme` | `tokens.css:126` (verbatim comment), `brand/themes/*.css:2`, `brand/BrandContext.jsx:15-16` | clean per §15 L487 (tokens.css comment is the verbatim block) |
| `localStorage` keys | `authToken`, `userData` (`AuthContext.jsx:9-10,22-23,36,50-51`), `platform.brandProfile` (`brand/index.js:10`, DEV-gated) | ⊆ §15 L561 set |

4B claim "the only exception is tokens.css comments" — **confirmed** for generic source. Two further nuances the 4B handoff did not state: `INTELLIGENCE PLATFORM` at `tokens.css:74` is also a *brand* string hit (same class of exception), and §15 L498's `@pulsegrid.fm` grep as written hits `profile.js` (inside `brand/`, spec-mandated).

### B4. Copy canon — expected (arch §13.1 / contract) → rendered

| Expected | Source key | Where rendered | Actual | OK |
|---|---|---|---|---|
| `ACCESS ID` | `copy.js:2` | `LoginPage.jsx:37` `{text.accessIdLabel}` | verbatim | ✓ |
| `PASSPHRASE` | `copy.js:3` | `LoginPage.jsx:42` | verbatim | ✓ |
| placeholder `user@${domain}` | `profile.domain` | `LoginPage.jsx:38` | `user@pulsegrid.fm` | ✓ |
| placeholder `••••••••` | §13.1 L631 | `LoginPage.jsx:45` **inlined literal** | verbatim but not via copy.js | ✗ **F-07** |
| `Forgot Password?` | `copy.js:4` | `LoginPage.jsx:43` (disabled `<button>`) | verbatim | ✓ (stub declared) |
| `INITIALIZE SESSION` / `AUTHENTICATING...` | `copy.js:5-6` | `LoginPage.jsx:47` `{loading ? text.submitBusy : text.submit}` | verbatim | ✓ |
| `RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.` / `Authorized personnel only.` | `copy.js:7-8` | `LoginPage.jsx:49-50` | verbatim | ✓ |
| `Login failed` fallback | `copy.js:9` | `LoginPage.jsx:35` | verbatim | ✓ |
| wordmark `pulsegrid` (lowercase) / `INTELLIGENCE PLATFORM` | `profile.displayName/tagline` | `LoginPage.jsx:32-33`, `Sidebar.jsx:39-40` | verbatim; login sublabel muted (`LoginPage.module.css:12`), sidebar sublabel `.label--accent` (`Sidebar.jsx:40`) | ✓ |
| nav `Dashboard · Artists · A&R Room · Intelligence · Marketing · Fans · Operations · Admin · Settings` | `copy.js:24-34` via `nav.js` | `Sidebar.jsx:16` `text.nav[item.id]` | verbatim, order per arch §5 | ✓ |
| `Terminate Session` | `copy.js:10` | `Sidebar.jsx:51` | verbatim | ✓ |
| page title = nav label; subtitle `Real-time label performance metrics` | `copy.js:13` | `Header.jsx:24-25` | verbatim, dashboard only | ✓ |
| `MONTHLY REVENUE · QUARTERLY PROJECTION · ANNUAL PROJECTION · ACTIVE ARTISTS` | `copy.js:14-17` | `DashboardPage.jsx:25-28` | verbatim | ✓ |
| `CONNECTION FAILURE` / `RETRY CONNECTION` / `Failed to connect to Neural Link` / `ERR` / `ACCESS DENIED` | `copy.js:19-23` | `ErrorState.jsx:7,12,13` | verbatim | ✓ |
| `INITIALIZING NEURAL LINK...` (optional) | `copy.js:18` | not rendered (`LoadingScreen.jsx:5`) | allowed ("optional") | ✓ |
| forbidden `Email/Password/Sign in/Log in/Sign out/Continue/Welcome/Assistant/…` (§13.1 exact grep) | — | — | 0 hits | ✓ |
| 4C keys (`COMMAND CONSOLE`, `// System ready.`, forgot/reset, settings›AI, `platformName`) | §13.1 L638–639, L660–674 | absent from `copy.js` | §16 #7 says "§13.1 verbatim" | **F-09** |
| Strings not in canon: `'Open navigation'`, `'Close navigation'` (`copy.js:11-12`), `aria-label="Loading"` (`LoadingScreen.jsx:5`, `RingLoader.jsx:4`, `PulseMarkLoader.jsx:4`), `aria-label="Secondary"` (`Sidebar.jsx:47`) | — | aria only | invented | **F-08** |

Every platform-voice literal greps to `copy.js` **only** (`grep -rlF` per string → `web/src/copy.js`), satisfying §15 L490.

### B5. File manifest

- `find web -type f -not -path '*/node_modules/*' -not -path '*/dist/*'` → **66 files**, identical set to `PHASE_4B_HANDOFF.md` L12–77. ✓
- §16 rows 1–33: every listed file exists at the listed path with the listed responsibility (checked file by file; `Panel.jsx` has no `.module.css` — it only applies the global `.panel`, fine; `defaults/` share one `defaults.module.css`, fine).
- Extra files not in §16: `web/.env.production` (sanctioned by §8 L230), `web/package-lock.json` (expected), `web/validation/*.png` ×5 (evidence captures inside the app folder — N-15). Missing: none. Misplaced: none.
- Root `.gitignore` covers `node_modules/` and `dist/` at any depth, so `web/node_modules`, `web/dist` are ignored; no `web/.gitignore` needed.

### B6. §19 MUST-NOT compliance

| §19 rule (L) | Evidence | Status |
|---|---|---|
| L696 touch `src/`, `server.js`, … | `git status --short` shows only `??` entries; no `M` | ✓ |
| L697 invent/fix backend routes; L698 send provider/model; L699 merge A&R | no such code | ✓ |
| L700 TypeScript / state lib / CSS framework / toast / AI SDK | `package.json:11-19`: react, react-dom, react-router-dom, remixicon; vite, plugin-react | ✓ (remixicon → N-01) |
| L701 vendor names, `localhost:3000`, raw colors in components | greps B3 → 0 in `src` | ✓ |
| L702 day/red mode, time-based theme | `prefers-color-scheme\|Switch to` → 0 | ✓ |
| L703 legacy HTML edits | untracked-only status | ✓ |
| L704 new backend coupling | none | ✓ |
| L705 skip §15 gate | README carries gate verbatim (84 `[ ]` = handoff 84); execution → live agent | — |
| L706 inline identity string; render `Email/Password/Sign in/Welcome/Assistant` | forbidden grep 0; **`••••••••` inlined** `LoginPage.jsx:45` | ✗ minor **F-07** |
| L707 Remixicon/text/image for `PulseMark` | `Sidebar.jsx:36-37` `<BrandMark/>` | ✓ |
| L708 legacy KPI subs / `TOTAL STREAMS` / `AVG ROI` / NaN | grep 0; `format.js:12-16` renders `—` for non-finite | ✓ |
| L709 anything on `/dashboard` beyond KPI row | `DashboardPage.jsx:22-31` | ✓ (error panel on refetch failure is §13.6-specified — N-11) |
| L710 copy radius/width/padding/color from HTML | all via tokens; **invented `height: 42px`** `LoginPage.module.css:16` (not copied from HTML, but not in spec either) | ✗ minor **F-05** |
| L711 picker in console / chat UI | no AI surface | ✓ |
| L712 edit contract / audit docs | unverifiable by git (untracked); mtimes 06:57/07:14 predate `web/` (22:19) | ✓ (process gap **F-13**) |
| L713 commit | HEAD unchanged | ✓ |
| L714 "pulsegrid"/"legacy"/artist/`art_*`/`@pulsegrid.fm`/`pulsegrid.*` key outside `brand/` incl. comments | only verbatim `tokens.css` comments | ✓ (spec contradiction **F-11**) |
| L715 import from `brand/profiles/*` outside registry | `registry.js` only | ✓ |
| L716 hardcode `$`, `en-US`, currency, tz | 0 outside `format.js`/profiles | ✓ |
| L717 runtime brand switcher / tenant machinery | `brand/index.js:8-14` DEV-only localStorage hook; no UI | ✓ |
| L718 redesign around example-records / ship as default | `registry.js:9` `defaultSlug: 'pulsegrid'`; `.env.*` `pulsegrid` | ✓ |
| L719 theme overrides locked token | `example-records-magenta.css:3-6` four `--color-brand-*` only | ✓ |
| L720–722 backend hardcodings / genericize / substitute data | `profile.js:4-20` = arch §14.2 values verbatim; example-records fixture only | ✓ |

Endpoints: `endpoints.js:4,8,12` — exactly `/v3/auth/login`, `/v3/auth/me`, `/v3/label/overview`; single `fetch(` at `client.js:10`. ✓

### B7. Permissions / nav vs backend

Frontend (`web/src/auth/permissions.js`):
```
5  export function effectivePageAccess(user) {
6    if (Array.isArray(user?.pageAccess)) return user.pageAccess;
7    if (isAdmin(user)) return ['all'];
10   if (user?.role === 'artist') return ['overview', 'roster'];
11   if (user?.role === 'viewer') return ['overview'];
12   return [];
```
Backend:
- `src/models/index.js:50` `pageAccess: { type: DataTypes.STRING, defaultValue: '["overview"]' }`; seeds `:98-100` admin `role:'admin' … pageAccess: JSON.stringify(['all'])`, `:103-105` `tours@novakin.band … role:'artist' … pageAccess: JSON.stringify(['overview','roster'])`.
- `src/routes/auth.js:78` `const parsedPageAccess = JSON.parse(user.pageAccess || '["overview"]');` — **computed and never returned**; login response `:92-101` `user: { id, name, email, role, artistAccess }`; `GET /v3/auth/me` `:183-189` `{ id, email, name, role, artistAccess }`. Only the `ADMIN_EMAIL/ADMIN_PASS` override path `:64-67` returns `pageAccess: ['all']`.
- Legacy `pulsegrid-frontend-connected.html:3458-3460`: `if (user.role==='admin') return true; if (!user || !user.pageAccess) return false;` → legacy showed **no** primary nav to any non-admin (pre-existing bug the 4A "verified" §10/§15 L464 missed).

Result: the fallback table matches the two seeded accounts and the model default exactly; the observable §15 L464 outcome (artist sees Dashboard + Artists) is achieved. But the mechanism is a role→permission map that does not exist in the backend (pageAccess is per-user, role-independent), so any admin-granted custom `pageAccess` is invisible until the backend returns the field. → **F-02**.

### B8. The five declared deviations + undeclared ones

| # | 4B claim (PHASE_4B_HANDOFF.md) | Real? | Minimal? | Correctly described? |
|---|---|---|---|---|
| 1 | L117 theme selector `:root[data-theme]`; sets theme on root and body | **Yes.** Custom properties resolve `var()` where declared: `--color-accent: var(--color-brand-primary)` is computed on `:root` (`tokens.css:141`) and inherited as a value, so a `body[data-theme]` override of `--color-brand-primary` (arch §14.4 L1280, L1301) can never reach it. 4A spec defect. | Yes (`BrandContext.jsx:15-16`, theme file line 2) | Yes. Residue: `pulsegrid-console.css:2` still `body[…]`; `tokens.css:126` comment and arch §14.4/§15 L558,573 still say `body` → **F-03** |
| 2 | L118 brand block `min-height`; tagline wraps at 224px/11px mono | **Yes** — `phase4b-pulsegrid-dashboard.png` shows `INTELLIGENCE` / `PLATFORM` on two lines; arithmetic: 192px content − 40 mark − 12 gap = 140px vs 21 chars × (11×0.6 + 0.12×11) ≈ 166px | Yes (`Sidebar.module.css:17`) | Yes; needs a spec decision → **F-04** |
| 3 | L119 auth payload lacks `pageAccess`; role fallback | **Yes** (B7) | Debatable — fallback encodes fixture semantics in platform code | Mostly; omits that legacy hid all non-admin nav (so 4B changes legacy behaviour, for the better) and that the root cause is a 4A verification miss → **F-02** |
| 4 | L120 forgot/reset stub, `Forgot Password?` disabled | Yes (`LoginPage.jsx:43` `disabled`) | Yes | Yes; §15 item 5 L438 allows "stubbed to 4C" |
| 5 | L121 two moderate react-router advisories | Not verifiable statically (no `npm audit` run); lock pins `react-router-dom 6.30.6` (`package-lock.json`) | — | Plausible; out of static scope |

Undeclared deviations from §13/§14/§15/contract: F-01 (loader pulse), F-05 (42px input), F-06 (`title` tooltips ≥1280), F-07 (`••••••••` inline), F-08 (invented aria strings), F-09 (copy.js incomplete vs §13.1), F-10 (`/me` 404 → logout). NOISE-grade: N-01…N-08.

### B9. Code-quality sweep

- **Bug — F-01**: `defaults.module.css:19` `.ring { animation: pulse 2s infinite }`, `pulsemark.module.css:7` `.head { animation: pulse 2s infinite }`; `@keyframes pulse` lives only in the non-module `global.css:34`. CSS Modules localize animation names → built CSS `web/dist/assets/index-DdkdhJRQ.css` contains `._head_16n6j_1{…animation:_pulse_16n6j_1 2s infinite}` and `._ring_1pzk3_13{…animation:_pulse_1pzk3_1 2s infinite}` while the only keyframes defined are `pulse, scanline, blink, fadeIn` (0 `@keyframes _pulse*`). Neither loader animates.
- Dead / unused: `AuthContext.jsx:19,25,53` `status` state exported, never read (N-09); `copy.js:12` `closeNavigation` unused (F-08); `DashboardPage.jsx:20` `if (!data) return <LoadingScreen/>` unreachable (`readJson` always yields an object) (N-10); `useApiMutation.reset` unused (hook API, fine); `Sidebar.jsx:16` `text.nav[item.id] || item.label` — fallback is already `platformCopy.nav[id]` (N-12); `auth/useAuth.js:1` re-exports what `AuthContext.jsx:64` already exports (N-13).
- Error paths: `LoginPage.jsx:23` `catch {}` — intentional, hook holds the error, in-card `ErrorState` renders it ✓; `AuthContext.jsx:39-43` swallows non-auth `/me` failures silently by design (comment) ✓; `brand/index.js:12` storage catch ✓; `AuthContext.jsx:41` also logs out on **404** — beyond §9 L241 "401/403 → logout" → F-10.
- Keys: `Sidebar.jsx:18` `<li key={item.id}>` ✓; StatCards static ✓.
- Effects: `AuthContext.jsx:28` cleanup via returned unregister ✓; `:44` abort ✓; `useApiQuery.js:16` abort ✓; `useApiMutation.js:7` abort on unmount ✓; `BrandContext.jsx:13` layout effect sets document props, no cleanup needed ✓. StrictMode double-invoke handled by `AbortError` filters ✓.
- Token in `localStorage` (`AuthContext.jsx:9,50`) — **accepted by spec**: 4A §9 L240 "`localStorage['authToken']`, `localStorage['userData']` (legacy keys)".
- `/me` merge `{...session.user, ...canonicalUser}` (`AuthContext.jsx:35`) is correct for the flat payload at `auth.js:183-189` ✓.
- `client.js:19` calls `onUnauthorized()` on **any** 401 including a wrong-password login → `logout()` runs on an already-anonymous session (harmless; same shape as 4A §7 L216) (N-14).
- Formatting logic verified offline with Node 22 ICU: en-US/USD → `$3.2M $134.8M $539.1M $0`; en-GB/GBP → `£3.2m £134.8m £539.1m`; integer `29` — matches 4B's reported values and arch §13.5.4/§14.7.

---

## Findings register

### MAJOR

**F-01 — Brand loader never pulses (CSS Modules localized `animation: pulse`).** Evidence: `web/src/brand/defaults/defaults.module.css:19` `animation: pulse 2s infinite;`, `web/src/brand/profiles/pulsegrid/pulsemark.module.css:7` same; `web/src/styles/global.css:34` `@keyframes pulse {…}` (global); build `web/dist/assets/index-DdkdhJRQ.css`: `animation:_pulse_16n6j_1 2s infinite`, `animation:_pulse_1pzk3_1 2s infinite`, `@keyframes` present = `pulse, scanline, blink, fadeIn` only. Breaks contract §3.17 L299 "pulsing legacy mark loader … `pulse 2s infinite`", arch §13.2 item 1 L705, §14.6 L1339, and the mechanical §15 L510 `[measure] … (80px ring + 2 ears, pulse)` and L574 (RingLoader "pulse"). 4B handoff L109 lists "loader" among verified items — a still screenshot cannot show this. **4B-fixable.**

**F-02 — `pageAccess` never reaches the client; §15 L464 gate rests on a hardcoded role→permission table in platform code.** Evidence: `src/routes/auth.js:78` parses `pageAccess` and drops it; `:92-101` and `:183-189` omit it; `web/src/auth/permissions.js:8-12` "These role defaults match the seeded accounts…"; 4A §10 L247-264 and §15 L464 assume the field is present ("seeded pageAccess overview+roster"); legacy `pulsegrid-frontend-connected.html:3459` hid all non-admin nav. Consequences: custom grants via `POST/PUT /v3/users` (`src/routes/users.js:102,122,155,173`) are invisible; the 4C Admin › Team permission checkboxes (arch §5 L326-328) will appear to do nothing; platform code now carries fixture-derived defaults (`'artist' → ['overview','roster']`) that the backend does not define. Declared by 4B (#3) — the finding is that the *decision* is open, not that 4B hid it. **Needs product/backend decision** (see D).

### MINOR

**F-03 — Theme-selector fix leaves spec and template inconsistent.** `web/src/brand/themes/pulsegrid-console.css:2` `body[data-theme="pulsegrid-console"] {}` vs `example-records-magenta.css:2` `:root[data-theme=…]`; `tokens.css:126` (verbatim) and arch §14.4 L1240, L1280, L1295, L1301, §15 L558/L573 still specify `body[data-theme]`, which cannot override `:root`-declared aliases (B8 #1). A 4C theme author copying the reference template reproduces the broken selector. **Spec fix + 1-line 4B fix.**

**F-04 — Sidebar tagline wraps at the specified geometry** (declared #2). `Sidebar.module.css:17` `min-height`; `:22` `letter-spacing: var(--tracking-wide)`; arch §13.5.2 L858 chose 11px over legacy 10px (L3446). Screenshot shows two lines. **Spec decision**: 10px per legacy, `--tracking-label`, or accept the wrap and amend §13.5.2/§15 L509.

**F-05 — Invented input dimension.** `LoginPage.module.css:16` `height: 42px; padding: 0 var(--space-3)` vs arch §13.3 L757 "input: 100% wide, 12px pad, 14px --font-mono" (legacy L3087 `padding: '12px'`). §15 L597-600: inventing "a color, size, radius…" is a FAIL — 42px appears in no spec. **4B-fixable.**

**F-06 — Native `title` tooltips at all widths.** `Sidebar.jsx:19` `title={label}` on every NavLink, `:35` `title={profile.shortName}`, `:49` `title={text.logout}`; arch §13.5.2 L859 "no tooltip at ≥1280", L862 rail: "`title` attribute as tooltip", §14.2 L1153 `shortName` "rail tooltip (4B)". **4B-fixable** (set `title` only when the rail media query matches, or drop for 4B since the rail is not gated).

**F-07 — `••••••••` placeholder inlined.** `LoginPage.jsx:45` `placeholder="••••••••"`; it is a §13.1 canon value (L631) and §19 L706 forbids inlining "anything in architecture §13.1". Zero identity weight, but the rule is mechanical. **4B-fixable** (one key in `copy.js`).

**F-08 — Invented strings outside the canon.** `copy.js:11-12` `openNavigation: 'Open navigation'`, `closeNavigation: 'Close navigation'` (unused); `aria-label="Loading"` at `LoadingScreen.jsx:5`, `defaults/RingLoader.jsx:4`, `profiles/pulsegrid/PulseMarkLoader.jsx:4`; `Sidebar.jsx:47` `aria-label="Secondary"`. All a11y-motivated and invisible, but §13.7 L997 "new strings need review" and §15 L597-600 require reporting, and the 4B handoff does not. **Spec fix** (add an `A11Y` block to §13.1) + drop the unused key.

**F-09 — `copy.js` is not "§13.1 verbatim".** §16 #7 L616: "platform voice, architecture §13.1 verbatim"; `copy.js` omits forgot/reset (L638-639), `COMMAND CONSOLE`/idle/busy/placeholder/`queryFailed`/chip (L660-667), Settings›AI (L669-674), `platformName` (L647). Defensible as YAGNI, but it is a deviation from the file's stated responsibility and the natural place 4C will look. **4B-fixable** or explicitly deferred in the 4B handoff.

**F-10 — `/me` 404 logs the user out.** `AuthContext.jsx:41` `if (error.status === 401 || error.status === 403 || error.status === 404) logout();` vs 4A §9 L241 / arch §6 L340 "401/403 → logout". Justified by `auth.js:179-181` (deleted user with valid JWT → 404), but the `ADMIN_EMAIL/ADMIN_PASS` override token (`auth.js:63`) carries no `id` claim → `User.findByPk(undefined)` → 404 → the override login is immediately terminated. **Needs decision**: keep and document in §9, or treat 404 as "keep local session".

**F-11 — Three §15 mechanical greps contradict other 4A rules and cannot pass as written.** (a) L497 `grep -rniE "pulsegrid|lumenveil|novakin" web/src --exclude-dir=brand → no results` vs the byte-for-byte blocks (L481) that contain `pulsegrid`/`legacy mark`/`PulseMark`/`pulsegrid-console` at `tokens.css:11,50,114,128`; L494 likewise vs `tokens.css:74` `"INTELLIGENCE PLATFORM"`. (b) L508 `grep -rn "ri-headphone…" web/src/layout → no results` vs arch §5 L311 `icon:'ri-headphone-line'` for A&R Room, which lives in `layout/nav.js:6`. (c) L498 `grep -rn "@pulsegrid.fm\|@novakin.band" web/src → no results` vs arch §14.2 L1158-1159 `admin@pulsegrid.fm`, `notify@pulsegrid.fm` in `profile.js:12-13`. 4B noticed (a) and (b) (handoff L112) and re-scoped them unilaterally; the gate text itself must change. **Spec fix.**

**F-12 — Stale 4A expected values for the artist role.** §15 L465 "(snapshot: $0 · $0 · $0 · 0)" and §18 L687 "returns all zeros in the frozen snapshot"; `tests/snapshots/baseline.json` `label_overview_artist_role` = zeros (mtime 04:26) but `tests/snapshots/.live.json` (23:02 today) = `activeArtists 1, monthlyRevenue 8464217, quarterlyProjection 25392651, annualProjection 101570604`; 4B reported the live values (handoff L102). The backend snapshot baseline is therefore stale relative to the Phase-3 `hasArtistAccess` behaviour — pre-existing, backend-owned, but §17 L662 "`npm test` … still pass" is now doubtful. **Spec/doc fix + backend re-baseline decision** (not 4B).

**F-13 — Phase 4A documents are untracked, so "no 4A doc was edited" is unverifiable by `git diff`.** `git status`: `?? FRONTEND_ARCHITECTURE.md`, `?? PULSEGRID_VISUAL_DESIGN_CONTRACT.md`, `?? PHASE_4A_DESIGN_AUDIT.md`, `?? PHASE_4A_HANDOFF.md`, …; §19 L712 forbids editing two of them. mtimes (06:57, 07:14, 19:44, 20:43) predate `web/` (22:19) and are consistent with the claim. **Process**: commit the 4A docs before 4C starts so 4C's own "untouched" claim is diffable.

### NOISE — why each dies

- **N-01** `remixicon` npm dependency (`package.json:15`) not in §16 #1's dep list — disclosed in 4B handoff L82; icon font, not a framework; all 12 classes exist in `remixicon@4.6` CSS. Dies: sanctioned icon set, offline-friendly.
- **N-02** No `AiProvider` no-op in `main.jsx` — §16 #32 says "may be a no-op shell". Dies: optional.
- **N-03** `Button.module.css:14` primary has `border: 1px solid var(--color-accent)` (spec §3.14 "none"). Dies: same colour as fill, `border-box`, invisible.
- **N-04** `Button.module.css:20` danger hover uses `--color-danger-border` (.30) vs spec ".2". Dies: no 0.2 danger token exists; nearest token used; unmeasurable difference.
- **N-05** `global.css:38` reduced-motion zeroes all animations/transitions vs contract §2 L187 per-class list. Dies: strictly stronger, a11y-positive.
- **N-06** Scrollbar thumb `var(--color-text-faint)` (#444) vs contract §2 L185 comment `#333`. Dies: token discipline over a comment; 1-shade difference.
- **N-07** `required` on both inputs (`LoginPage.jsx:38,45`) → browser-native bubbles not in §13.5.5. Dies: browser chrome; legacy also had `type="email"` (L3082) so the `@` bubble pre-exists.
- **N-08** `web/validation/*.png` inside the app tree. Dies: not shipped (not under `src/`/`public/`); location preference only — suggest `docs/` if committed.
- **N-09** `AuthContext.jsx:19,25,53` `status` state never read. Dies: harmless 3 lines.
- **N-10** `DashboardPage.jsx:20` unreachable `LoadingScreen` branch. Dies: defensive.
- **N-11** `DashboardPage.jsx:30` panel `ErrorState` below the KPI row on refetch failure — looks like "something below the row" but is arch §13.6 row 3 verbatim and only reachable if `token` changes mid-session. Dies: specified.
- **N-12** `Sidebar.jsx:16` redundant `|| item.label`. Dies: no behaviour.
- **N-13** `auth/useAuth.js` duplicates `AuthContext.jsx:64` export — §16 #23 lists both files. Dies: spec'd.
- **N-14** Wrong-password 401 invokes `onUnauthorized()` → `logout()` on an anonymous session (`client.js:19`). Dies: identical to 4A §7 L216; no observable effect.
- **N-15** §15 L528 `[judge]` "header contains ONLY … no … menu … button" vs `Header.jsx:20` `ri-menu-line` button. Dies: arch §13.5.8 L949 and §13.7 L982 explicitly allow it; `Header.module.css:8` `display:none`, shown only `≤1023px`.
- **N-16** Google Fonts `<link>`s (`index.html:6-8`) are a third-party call while contract §3.8 removed `ui-avatars.com` for privacy/offline. Dies: §16 #3 mandates "Inter + JetBrains Mono links".
- **N-17** `format.js` exports `createFormatters(locale)` instead of bare `moneyCompact/integer` (§16 #19). Dies: same functions, locale injected by `BrandContext.jsx:10`; `[grep]` L562 still passes.

---

## C. PHASE_4B_HANDOFF.md claims — Confirmed / Rejected / Changed

| Claim (line) | Verdict | Evidence |
|---|---|---|
| L7 "created `web/` (66 files) … modified no existing file" | **Confirmed** (tracked); untracked 4A docs unverifiable by git (F-13) | `find` = 66; `git status` no `M` |
| L82 deps: react, react-dom, react-router-dom, remixicon; dev vite, plugin-react; "no state manager, CSS framework, toast library, or provider SDK" | **Confirmed** | `package.json:11-19` |
| L84 structure follows §16; "no Phase 4C pages…" | **Confirmed** | B5 |
| L88 registry/resolution/`BrandProvider`/fallbacks; "No user-facing label switcher" | **Confirmed** | `registry.js`, `index.js:8-14`, `BrandContext.jsx:13-25`, `BrandMark.jsx:7`, `BrandLoader.jsx:7` |
| L90 "`tokens.css` contains the three required blocks copied byte-for-byte" | **Confirmed** | B2 diff empty |
| L90 "224px sidebar/56px rail, responsive four-column/two-column KPI" | **Confirmed** (CSS) | `Sidebar.module.css:8,46`, `DashboardPage.module.css:1-3` |
| L94 `endpoints.js` defines only the three calls; 401 hook; login/logout key handling; 403 → ACCESS DENIED no retry; network → CONNECTION FAILURE + retry | **Confirmed** (code); live behaviour → live agent | `endpoints.js:4,8,12`; `client.js:19`; `ErrorState.jsx:7,13`; `DashboardPage.jsx:16-19` |
| L96 "login and `/me` payloads omit `pageAccess`" | **Confirmed**; **Changed**: root cause is a 4A verification miss; legacy hid all non-admin nav (L3459) | `auth.js:78,92-101,183-189` |
| L100 four cards from the four fields; `Intl.NumberFormat` from profile locale; em dash for invalid | **Confirmed** | `DashboardPage.jsx:25-28`, `format.js:12-16` |
| L102 "$3.2M, $134.8M, $539.1M, 29" / "£3.2m, £134.8m, £539.1m" / artist "$8.5M, $25.4M, $101.6M, 1"; "4A zero snapshot is stale" | **Confirmed** (offline ICU check + `tests/snapshots/.live.json`) | B9; F-12 |
| L108 "`npm run build` passed" | **Not re-run**; a `dist/` from 23:03 exists and was used as evidence | `web/dist/assets/index-DdkdhJRQ.css` |
| L109 verified "theme/title/favicon/mark/**loader**" | **Rejected in part** — loader renders but does not pulse | F-01 |
| L112 "Brand-leak searches found no … in generic React source. The exception is … `tokens.css` comments" | **Confirmed**; **Changed**: also note `tokens.css:74` `INTELLIGENCE PLATFORM` (same class) and that §15 L498 as written hits `profile.js:12-13` | B3, F-11 |
| L112 "`ri-headphone` gate pattern also matches the prescribed A&R nav icon" | **Confirmed** | `nav.js:6`, arch §5 L311 |
| L117 deviation 1 (theme selector) | **Confirmed** real, minimal, correct; residue F-03 | B8 |
| L118 deviation 2 (brand block min-height; wrap) | **Confirmed** by screenshot | B8, F-04 |
| L119 deviation 3 (pageAccess) | **Confirmed**; elevated to F-02 because the decision is open | B7 |
| L120 deviation 4 (forgot/reset stub) | **Confirmed** | `LoginPage.jsx:43` |
| L121 deviation 5 (react-router advisories) | **Not verified** statically; lock pins 6.30.6 | `package-lock.json` |
| L131 "`git diff --stat` empty … no commit" | **Confirmed** | HEAD `3a95375` |
| (implicit) "no undeclared deviations" | **Changed** — F-01, F-05, F-06, F-07, F-08, F-09, F-10 are undeclared | B8 |

---

## D. Minimum-patch list (only genuinely wrong things)

**4B-fixable (code, `web/` only):**

1. **F-01** — make the loader keyframes reachable from the two CSS modules. Either (a) add to `web/src/styles/global.css` a global utility `.pulse { animation: pulse 2s infinite; }` and apply `className={\`${styles.head} pulse\`}` in `PulseMarkLoader.jsx:4` / `className={\`${styles.ring} pulse\`}` in `RingLoader.jsx:4`, removing the `animation:` lines from `pulsemark.module.css:7` and `defaults.module.css:19`; or (b) declare `@keyframes pulse` inside each of the two `.module.css` files (localized name then matches). Verify in the build: `grep -o 'animation:[^;}]*' dist/assets/*.css` must reference a defined `@keyframes`.
2. **F-03 (code half)** — `web/src/brand/themes/pulsegrid-console.css:2` → `:root[data-theme="pulsegrid-console"] {}` so both theme files use the selector that actually works.
3. **F-05** — `web/src/pages/LoginPage/LoginPage.module.css:16`: replace `height: 42px; padding: 0 var(--space-3);` with `padding: var(--space-3);` (12px, per §13.3 L757).
4. **F-06** — `web/src/layout/Sidebar.jsx:19,35,49`: drop the `title` attributes at ≥1280 (e.g. gate on a `matchMedia('(max-width:1279px)')` state, or omit until the rail is gated).
5. **F-07** — add `passphrasePlaceholder: '••••••••'` to `web/src/copy.js` and use `text.passphrasePlaceholder` at `LoginPage.jsx:45`.
6. **F-08 (code half)** — remove unused `closeNavigation` (`copy.js:12`); move `'Loading'`, `'Open navigation'`, `'Primary'`, `'Secondary'` into `copy.js` under an `a11y` group and read them via `text`.
7. **F-09** — either add the §13.1 4C keys to `copy.js` (forgot/reset, console, settings›AI, `platformName`) or amend the 4B handoff to say `copy.js` carries the 4B subset and 4C appends the rest.

**Needs a spec / product decision (4A docs or backend; not 4B code):**

8. **F-02** — choose one: (a) authorize a bounded backend patch returning `pageAccess` in `src/routes/auth.js` login (`:92-101`, `parsedPageAccess` already exists at `:78`) and `/me` (`:183-189`), then delete `permissions.js:8-12` so platform code carries no role table; or (b) accept the fallback for 4B/4C and amend 4A §10 L247-264, §15 L464 and §18 to state it, plus flag in the 4C plan that Admin › Team permission checkboxes are display-only until (a) lands. Also decide whether legacy's "no nav for non-admins" was ever intended.
9. **F-03 (spec half)** — arch §14.4 L1240, L1280, L1295, L1301 and §15 L558/L573: theme selector is `:root[data-theme="<id>"]`; `BrandProvider` sets both `documentElement` and `body`. The verbatim `tokens.css:126` comment will then lag — either accept it or re-baseline the block text (doc-only, then re-diff).
10. **F-04** — arch §13.5.2 L858: pick tagline 10px (legacy L3446) or `--tracking-label`, or state "may wrap to two lines"; mirror in §15 L509.
11. **F-11** — §15 L494/L497: add `--exclude=tokens.css` (the verbatim blocks); L508: scope to `layout/Sidebar.jsx` (brand block) or exclude `nav.js`; L498: add `--exclude-dir=brand`.
12. **F-12** — §15 L465 and §18 L687: replace the zero snapshot with the live artist values or "as served"; backend owner to re-baseline `tests/snapshots/baseline.json` (`label_overview_artist_role`).
13. **F-10** — 4A §9 L241: either add "404 → logout (deleted user)" and note the admin-override consequence, or have 4B narrow `AuthContext.jsx:41` back to 401/403.
14. **F-13** — commit the six 4A documents (and the 4B handoff) before authorizing 4C.

---

PHASE 4B STATIC VERDICT: FAIL
PHASE 4C SAFE TO BEGIN (static view): NO

Reason in one line: F-01 makes §15 L510/L574 mechanically unpassable (§15 L591 "FAIL if any mechanical box is unchecked") and F-02 leaves the nav-permission model undecided; both are cheap to close (one CSS patch, one decision), after which the static view is a PASS.
