# DAT Findings — Data & Integrations

Branch: `devteam/review-2026-09-29` · read-only review · 2026-09-29
Role card: B9.9 (float usage, DB schema integrity, API/provider response contracts,
migrations, seeded data). Cross-references: DOC-002 (whitepaper float claim),
TST-003 (GDPR test coverage).

## Index

| ID | Sev | Title |
|---|---|---|
| DAT-001 | S3 | Float types remain in financial/projection paths — P1 lead #11 confirmed but narrowed |
| DAT-002 | S2 | Migrations are ad-hoc SQLite-only repairs; Postgres upgrades get schema evolution silently skipped |
| DAT-003 | S2 | Payout/deposit match and unmatch are non-atomic |
| DAT-004 | S2 | Direct-sales sync is non-atomic and leaves stale payout rows |
| DAT-005 | S2 | Stripe provider lists silently stop at the first 100 records |
| DAT-006 | S2 | OAuth refresh tokens are stored but never used; sync fails after access-token expiry |
| DAT-007 | S3 | Provider failures silently merge over a mock base with no fixture labeling |
| DAT-008 | S3 | atVenu import validates format but not money consistency (net ≠ gross−fees−taxes unchecked) |
| DAT-009 | S3 | Stripe billing webhook has no event-id idempotency |
| DAT-010 | S3 | Legacy NULL `amountDecimal` crashes reconciliation |
| DAT-011 | S3 | User deletion removes only the User row; no export endpoint |
| DAT-012 | S4 | `Stats` table has no writers and no readers — dead schema |
| DAT-013 | S3 | Provider-sync stale-run takeover is read-then-update with no lock |
| DAT-014 | S3 | SQLite concurrency: no WAL, no busy_timeout, concurrent writers exist |
| DAT-015 | S4 | `resetTokenExpiry` type mismatch (STRING epoch millis) |
| DAT-016 | S4 | Outbound-call resilience gaps: no timeout/retry on key paths; rate limiters diagnostic-only |

---

## DAT-001 · S3 · Float types remain in financial/projection paths (P1 lead #11 — confirmed, narrowed)

**Disposition of P1 lead #11:** Confirmed but narrowed. The lead's core claim ("float in
the money pipeline") does **not** implicate settlement: reconciliation, trusted totals,
and KPI accounting are exact-decimal/integer-cents. What remains is float in (a) a
vestigial column, (b) labeled projections, and (c) user-facing mock roster numbers —
which still disproves the whitepaper's "no float … in projections" claim (see DOC-002).

Evidence:
- `src/models/index.js:114`: `revenue: { type: DataTypes.FLOAT, allowNull: false }`
  on `SalesEntry` — the only FLOAT money column in the schema. `SalesEntry` is vestigial:
  no product writer found; `salesService.history()` has no route call sites; manual sales
  now write `ManualAdjustment.amountCents` (integer).
- `src/services/salesService.js:25–27`: `history()` aggregates with `+` on JS Numbers;
  `forecast()` runs float regression and crosses the money boundary via `Math.round`.
- `src/analytics/regression.js:18–40`: OLS on JS floats; `generateSyntheticHistory` is
  dead code (no call sites).
- `src/routes/analytics.js:158–169`: `centsToNumber` converts exact cents to float before
  regression; result rounded to integer cents; user-facing text is labeled "forecast"/"estimates".
- `src/finance/kpi.js:44,67–70`: same float regression on integer-valued floats for
  quarterly/annual projections (labeled).
- `src/utils/dataShape.js:17–24`: `calculateTotalRevenue` float-sums `artist.revenue` —
  this feeds `GET /v3/artists/:id` `totalRevenue`/`projectedAnnual` on the **mock roster**
  path (unlabeled as fixture).
- `src/routes/analytics.js:47`: `parseFloat` on display percentages — cosmetic only.

**Impact:** No wrong settlement numbers; projections are estimates by design and labeled.
The false whitepaper claim and the unlabeled float-summed mock revenue are the real residue.
**Confidence:** Confirmed (code).

## DAT-002 · S2 · Migrations are ad-hoc SQLite-only repairs; Postgres upgrades silently skip schema evolution

