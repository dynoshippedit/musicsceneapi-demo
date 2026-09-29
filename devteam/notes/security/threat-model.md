<!-- SEC Phase 2 threat model — Security Auditor, 2026-09-29. -->
<!-- Branch: devteam/review-2026-09-29 · HEAD 111aa9d (src/ identical to 53b7404). -->
# Threat Model — Music Scene API (electronic-label-os v5.0.0)

Reviewed against `devteam/review-2026-09-29`. Deployment is a **dedicated
instance per label** (single ACTIVE_LABEL_SLUG, one DB per instance) —
explicitly **not multi-tenant**. Tenant isolation is therefore out of scope;
the in-scope isolation boundary is **per-artist data within one label's
instance** (admin sees label-wide, everyone else is scoped to their granted
artists). See `devteam/notes/security/authz-matrix.md` for the route-by-route
control inventory (128 bound routes) and `devteam/findings/sec.md` for the
findings.

## Assets (crown jewels per Playbook B3)

| # | Asset | Where it lives |
|---|---|---|
| 1 | Auth material: bcrypt password hashes, JWT secret, OAuth access tokens (AES-256-GCM) | User table; JWT_SECRET, OAUTH_TOKEN_KEY env |
| 2 | Money data: royalty lines, settlements, direct sales, payouts, deposits, adjustments, statements | Sequelize models; /v3/financials/*, /v3/royalties/*, /v3/direct-sales* |
| 3 | Provider credentials: Stripe access tokens, secret keys, webhook secret | PaymentConnection.accessTokenEnc (encrypted); env |
| 4 | A&R pipeline: submissions, votes, shortlist, prospect evaluations | ANRSubmission (PII encrypted at rest) |
| 5 | GDPR: right-to-export, right-to-delete (/v3/users/:id/export, DELETE) | admin-only endpoints |
| 6 | User accounts: role, artistAccess, sessionVersion | User table |
| 7 | Demo/customer separation: DEMO_MODE seeded throwaway DB vs real DB | DB_STORAGE, startup path |

## Actors

- **A0 anonymous internet user** — can reach: POST /v3/auth/login,
  POST /v3/auth/forgot-password, POST /v3/auth/reset-password,
  POST /v3/billing/webhook (Stripe-signed), two OAuth callbacks
  (single-use state), GET /health.
- **A1 authenticated non-admin** (viewer/artist/manager/custom roles) — any
  route with authenticateToken; expected to see only data for artists in
  their artistAccess grant set.
- **A2 admin** — full label control: user management, imports, monthly close,
  OAuth connect, exports.
- **A3 label staff via AI copilot** — LLM prompts include resolved,
  access-scoped data; Groq is opt-in (GROQ_API_KEY).
- **A4 third-party providers** — Stripe (charges/payouts), OAuth providers,
  Groq, SMTP. Server trusts API keys/webhook signatures; **user-supplied
  URLs are never fetched server-side** (no SSRF path found in audit scope).
- **A5 demo-mode operator** — seeded throwaway DB; startup aborts if
  DB_STORAGE is set in DEMO_MODE (no real-DB contamination).

## Entry points

1. **128 bound HTTP routes** (src/routes/*.js, registered via production-api.js):
   122 require JWT, 6 public (see A0).
2. **CSV uploads** (multer, memory storage, 5 MiB / 1 file) — royalties,
   atVenu imports. Filename sanitized by src/utils/safeFilename.js
   (allowlist, length-capped); content parsed as data only.
3. **Stripe webhook** — raw-body signature verification
   (stripe.webhooks.constructEvent) before any processing.
4. **OAuth callbacks** — random single-use state tokens, 10-min TTL.
5. **LLM responses** (Groq) — parsed with zod schemas
   (src/ai/responseParser.js); responses never execute; AI cache key is
   identity-scoped (sha256 of user id, role, grants, resolved context).
6. **Cron jobs** — internal scheduling only; no cron route executes without
   the composite auth gate.
7. **React SPA** — JWT in localStorage (SEC-006); no raw-HTML sinks in web/src
   (dangerouslySetInnerHTML, innerHTML, eval, document.write all absent);
   startup revalidates token via /v3/auth/me; 401/403 auto-logout.

## Trust boundaries

```
Internet --> helmet / CORS(env-allowlisted) / /v3/ global rate limit (1000/hr)
        --> composite authenticateToken:
            JWT verify --> DB revalidate (user exists, active,
            current role/artistAccess, sessionVersion)
        --> per-handler RBAC: admin check / hasArtistAccess / requireGrants /
            checkExportAccess / pageAccess
        --> zod/manual input validation (schemas live with routes)
        --> services (encryption, AI, payments) --> DB / provider APIs
```

Cross-cutting notes:
- **Fail-closed defaults.** server.js:33 calls assertSecrets() before any
  side effect; missing/short JWT_SECRET (min 16) and missing 32-byte
  OAUTH_TOKEN_KEY abort the process. Admin bootstrap override requires BOTH
  ADMIN_EMAIL+ADMIN_PASS and only re-hashes an existing admin
  (src/routes/auth.js:95-113).
- **Session revocation.** sessionVersion is bumped on password change/reset
  (src/routes/auth.js:287,364), invalidating all sessions atomically.
- **Reset tokens.** Raw token is 32 random bytes; only the SHA-256 digest is
  stored; redemption is a single atomic conditional UPDATE
  (src/routes/auth.js:230-244) — single-use, single-winner.
- **OAuth tokens.** AES-256-GCM, random IV per token, encrypt-only via
  src/oauth/crypto.js; decryption fails loudly on key rotation instead of
  syncing half-blind.
- **Intentionally shared label-wide.** Payouts, deposits, expected-report
  calendar, source mappings, and statements are deliberately label-internal
  (requireGrants = any granted user). This matches the business rule that
  cash-reconciliation evidence is label-visible; see SEC-002 for the one
  mapping table judged to cross the line.
- **Known remaining exposures.** CSV formula injection on financial export
  (SEC-001); unscoped mapping read (SEC-002); err.message leaks on two
  routes (SEC-003); requireAdminOrArtist misnomer + OAuth connectable by any
  granted role (SEC-004); JWT without algorithm pinning / secret in route
  ctx (SEC-005); localStorage token trade-off (SEC-006); RESET_LINK_BASE
  localhost default (SEC-007); sync e.message exposure (SEC-008); free-form
  role strings on user create (SEC-009); PDF Content-Disposition hardens
  around server-derived IDs (SEC-010).

## Non-goals / accepted risks

- Token in localStorage (SPA trade-off; mitigations documented in SEC-006).
- Admin-only marketing/A&R/operations fixtures (profile-owned static data).
- Groq query content goes to a third-party LLM only when admin-configured;
  acknowledgeNotAdvice gate on financial analysis.
