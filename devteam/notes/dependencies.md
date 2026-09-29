# Dependencies — The Music Scene (electronic-label-os v5.0.0)
Captured 2026-09-29 by BLD.

## Manifests
- Root `package.json` (name `electronic-label-os`, 5.0.0, main `server.js`,
  engines `node >= 18.0.0`): 29 deps. All script targets exist: `start` →
  `server.js` ✓, `verify` → `tests/support/verify_phase2.js` ✓,
  `verify:hermetic` → `scripts/run-verify-hermetic.js` ✓,
  `snapshot:baseline` → `tests/support/probe.js` ✓,
  `test:workflows` → `scripts/run-browser-workflows.js` ✓.
- `web/package.json` (`label-intelligence-web`, private, 0.1.0): 7 deps +
  3 devDeps. Scripts `dev`/`build`/`preview`/`gate` all resolve
  (`web/validation/gate.mjs` ✓).
- Lockfiles: `package-lock.json` + `web/package-lock.json` both present and
  **in sync** (`npm ci --dry-run` → "up to date" for both). No drift.

## Unused / missing / duplicate-purpose
| Package | Declared | Imported | Verdict |
|---|---|---|---|
| googleapis ^168.0.0 | root | **never** — only URL strings in `src/oauth/providers.js:134-135` | **Unused, heavy** (~tens of MB). → BLD-004 |
| pdfkit ^0.17.2 | root | **never directly** — code requires `pdfkit-table` (`src/reports/monthlyReport.js:33`); pdfkit arrives transitively | Unused direct dep. → BLD-005 |
| chart.js ^4.5.1 (root) | root | **never directly** — only via `chartjs-node-canvas` peer (`src/utils/charts.js:14`); web has its own chart.js | Unused direct dep / duplicate-purpose. → BLD-005 |
| pg ^8.16.3 | root | never `require`d directly — loaded dynamically by sequelize when `DB_DIALECT=postgres` | Legit (sequelize dialect peer); keep |
| sqlite3 ^6.0.1 | root | never `require`d directly — loaded dynamically by sequelize | Legit (default dialect); keep |
| canvas ^3.2.0 | root | never `require`d directly — peer of `chartjs-node-canvas` (PDF charts) | Legit; keep |
| remixicon (web) | web | `web/src/main.jsx` only | Used; keep |
| — | — | No imported-but-undeclared packages found | No missing deps |

## Outdated majors (noted, not actioned — no major upgrades during review)
- Root: express 4.22.3 → 5.2.1 · dotenv 16.6.1 → 18.0.4 ·
  express-rate-limit 7.5.1 → 8.7.0 · groq-sdk 0.37.0 → 1.6.0 ·
  pdfkit 0.17.2 → 0.20.2 · pdfkit-table 0.1.99 → 0.2.11
- Web: react 18.3.1 → 19.3.0 · react-dom 18.3.1 → 19.3.0 ·
  react-router-dom 6.30.6 → 7.18.4 · vite 6.4.3 → 8.3.1 ·
  @vitejs/plugin-react 4.7.0 → 6.1.1
- Minor/patch drift within range: canvas 3.2.0→3.2.3, compression, cors,
  helmet 8.1.0→8.3.0, node-cron 4.2.1→4.6.0, pg 8.16.3→8.23.0, zod 4.2.1→4.6.5.

## Vulnerabilities (`npm audit`)
- Root: **2 moderate** — `uuid <11.1.1` (GHSA-w5hq-g745-h8pq, missing buffer
  bounds check in v3/v5/v6) via `sequelize`. Fix requires breaking
  `sequelize@3.30.0`. → BLD-012
- Web: **2 moderate** — `react-router 6.0.0–7.17.0`: open redirect via
  backslash in `<Link>`/useNavigate (CVE-2025-68470 bypass, GHSA-wrjc-x8rr-h8h6)
  and arbitrary constructor injection via `deserializeErrors()` in SSR
  hydration (GHSA-337j-9hxr-rhxg). Fix requires breaking
  `react-router-dom@7.18.4`. App is SPA (no SSR) → hydration issue likely not
  exploitable here. → BLD-012

## Native modules & install scripts
- Native: `bcrypt ^6.0.0`, `canvas ^3.2.0`, `sqlite3 ^6.0.1` — all installed
  and functional on the Threadripper (Nobara Linux; tests exercise bcrypt
  hashing and sqlite). System prereqs for a fresh clone: C++ toolchain,
  python3, Cairo/Pango dev libs (canvas). No install failures observed.
- Packages with install scripts: bcrypt, canvas, sqlite3 (native builds).
  No suspicious postinstall behavior reviewed (out of BLD scope; no anomalies
  in install output).
- Frontend build: `vite build` → `✓ built in 3.07s`, no errors.

## License note (quick scan, not legal advice)
- Deps are standard MIT/Apache/BSD/ISC. `stripe` pinned at `22.6.2`
  (exact, no caret). No copyleft (GPL/AGPL) packages spotted in the
  top-level manifests.
