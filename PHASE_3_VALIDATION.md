# PHASE_3_VALIDATION.md

End-of-Phase-3 verification record. Every claim below was reproduced against the
working tree on the date of this file, not inherited from the handoff.

Reference commit for "original" behavior: `c0281d8` (the pre-refactor monolith).

---

## 1. Result summary

| Gate | Result |
|---|---|
| `npm test` | **121 pass / 0 fail** (26 suites) |
| `npm run verify` | **54 pass / 0 fail** (clean DB, server on :3000) |
| `GET /v3/exports?format=pdf` | **200 + `%PDF-1.3`** (label-wide 1636 B, artist 6592 B) |
| `GET /v3/reports/monthly/:id/:month` | **200 + `%PDF-1.3`** (100635 B, multi-page) |
| Contract drift vs original | **10 status changes, 0 unexpected** (see §4) |
| Intentional contract changes | **11 / 11 verified** (see §4) |

---

## 2. The previously-unresolved runtime check

The last open item at handoff was `GET /v3/exports?format=pdf` returning 500
because `src/routes/reports.js` referenced `PDFDocument` without importing it.
The import (`const PDFDocument = require('pdfkit-table')`) is present and the
endpoint is now verified end-to-end:

```
GET /v3/exports?format=pdf                       -> 200  application/pdf  1636 B  %PDF-1.3
GET /v3/exports?format=pdf&artistId=art_deadmau5 -> 200  application/pdf  6592 B  %PDF-1.3
GET /v3/reports/monthly/art_deadmau5/2026-01     -> 200  application/pdf  100635 B %PDF-1.3
```

The monthly report is a full multi-page PDF (revenue table, sustainability,
visual analytics, streaming geography, social/CRM, tour, brand deals, forecast,
footer). The AI-insights block degrades gracefully to the offline sentence when
`GROQ_API_KEY` is unset (verified in the server log: `PDF AI Error: Groq client
unavailable` is caught and the PDF still renders).

---

## 3. Security / correctness fixes applied (all verified)

| ID | Fix | Where | Verified by |
|---|---|---|---|
| NEW-2 | `addBackground` now takes a rect object `{x,y,width,height}` + colour string, not 4 positional args; footer no longer walks flushed pages | `src/reports/monthlyReport.js` | `services.test.js` "FIXED NEW-2" + live PDF 200 |
| NEW-1 | `POST /v3/users` no longer writes a STRING `id` into the INTEGER PK | `src/routes/users.js` | `routes.test.js` "FIXED NEW-1" + live create 200 |
| CRITICAL-2 | `JWT_SECRET` has no fallback; fail-fast in EVERY environment (no ephemeral dev secret) | `src/config/index.js` | `units.test.js` "FIXED CRITICAL-2" + live exit 1 |
| CRITICAL-1 | empty login body -> 401; admin override requires both `ADMIN_EMAIL`/`ADMIN_PASS` non-empty | `src/routes/auth.js` | `verify_phase2.js` + live 401 |
| JWT `id` claim | login payload now carries `id`, repairing `/v3/auth/me`, GDPR delete, change-password, per-user integrations | `src/routes/auth.js` | live `auth_me_*` 200 |
| HIGH-4 | `artistAccess` scalar string normalized to a one-element array (fail-closed) | `src/auth/index.js` | `units.test.js` + live own-record 200 / other 403 |
| HIGH-5 | CORS built from `ALLOWED_ORIGINS`; dev localhost allowlist; production locked down | `src/config/index.js`, `src/middleware/index.js` | `units.test.js` "FIXED HIGH-5" |
| HIGH-6 | `autoPrintReport` uses `execFile(args[])`, no shell interpolation | `src/jobs/monthlyReportJob.js` | `services.test.js` "FIXED HIGH-6" |
| MEDIUM-8 | forgot-password returns generic 200 for unknown emails (no enumeration) | `src/routes/auth.js` | live 200 generic |
| MEDIUM-9 | error handler + AI-query error path return generic bodies; `err.message` logged server-side only | `src/middleware/index.js`, `src/routes/ai.js` | live `{"error":"AI query failed"}` |
| Validation | zod request validation on `POST /v3/ai/query` and `POST /v3/users` | `src/validation/index.js` | live 400 on malformed body |
| Logging | request logger redacts `token`/`api_key`/`password`/etc. query params | `src/middleware/index.js` | source inspection |
| DoS guard | `unhandledRejection`/`uncaughtException` handlers shut down cleanly instead of a bare crash | `server.js` | source inspection |
| AI model | `groqModel` default changed `llama-3.1-8b-instant` -> `openai/gpt-oss-20b` (retired model returned 404); now overridable via `GROQ_MODEL` | `src/config/index.js` | live AI query 200 + real answer |

