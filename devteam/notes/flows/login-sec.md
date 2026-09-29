<!-- Security flow note — SEC, 2026-09-29. Companion to authz-matrix.md and findings/sec.md. -->
# Flow security note — login (flow 1)

**Path:** `POST /v3/auth/login` (src/routes/auth.js:95) -> `POST /v3/auth/change-password` / session use.

**Security-relevant hops:**
1. Public endpoint, no CAPTCHA — only the global `/v3/` limiter (1000 req/hr/IP)
   stands in front of credential stuffing. No dedicated login throttle. P1 lead
   on missing rate limiting is partially addressed globally but not
   per-endpoint; see open question Q-SEC-1 in findings/sec.md.
2. Email lookup is case-insensitive; missing email/password -> 401 with empty
   body (auth.js:117) — no oracle for "account exists".
3. Admin bootstrap override (auth.js:95-113): requires BOTH ADMIN_EMAIL and
   ADMIN_PASS set; only re-hashes an EXISTING admin whose stored hash still
   matches the bootstrap password; empty admin credentials -> 401.
   P1 #1 dismissed (fixed).
4. JWT claims signed: `id, email, role, artistAccess, integrationCount,
   sessionVersion` (auth.js:124, 158-165). P1 #3 dismissed (fixed).
5. Composite `authenticateToken` revalidates EVERY request against the DB:
   user exists, active, current role/artistAccess (not stale claims),
   sessionVersion (src/auth/index.js, src/routes/context.js:52-92).
6. Change-password (auth.js:346) verifies currentPassword via bcrypt and bumps
   sessionVersion -> all other sessions revoked atomically.

**Residual:** JWT `algorithms` not pinned (SEC-005); login/reset lack
dedicated throttling beyond the global limiter (Q-SEC-1).
