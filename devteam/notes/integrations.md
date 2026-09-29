# Integrations Notes — DAT

Branch: `devteam/review-2026-09-29` · read-only review · 2026-09-29
One row per service/input: auth, token handling/refresh, limits/timeouts/retries,
response validation, mapping, real-vs-mock, provenance, terms/licensing.

## Integration matrix (19 rows)

### Audience / streaming data

1. **Spotify Web API (public, client credentials)** — `integrations/spotify.js`
   Global singleton, refreshes a global env token. Response shape validated (`SafeStatsSchema`).
   Config paths are inconsistent: the singleton uses env creds while the provider-sync
   path uses per-artist OAuth links (DAT-016-adjacent; configuration confusion).

2. **Spotify (per-artist OAuth sync)** — `src/jobs/providerSync.js`, `src/routes/oauth.js`, `src/oauth/providers.js`
   ArtistOAuth rows store AES-256-GCM-encrypted access+refresh tokens (`OAUTH_TOKEN_KEY` required,
   `src/oauth/tokenCrypto.js`). **Refresh tokens are collected but never used** — no expiry check
   against `expiresAt`, no refresh flow anywhere; sync fails after access-token expiry (DAT-006).
   `exchangeCode()` has no timeout, retry/backoff, or normalized-response validation (DAT-016).
   Live runs validate response shape and store observations only in the execution summary —
   Spotify sync **does not write `Stats`** (deliberate Phase 1B honesty), fixture runs marked
   `fixture: true`.

3. **YouTube Data API v3** — `integrations/youtube.js` (header-inspected)
   API-key auth. Quota-bearing; no quota tracking found in reviewed code. Failures merge
   silently over the mock base via `integrations/index.js` (DAT-007).

4. **TikTok** — `integrations/tiktok.js`
   OAuth2 PKCE; fail-closed attribution (strategy 2026-09-28): `/user/info/` returns the token
   owner, so `getUserData()` verifies the token owner's live username against the mapped handle
   and returns null on mismatch — nulls are skipped in the merge. Good pattern.

5. **Instagram Graph API** — `integrations/instagram.js`
   Single configured business account, OAuth; same fail-closed pattern as TikTok — account data
   merged only when the live username matches the artist's mapped handle.

6. **Twitter/X API v2** — `integrations/twitter.js`
   OAuth2 PKCE with a **static plain challenge** (`pulsegrid-static-challenge`) — noted for SEC,
   weak by design (PKCE without verifier entropy).

7. **Ticketmaster Discovery API** — `integrations/ticketmaster.js` (header-inspected)
   API-key auth for artist events.

### Entity audit (A&R / artist verification)

8. **Google Knowledge Graph** — via `modules/entityAudit.js` → `src/services/entityAuditService.js`
   Composite result cached 2 weeks (`?refresh=true` bypasses; response carries `cached: true|false`).
   Quota/toS caching limits not documented in reviewed code.

9. **Wikipedia** — `entityAudit.js` + `src/routes/artists.js:217–238`
   `auditWikipedia()` with `FIXTURE_WIKIPEDIA=1` fixture mode (deterministic tests). Live path
   requires `musicRelated` before attaching (fictional LUMEN VEIL's "Veil of Isis" mythology hit
   is rejected — good). Attached bio is CC BY-SA content attributed via `wikiUrl` link; cached 24h.
   On failure, `wikipedia` stays null (fail-safe).

10. **Discogs** — entity-audit provider. 11. **Genius** — entity-audit provider.
12. **MusicBrainz** — entity-audit provider. 13. **Wikidata** — entity-audit provider.
14. **Fandom** — entity-audit provider; Fandom content is CC BY-SA — attribution handling in the
    audit display path was not verified in this pass.

### Money movement / billing

15. **Stripe Billing (subscriptions)** — `src/routes/billing.js`, `src/payments/stripeClient.js`
    Test-mode-only: rejects non-`sk_test_` keys. Checkout sessions + webhook receiver
    (`POST /v3/billing/webhook`, public, signature-verified via `constructEvent` over the
    raw body stashed by JSON middleware — correct). Local `Subscription` row is a read model;
    **no Stripe event-id dedup** — retries re-apply events (DAT-009). Stub client signs test
    webhooks over `JSON.stringify(payload)`, matching the stub only.

16. **Stripe Connect / direct-sales import** — `src/payments/providers/stripe.js`, `src/routes/directsales.js`
    Integer-cent normalization with currency validation — good. **Charges and payouts each issue
    one `.list({limit})` with no `has_more`/cursor handling — silently stops at the first 100**
    (DAT-005). Import is non-atomic with per-row writes; rerun does not refresh existing payout
    rows' status/arrival fields (DAT-004).

17. **Stripe Connect OAuth** — `src/oauth/providers.js`
    Token exchange shares the no-timeout/no-retry `exchangeCode()` path (DAT-016).

### AI

18. **Groq LLM** — `src/ai/groqClient.js`, `src/ai/aiService.js`, `src/ai/responseParser.js`
    Opt-in (`isConfigured` requires API key); response validation via zod schemas (responseParser);
    20-second Promise timeout with a typed `AiTimeoutError`, **but the timeout does not abort the
    underlying SDK request and there is no retry/backoff** (DAT-016). Usage tracked per call via
    `usageService`; AI answers cached. `DEV_FALLBACK_ANSWER` is exported but has **no call sites** —
    dead code, never served as a fake answer (good). Provider failure never fabricates an answer
    (discriminated result kinds `ok|cached|error`).

### Comms

19. **Email (SMTP/SendGrid)** — `src/services/emailService.js`
    Nodemailer; enabled when `SMTP_HOST` or `SENDGRID_API_KEY` set. Password-reset link base
    defaults to `http://localhost:5173/reset-password` (`RESET_LINK_BASE`) — must be set per
    environment (deployment config, not DAT).

## Cross-cutting observations

- **Resilience (DAT-016):** outbound calls lack a uniform policy. `src/integrations/rateLimiter.js`
  explicitly states its limiters are **diagnostic-only and not used by real outbound calls**.
  No retry/backoff on Groq, OAuth token exchange, or provider sync (provider sync does have
  bounded retries: 3 attempts, exponential backoff — good). Timeouts missing on `exchangeCode()`.
- **Provenance:** `src/services/provenance.js` enforces a `withProvenance` convention
  (source/observedAt/basis measured|estimated, formula mandatory for estimates) for AI-era
  metrics. The legacy `integrations/index.js` merge path predates it and labels nothing (DAT-007).
- **Attribution caching:** entity-audit composite cached 2 weeks; Wikipedia bio 24h; artist
  merged data 24h — a transient provider outage can be served from a mock-filled cache entry
  with no fixture label (DAT-007).
- **Terms/licensing:** no ToS/quota/caching-policy enforcement found in reviewed code for
  Google KG, Ticketmaster, YouTube, Twitter, or TikTok. Wikipedia attribution is via article
  URL (meets the hyperlink-attribution norm); Fandom CC BY-SA attribution unverified.
  Phrase: "not documented/enforced in reviewed code," not a legal conclusion.
