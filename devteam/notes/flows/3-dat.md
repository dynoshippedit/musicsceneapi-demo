# Flow 3 (DAT): provider sync data flow

Role: Data & Integrations Specialist. Covers `src/jobs/providerSync.js`, the Stripe/Spotify
adapters, `ProviderSyncExecution`, and where synced data lands (or deliberately doesn't).

## 3.1 Execution model

- Each run is a durable `ProviderSyncExecution` row: provider, kind, idempotency key
  (default provider/kind/**hour**), status, result summary JSON.
- `findOrCreate` on the idempotency key protects normal duplicates; **stale-run takeover
  is read-then-update with no lock or compare-and-swap** — two workers could both claim
  a stale run (DAT-013; PM2 runs a single fork instance, so this is cron-vs-manual-trigger only).
- Retry: bounded, 3 attempts, exponential backoff. Fixture runs explicitly marked
  `fixture: true`. Secrets in logs are redacted (`refresh_token=[redacted]`).

## 3.2 What each provider actually writes

| Provider | Writes to DB? | Detail |
|---|---|---|
| Spotify (live) | **No** | Validates response shape (`SafeStatsSchema`), stores observations in the execution summary only. **Does not update `Stats`** — deliberate Phase 1B honesty ("no fabricated numbers"). |
| Spotify (fixture) | No | Marked `fixture: true`. |
| Stripe (provider-sync adapter) | **No** | Counts **first-page** charges only (`.list({limit})`, no `has_more`/cursor — DAT-005), stores the count in the summary. **Does not normalize or write `DirectSale` rows.** |
| Stripe (direct-sales route) | Yes | `POST /v3/direct-sales/sync` (separate route) performs the actual persistence: normalized integer-cent `DirectSale` rows, `Payout` rows via `findOrCreate`, artist resolution via `ArtistPaymentMapping`. Non-atomic loop, no transaction; rerun does not refresh existing payout rows' status/arrival fields (DAT-004). Also first-100-only (DAT-005). |

This distinction is the key DAT point for Flow 3: **the scheduled "provider sync" is
observational (summary only); the data-writing sync is the on-demand
`/v3/direct-sales/sync` route.** They share the Stripe adapter but differ in pagination
behavior (both stop at 100) and in write semantics (neither writes / non-atomic writes).

## 3.3 Token lifecycle (DAT-006)

- Artist OAuth links store AES-256-GCM-encrypted access + refresh tokens (`OAUTH_TOKEN_KEY`
  required, `src/oauth/tokenCrypto.js`).
- Sync decrypts and uses **only the access token**; `expiresAt` is never checked, and no
  code path ever uses the refresh token. After access-token expiry: 401 → 3 retries → `failed`.
- Recovery is manual re-link; there is no refresh implementation to call.

## 3.4 Data-honesty assessment

- The sync layer is honest about what it does *not* do: no fabricated `Stats`, fixture
  runs labeled, bounded retries, idempotency keys.
- Gaps: silent 100-record truncation (DAT-005) means reconciliation evidence can be
  incomplete without warning; the stale-takeover race (DAT-013) and missing refresh
  (DAT-006) are the structural weaknesses.
- `Stats` remains a dead table (DAT-012): defined with a unique (artistId, month) index,
  but with no writers anywhere in `src/` — the provider sync's honesty guarantee and the
  missing writer are the same design decision, which is fine, but the table's presence
  in the schema implies a data flow that doesn't exist.
