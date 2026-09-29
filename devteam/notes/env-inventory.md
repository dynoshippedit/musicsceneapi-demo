# Env inventory — The Music Scene (electronic-label-os v5.0.0)
Captured 2026-09-29 by BLD. Method: `process.env` reads grepped across `src/`,
`production-api.js`, `server.js`, `scripts/`, `web/src`, `web/validation`
(+ `import.meta.env` in web/src), compared against `.env.example`,
`.env.prod.template`, `web/.env.*`. Central config: `src/config/index.js`
(single place where most vars are read; "read at" below = first/primary read).

Legend: secret? = yes if the value is a credential/key. required? = the app
refuses to start / feature 503s without it.

## Read by the code

| Variable | Read at | Default | Documented where | Secret? | Required? | Notes |
|---|---|---|---|---|---|---|
| NODE_ENV | src/config/index.js:26 | 'development' | .env.example | no | no | Drives isProduction, CORS policy |
| PORT | src/config/index.js:71 | 3000 | .env.example | no | no | |
| JWT_SECRET | src/config/index.js:76 | '' → fail-fast via assertSecrets() (min 16 chars) | .env.example | **yes** | **yes** (all envs) | CRITICAL-2 fixed Phase 3: no hardcoded fallback |
| ADMIN_EMAIL | src/config/index.js:81 | undefined | .env.example | no (identifier) | no | Optional admin override; both must be set |
| ADMIN_PASS | src/config/index.js:82 | undefined | .env.example | **yes** | no | |
| DB_DIALECT | src/config/index.js:86 | 'sqlite' | .env.example | no | no | 'sqlite' or 'postgres' |
| DB_STORAGE | src/config/index.js:92 | profile sqliteFile ('pulsegrid_v5.sqlite') | .env.example (commented) | no | no | Per-instance deployment seam |
| DATABASE_URL | src/config/index.js:93 | undefined | .env.example (commented) | **yes** (may embed creds) | only for postgres | |
| USE_REAL_DATA | src/config/index.js:98 | false | .env.example | no | no | |
| DEMO_MODE | src/config/index.js:107 | false | .env.example (commented) | no | no | Opt-in fictional seeding; run-demo.sh sets it |
| GROQ_API_KEY | src/config/index.js:110 | undefined | .env.example (placeholder) | **yes** | only for AI endpoints | Opt-in AI; absence disables |
| GROQ_MODEL | src/config/index.js:114 | 'openai/gpt-oss-20b' | **NOT documented** | no | no | Added Phase 3 |
| SMTP_HOST | src/config/index.js:130 | 'smtp.sendgrid.net' | .env.example (commented) | no | no | Email enabled iff SMTP_HOST or SENDGRID_API_KEY set |
| SMTP_PORT | src/config/index.js:131 | 587 | .env.example (commented) | no | no | |
| SMTP_USER | src/config/index.js:132 | 'apikey' | .env.example (commented) | no | no | |
| SMTP_PASS | src/config/index.js:133 | SENDGRID_API_KEY | .env.example (commented) | **yes** | no | |
| SENDGRID_API_KEY | src/config/index.js:133 | undefined | .env.example (commented) | **yes** | no | Alt credential for SMTP_PASS |
| EMAIL_FROM | src/config/index.js:137 | '' (profile default resolves later) | **NOT in .env.example** (was brand default, moved to profile) | no | no | |
| RESET_LINK_BASE | src/config/index.js:139 | 'http://localhost:5173/reset-password' | **NOT in .env.example**; only docs/DEPLOY.md:106 | no (but security-relevant: password-reset link host) | no | → BLD-007 |
| AUTO_PRINT | src/config/index.js:143 | false | .env.example | no | no | Shells out to printer; see SECURITY_AUDIT HIGH-6 |
| STRIPE_SECRET_KEY | src/config/index.js:149; src/jobs/providerSync.js:160 | undefined | .env.example (commented, TEST MODE) | **yes** | no — billing routes 503 without it | Server refuses non-`sk_test_` keys |
| STRIPE_WEBHOOK_SECRET | src/config/index.js:150 | undefined | .env.example (commented) | **yes** | no | |
| STRIPE_SETUP_PRICE_ID | src/config/index.js:152 | undefined | .env.example (commented) | no | no | |
| STRIPE_SUBSCRIPTION_PRICE_ID | src/config/index.js:157 | undefined | .env.example (commented) | no | no | |
| STRIPE_SUCCESS_URL | src/config/index.js:158 | 'http://localhost:3000/billing/success' | .env.example (commented) | no | no | Insecure dev default (http) |
| STRIPE_CANCEL_URL | src/config/index.js:159 | 'http://localhost:3000/billing/cancel' | .env.example (commented) | no | no | Insecure dev default (http) |
| STRIPE_STUB | src/config/index.js:162 | false | .env.example (commented) | no | no | TEST-ONLY stub; "Never set in prod" |
| LABEL_STRIPE_CLIENT_ID | src/config/index.js:174 | undefined | .env.example (commented) | no (public id) | no — connect routes 503 without | |
| LABEL_STRIPE_CLIENT_SECRET | src/config/index.js:175 | undefined | .env.example (commented) | **yes** | no | |
| LABEL_STRIPE_REDIRECT_URI | src/config/index.js:176 | 'http://localhost:3000/v3/direct-sales/connect/callback' | .env.example (commented) | no | no | |
| PAYMENTS_STUB | src/config/index.js:182 | false | .env.example (commented) | no | no | TEST-ONLY |
| PAYMENTS_STUB_CHARGES_FILE | src/payments/providers/stripe.js:346 | undefined | .env.example (commented) | no | no | Fixture JSON path |
| PAYMENTS_STUB_CHARGES | src/payments/providers/stripe.js:353 | undefined | **NOT documented** | no | no | Inline fixture JSON |
| PAYMENTS_STUB_PAYOUTS_FILE | src/payments/providers/stripe.js:365 | undefined | .env.example (commented) | no | no | |
| PAYMENTS_STUB_PAYOUTS | src/payments/providers/stripe.js:372 | undefined | **NOT documented** | no | no | Inline fixture JSON |
| ALLOWED_ORIGINS | src/config/index.js:35 | '' → dev: localhost allowlist; **prod: no cross-origin** | .env.prod.template | no | effectively yes in prod | CORS policy (HIGH-5 fix, Phase 3) |
| LABEL_PROFILE / LABEL_SLUG / ACTIVE_LABEL | src/profile/index.js:29 | 'pulsegrid' | LABEL_SLUG + ACTIVE_LABEL in .env.example (commented); **LABEL_PROFILE not named** | no | no | Profile selection; unknown slugs fall back |
| PROVIDER_SYNC_ENABLED | src/jobs/index.js:40 | false | .env.example (commented) | no | no | Daily 04:00 sync; default off |
| SCHEDULE_JOBS | server.js:48 | enabled unless 'false' | .env.example; docs/DEPLOY.md:108 | no | no | Kills all cron jobs |
| SPOTIFY_CLIENT_ID | (documented; adapter read) | undefined | .env.example (placeholder) | no (public id) | for live sync | |
| SPOTIFY_CLIENT_SECRET | src/jobs/providerSync.js:90 | undefined | .env.example (placeholder) | **yes** | for live sync | |
| OAUTH_TOKEN_KEY | src/oauth/tokenCrypto.js:25 | — | .env.example | **yes** | for per-artist OAuth token encryption | 32 random bytes |
| OAUTH_STUB | src/oauth/providers.js:218,244 | false | .env.example (commented) | no | no | TEST-ONLY stub |
| OAUTH_REDIRECT_BASE | src/oauth/providers.js:224 | — | **NOT documented** | no | no | OAuth callback base |
| FIXTURE_WIKIPEDIA | src/integrations/index.js:75 | false | **NOT documented** | no | no | Test harness fixture switch |
| HERMETIC_PORT | scripts/run-verify-hermetic.js:23,57 | 3971 | **NOT documented** | no | no | Harness-only |
| PROXY_API_PORT | scripts/serve-static.js:33 | — | **NOT documented** | no | no | Static-frontend proxy |
| API_URL | scripts/run-visual-gate.js:45-46 | — | **NOT documented** | no | no | Harness-only |
| BASE_URL | scripts/run-visual-gate.js | — | **NOT documented** | no | no | Harness-only |
| HEADLESS | scripts (browser workflows) | — | **NOT documented** | no | no | Harness-only |
| SCREENSHOT_DIR | scripts (visual gate) | web/validation | **NOT documented** | no | no | Harness-only |
| VITE_API_BASE_URL | web/src/api/client.js:1 (import.meta.env) | '' (relative URLs) | web/.env.example, web/.env.development, **web/.env.production (empty)** | no | no | Empty in prod template → same-origin calls |
| VITE_BRAND_PROFILE | web/src/brand/index.js | — | web/.env.* | no | no | |
| VITE_MAP_TILE_URL | web/src/components/maps/GeoHeatmap.jsx | legacy default provider | web/.env.* (commented) | no | no | Optional keyed basemap |
| VITE_MAP_TILE_ATTRIBUTION | web/src/components/maps/GeoHeatmap.jsx | — | **NOT documented** | no | no | Attribution string |
| ADMIN_PASSWORD / ARTIST_EMAIL / ARTIST_PASSWORD | web/validation/gate.mjs:35-36 | demo defaults | **NOT documented** | **yes** (harness creds) | no | Visual-gate harness only; defaults are public demo creds |

