<!-- C12 findings ledger — Security Auditor (SEC), Phase 2. -->
<!-- One entry per problem: ID · title · severity · confidence · location · -->
<!-- evidence (quoted) · what's wrong · impact · suggested fix.              -->
<!-- Statuses follow the Playbook B7 lifecycle. The Tech Lead merges these    -->
<!-- into devteam/ISSUES.md.                                                 -->
# Findings — SEC (Security Auditor)

Branch: `devteam/review-2026-09-29` · reviewed HEAD `111aa9d`
(src/ identical to `53b7404`; only devteam docs changed since).
Source read-only; no fixes applied.

| ID | Sev | Conf | Status | Title | Location |
|---|---|---|---|---|---|
| SEC-001 | S2 | Confirmed | NEW | CSV formula injection in financial export (`csvCell` does not neutralize `= + - @` prefixes) | src/routes/directsales.js:113-117 (sink); src/routes/directsales.js:586+ (export); src/routes/royalties.js:639-681, src/payments/providers/stripe.js:192 (sources) |
| SEC-002 | S2 | Confirmed | NEW | `GET /v3/direct-sales/mappings` exposes all payment matching rules to any authenticated user (no artist scoping) | src/routes/directsales.js:360 |
| SEC-003 | S3 | Confirmed | NEW | `err.message` returned to client on `GET /v3/financials/reconciliation` (500) and `GET /v3/catalog/integrity` | src/routes/directsales.js:535; src/routes/catalog.js:280 |
| SEC-004 | S3 | Confirmed | NEW | `requireAdminOrArtist` checks identity, not role — misnomer guarding OAuth authorize/status/disconnect; any granted role (incl. viewer) can connect OAuth for their artist | src/routes/oauth.js:59-70 |
| SEC-005 | S4 | Confirmed | NEW | JWT verification does not pin `algorithms`; JWT secret distributed to every route module via shared ctx | src/auth/index.js:56; src/routes/context.js:102 |
| SEC-006 | S4 | Confirmed | NEW | Web SPA stores JWT in `localStorage` (XSS-exfiltration trade-off; mitigations present) | web/src/auth/AuthContext.jsx |
| SEC-007 | S3 | Confirmed | NEW | `RESET_LINK_BASE` defaults to `http://localhost:5173/reset-password` — broken reset links in prod if unset (no token leak; availability) | src/config/index.js:139 |
| SEC-008 | S4 | Confirmed | NEW | Stripe sync failures (`e.message` / `lastSyncError`) exposed to any authenticated user on connect/status | src/routes/directsales.js:203-226, 242+ |
| SEC-009 | S4 | Confirmed | NEW | `role` is a free-form string on user create — typo silently creates an unrecognized role with no permissions | src/validation/index.js (createUser schema); src/routes/users.js:68 |
| SEC-010 | S4 | Confirmed | NEW | PDF `Content-Disposition` interpolates user-selected `artistId`; safe only because server-derived IDs are whitespace-stripped — document the invariant | src/routes/reports.js:163+ |

## SEC-001 · CSV formula injection in financial export

- **Severity:** S2 (data-integrity / downstream code execution on analyst
  workstations; financial export is the crown-jewel money path).
- **Confidence:** Confirmed (code read; sink and both sources verified).
- **Location:** sink `src/routes/directsales.js:113-117` (`csvCell`);
  export `src/routes/directsales.js:586+` (`GET /v3/financials/export`);
  sources `src/routes/royalties.js:639-681` (atVenu venue stored verbatim),
  `src/payments/providers/stripe.js:192` (Stripe `charge.description` stored
  verbatim -> DirectSale.description).
- **Evidence:** `csvCell` quotes only commas, quotes, CR, LF:
  ```js
  function csvCell(v) { /* quotes , " \r \n — no =, +, -, @ handling */ }
  ```
  Exported cells flow straight from DB columns that hold externally
  controlled text (Stripe charge descriptions, imported CSV venue names).
  A cell beginning with `=`, `+`, `-`, or `@` will be interpreted as a
  formula by spreadsheet apps on open.
