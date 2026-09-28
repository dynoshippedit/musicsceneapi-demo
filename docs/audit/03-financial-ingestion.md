# Step 3 — Financial-Ingestion Layer Verification

**Date:** 2026-09-28 (live against demo API :4000)

---

## 1. CSV Import Pipeline — Verified Live

`POST /v3/royalties/import` (multipart CSV, admin-only):
- Header validation with logical-column aliases (`isrc`/`upc`/`catalog` → key; `total`/`royalty_amount`/`earnings` → amount).
- Unknown catalog keys rejected with `unmatched_catalog` (verified: `ZZAAA2690001` rejected; no silent drops).
- Per-row report: `received` / `imported` / `superseded` / `rejected[]` with codes and reasons.
- Same-file SHA-256 → HTTP 200 idempotent reimport (no duplicates).
- Within-file duplicates detected by full row-content hash.

## 2. Statement Identity — Verified

- Every import creates a `RoyaltyStatement` (source, period, fileHash, status).
- Lines carry `statementId`, `sourceFileHash`, `rowRef`, `importVersion`.
- **Supersede rule (fixed 2026-09-28):** a new file revises a prior statement ONLY on `catalogKey` overlap; each overlapped statement is superseded as a unit; disjoint statements stay additive; byte-identical rows across disjoint statements are rejected as cross-statement duplicates (never double-counted).

## 3. Mapping History — Verified (code + live)

`SourceMapping` (unique on source+headerHash):
- Identical layout + approved → reused silently with approver attribution.
- Identical layout + not approved → `reviewRequired: true` on every repeat (never trusted by repetition).
- Changed layout → new version (`mappingVersion`++), status `seen`, explicit "changed since approved vN — re-review required" message. Approval is never inherited across layouts.
- Live: second import with same layout returned `reused: true, status: seen, reviewRequired: true`.

## 4. Exact-Decimal Arithmetic — Verified Live

Imported `0.003`, `10.005`, `99.999` (USD, 2026-10):

| Line | sourceAmount | amountDecimal | scale | amountCents (boundary) |
|---|---|---|---|---|
| 1 | 0.003 | 0.003 | 3 | 0 |
| 2 | 10.005 | 10.005 | 3 | 1001 |
| 3 | 99.999 | 99.999 | 3 | 10000 |

Aggregate: `royaltiesExact = "110.007"`, `royaltiesCents = 11001` (half-up applied once on the sum).

**Guarantees:** source precision preserved exactly per line (scaled integer, never float); internal math in BigInt cents; boundary rounding (round-half-up to cents) applied once per aggregate, never per line. A million $0.003 lines sum to $3,000.00 exactly instead of rounding to zero.

## 5. Cash Evidence Discipline — Verified Live

- `POST /v3/financials/deposits` records bank deposits with unique `bankRef` (409 on duplicate).
- Deposits/payouts/matches are **never** counted as income: reconciliation after a 7500c deposit still shows `countedCents=7500` from royalties only.
- Payout↔deposit matching flags amount differences ("needs an owner and a next action") rather than auto-resolving.
