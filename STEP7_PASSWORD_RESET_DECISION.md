# STEP 7 DECISION RECORD — Password Reset Flow

**Status:** PENDING SIGN-OFF
**Decision number:** D7
**Date:** 2026-09-17 · **Operator:** ________ · **Repo HEAD:** `7efb44b` (4C+4CF uncommitted on top)
**Authority:** NEXT_STEPS_PLAN.md Step 7 · EXECUTION_GUIDE.md §5

## Question

Ship the pinned-dead password-reset flow (Step 7)? Yes/No, plus the sub-options below.

Today: forgot-password mints + emails a token (src/routes/auth.js:138-140) but no redeem
route exists; the route's absence is PINNED (routes.test.js:141-146), the UI button is
disabled (LoginPage.jsx:43), and the email link points at localhost:8080 where nothing
listens. Users cannot recover accounts.

## What shipping flips (deliberate pin edits — full detail in EXECUTION_GUIDE.md ledger)

- routes.test.js 63→64 routes; delete the "reset-password still unimplemented" PINS assertion;
  unauthenticated-route list 3→4 (new PUBLIC route).
- cases.js 91→92 (reset_password_missing replaced by two deterministic 400 cases).
- phase2_baseline.json (+__meta.caseCount 91→92) and baseline.json (two new 400 entries).
- gate F16 (Forgot button enabled + new F23 navigation box) and P03 (selector fix — it
  currently throws once nothing is disabled).
- API_INVENTORY.md (route row; 63→64; 3→4; delete the dead-call row).

## Options

- [ ] A. Proceed as specced: public POST /v3/auth/reset-password; token + 1h expiry
      validated; min-8 password; single-use; token columns cleared on redeem;
      unknown == expired == identical 400 (no enumeration oracle). New
      tests/regression/passwordReset.test.js (8 tests).
- [ ] B. RESET_LINK_BASE default: __ http://localhost:5173/reset-password (recommended —
      lands on the live Vite app) / __ keep http://localhost:8080/reset-password.
- [ ] C. Optional: emitAudit('user.password_reset') — yes / no.
- [ ] D. Deferred (out of scope, noted): JWT session invalidation on reset (needs a
      passwordChangedAt claim).

## Signature

Operator: ______________________   Date: __________

Cross-references to add after signing:
- NEXT_STEPS_PLAN.md Step 7: `SIGNED-OFF: <date> — STEP7_PASSWORD_RESET_DECISION.md`
- REFACTOR_PROGRESS.md §Status: `| 7 | Password reset flow | SIGNED-OFF — D7 |`
