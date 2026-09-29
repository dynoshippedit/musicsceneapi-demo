# BASELINE
Captured: 2026-09-29 ~02:00 UTC (21:48–22:05 EDT 2026-09-28) · commit 63a203c (devteam/review-2026-09-29) · by Build & Release Engineer (BLD)

Source code was READ-ONLY throughout. Setup touched only: /tmp/ms-bld/* (scratch),
node_modules installs (gitignored), and transient runtime files (all gitignored or
reverted — `git status` clean at end; two visual-gate PNGs reverted with
`git checkout --`).

## Environment
| Tool | Version |
|---|---|
| node | v22.23.2 |
| npm | 10.9.8 |
| npx | 10.9.8 |
| OS (Threadripper) | Nobara Linux, 32 cores, 62 GB RAM |
| engines field | node >= 18.0.0 |

## Before any change
| Step | Command | Exit | Result summary | Duration |
|---|---|---|---|---|
| install | `npm ci --dry-run` (root) | 0 | "up to date" — node_modules already in sync with package-lock.json; no reinstall needed | <1 s |
| install (web) | `npm ci --dry-run --prefix web` | 0 | in sync with web/package-lock.json; no reinstall needed | ~2 s |
| test | `npm test` → `node --test --test-force-exit tests/regression/*.test.js` | 1 | **FLAKY — see "Test flakiness" below.** Run A (concurrent w/ another lane's suite): 351 pass / 10 fail. Run B (alone, parallel default): 299 pass / 37 fail / 25 cancelled. Run C (`--test-concurrency=1`, alone): 356 pass / 5 fail. **Every failing file passes in isolation**: durability 1/1, phase2 29/29, snapshot 21/21, authz 22/22, financials 21/21. Code identical to 89e222e (only delta is the devteam/ workspace commit). | 12–92 s |
| verify:hermetic | `npm run verify:hermetic` | 1 | **FAILS out of the box** (BLD-001): `seeded admin login -> 200` got 401 and all seeded-login checks fail. Root cause: `scripts/run-verify-hermetic.js` builds the child env without `DEMO_MODE`, so the throwaway DB boots with zero demo records while `verify_phase2.js` expects seeded logins. Setting DEMO_MODE externally does not help — the script hardcodes the child env. | ~4 s |
| build (web) | `npm --prefix web run build` → `vite build` | 0 | `✓ built in 3.07s`; one chunk-size warning only | 3 s |
| visual gate | `node scripts/run-visual-gate.js --static-only` | 0 | GATE SUMMARY: **70 pass, 0 fail, 70 checks** | ~37 s |
| smoke run | manual boot mirroring `scripts/run-demo.sh` (PORT=4123, DB_STORAGE=/tmp/ms-bld/smoke/smoke.sqlite, DEMO_MODE=true, fake JWT_SECRET, SCHEDULE_JOBS=false) | 0 | `/health` → 200 `{"status":"operational","version":"3.0-production",...}`; `GET /v3/artists` no token → 401; demo login `admin@pulsegrid.fm` → 200; clean shutdown of exact PID 963917 (no SIGKILL needed) | ~9 s |
| dependency audit (root) | `npm audit` | 1 | **2 moderate**: `uuid <11.1.1` (GHSA-w5hq-g745-h8pq, missing buffer bounds check) via `sequelize`; fix = breaking (sequelize@3.30.0) | <5 s |
| dependency audit (web) | `npm audit` (in web/) | 1 | **2 moderate**: `react-router 6.0.0–7.17.0` — open redirect via backslash in `<Link>`/useNavigate (CVE-2025-68470 bypass, GHSA-wrjc-x8rr-h8h6) + arbitrary constructor injection via `deserializeErrors()` in SSR hydration (GHSA-337j-9hxr-rhxg); fix = breaking (react-router-dom@7.18.4) | <5 s |
| secret scan | gitleaks (absent — `which` empty) → B6 patterns via grep over tracked files + `git log -p --all` (6.6 MB) | 0 | **Clean.** No key formats (`sk-…`, `AKIA…`, `gh[pousr]_…`, `xox[baprs]-`, `-----BEGIN … PRIVATE KEY-----`), no hardcoded secret assignments, no `|| 'literal'` secret fallbacks. History: only placeholder values (`JWT_SECRET=<redacted>` in docs/scripts, `Authorization: Bearer <redacted>` in docs). `.env` (repo root, 28 vars) is gitignored and untracked; no `.env` ever committed. | — |
| lint | — | n/a | **none configured** (no lint/typecheck scripts or configs) | — |
| typecheck | — | n/a | none configured | — |

### Test flakiness (root-caused, evidence)
1. **Duplicate fixed test port 32193** — `tests/regression/directsales.test.js:539,560` (srv2, killed via sync `after(() => srv2.child.kill('SIGKILL'))` with no exit-wait) and `tests/regression/financials.test.js:238` (`spawnServer(32193)`). When the stale server still holds the port, the second file's `waitForHealth` passes against the *stale* server and its tests run against the *wrong* DB → assertion failures that look like state leakage (409 vs 201, double-counts, wrong totals). Observed: serial full run → financials 5 subtests failed; financials alone → 21/21 green. (→ BLD-002)
2. **Parallel resource contention** — default `node --test` concurrency on 32 cores spawns ~10 heavy server.js instances simultaneously (each bcrypt-seeds demo data). Observed: 37 fail + 25 cancelled in one clean parallel run; serial run of the same tree: 356/361; per-file isolated runs: all green. (→ BLD-003)

### Notes / deviations
- `npm test` was first run while the sibling TST lane ran the same suite concurrently
  (`/tmp/ms-tst/npm-test-c4.log`, `--test-concurrency=4`) — that run also showed 5
  failures. The two concurrent runners explain Run A's 10 failures.
- `test:all` = `npm test && npm --prefix web run build && npm --prefix web run gate -- --static-only && npm run test:workflows`. `test:workflows` (playwright browser flows) was not run — it needs a live browser/display and is a BLD "quick only if quick" optional.
- Native modules present and working: bcrypt, canvas, sqlite3 (install scripts ran at image build; no rebuild needed).
- `web/validation/*.png` are tracked baseline screenshots; running the visual gate
  regenerated two of them — reverted (`git checkout --`) so the tree is clean.
- Playwright is a web devDependency (1.63.0); browser binaries were not verified
  (not needed for the static-only gate, which passed).

## After (Phase 6) — same commands, compared with "Before"
| Step | Before | After | Change |
|---|---|---|---|
| (pending Phase 6) | | | |