Evidence:
- `src/models/migrations.js`: named repair functions (`repairSalesSchema`,
  `addUserSecurityColumns`, `addRoyaltyDedupColumns`, `addMonthlyCloseColumns`) —
  **every one returns immediately for non-SQLite**. No versioned ledger, no history table,
  no rollback chain.
- `src/models/index.js:233`: startup runs plain `sequelize.sync()` (not `alter:true`) —
  creates absent tables, never evolves existing columns/indexes.

**Impact:** Existing Postgres deployments never receive column/index evolutions
(dedup columns, security columns, monthly-close columns, FLOAT→DECIMAL conversions).
Fresh installs are correct; upgraded installs silently drift. This is the enabling
condition for DAT-010 on Postgres. Fix direction: versioned migration tool with a
history table (or per-dialect repair functions).
**Confidence:** Confirmed (code).

## DAT-003 · S2 · Payout/deposit match and unmatch are non-atomic

Evidence:
- `src/routes/monthlyclose.js`: the match handler saves the `Payout` row, then separately
  saves the `BankDeposit` row — no transaction. Unmatch does the same in reverse order.
- No FK or unique constraint at the model level enforces the one-to-one
  Payout↔BankDeposit linkage; the pairing exists only in route code.

**Impact:** A failure or concurrent request between the two writes leaves a one-sided
link — cash evidence that is half-matched. In the reconciliation flow (2-dat.md), cash
matching is the weakest integrity link.
**Confidence:** Confirmed (code).

## DAT-004 · S2 · Direct-sales sync is non-atomic and leaves stale payout rows

Evidence:
- `src/routes/directsales.js:242–356`: the sync loops over payouts and sales with
  individual `findOrCreate`/updates and connection-state writes — no transaction.
- Rerun helps for sales (provider IDs are unique), but payout rows use `findOrCreate`
  and **never refresh existing rows' status/arrival fields** — a payout whose arrival
  status changed upstream keeps its stale local row.

**Impact:** Partial persistence on failure; stale payout state feeding reconciliation.
Fix direction: wrap in a transaction and update-not-just-create on rerun.
**Confidence:** Confirmed (code).

## DAT-005 · S2 · Stripe provider lists silently stop at the first 100 records

Evidence:
- `src/payments/providers/stripe.js:227–238` (charges) and `:275–295` (payouts): each
  issues one `.list({limit})` with **no `has_more`/cursor/auto-pagination handling**.

**Impact:** Both the provider-sync summary counts and the `/v3/direct-sales/sync`
persistence path undercount once a period exceeds 100 charges/payouts — reconciliation
evidence incomplete **without warning**. Fix direction: auto-pagination loop.
**Confidence:** Confirmed (code).

## DAT-006 · S2 · OAuth refresh tokens are stored but never used; sync fails after access-token expiry

Evidence:
- `src/routes/oauth.js:143–151`: callback stores `refreshTokenEnc` (AES-256-GCM,
  `OAUTH_TOKEN_KEY` required) alongside `accessTokenEnc` and `expiresAt`.
- No code path anywhere reads `refreshTokenEnc` or checks `expiresAt` before use;
  `src/jobs/providerSync.js` decrypts and uses **only the access token**.
- `src/oauth/providers.js` `exchangeCode()`: no timeout, no retry/backoff, no
  normalized-response validation before tokens are used/stored.

**Impact:** Spotify (and any OAuth provider) sync breaks permanently after access-token
expiry — 401 → 3 retries → `failed` — until a human re-links. The stored refresh token
is dead weight. Fix direction: expiry check + refresh flow, or remove refresh-token
collection.
**Confidence:** Confirmed (code; absence verified by repo-wide grep).

## DAT-007 · S3 · Provider failures silently merge over a mock base with no fixture labeling

Evidence:
- `integrations/index.js` `fetchArtistData`/`mergeData`: live results merge over a mock
  base; each provider's `catch` only `console.warn`s, so a failed provider's mock values
  remain **indistinguishable from live data** in the response.
- `src/repositories/artistRepository.js:149`: `getArtistData` catches and returns `base`
  (mock) — same pattern one layer up. Merged result cached 24h (`ARTIST_DATA` TTL), so a
  transient outage can be served from a mock-filled cache entry.
