
<!-- C12 findings ledger — Build & Release Engineer (BLD), Phase 1/3. -->
<!-- One entry per problem: ID · title · severity · confidence · location · -->
<!-- evidence (quoted) · what's wrong · impact · suggested fix.              -->
<!-- Statuses follow the Playbook B7 lifecycle. The Tech Lead merges these    -->
<!-- into devteam/ISSUES.md.                                                 -->
# Findings — BLD (Build & Release Engineer)

| ID | Sev | Conf | Status | Title | Location |
|---|---|---|---|---|---|
| BLD-001 | S2 | Confirmed | NEW | `npm run verify:hermetic` fails out of the box — child env omits DEMO_MODE | scripts/run-verify-hermetic.js:60-82 |
| BLD-002 | S2 | Confirmed | NEW | Duplicate fixed test port 32193 in directsales + financials suites — cross-file server squatting | tests/regression/directsales.test.js:539,560; tests/regression/financials.test.js:238 |
| BLD-003 | S2 | Confirmed | NEW | Full `npm test` (default parallel) is load-flaky: 37 fail + 25 cancelled in one clean run | tests/regression/* (harness) |
| BLD-004 | S3 | Confirmed | NEW | `googleapis` declared but never imported (heavy unused dep) | package.json:23 |
| BLD-005 | S3 | Confirmed | NEW | `pdfkit` and root `chart.js` declared but never directly required | package.json:24,26 |
| BLD-006 | S3 | Confirmed | NEW | Stale "Preserved" audit comments claim CORS origin:true and err.message leaks are still present — both were fixed in Phase 3 | src/middleware/index.js:11-15; production-api.js:64-67 |
| BLD-007 | S3 | Confirmed | NEW | RESET_LINK_BASE (password-reset link host) read but missing from .env.example | src/config/index.js:139 |
| BLD-008 | S3 | Confirmed | NEW | `.env.prod.template` is stale: documents SESSION_SECRET + OPENAI_API_KEY (never read), omits DEMO_MODE/ALLOWED_ORIGINS/Stripe vars | .env.prod.template |
| BLD-009 | S4 | Confirmed | NEW | ~25 legacy provider env vars documented in .env.example but never read by code | .env.example |
| BLD-010 | S4 | Confirmed | NEW | No CI configuration (no .github/workflows) — no automated install/test/build gate | (repo root) |
| BLD-011 | S4 | Confirmed | NEW | web/.env.production ships empty VITE_API_BASE_URL → prod build makes same-origin API calls | web/.env.production:1; web/src/api/client.js:1 |
| BLD-012 | S2 | Confirmed | NEW | Known moderate vulns: uuid via sequelize (GHSA-w5hq-g745-h8pq); react-router via react-router-dom (CVE-2025-68470 bypass, GHSA-337j-9hxr-rhxg) | package.json; web/package.json |

## BLD-001 · `npm run verify:hermetic` fails out of the box
- **Severity:** S2 (broken build/test tooling; part of `test:all`).
- **Confidence:** Confirmed (ran twice; exit 1 both times).
- **Location:** `scripts/run-verify-hermetic.js:60-82`.
- **Evidence:** The script builds the child's env explicitly:
  ```js
  const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      ...
      DB_STORAGE: dbFile,
      ...
      // no DEMO_MODE entry
  };
  ```
  Output:
  ```
  [3] Authentication
    FAIL  seeded admin login -> 200  got 401
  ```
  `tests/support/verify_phase2.js:67-68` expects `admin@pulsegrid.fm`/`admin123`,
  which only exist when DEMO_MODE seeds the throwaway DB. Setting DEMO_MODE in
  the *outer* env does not help — the script never copies it into the child env.
- **What's wrong / impact:** the hermetic verifier can never pass as shipped;
  anyone running the documented `test:all` chain hits a red step unrelated to
  the code under test.
- **Suggested fix:** add `DEMO_MODE: 'true'` to the child env object (the
  verifier's seeded-login checks are demo-mode checks by design).

## BLD-002 · Duplicate fixed test port 32193 across two test files
- **Severity:** S2 (test harness defect producing false failures that look like
  product regressions).
- **Confidence:** Confirmed.
- **Location:** `tests/regression/directsales.test.js:539` (`PORT: '32193'`),
  `:560` (`const base = 'http://127.0.0.1:32193'`); `tests/regression/financials.test.js:238`
  (`srv = await spawnServer(32193)`).
- **Evidence:** directsales' second suite kills its server with a synchronous
  `after(() => { srv2.child.kill('SIGKILL'); })` (line 566) — no exit-wait.
  financials then boots its own server on the same port; if the stale server
  still answers, `waitForHealth` succeeds against the *wrong* server and the
  whole file runs against directsales' DB. Observed in the serial full-suite
  run: financials failed 5 subtests (`409 !== 201`, `200 !== 201`,
  `'0.005' !== '0.003'` — classic wrong-DB/stale-state signatures); run alone
  the same file is 21/21 green.
- **Impact:** order-dependent false failures; masks real regressions.
- **Suggested fix:** give one of the files a different fixed port (or pick a
  free ephemeral port at boot like durability.test.js's TEST_PORT pattern…
  note durability still defaults to fixed 3989 — same latent risk).

## BLD-003 · Full `npm test` is load-flaky under default parallelism
- **Severity:** S2 (the canonical test command is not trustworthy on this machine).
- **Confidence:** Confirmed.
- **Evidence:** Three full runs of the identical tree (code == 89e222e, only the
  devteam/ commit differs):
  - Run 1 (concurrent with sibling lane's suite): 351 pass / 10 fail.
  - Run 2 (alone, default parallel): 299 pass / 37 fail / 25 cancelled
    (`cancelledByParent`, `fetch failed`, `503 !== 200` on bootstrap login).
  - Run 3 (`--test-concurrency=1`): 356 pass / 5 fail — the 5 are BLD-002.
  Every individually failing file passes in isolation
  (durability 1/1, phase2 29/29, snapshot 21/21, authz 22/22, financials 21/21).
- **What's wrong:** ~10 spawned-server suites boot simultaneously; under load,
  children die or answer late and the failures cascade. The 503s come from
  `src/routes/auth.js:133` ("Login is temporarily unavailable") when the admin
  bootstrap's `User.findOne/create` throws under contention.
- **Impact:** a red full-suite run cannot be distinguished from a real
  regression without re-running files in isolation.
- **Suggested fix (needs TST/LEAD sign-off):** fix BLD-002 first; then either
  serialize the spawned-server files (documented `--test-concurrency=1`
  fallback) or give each a unique port + retry-on-EADDRINUSE boot.

## BLD-004 · `googleapis` declared but never imported
- **Severity:** S3 (bloat; heavy dep with no use).
- **Confidence:** Confirmed (`grep -rn 'googleapis'` shows only URL strings in
  `src/oauth/providers.js:134-135`, no `require('googleapis')` anywhere).
- **Location:** `package.json:23` (`"googleapis": "^168.0.0"`).
- **Impact:** installs a very large dependency tree for nothing; widens supply-chain surface.
- **Suggested fix:** remove from dependencies (re-add if/when a real Google API
  client is needed). Note: `npm outdated` shows 168.0.0 → 182.0.0 available —
  moot once removed.

## BLD-005 · `pdfkit` and root `chart.js` declared but never directly required
- **Severity:** S3.
- **Confidence:** Confirmed.
- **Location:** `package.json` (`"pdfkit": "^0.17.2"`, `"chart.js": "^4.5.1"`).
- **Evidence:** `src/reports/monthlyReport.js:33` requires `pdfkit-table`
  (which re-exports/embeds pdfkit); `src/utils/charts.js:14` requires
  `chartjs-node-canvas` (chart.js is its peer). No `require('pdfkit')` or
  `require('chart.js')` in `src/`, `scripts/`, `server.js`.
- **Suggested fix:** drop both direct deps (they stay available transitively);
  or keep with a comment if the pinning is intentional.

## BLD-006 · Stale "Preserved" audit comments misstate fixed security posture
- **Severity:** S3 (misleading docs adjacent to security-sensitive code).
- **Confidence:** Confirmed.
- **Location:** `src/middleware/index.js:11-15` ("Preserved audit findings
  (Phase 2): HIGH-5 cors({ origin: true … }); MED-9 error handler returns
  err.message"), and `production-api.js:64-67` ("PRESERVED (audit MEDIUM-9):
  the error handler returns err.message to the client").
- **Evidence:** Both are contradicted by the current code in the *same files*:
  `src/config/index.js:30-58` (`buildCorsConfig` — allowlist / prod deny) and
  `src/middleware/index.js:108-126` (Phase 3 fix: generic 500 body, details
  logged server-side only).
- **Impact:** a reader (or auditor) trusts the header and believes CORS
  reflection and error-message leaks are still live. (Lead #9 verification:
  CORS and error-leak items are DISMISSED-fixed; this comment is the residue.)
- **Suggested fix:** update the header lists to "Fixed in Phase 3" with the
  same precision as the inline fix comments.

## BLD-007 · RESET_LINK_BASE read but absent from .env.example
- **Severity:** S3 (security-relevant var undocumented in the primary template).
- **Confidence:** Confirmed.
- **Location:** `src/config/index.js:139`
  (`resetLinkBase: process.env.RESET_LINK_BASE || 'http://localhost:5173/reset-password'`);
  `.env.example` has zero occurrences; only `docs/DEPLOY.md:106` documents it.
- **Impact:** an operator wiring up password reset from `.env.example` alone
  ships reset links pointing at `http://localhost:5173` (or never learns the
  knob exists).
- **Suggested fix:** add a commented `RESET_LINK_BASE=` entry to `.env.example`
  mirroring the DEPLOY.md guidance.

## BLD-008 · `.env.prod.template` is stale and misleading
- **Severity:** S3 (misconfig risk for anyone deploying from the template).
- **Confidence:** Confirmed.
- **Location:** `.env.prod.template` (whole file, 464 bytes).
- **Evidence:** documents `SESSION_SECRET` and `OPENAI_API_KEY` — neither is
  read anywhere (`grep` over src/scripts/server/web: zero hits). Omits
  `DEMO_MODE`, `ALLOWED_ORIGINS`, `PROVIDER_SYNC_ENABLED`, `DB_STORAGE`,
  all `STRIPE_*` billing vars, `OAUTH_TOKEN_KEY`, `RESET_LINK_BASE`.
- **Impact:** an operator following it sets secrets nothing reads and misses
  the vars that actually control prod behavior (notably the CORS allowlist).
- **Suggested fix:** regenerate from the env inventory (notes/env-inventory.md).

## BLD-009 · ~25 legacy provider env vars documented but never read
- **Severity:** S4 (info / hygiene).
- **Confidence:** Confirmed.
- **Location:** `.env.example` (Instagram/TikTok/Twitter/YouTube/Ticketmaster/
  Discogs/Genius/Google-KG/Wikipedia-OAuth blocks).
- **Impact:** dead config surface; suggests integrations that don't exist.
- **Suggested fix:** move to a clearly-labeled "reserved / not implemented"
  section or remove.

## BLD-010 · No CI configuration
- **Severity:** S4 (process gap; no automated gate).
- **Confidence:** Confirmed (`ls .github/workflows` → absent).
- **Impact:** install/test/build/visual-gate are only ever run manually; the
  BLD-001/B LD-002 breakages above would be caught by CI.
- **Suggested fix:** add a minimal workflow (npm ci ×2, npm test serial,
  web build, hermetic verify). NEEDS-OWNER per Playbook (CI/CD changes).

## BLD-011 · web/.env.production ships empty VITE_API_BASE_URL
- **Severity:** S4 (deploy-time footgun, low blast radius).
- **Confidence:** Confirmed.
- **Location:** `web/.env.production:1` (`VITE_API_BASE_URL=` empty);
  `web/src/api/client.js:1` falls back to `''` (relative URLs).
- **Impact:** a production frontend built from this file calls the API
  same-origin; works only if API and UI share an origin. Silent, not loud.
- **Suggested fix:** comment the line with guidance (like the VITE_MAP_TILE_URL
  comment below it) instead of shipping it empty.

## BLD-012 · Known moderate vulnerabilities in dependencies
- **Severity:** S2 (known-vulnerable deps; fixes are breaking majors).
- **Confidence:** Confirmed (`npm audit` output, 2026-09-29).
- **Evidence (root):** `uuid <11.1.1` — GHSA-w5hq-g745-h8pq (missing buffer
  bounds check in v3/v5/v6) via `sequelize`; fix = `sequelize@3.30.0`
  (breaking). **Evidence (web):** `react-router 6.0.0–7.17.0` — open redirect
  via backslash in `<Link>`/useNavigate (CVE-2025-68470 bypass,
  GHSA-wrjc-x8rr-h8h6) + arbitrary constructor injection via
  `deserializeErrors()` in SSR hydration (GHSA-337j-9hxr-rhxg); fix =
  `react-router-dom@7.18.4` (breaking). The app is a Vite SPA (no SSR), so the
  hydration vector is likely not exploitable here; the open-redirect one
  applies to client-side `<Link>` usage.
- **Suggested fix:** none during review (major upgrades are NEEDS-OWNER);
  track for the post-review upgrade pass.

## Known-lead dispositions (mine: #9, #10, #12, #16)
- **#9 (CORS/env/error leaks): DISMISSED-fixed.** CORS `origin: true` reflection
  → replaced by `buildCorsConfig()` allowlist (`src/config/index.js:30-58`;
  prod default denies cross-origin). Error handler no longer returns
  `err.message` (`src/middleware/index.js:116-126`, generic 500). Residual
  stale "Preserved" comments logged as BLD-006. (`express.json()` still has no
  explicit size limit — preserved MED-11, out of BLD scope; SEC's call.)
- **#10 (cluster vs in-memory state): DISMISSED-obsolete.** No cluster code
  anywhere (`grep` for cluster/isPrimary: zero hits); `ecosystem.config.js`
  sets `instances: 1, exec_mode: 'fork'`. In-memory state (node-cache, cron,
  SQLite) is single-process by config.
- **#12 (start script/manifests): DISMISSED-fixed.** `main`/`start` → existing
  `server.js`; every npm-script target verified to exist
  (`scripts/run-verify-hermetic.js`, `run-browser-workflows.js`,
  `run-visual-gate.js`, `tests/support/verify_phase2.js`, `probe.js`,
  `web/validation/gate.mjs`).
- **#16 (repo hygiene): DISMISSED-fixed.** `.gitignore` covers `.env`
  (incl. nested), `*.pem`, `*.key`, `*.sqlite`, `logs/`, `node_modules/`;
  repo-root `.env` is untracked+ignored; no `.env` ever committed; secret
  scan of tree and full `git log -p --all` history clean (placeholders only);
  no `web/dist` or minified bundles tracked. `web/validation/*.png`
  baselines are tracked by design.

## Questions / recommended defaults
- Q1: Should `npm test` be run with `--test-concurrency=1` as the documented
  default until BLD-002/BLD-003 are fixed? **Recommended: yes** — record the
  serial result (356/361, 5 known-harness fails) as the honest baseline.
- Q2: Delete `googleapis`/`pdfkit`/root `chart.js` direct deps (BLD-004/005)?
  **Recommended: yes** — they are provably unimported.
- Q3: Add minimal GitHub Actions CI (BLD-010)? **Recommended: yes**, but this
  is NEEDS-OWNER per Playbook B1.

## Blockers
None. All Phase 1 BLD outputs are written; no irreversible or NEEDS-APPROVAL
actions were taken (no commits, no pushes, no dependency changes).
