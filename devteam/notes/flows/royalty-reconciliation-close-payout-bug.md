# Flow note (BUG) — Royalty import → matching → reconciliation → monthly close → payout

Branch `devteam/review-2026-09-29`, read 2026-09-29. Source read-only; this note is BUG-lane only.

## Hop chain

1. **CSV import** — `POST /v3/royalties/import` (`src/routes/royalties.js`, ~1,076 lines total).
   - CSV parsed (papaparse-style parse), column mapping applied per `SourceMapping`
     (`src/routes/monthlyclose.js:503` lists mappings; mapping approval at `monthlyclose.js:526`).
   - Rows grouped into `RoyaltyStatement`s; statements can be superseded
     (`src/routes/royalties.js` supersede logic — newer import of the same
     provider+period marks the old statement superseded, never deleted).
2. **Catalog matching** — imported lines matched to `Work`/`Recording` catalog
   (`src/routes/royalties.js` matching section). Unmatched lines stay visible as
   unmatched, never silently dropped.
3. **Money representation** — `RoyaltyLine.amountCents` INTEGER (`src/models/index.js`);
   all aggregation in `src/finance/reconciliation.js` and `src/finance/commission.js`
   uses BigInt/exact-decimal (`src/finance/decimal.js`). No float in the trusted path.
4. **Reconciliation** — `GET /v3/financials/reconciliation` (`src/routes/directsales.js:521-544`)
   → `buildReconciliation({ RoyaltyLine, MerchSettlement, DirectSale, ManualAdjustment,
   Payout, BankDeposit, CashGapAnnotation, ExpectedReport, SourceMapping, RoyaltyStatement },
   { artistIds, period })`.
   - Reported income vs cash received compared per period+currency; gaps surface as
     `CashGapAnnotation`s (human-owned, `monthlyclose.js` annotate endpoint).
   - Expected-report calendar (`ExpectedReport`) flags missing statements as EVIDENCE GAPs.
   - Error path: `catch (err) { ...; res.status(500).json({ error: err.message || 'Reconciliation failed' }) }`
     (`directsales.js:543-544`) — `err.message` reaches the client (SEC-owned leak surface;
     correctness note: error contract is free-form, not a stable shape).
5. **Monthly close** — `src/routes/monthlyclose.js`:
   - Manual adjustments (`ManualAdjustment`, integer cents) with review-state machine
     (`src/finance/reviewState.js`; approve at `monthlyclose.js:318`).
   - **Deposits**: `POST /v3/financials/deposits` (`monthlyclose.js:114-135`) — admin only.
     Validates `amountCents` (`/^\d+$/`, `Number.isSafeInteger`), `currency` (`/^[A-Z]{3}$/`),
     `bankRef` required + duplicate-bankRef → 409. `depositAt: depositAt ? new Date(depositAt) : new Date()`
     (`monthlyclose.js:129`) — **no validity check**: `new Date('garbage')` is Invalid Date →
     Sequelize create throws → 500 `Database error` instead of 400 → **BUG-008 (S3)**.
   - **Payout/deposit matching**:
     - `POST /v3/financials/matches` (`monthlyclose.js:177-224`): validates integer IDs (400),
       404s on missing rows, 409s if either side already matched or currencies differ,
       then `payout.save()` (`:203`) and `deposit.save()` (`:207`) as **two separate
       writes, no transaction, no row lock** → **BUG-001 (S1)**.
     - `DELETE /v3/financials/matches` (`monthlyclose.js:226-247`): requires BOTH sides
       to agree (`payout.matchedDepositId !== deposit.id || deposit.matchedPayoutId !== payout.id`
       → 409, `:232-234`), then clears both sides with two separate saves (`:240`, `:243`).
       Consequence: a half-written match (payout saved, deposit save failed) can never be
       un-matched through the API — the 409 guard blocks the only repair path.
     - Model level (`src/models/index.js:628-668`): `matchedDepositId`/`matchedPayoutId`
       are plain nullable INTEGERs — no unique constraint, no FK. Concurrent match
       requests for the same payout can both pass the 409 checks before either saves
       (check-then-act race) → conflicting links.
   - **Commission worksheet**: `GET /v3/financials/commissions/worksheet`
     (`monthlyclose.js:417-444`) → `buildWorksheet` (`src/finance/commission.js:122+`).
     Route selects `contracts[0]` — newest by `effectiveFrom` DESC (`:425`) — **without
     filtering to contracts covering the requested period**. `buildWorksheet` computes
     `commissionCents` from that contract's `rateBps` regardless; `contractCoversPeriod`
     (`commission.js:109-115`) only flips `status` to `'draft_contract_not_effective_for_period'`
     (`commission.js:251-253`). A consumer reading `commissionCents` without checking
     `status` gets a number computed under the wrong contract → **BUG-002 (S2)**.
     (The `contractCoversPeriod` string comparison itself is sound: `effectiveFrom`/`effectiveTo`
     are `DataTypes.STRING` YYYY-MM-DD columns, `src/models/index.js:704-705`.)

## Authorization observed

- All `/v3/financials/*` mutation endpoints: `authenticateToken` (composite) + `requireAdmin`.
- Reconciliation GET: any authenticated user, artist-scoped via `hasArtistAccess`
  (`directsales.js:524-527`); `period` validated `/^\d{4}-\d{2}$/` → 400.
- Commission worksheet: `checkArtist` gate; `contractId` override param exists.

## BUG observations filed

- **BUG-001 (S1)** — non-atomic payout/deposit match & unmatch.
- **BUG-002 (S2)** — worksheet uses newest contract even when it doesn't cover the period.
- **BUG-008 (S3)** — invalid `depositAt` → 500 instead of 400.
- Dismissed: reset-audit rejection (see password-reset note); `contractCoversPeriod`
  comparison (columns are strings, comparison is lexicographic-correct).