## Documented but never read (dead config surface)
`.env.example`: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID,
TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_ACCESS_TOKEN, TWITTER_BEARER_TOKEN,
TICKETMASTER_API_KEY, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET,
YOUTUBE_REFRESH_TOKEN, GOOGLE_KG_API_KEY, DISCOGS_API_KEY, DISCOGS_API_SECRET,
GENIUS_API_TOKEN, WIKIPEDIA_CLIENT_ID, WIKIPEDIA_CLIENT_SECRET,
WIKIPEDIA_ACCESS_TOKEN, SPOTIFY_REFRESH_TOKEN, OAUTH_{SPOTIFY,INSTAGRAM,YOUTUBE,TWITTER,TIKTOK}_{CLIENT_ID,CLIENT_SECRET}.
`.env.prod.template`: SESSION_SECRET, OPENAI_API_KEY (code uses JWT_SECRET and
GROQ_API_KEY respectively — template is stale, → BLD-008). → BLD-009 (S4).

## Flags
- **Read but undocumented, security-relevant:** RESET_LINK_BASE (password-reset
  link host; .env.example silent, only docs/DEPLOY.md:106). → BLD-007.
- **Hardcoded fallback secrets:** none found. CRITICAL-2 (JWT fallback literal)
  was removed in Phase 3; `src/config/index.js:76` fail-fasts. Secret scan of
  working tree + full `git log -p --all` history: clean (only placeholder values).
- **Insecure defaults:** STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL and
  RESET_LINK_BASE default to `http://localhost:*` — acceptable for dev, must be
  overridden in prod (RESET_LINK_BASE is covered in docs/DEPLOY.md; Stripe URLs
  rely on the operator reading the TEST-MODE comments).
- **Dev/prod differences:** CORS — dev falls back to a localhost/file allowlist,
  prod with empty ALLOWED_ORIGINS blocks all cross-origin (`origin: false`).
  DEMO_MODE default off in all envs; customer DBs boot empty.
- **`.env.prod.template` staleness:** names SESSION_SECRET and OPENAI_API_KEY
  (never read); omits DEMO_MODE, ALLOWED_ORIGINS, PROVIDER_SYNC_ENABLED,
  DB_STORAGE, Stripe billing vars, OAUTH_TOKEN_KEY. An operator following it
  would misconfigure a deployment. → BLD-008.
