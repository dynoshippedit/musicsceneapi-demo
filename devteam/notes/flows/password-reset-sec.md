<!-- Security flow note — SEC, 2026-09-29. Companion to authz-matrix.md and findings/sec.md. -->
# Flow security note — password reset (flow 5)

**Path:** `POST /v3/auth/forgot-password` (src/routes/auth.js:191) ->
email (SMTP) -> `POST /v3/auth/reset-password` (src/routes/auth.js:253).

**Security-relevant hops:**
1. forgot-password: no email -> generic 200 "If an account exists..."; inactive
   account -> same generic 200 (auth.js:206-209). No enumeration oracle.
   Public endpoint; global rate limiter only.
2. Token: 32 random bytes (crypto.randomBytes), stored as SHA-256 digest only
   (auth.js:215); raw token never persisted. 1-hour expiry (auth.js:219).
3. Redemption (auth.js:230-244): single atomic conditional UPDATE
   (resetTokenHash match AND not expired AND active) -> single-use,
   single-winner, no race.
4. Consumed/invalid/expired -> unified 400 "Invalid or expired reset token"
   (auth.js:246) — no timing or status oracle.
5. Success: clears token fields AND bumps sessionVersion (auth.js:287) ->
   revokes all sessions; new login required.
6. Reset link base from RESET_LINK_BASE (src/config/index.js:139); default
   `http://localhost:5173/reset-password` — safe default (no token leaves the
   server except via email to the account owner), but produces broken links in
   prod if unset (SEC-007).
7. Reset email HTML interpolates the account email address without HTML
   escaping — Nodemailer owns envelope/header structure; practical impact is
   minimal (address is server-derived from a registered account), noted as
   hardening.

**Residual:** SEC-007 (localhost default); dedicated reset-request throttling
beyond the global limiter (Q-SEC-1). P1 #8 dismissed (fixed).