### MEDIUM-9 residual fixed during this session

The error handler and the AI-query `catch` block were already generic, but the
discriminated-result path in `src/routes/ai.js` still returned
`details: outcome.message` (the Groq SDK message) to the client. Fixed: the
message is now logged server-side and the client receives
`{"error":"AI query failed"}`. Verified live.

---

## 4. The 11 intentional contract changes (all verified)

Diffed the original monolith (`c0281d8`) against the current tree across all 91
catalogue cases. Exactly 10 status-code changes and 1 body-only change, all
matching the handoff table. **Zero unrelated deterministic drift.**

| # | case | original | now | driver |
|---|---|---|---|---|
| 1 | `login_empty_body` | 200 + admin JWT | 401 | CRITICAL-1 |
| 2 | `auth_me_admin` | 404 | 200 | JWT `id` |
| 3 | `auth_me_artist_role` | 404 | 200 | JWT `id` |
| 4 | `change_password_wrong_current` | 500 | 401 | JWT `id` |
| 5 | `forgot_password_unknown` | 404 | 200 generic | MEDIUM-8 |
| 6 | `users_create_valid_shape` | 500 | 200 | NEW-1 |
| 7 | `artists_artist_role` | 200 empty list (`total=0`) | 200 own artist (`total=1`) | HIGH-4 |
| 8 | `artist_own_detail_artist_role` | 403 | 200 | HIGH-4 |
| 9 | `monthly_sales_artist_role` | 403 | 200 | HIGH-4 |
| 10 | `exports_artist_role_own` | 403 | 200 CSV | HIGH-4 |
| 11 | `reports_monthly_artist_role` | 403 | 200 PDF | HIGH-4 |

The other 80 cases are byte-identical in status (and byte-identical in body for
the 76 deterministic ones, per the snapshot suite).

---

## 5. JWT_SECRET — final behavior (option b, signed off)

The handoff item #3 said "fail fast when `JWT_SECRET` is absent, not only when
`NODE_ENV==='production'`". Final decision: **option (b)** — require
`JWT_SECRET` explicitly in EVERY environment.

`config.assertSecrets()` now:

- **No hardcoded fallback.** `config.jwtSecret` is `process.env.JWT_SECRET || ''`.
- **No ephemeral generated dev secret.** The `crypto.randomBytes` dev path was
  removed.
- **Fail fast in every environment.** Absent/empty -> `exit(1)`; `<16` chars ->
  `exit(1)`. Verified live: `node server.js` without `JWT_SECRET` prints
  `CRITICAL: JWT_SECRET is required in every environment.` and exits 1.

Consequences of the choice: `npm start` now requires `JWT_SECRET` in the
environment (no more out-of-the-box dev boot), and clustered deployments are
safe because every worker reads the same env var. Pinned by
`units.test.js` "FIXED CRITICAL-2: assertSecrets fails fast when JWT_SECRET is
absent in ANY env".

---

## 6. Validation layer scope

`src/validation/index.js` defines four schemas (`login`, `forgotPassword`,
`createUser`, `aiQuery`) and a `validateBody(name)` middleware. Two are wired:

- `POST /v3/ai/query` -> `aiQuery`
- `POST /v3/users` -> `createUser`

`login` and `forgotPassword` are defined but **not wired** — the routes use
manual empty-field checks instead. This is deliberate: wiring `schemas.login`
would turn a malformed-but-non-empty email into a 400, changing the 401
"Invalid credentials" contract. The unused schemas are harmless leftovers.

---

## 7. Known caveats (not Phase 3 regressions)

- `verify_phase2.js` is **not idempotent**: it creates and restores a
  "Verify Artist …" row, so a second run on the same DB reports `total=30`
  instead of 29. Run it against a fresh DB (delete `mau5trap_v5.sqlite` first).
- The snapshot baseline (`tests/snapshots/phase2_baseline.json`) was re-captured
  AFTER the Phase 3 fixes, so the snapshot suite now guards against *future*
  drift, not against Phase 3 drift. The Phase 3 drift was verified separately
  against the original monolith (see §4).
- `POST /v3/auth/reset-password` still has no server route (pre-existing; the
  forgot-password token remains unredeemable). Out of Phase 3 scope.
- Real integrations (Spotify/IG/YouTube/etc.) and the Postgres path remain
  unverified (no credentials); the Groq AI boundary WAS verified live with a
  real key and the new default model.
