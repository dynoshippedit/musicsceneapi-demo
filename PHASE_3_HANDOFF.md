# PHASE_3_HANDOFF.md

State as of the model switch. **Phase 3 has NOT been started.** Phase 1 and 2 are
complete and verified (114/114 tests, 53/53 operational checks, 0 contract drift).

Read `BACKEND_ARCHITECTURE.md` and `REFACTOR_PROGRESS.md` first. This file only
records what Phase 3 must decide and do.

---

## Verified current state

```
npm test            -> 114 pass / 0 fail   (26 suites)
npm run verify      -> 53 pass / 0 fail    (needs server on :3000)
npm start           -> boots, /health OK
git status          -> 5 modified, src/ tests/ + docs untracked
```

Monolith is 82 lines. 39 modules under `src/`. No Phase 3 artifacts exist:
`PHASE_3_VALIDATION.md`, `src/validation/`, `src/middleware/errorHandler.js` all
MISSING.

---

## BLOCKING DECISION (must be answered before coding)

Phase 3's security objectives require changing **11 of 91** API response
contracts. The brief said both "preserve all contracts" and "remove fallback
secrets". These conflict. Options were:

- (a) change the 11, document each, re-baseline
- (b) fix only contract-neutral items, leave CRITICAL-1/HIGH-4 open
- (c) env-flag the fixes (secure default, legacy opt-in)

**The 11 affected cases** (names match `tests/support/cases.js`):

| case | now | after fix | driver |
|---|---|---|---|
| `login_empty_body` | 200 + admin JWT | 401 | CRITICAL-1 |
| `auth_me_admin` | 404 | 200 | missing JWT `id` |
| `auth_me_artist_role` | 404 | 200 | missing JWT `id` |
| `change_password_wrong_current` | 500 | 401 | missing JWT `id` |
| `forgot_password_unknown` | 404 | 200 generic | MEDIUM-8 enumeration |
| `users_create_valid_shape` | 500 | 2xx | NEW-1 |
| `artists_artist_role` | 200 empty list | 200 own artist | HIGH-4 |
| `artist_own_detail_artist_role` | 403 | 200 | HIGH-4 |
| `monthly_sales_artist_role` | 403 | 200 | HIGH-4 |
| `exports_artist_role_own` | 403 | 200 CSV | HIGH-4 |
| `reports_monthly_artist_role` | 403 | 200/500 | HIGH-4 |

The other **80 cases must stay byte-identical.** Re-baseline with
`npm run snapshot:baseline` ONLY after the decision is recorded, and keep the
old file for the diff.

---

## Work queue (dependency-ordered)

1. **NEW-2 — PDF crash (highest priority).** `src/reports/monthlyReport.js:181`
   calls `doc.addBackground(doc.y, doc.page.width - 80, 20, {...})` with four
   positional args; pdfkit-table@0.1.99 wants
   `addBackground({x,y,width,height}, fillColor, fillOpacity, cb)`. `x`/`y`
   become `undefined`, pdfkit throws, and because the throw is inside
   pdfkit-table's own async forEach it escapes as an UNHANDLED REJECTION and
   kills the process. Reachable via `GET /v3/reports/monthly/:artistId/:month`,
   `GET /v3/exports?format=pdf`, and the `0 3 1 * *` cron.
   PRE-EXISTING — verified identical on git HEAD at `api.js:2212`.
   Also add a `process.on('unhandledRejection')` guard so no single handler can
   kill the server again.
2. **NEW-1 — user creation.** `src/routes/users.js` writes
   `id: \`user_${Date.now()}\`` (STRING) into an INTEGER autoincrement PK ->
   `SQLITE_MISMATCH` -> always 500. Drop the `id` assignment. Note the shadowed
   third `POST /v3/users` registration omits `id` and was already correct.
3. **CRITICAL-2** — remove `|| 'your-secret-key-change-this'`
   (`src/config/index.js:32`); fail fast when `JWT_SECRET` is absent, not only
   when `NODE_ENV==='production'`.
4. **CRITICAL-1** — `src/routes/auth.js:50` compares
   `email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASS`.
   Both `undefined` when unset -> `{}` logs in as admin. Require both env vars
   to be non-empty before the branch is even considered.
5. **JWT `id` claim** — neither login branch includes `id`; `generateToken()`
   (which does) is dead. Wiring it up repairs `/v3/auth/me`, GDPR delete,
   change-password, and stops `userIntegrations[undefined]` being one shared
   bucket. 12 call sites listed by
   `grep -rn "req.user.id" src/routes/`.
6. **HIGH-4** — `artistAccess` is a STRING column checked with
   `Array.isArray` (`src/auth/index.js`), so artists are denied their own data.
   Needs normalization (scalar -> array) plus the 6 artist-scoped routes
   updated together. Fail-closed today, so a careless fix fails OPEN.
7. **Zod validation layer** — `zod` already a dependency. No request body is
   validated anywhere.
8. **Centralized errors** — 10 sites leak `err.message`:
   `grep -rn "err.message\|error.message\|e.message" src/`.
9. **HIGH-5** CORS `origin:true`; `ALLOWED_ORIGINS` documented, never read.
10. **HIGH-6** `autoPrintReport` shell interpolation
    (`src/jobs/monthlyReportJob.js`), gated on `AUTO_PRINT=true`.
11. **Logging redaction**, then consolidate the 18 legacy `test_*`/`verify_*`
    scripts.

---

## Guardrails

- Every `PINS`-labelled test asserts a defect ON PURPOSE. Fixing the defect
  means updating that test in the same change — never delete it silently.
- `tests/support/cases.js` is the shared case catalogue; the probe and the
  snapshot suite both read it. Adding cases is safe; reordering invalidates
  baselines.
- Route registration order is a contract (5 shadowed duplicates). Do not
  reorder `DOMAIN_ORDER` in `src/routes/index.js`.
- Do not delete `Server v5.js`, `package1.json`, `package-production.json`,
  old frontends, or any legacy script. That is a later phase.
- No new dependencies. Tests use Node 22 `node:test` + global `fetch`.
- `src/routes/context.js` is a deliberate transitional seam — narrowing it is
  cleanup, not Phase 3.

---

## Useful commands

```
npm test                          # full suite
npm run test:services             # Phase 2 layer tests only
npm start                         # canonical entrypoint
npm run verify                    # 53 live checks (server must be running)
node tests/support/probe.js server.js /tmp/x.json    # snapshot a build
bash tests/support/run_legacy_scripts.sh <files...>  # legacy harness
SCHEDULE_JOBS=false npm start     # boot without cron (avoids NEW-2 via cron)
```

Known-failing by design: `verify_admin_permissions.js` exits 1 (NEW-1).
`test-api.js` probes 3 nonexistent endpoints with a placeholder token.