- Counterpoints (honest): `GET /v3/anr/scout` labels `{ source: 'fixture' }`
  (`src/routes/anr.js:290`); provider-sync fixture runs are marked `fixture: true`;
  TikTok/Instagram use a fail-closed attribution pattern (mismatch → null → skipped).

**Impact:** Users can see mock numbers presented as artist data with no indication.
Fix direction: carry a per-field or per-response `source: 'live'|'fixture'` label through
the merge (the `provenance.js` convention already exists for AI-era metrics).
**Confidence:** Confirmed (code).

## DAT-008 · S3 · atVenu import validates format but not money consistency

Evidence:
- `src/routes/royalties.js:634–678` `validateSettlementRow`: enforces integer-cents
  format (`CENTS_RE`), safe-integer range, ISO currency, valid date, unambiguous roster
  artist — but **never checks `netCents == grossCents − feesCents − taxesCents`**.

**Impact:** An internally inconsistent settlement (typo'd net) is stored and summed by
`netCents` into trusted totals. Fix direction: reject or flag rows where the identity
fails.
**Confidence:** Confirmed (code).

## DAT-009 · S3 · Stripe billing webhook has no event-id idempotency

Evidence:
- `src/routes/billing.js` `applyEvent`: applies verified events to the `Subscription`
  read model but **never records `event.id`**. (Signature verification itself is correct:
  `constructEvent` over the raw body stashed by the JSON middleware.)

**Impact:** Stripe retries (or concurrent duplicate deliveries) re-apply events. Benign
today (idempotent flag-sets), but there is no replay log and no dedup. Fix direction:
persist processed event IDs with a unique constraint.
**Confidence:** Confirmed (code).

## DAT-010 · S3 · Legacy NULL `amountDecimal` crashes reconciliation

Evidence:
- `src/models/index.js:433+`: `RoyaltyLine.amountDecimal` is **nullable**.
- `src/finance/decimal.js:31–35`: `parseDecimal(null)` → `String(null)` = `"null"` →
  fails `DECIMAL_RE` → throws `not an exact decimal: "null"`.
- `src/finance/income.js` and `src/finance/reconciliation.js` call
  `parseDecimal(l.amountDecimal)` with no fallback.
- No backfill found; migrations are SQLite-only (DAT-002), so Postgres legacy rows
  would never be repaired.

**Impact:** Any pre-change row with NULL `amountDecimal` crashes reconciliation for its
period. **Open question:** do NULL rows exist in any deployed DB? If yes, escalate to S1.
**Confidence:** Confirmed (code path); existence of legacy rows unverified — needs a DB check.

## DAT-011 · S3 · User deletion removes only the User row; no export endpoint

Evidence:
- `DELETE /v3/auth/me` destroys only the `User` row; source comment: *"In production,
  also cascade delete related data or anonymize logs"* (paraphrased). Admin user deletion
  likewise destroys only the User.
- **No data-export endpoint found** (no route assembles per-user personal data).
- Surviving personal data (no FK cascades anywhere): `Campaign.userId`,
  `RoomVote.userId`, `AuditEvent.actorId/actorEmail`, `enteredBy`/`reviewedBy`/
  `importedBy`/`triggeredBy` email strings on financial rows, generated PDF/CSV reports
  and logs.
- Overlap: TST-003.

**Impact:** Erasure is explicitly incomplete by the code's own admission; export is absent.
S3 (known gap) rather than hidden defect; escalates if offered to EU/UK users.
**Confidence:** Confirmed (code).

## DAT-012 · S4 · `Stats` table has no writers and no readers — dead schema

Evidence:
- `src/models/index.js:53`: `Stats` defined with unique index (artistId, month).
- Repo-wide grep: **zero** `Stats.create/update/upsert/bulkCreate/destroy` and zero member
  reads in `src/` (only the destructure in artists.js/analytics.js, unused).
- `src/jobs/providerSync.js:22`: sync deliberately does not write Stats (Phase 1B honesty).

**Impact:** The schema implies a streaming-stats data flow that doesn't exist. Either wire
a writer or drop the table; as-is it's misleading surface. (The provider-sync honesty
decision itself is good.)
**Confidence:** Confirmed (code).

