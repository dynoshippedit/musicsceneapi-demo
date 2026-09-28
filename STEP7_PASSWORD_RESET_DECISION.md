# STEP 7 DECISION RECORD — Password Reset Flow

**Status:** IMPLEMENTED (uncommitted, 2026-09-28) — pending operator review + commit
**Decision number:** D7
**Date:** 2026-09-17 (spec) · **Implemented:** 2026-09-28 · **Operator:** Dino
**Repo HEAD:** `c109be3` (Step 7 uncommitted on top)
**Authority:** NEXT_STEPS_PLAN.md Step 7 · EXECUTION_GUIDE.md §5

## Question

Ship the pinned-dead password-reset flow (Step 7)? Yes/No, plus the sub-options below.

2026-09-17 state: forgot-password mints + emails a token (src/routes/auth.js:138-140)
but no redeem route exists; the route's absence is PINNED (routes.test.js:141-146),
the UI button is disabled (LoginPage.jsx:43), and the email link points at
localhost:8080 where nothing listens. Users cannot recover accounts.

## Resolution (2026-09-28)

- [x] **A. Proceed as specced** — public `POST /v3/auth/reset-password`; SHA-256
      token digest + 1h expiry validated; min-8 / max-72-byte password; single-use
      via atomic conditional `User.update` (one winner); token columns cleared on
      redeem; malformed == invalid == expired == consumed → identical controlled
      400 (no enumeration oracle). `tests/regression/password-reset.test.js`
      (10 spec tests) + route pins updated.
- [x] **B. RESET_LINK_BASE** — `http://localhost:5173/reset-password` (Vite app),
      configurable via `RESET_LINK_BASE` env. The old hardcoded 8080 default is gone.
- [x] **C. `user.password_reset` audit emission** — yes, emitted on redemption.
- [x] **D. Session invalidation** — IMPLEMENTED, not deferred. Three new `Users`
      columns (`sessionVersion`, `version`, `active`; idempotent migration +
      model fields). Redeem/change bumps `sessionVersion`; the auth middleware
      rejects tokens whose `sessionVersion` claim mismatches (401 Session revoked)
      and rejects deactivated accounts (401). Old tokens (no claim) read as 0 and
      keep working against the 0 default until the next password change.

## Deliberate behavior changes beyond the 09-17 spec

- `POST /v3/auth/change-password`: input validation (400) now precedes the
  current-password check (401). The probe fixture supplies both a wrong current
  password and a 1-char new password, so the response flipped 401 → 400.
- `GET /v3/users` (admin): now carries `active`; `sessionVersion`/`version`
  are never serialized.
- Email contract (`src/services/emailService.js`): `sendEmail` returns `true`
  only when the transport acknowledges the recipient in `info.accepted`; JSON/
  simulated delivery no longer counts. Failed mail delivery clears the minted
  reset token (no orphaned valid tokens).
- Frontend: functional "Forgot Password?" flow in LoginPage, public
  `/reset-password?token=…` route + ResetPasswordPage, brand-neutral copy keys.

## Test/baseline bookkeeping (2026-09-28)

- Suite: **160/160** (`npm test`).
- routes.test.js: 65 routes expected; the "reset-password still unimplemented"
  PIN is deleted; unauthenticated list is 4.
- cases.js: 92 cases (`reset_password_missing` replaced by `reset_password_bad_token`
  + `reset_password_short_password`, both deterministic 400).
- `phase2_baseline.json`: only the reset case swap + `__meta.caseCount` 91→92
  (the caseCount assertion reads the baseline directly, so this could not go in
  the overlay). Historical baseline otherwise untouched.
- Reviewed contract repairs (`change_password_wrong_current` 401→400,
  `users_list_admin` +`active`) live in `tests/snapshots/repaired_contracts.json`,
  the designed overlay — NOT as direct baseline edits.
- `tests/snapshots/baseline.json` is not consumed by any test; left at HEAD.
- Snapshot comparison is `JSON.stringify`-based: overlay entries must match the
  probe's alphabetical key order exactly.

## Remaining before commit

- Operator diff review (all diffs are STEP 7-scoped; no accidental drift found).
- End-to-end reset with a disposable user + acknowledged test transport.
- Commit; push only on explicit authorization.

## Signature

Operator: ______________________   Date: __________

Cross-references to add after signing:
- NEXT_STEPS_PLAN.md Step 7: `SIGNED-OFF: <date> — STEP7_PASSWORD_RESET_DECISION.md`
- REFACTOR_PROGRESS.md §Status: `| 7 | Password reset flow | SIGNED-OFF — D7 |`
