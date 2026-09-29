<!-- Security flow note — SEC, 2026-09-29. Companion to authz-matrix.md and findings/sec.md. -->
# Flow security note — OAuth connect (flow 9)

**Path:** `GET /v3/oauth/:provider/authorize` (oauth.js:97, admin or granted
user) -> provider -> `GET /v3/oauth/:provider/callback` (oauth.js:124,
public) -> encrypted token storage -> `POST /v3/direct-sales/sync`.

**Security-relevant hops:**
1. Authorize: provider allowlist; state = 32 random bytes stored in-memory,
   single-use, 10-min TTL. Callback userId must be admin; non-admin callbacks
   validated against the stored state owner.
2. Callback: validates state presence AND match; token exchange server-side;
   access token encrypted with AES-256-GCM (random IV) via
   src/oauth/crypto.js before storage; key = 32-byte OAUTH_TOKEN_KEY
   (fail-closed at startup).
3. resolveArtistId (oauth.js:72): admin may pass artistId (defaults 'all');
   non-admin CANNOT pass artistId — uses their own artistAccess scalar.
   Note: ANY granted role (incl. viewer) can connect OAuth for their artist
   (SEC-004) — business-rule question for the owner.
4. Sync (directsales.js:242): admin-only; decrypts stored token first — fails
   loudly (503) on key rotation instead of syncing half-blind; Stripe pull
   failures degrade to recorded lastSyncError (exposed to any authed user on
   connect/status — SEC-008).
5. Stripe webhook (billing.js:242): raw-body signature verification
   (constructEvent) before any processing; no unsigned event is trusted.

**Residual:** SEC-004 (requireAdminOrArtist misnomer; viewer-role OAuth
connect); SEC-008 (sync error detail exposure).
