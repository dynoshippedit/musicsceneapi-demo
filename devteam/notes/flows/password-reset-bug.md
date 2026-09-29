# Flow note (BUG) — Password reset

Branch `devteam/review-2026-09-29`, read 2026-09-29. Source read-only; this note is BUG-lane only.

## Hop chain

1. `POST /v3/auth/forgot-password` (`src/routes/auth.js`, ~line 240-290 region):
   - Looks up user by email; **always returns success** (no account enumeration).
   - Generates a random 32-byte token (`crypto.randomBytes`), persists **SHA-256 digest**
     (never the raw token) in `User.resetToken` with `resetTokenExpiry = now + 1h`.
   - Reset URL emailed via `src/services/emailService.js` `sendEmail` (transport per config;
     reset-link host/path settings in `src/config/index.js`).
   - `emitPasswordResetAudit(user.id)` (`auth.js:66-77`) — fire-and-forget by design.
2. `POST /v3/auth/reset-password`:
   - Validates token format and the password policy (`validatePasswordLength`,
     `auth.js:60-64`: string, ≥8 chars, ≤72 UTF-8 bytes).
   - Looks up the user by **digest** of the presented token; rejects unknown/expired tokens.
   - `User.update`: sets the new bcrypt hash, clears `resetToken`/`resetTokenExpiry`,
     **increments `sessionVersion`** — all outstanding sessions die on next request
     via the composite `authenticateToken` check (`src/routes/context.js:77-80`).
3. In-flight requests: the next protected request after the reset hits
   `tokenSession !== user.sessionVersion` → **401** `Session revoked`.

## Failure / edge behavior (observed)

- Expired token → rejected (expiry checked against `resetTokenExpiry`).
- Reused token → rejected (fields cleared on first successful use).
- Token presented for a deleted user → no row → rejected.

## BUG observations

- **Dismissed (was a candidate):** `emitPasswordResetAudit()` calls
  `auditService.emitAudit()` without awaiting and catches only synchronous exceptions
  (`auth.js:66-77`). Reading `src/services/auditService.js:30-44` shows `emitAudit`
  is **synchronous** — it calls `model.create(record).catch(err => log.error(...))`
  internally and returns nothing. There is no floating promise and no unhandled
  rejection path. The fire-and-forget wrapper is therefore correct as written;
  an audit failure can never break or hang the reset request. Not filed.
- No logic defect found in the reset chain: token is random, stored as digest,
  single-use, time-boxed, and the `sessionVersion` bump coherently invalidates
  sessions through the Layer-2 check traced in the login flow note.
