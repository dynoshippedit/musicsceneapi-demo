# Flow note (BUG) — Demo vs customer boot

Branch `devteam/review-2026-09-29`, read 2026-09-29. Source read-only; this note is BUG-lane only.

## Hop chain

1. `scripts/run-demo.sh` sets `DEMO_MODE=true` (plus port/env) and execs `node server.js`.
2. `server.js` (canonical entry, 120 lines):
   - `config.assertSecrets()` FIRST — JWT secret required in every environment
     (CRITICAL-2; no fallback), before any DB work.
   - `api.initializeDatabase()` (`production-api.js`) → `initDB({ demoMode })`
     (`src/models/index.js:225+`).
   - `src/models/index.js:225+`: fictional roster/users/statements are seeded **only**
     `if (demoMode)`; customer boot (`DEMO_MODE` unset/false) seeds schema only —
     no fictional users, artists, or financial rows.
   - `registerJobs({ enabled: process.env.SCHEDULE_JOBS !== 'false' })` — explicit,
     so tests can require the app without timers.
   - `process.on('unhandledRejection')` → log + clean `shutdown()` (`server.js:104-107`);
     `uncaughtException` → same. Deliberate: never serve with corrupted state.
3. Listener banner (`server.js:57-78`): box drawn from `profile.identity.*`;
   then `Default Users:` + `profile.seedUsers.map(s => `- ${s.email} (${s.password}) - ${s.bannerLabel}`)`
   (`server.js:59-62`) + `⚠️  CHANGE DEFAULT PASSWORDS IMMEDIATELY!`.

## Failure / edge behavior (observed)

- `initializeDatabase()` returns false → `start()` throws → `process.exit(1)`;
  a listener never claims readiness when schema init failed.
- Missing JWT secret → `assertSecrets()` throws before any side effect.

## BUG observations

- **BUG-007 (S3)**: the startup banner enumerates `profile.seedUsers` **unconditionally**,
  including in customer mode where `initDB({demoMode:false})` intentionally seeds zero
  users. The banner therefore advertises accounts (with passwords) that do not exist
  on a customer boot — misleading operational output; an operator may believe default
  credentials are live (or try them) when the database has no such rows.
  `server.js:59-62` vs `src/models/index.js:225+`.
  Suggested fix: gate the `Default Users:` block on the same `demoMode` flag used for
  seeding (or derive the list from the actually-seeded rows). The password-printing
  aspect is SEC's lane; this finding is the BUG angle (banner does not reflect reality).
- `artistRepository.findById` fail-soft: on DB read failure it logs and falls back to
  the in-memory mock roster **only** `if (demoMemoryAllowed())`; on a customer boot the
  fictional roster is invisible (`src/repositories/artistRepository.js:103-115`).
  Coherent with the demo/customer split — no finding.