- **What's wrong / impact:** a crafted Stripe charge description (set by the
  payer via Checkout) or atVenu venue row can plant a formula in the label's
  financial export. Impact ranges from data exfiltration via formula (classic
  DDE/HYPERLINK payloads) to silent corruption of reconciled money reports.
- **Suggested fix:** in `csvCell`, prefix any cell whose first character is
  `=`, `+`, `-`, or `@` (after trimming) with a leading apostrophe, while
  keeping RFC-4180 quoting. Fix belongs in `csvCell` itself — all export
  rows flow through it.

## SEC-002 · Unscoped payment-mapping read

- **Severity:** S2 (information disclosure of label-internal matching rules).
- **Confidence:** Confirmed.
- **Location:** `src/routes/directsales.js:360`
  (`GET /v3/direct-sales/mappings`).
- **Evidence:**
  ```js
  app.get('/v3/direct-sales/mappings', authenticateToken, async (req, res) => {
  ```
  No `scopeWhere`, no `hasArtistAccess`, no role check — returns every mapping
  (matchType/matchValue/artistId) to any authenticated user, unlike the
  neighboring scoped reads (#106-#108) and unlike the monthly-close mappings
  list which at least requires `requireGrants`.
- **What's wrong / impact:** matching rules reveal how provider payouts are
  attributed to artists — label-internal reconciliation logic. Any granted
  user (incl. a compromised viewer account) can enumerate it.
- **Suggested fix:** apply `scopeWhere`-style artist filtering (same pattern
  as #106), or require admin if mappings are label-internal by design.

## SEC-003 · `err.message` to client on two routes

- **Severity:** S3 (internal-error detail disclosure).
- **Confidence:** Confirmed.
- **Location:** `src/routes/directsales.js:535`
  (`res.status(500).json({ error: err.message || 'Reconciliation failed' })`);
  `src/routes/catalog.js:280` (integrity endpoint returns
  `detail: error.message`).
- **What's wrong / impact:** Sequelize/DB/driver internals (table names,
  constraint names, driver strings) can leak to any authenticated user.
  The global error handler was already hardened to generic messages — these
  two handlers bypass it.
- **Suggested fix:** log `err.message` server-side, return a generic
  "Reconciliation failed" / "Integrity check failed" body (the pattern used
  by the neighboring handlers).

## SEC-004 · `requireAdminOrArtist` is a misnomer; OAuth connectable by any granted role

- **Severity:** S3 (authorization-model clarity + business-rule question).
- **Confidence:** Confirmed.
- **Location:** `src/routes/oauth.js:59-70` (guard), `:97`, `:163`, `:179`
  (uses); `resolveArtistId` at `oauth.js:72`.
- **Evidence:**
  ```js
  function requireAdminOrArtist(req, res, next) {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      next();  // no role check at all
  }
  ```
  The real scoping happens in `resolveArtistId` (admin may pick artistId;
  non-admin is forced to their own grant scalar). All three authenticated
  OAuth routes call it — verified — so there is no current bypass.
- **What's wrong / impact:** (a) the name invites a future route to rely on
  it alone and be under-protected; (b) as a business rule, ANY granted role
  — including `viewer` — can connect an OAuth provider for their artist and
  trigger provider data pulls. Confirm with the owner whether OAuth connect
  should be admin/manager-only.
- **Suggested fix:** rename to `requireAuthenticatedArtist` (or fold the
  resolve into the guard); ask the owner (Q-SEC-2) whether connect should be
  admin-only.

## SEC-005 · JWT without algorithm pinning; secret in shared route ctx

- **Severity:** S4 (defense in depth).
- **Confidence:** Confirmed.
- **Location:** `src/auth/index.js:56` (`jwt.verify(token, secret)` — no
  `algorithms` option); `src/routes/context.js:102` (JWT secret placed in
  the ctx object handed to every route module).
- **What's wrong / impact:** jsonwebtoken v9 rejects `none` and the code
  only ever signs HS256, so no algorithm-confusion exploit is demonstrated —
  this is hardening, not a vuln. The ctx-wide secret widens the blast radius
  of any future server-side code defect (any route handler could mint tokens).
- **Suggested fix:** pass `{ algorithms: ['HS256'] }` at verify; narrow ctx
  to expose a `signToken()` helper instead of the raw secret.

## SEC-006 · JWT in localStorage (SPA trade-off)

- **Severity:** S4 (accepted-pattern trade-off; mitigations present).
- **Confidence:** Confirmed.
- **Location:** `web/src/auth/AuthContext.jsx`.
- **Evidence:** token persisted in `localStorage` under `authToken`; any
  successful same-origin XSS could exfiltrate it.
- **What's wrong / impact:** mitigations verified: no raw-HTML sinks in
  `web/src` (`dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `document.write` all absent); logout clears `authToken` and `userData`;
  startup ignores stored claims and revalidates via `GET /v3/auth/me`;
  401/403 responses force logout. Moving to HttpOnly cookies would be an
  auth-model change (CSRF handling) needing owner approval.
- **Suggested fix:** owner decision (Q-SEC-3): accept as documented trade-off,
  or move to HttpOnly cookie + CSRF tokens. At minimum consider
  `sessionStorage` to avoid persistence across sessions (24h token TTL).

## SEC-007 · RESET_LINK_BASE localhost default

- **Severity:** S3 (availability, not confidentiality).
- **Confidence:** Confirmed.
- **Location:** `src/config/index.js:139`
  (`RESET_LINK_BASE || 'http://localhost:5173/reset-password'`).
- **What's wrong / impact:** if unset in production, reset emails contain
  localhost links — password reset is broken for real users. The token itself
  only goes to the account owner's email, so no leak.
- **Suggested fix:** document `RESET_LINK_BASE` as required in production
  (also BLD-007 notes it is missing from `.env.example`); optionally fail
  fast when `NODE_ENV=production` and it is unset.

## SEC-008 · Sync error internals exposed to any authenticated user

- **Severity:** S4.
- **Confidence:** Confirmed.
- **Location:** `src/routes/directsales.js:203-226`
  (`GET /v3/direct-sales/connect/status` returns `lastSyncError`);
  `src/routes/directsales.js:242+` (`POST /v3/direct-sales/sync` stores and
  returns `e.message` from Stripe pulls).
- **What's wrong / impact:** Stripe API error strings (account IDs, request
  IDs, decline internals) are readable by any authenticated user, not just
  admins. Low sensitivity but unnecessary exposure.
- **Suggested fix:** restrict `/connect/status` to admin, or redact
  `lastSyncError` for non-admins; log full errors server-side.

## SEC-009 · Free-form role string on user create

- **Severity:** S4.
- **Confidence:** Confirmed.
- **Location:** `src/validation/index.js` (`createUser` schema — `role` is a
  free-form string); `src/routes/users.js:68`.
- **What's wrong / impact:** an admin typo (e.g. `admn`) silently creates a
  user with an unrecognized role. All guards fail closed on unknown roles
  (deny by default), so the impact is lockout-by-typo, not privilege
  escalation — but it is silent.
- **Suggested fix:** enum-constrain `role` in the zod schema to the known
  role set (or validate against the roles registry if dynamic roles are
  intended).

## SEC-010 · Content-Disposition interpolates artistId (safe today — document the invariant)

- **Severity:** S4 (hardening note, not an active vuln).
- **Confidence:** Confirmed.
- **Location:** `src/routes/reports.js:163+`
  (`Content-Disposition: attachment; filename="...${artistId}..."`).
- **What's wrong / impact:** header injection is NOT practically reachable:
  artist IDs are server-derived and whitespace-stripped at creation
  (`name.toLowerCase().replace(/\s+/g, '')`), and Node rejects invalid header
  characters (fail-closed). But the safety rests on an undocumented invariant
  in artist creation.
- **Suggested fix:** add a comment at the export site citing the invariant,
  or wrap the filename in `safeFilename()` (the monthly-report path already
  does).

---

## P1 lead dispositions (pre-refactor leads re-verified against current code)

- **P1 #1 — admin override when ADMIN_EMAIL/ADMIN_PASS unset: DISMISSED
  (fixed).** `src/routes/auth.js:95-113`: missing credentials -> 401 empty
  body; override requires BOTH `adminEmail && adminPass` set AND the account
  already be an admin whose stored hash still matches the bootstrap password.
- **P1 #2 — fallback secrets / plaintext passwords: DISMISSED (fixed).**
  `src/config/index.js:208-220` (`assertSecrets`, called at
  `server.js:33` before any side effect): JWT_SECRET required in every
  environment, min 16 chars, process exits otherwise; no literal fallbacks
  (grep verified — only `|| ''` empty-string guards that trip the fail-fast).
  OAUTH_TOKEN_KEY requires a valid 32-byte key.
- **P1 #3 — tokens missing `id` claim: DISMISSED (fixed).**
  `src/routes/auth.js:124,158-165`: both login branches sign
  `id, email, role, artistAccess, integrationCount, sessionVersion`;
  composite middleware rejects missing IDs (`src/routes/context.js:65`) and
  revalidates DB state every request.
- **P1 #4 — `POST /v3/royalties/calculate` authz / client splits: DISMISSED
  (not a bypass).** `src/routes/finance.js:39+`: calls
  `hasArtistAccess(req.user, artistId)` -> 403 otherwise; splits validated as
  finite `[0,1]` summing to 1 and echoed back. The endpoint is a read-only
  calculator, not persisted settlement authority.
- **P1 #5 — AI cache cross-user leakage: DISMISSED (fixed).**
  `src/ai/aiService.js:35-49`: access checked before lookup; cache key =
  sha256 of prompt, artistId, user id, role, grants, and resolved accessible
  context. No cross-user collision possible.
- **P1 #8 — password reset weaknesses: DISMISSED (fixed).**
  `src/routes/auth.js:191-291`: generic 200 prevents enumeration; 32 random
  bytes, SHA-256 digest at rest; 1-hour expiry; atomic conditional UPDATE
  (single-use, single-winner); unified 400 on bad token; success bumps
  `sessionVersion` (session revocation). RESET_LINK_BASE configurable.

## Routed items

- `scripts/run-browser-workflows.js:36` — generates a fresh random 32-byte
  JWT secret at runtime for a local workflow fixture. Not a committed/live
  secret. **No action.**
- `web/src/auth/AuthContext.jsx` localStorage token — assessed as SEC-006
  (S4 trade-off with mitigations), not a standalone vuln.

## Questions for the owner (also in devteam/QUESTIONS.md as Q-SEC-*)

- **Q-SEC-1:** Login / forgot-password / reset-password rely only on the
  global 1000-req/hr `/v3/` limiter. Is dedicated credential-stuffing
  throttling (per-IP/per-account backoff, CAPTCHA) required, or is the
  global limiter the accepted control?
- **Q-SEC-2:** Any granted role (including `viewer`) can connect an OAuth
  provider for their artist (SEC-004). Should OAuth connect be admin /
  manager-only?
- **Q-SEC-3:** Accept the localStorage JWT trade-off (SEC-006) as documented,
  or schedule the HttpOnly-cookie migration (auth-model change, CSRF work)?
- **Q-SEC-4:** `GET /v3/direct-sales/mappings` (SEC-002) — is the mapping
  table label-internal (restrict to admin) or should it be artist-scoped
  like the neighboring reads?

## Method note

- Route inventory: 118 registration statements -> 128 bound routes (catalog
  `registerCrud` x3) -> 124 unique effective (4 shadowed duplicates in
  users.js). Full matrix: `devteam/notes/security/authz-matrix.md`.
- Source-to-sink coverage: HTTP bodies/query/params -> Sequelize (zod/manual
  validation per route); CSV upload -> DB -> CSV export (SEC-001); OAuth
  callbacks -> AES-256-GCM token storage; Groq responses -> zod schemas,
  never executed; email headers/body (Nodemailer owns envelope; reset HTML
  interpolates server-derived email); PDF generation (pdfkit server-side,
  no exec); filename handling (`safeFilename.js` allowlist); external URL
  construction — no server-side fetch of user-supplied URLs found (no SSRF);
  no prototype-pollution-prone merges found (`Object.assign` on fixed-shape
  literals only); cron routes behind the same composite auth.
- **No live attacks, no credentials, no external contact.** All findings from
  code reading only.
