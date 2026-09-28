# Step 5 — Reconciliation and Provenance

**Date:** 2026-09-28 (live against demo API :4000)

---

## 1. Reconciliation Structure — Verified Live

`GET /v3/financials/reconciliation` returns:
- `income`: per artist, per currency — `countedCents` (reported+reconciled+approved), `approvedCents`, `disputedCents`/`estimatedCents` as SEPARATE lines (never summed into trusted totals), per-category `royaltiesCents`/`royaltiesExact`/`merchSettlementsCents`/`directSalesCents`/`manualAdjustmentsCents`.
- `cash`: matched payout/deposit pairs (with links), unmatched items, per-(period,currency) gaps with owner + next action. **Cash is never added to income.**
- `evidenceGaps`: missing expected reports, unapproved column layouts, unexplained variances — shown, never auto-filled.
- `coverage`: per-category period-filtering disclosure (which date field filters which category, how many records, how many excluded).
- `disclaimers`: explicit statements that this is not a P&L, not a credit rating.

## 2. Provenance — Verified Live

Every income line is traceable to its source:
```
reconciliation totals → /v3/royalties/lines?artistId&period →
  { id, catalogKey, sourceAmount, amountDecimal, currency, period,
    source, statementId, sourceFileHash (SHA-256), rowRef ("line 2"),
    reviewState, reviewedBy, importVersion }
```

Verified: line id 4 → statement 2 → file `c9323a22…` → "line 2" → `0.003` USD → `decimal-test` source.

## 3. No Double-Counting — Verified Live

- Deposits/payouts/matches are cash evidence, never income. After recording a 7500c deposit against 7500c of royalty income, `countedCents` stayed 7500.
- Superseded statements are excluded everywhere (`reviewState='superseded'` filtered from all aggregates).
- Cross-statement byte-identical rows are rejected, not double-counted.

## 4. Commission Determinism — Verified (code)

`src/finance/commission.js`: contract (rateBps, basis, effectiveFrom/To, exclusions) is data; worksheet = deterministic function of (contract, counted income). Same inputs → same output. No randomness, no LLM in the calculation path.
