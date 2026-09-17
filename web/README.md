# Label Intelligence Platform frontend

Phase 4B implements the login, authenticated shell, and one real dashboard KPI row. The legacy HTML applications remain available at the repository root.

## Run

From the repository root, start the existing backend with a development JWT secret of at least 16 characters:

```sh
JWT_SECRET=replace-with-a-long-local-dev-secret npm start
```

In another terminal:

```sh
cd web
npm install
npm run dev
```

The backend base is set in `.env.development` as `VITE_API_BASE_URL=http://localhost:3000` (without `/v3`). The production backend URL should be supplied at build time. Seeded test accounts: `admin@mau5trap.com / admin123` and `tours@rezz.com / rezz123`.

Select the portability test profile with `VITE_BRAND_PROFILE=example-records npm run dev`, or set `localStorage['platform.brandProfile']='example-records'` in development and reload. Remove the key and use the default configuration to restore mau5trap. Example Records changes presentation and display formatting over the current mau5trap backend numbers; the backend's label-specific intelligence, AI, PDFs, and reset email remain mau5trap-specific pending a separate bounded backend phase.

## Verified Phase 4B notes

- The current `/v3/auth/login` and `/v3/auth/me` responses omit `pageAccess`. The frontend uses role defaults for navigation until the backend exposes that field; the backend still authorizes every request.
- The live artist account currently receives one accessible artist and nonzero overview values. The zero-valued artist snapshot cited in the copied Phase 4A gate is stale after the Phase 3 artist-access fix.
- The active theme sets both root and body theme attributes. The four color overrides are scoped on `:root` so semantic aliases declared in `tokens.css` update for the alternate profile.
- `tokens.css` is copied byte-for-byte from the three required source blocks; its existing comments contain the reference label name. The required A&R navigation icon also contains `ri-headphone-line`, so the gate's broad icon grep must be applied to the brand block instead of the entire layout directory.
- `Forgot Password?` remains visible but disabled until its 4C state is implemented. The existing backend reset route is missing.

## Phase 4A acceptance gate (verbatim)

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