## DAT-013 · S3 · Provider-sync stale-run takeover is read-then-update with no lock

Evidence:
- `src/jobs/providerSync.js`: stale execution rows are claimed via read-then-update —
  no row lock, no compare-and-swap. Two workers can both take over the same stale run.

**Impact:** Mitigated by `ecosystem.config.js` (`instances: 1`, fork) — single process,
so only cron-vs-manual-trigger races. Keep S3; revisit if process count changes.
**Confidence:** Confirmed (code); exploitability Likely-limited.

## DAT-014 · S3 · SQLite concurrency: no WAL, no busy_timeout, concurrent writers exist

Evidence:
- Sequelize SQLite options set no `journal_mode` (default DELETE, not WAL) and no
  `busy_timeout` (node-sqlite3 default 0 → immediate SQLITE_BUSY).
- Concurrent writers exist: HTTP requests + in-process cron/provider-sync jobs; plus
  non-atomic multi-write flows (DAT-003, DAT-004) widen the contention window.

**Impact:** Under write contention the loser gets SQLITE_BUSY → 500s on unrelated
requests. Fix direction: WAL + busy_timeout, or serialize the cron writers.
**Confidence:** Confirmed (config).

## DAT-015 · S4 · `resetTokenExpiry` type mismatch (STRING epoch millis)

Evidence:
- `src/models/index.js:35`: `resetTokenExpiry: { type: DataTypes.STRING }`
  ("SQLite date handling is strict, use String for safety").
- `src/routes/auth.js:208`: stores `String(Date.now() + 3600000)`; `:264` compares via
  `Number(...) > Date.now()`; `:279` queries `[Op.gt]: String(Date.now())` —
  lexicographic comparison of same-length epoch strings.

**Impact:** Works today (fixed digit length), but the type lies: any consumer treating
it as a date gets a string. S4 cleanup — store INTEGER epoch millis or a real DATE.
**Confidence:** Confirmed (code).

## DAT-016 · S4 · Outbound-call resilience gaps

Evidence:
- `src/oauth/providers.js` `exchangeCode()`: no timeout, retry/backoff, or
  normalized-response validation.
- `src/ai/groqClient.js`: 20-second Promise timeout with typed `AiTimeoutError`, but
  **the timeout does not abort the underlying SDK request** and there is no retry.
- `src/integrations/rateLimiter.js`: **explicitly states its limiters are
  diagnostic-only and not used by real outbound calls.**

**Impact:** Transient provider failures surface as hard failures (or hang, in the
exchangeCode case) rather than retried; no cost/rate protection on live calls.
S4 as no incident is evidenced, but the resilience posture is weaker than the
rate-limiter file's presence suggests.
**Confidence:** Confirmed (code).

---

## P1 lead #11 — final disposition

**Confirmed but narrowed.** See DAT-001. Settlement and reconciliation are exact
(exact-decimal strings, integer cents); float survives only in the vestigial
`SalesEntry.revenue` column, labeled projections/forecasts, display percentages, and
float-summed mock roster revenue. The whitepaper's "no float … in projections" claim
remains false (DOC-002).

## Questions for the tech lead (recommended defaults)

1. Do any deployed DBs contain `RoyaltyLine` rows with NULL `amountDecimal`? **Default: assume
   no;** if yes, escalate DAT-010 to S1 and backfill before next reconciliation run.
2. Are there Postgres deployments with schema older than current models? **Default: assume
   yes;** adopt a versioned migration tool (DAT-002).
3. Should merged artist responses carry `source: 'live'|'fixture'` labels? **Default: yes**
   (DAT-007), following the existing `withProvenance` convention.
4. Implement OAuth token refresh, or drop refresh-token collection? **Default: implement
   refresh** (DAT-006) — collecting tokens you never use is the worst of both.
5. Add auto-pagination to Stripe provider lists? **Default: yes** (DAT-005).

## Blockers

None. One SSH drop during the session; recovered after backoff. Source was read-only
throughout; no commits, pushes, or live provider calls made.
