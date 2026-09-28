# Step 2 — Domain Model, Authorization, Persistence

**Date:** 2026-09-28

---

## 1. Domain Model

### Core financial entities

| Entity | Table | Key fields | Money handling |
|---|---|---|---|
| RoyaltyLine | RoyaltyLines | artistId, catalogKey, period, source, statementId, rowHash, reviewState | amountCents (BigInt boundary) + amountDecimal/amountScale/sourceAmount (exact) |
| RoyaltyStatement | RoyaltyStatements | source, period, status, fileHash | import batch identity; unit of supersede |
| MerchSettlement | MerchSettlements | artistId, period, reviewState | amountCents |
| DirectSale | DirectSales | artistId, provider='stripe', reviewState | amountCents |
| ManualAdjustment | ManualAdjustments | artistId, month, source, reviewState | amountCents (signed; corrections allowed) |
| BankDeposit | BankDeposits | bankRef (unique), amountCents | cash evidence — NEVER income |
| Payout | Payouts | provider, providerPayoutId, amountCents | cash evidence — NEVER income |
| CashMatch | (via FKs) | payoutId ↔ depositId | evidence linkage |
| CommissionContract | CommissionContracts | artistId, rateBps, basis, effectiveFrom/To, exclusions | deterministic calc inputs |
| ExpectedReport | ExpectedReports | source, period, status | evidence-gap calendar |
| SourceMapping | SourceMappings | source, columnSignature, version | versioned mapping history |
| CashGapAnnotation | CashGapAnnotations | gapId, owner, nextAction | human ownership of gaps |

### Review state machine
`reported → reconciled → approved`, plus `disputed`, `estimated`, `superseded`.
- `superseded` is set ONLY by the import path, never by the review API.
- Every transition records `reviewedBy` + `reviewedAt` + optional evidence.
- Counted income = reported + reconciled + approved. Disputed/estimated are reported separately, never in totals.

### Supporting entities
User (RBAC + artistAccess), Artist, Recording, Release, Work, WorkRecording (catalog), AnrSubmission, RoomDemo/Vote/Setting, Campaign, SalesEntry (legacy), Subscription, ArtistOAuth, PaymentConnection, ArtistPaymentMapping, AuditEvent, Stats.

---

## 2. Authorization — Verified

**Mechanism:** JWT (`authenticateToken`) → role check (`requireAdmin`) → per-artist grants (`hasArtistAccess` / `checkArtist` / `requireGrants`).

**Live verification (2026-09-28, demo API :4000):** 7/7 pass
- Unauthenticated → 401
- Artist reads own overview → 200
- Artist cross-artist reconciliation → 403
- Artist `/v3/users` → 403
- Artist royalty-line review → 403
- Admin full access → 200

**Unauthenticated route audit:** 6 routes lack `authenticateToken`; all are legitimately public (login, forgot/reset password, Stripe webhook with signature verification, 2 OAuth callbacks).

**Data isolation:** `normalizeArtistAccess` handles scalar/array/JSON/'all'/'none'. Artist `tours@novakin.band` is scoped to `art_novakin` only. Fail-closed: no grants → 403.

---

## 3. Persistence

- **ORM:** Sequelize. SQLite (demo/dev) or Postgres (`DB_DIALECT`).
- **Migrations:** `src/models/migrations.js` — explicit, transactional repairs (e.g., SalesEntries unique-index repair with `VACUUM INTO` backup before destructive work). New tables via `sync()`; never lossy without backup.
- **Restart durability:** Verified by test suite (data survives two restarts; file-backed SQLite). Demo uses `.demo-data/demo.sqlite`.
- **Money:** BigInt cents internally; exact decimals preserved per line (`amountDecimal`/`amountScale`); boundary rounding (half-up to cents) applied once per aggregate, never per line.

---

## 4. Audit Gap — Repaired (2026-09-28)

**Finding:** `AuditEvent` existed but financial write paths never emitted events. Only artist/auth/user actions were logged.

**Fix:** Fire-and-forget `emitAudit` added to:
- `royalties.js`: `royalty.import` (per statement: source, period, imported/superseded counts), `royalty.review` (from→to, artistId)
- `monthlyclose.js`: `cash.deposit`, `cash.match`, `finance.adjustment`, `finance.adjustment.review`, `finance.commission`
- `analytics.js`: `finance.manual-sale`

Audit failure never blocks the business write (catch-and-log). Backend suite still 333/333 after the change.
