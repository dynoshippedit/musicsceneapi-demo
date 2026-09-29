# Flow note (BUG) — Login → JWT → authenticateToken → RBAC

Branch `devteam/review-2026-09-29`, read 2026-09-29. Source read-only; this note is BUG-lane only.

## Hop chain

1. `POST /v3/auth/login` — `src/routes/auth.js`
   - Password length policy enforced pre-DB: `validatePasswordLength` (`auth.js:60-64`):
     string, `pw.length >= 8`, `Buffer.byteLength(pw,'utf8') <= 72` (bcrypt 72-byte cap).
   - Login looks up the user by email, `bcrypt.compare`, rejects inactive accounts.
   - On success mints a JWT carrying `id`, `role`, `artistAccess`, `integrationCount`,
     `sessionVersion` (24h expiry per config; exact claims verified at the sign call in `auth.js`).
2. Layer 1 — pure JWT verification: `src/auth/index.js` `authenticateToken`.
   - Verifies signature/expiry only. No DB touch. Unit-pinned, unchanged by the refactor.
3. Layer 2 — composite revalidation: `src/routes/context.js:55-94` `authenticateToken`
   (the `authenticateToken` that route modules actually receive via `buildContext()`).
   - `auth.authenticateToken` runs first; then on EVERY protected request:
     - `User.findByPk(req.user.id)` — row missing → **401** `User not found`
       (previously issued tokens die with the row).
     - `user.active` false → **401** `Account deactivated`.
     - `sessionVersion` mismatch (token claim vs row; missing claim reads as 0,
       matching the column default for pre-existing rows) → **401** `Session revoked`.
     - On success, `req.user.role/artistAccess/integrationCount/email/id` are
       **re-sourced from the row** — permission changes take effect immediately,
       not after token expiry.
     - DB lookup failure → **503** `Unable to verify access. Please retry.`
       (fail closed; stale claims never authorize during an outage).
4. RBAC — route-local, after the composite middleware:
   - `requireAdmin` (e.g. `src/routes/monthlyclose.js`) — `req.user.role !== 'admin'` → 403.
   - `hasArtistAccess(req.user, artistId)` — used per-route for artist-scoped reads.
   - `checkExportAccess` (`src/routes/reports.js`) — admin, or `artistId` present in the
     user's artist access.

## Failure / edge behavior (observed)

- Wrong password / unknown email → 401, no user enumeration beyond the generic error.
- Expired token → 401 at Layer 1, never reaches DB.
- Password reset (`auth.js:287` region) increments `sessionVersion` → all outstanding
  tokens for that user become `Session revoked` on their next request. Verified the
  increment + the Layer-2 check agree on the `== null → 0` default.
- Deactivation (`active=false`) kills sessions on next request, no token blacklist needed.

## BUG observations

- No logic defect found in the login→JWT→revalidation→RBAC chain itself. The
  composite design (pure verify + per-request DB revalidation + fail-closed 503) is
  sound, and the `sessionVersion` revocation path is coherent end to end.
- Residual note (not filed): any route that imported `src/auth/index.js`
  `authenticateToken` directly instead of the composite would skip revocation.
  Sibling search shows route modules receive auth via `buildContext()` from
  `src/routes/index.js`; no direct `require('../auth')` in route files was found
  (spot-checked `users.js`, `reports.js`, `monthlyclose.js`, `directsales.js`).
  If a future route bypasses the composite, revocation silently stops working for it —
  worth a regression assertion, owned by TST.
