# Flow 2 (DAT): royalty import → reconciliation → monthly close

Role: Data & Integrations Specialist. Scope: data model, validation, integrity,
provenance, failure modes. Money math and policy judgments belong to FIN/MUS;
endpoint auth to SEC.

## 2.1 Royalty CSV import (`POST /v3/royalties/import`)

- Multipart CSV → `parseCsv` → required-header check (`src/routes/royalties.js:307+`).
- Rows validated: exact-decimal money strings via `parseDecimal` (`src/finance/decimal.js`
  — throws on anything non-decimal, including `null`), ISRC/artist/period mapping against
  the catalog via versioned `SourceMapping` rows (`source_mappings`, unique (source, headerHash)).
- **Whole import runs inside one Sequelize transaction** — atomic. Verified.
- Dedup: statement identity = (source, period, sourceFileHash) unique index; rowHash per line;
  same-file re-import rejected with `alreadyImported`. Revised overlapping statements
  **supersede prior statements and their lines as a unit** (domain state, not deletion).
- Provenance recorded per import: file hash, row hash, mapping version, reviewer identity.
- Unmatched rows are **rejected, never persisted**; the import report lists them
  (`demo/dataset-v1/load.js` asserts this explicitly).
- atVenu merch import (`POST /v3/royalties/import/atvenu`, royalties.js:693+) is likewise
  transactional with in-file + DB dedup and supersede-on-revision. **But it validates
  format, not money consistency**: `netCents == grossCents − feesCents − taxesCents` is
  never checked (DAT-008) — an internally inconsistent settlement is stored and summed
  by `netCents`.

## 2.2 Reconciliation (`src/finance/income.js`, `reconciliation.js`)

- Exact-decimal arithmetic (`parseDecimal`) and integer cents throughout; no float in the
  settlement path (DAT-001 narrowed: settlement is exact).
- `COUNTED_STATES` = {reported, reconciled, approved}: "trusted" totals include
  **unreviewed reported** records — a domain/policy question, MUS owns the judgment.
- Every figure carries provenance: state, who entered/reviewed, import version, evidence
  gaps called out with explicit disclaimers ("reconciliation difference" for income with
  no matching cash evidence).
- **Legacy precision gap (DAT-010):** `RoyaltyLine.amountDecimal` is nullable; both
  `income.js` and `reconciliation.js` call `parseDecimal(l.amountDecimal)` with no
  fallback. `parseDecimal(null)` → `String(null)="null"` → throws. Any pre-change row
  with NULL crashes reconciliation. No backfill found; migrations are SQLite-only (DAT-002).
  Open question: do NULL rows exist in any deployed DB?

## 2.3 Monthly close — cash matching (`src/routes/monthlyclose.js`)

- **Non-atomic match/unmatch (DAT-003):** matching saves the `Payout` row, then separately
  saves the `BankDeposit` row — no transaction. Unmatching does the same in reverse.
  A failure or concurrent request between the two writes leaves a one-sided link.
- No FK or unique constraint enforces the one-to-one Payout↔BankDeposit linkage at the
  model level — the pairing exists only in route code.
- Honest structural note: **there is no persisted "monthly close" entity** — no
  close record, lock, or finalization flag. The close is a computed reconciliation plus
  review states, contracts, mappings, deposits, payouts. "Closing" is a process, not a row.
- Money inputs are strong (exact decimals, integer cents, states, provenance, dedup);
  **cash matching is the weak link in the chain.**

## 2.4 Data-honesty summary for this flow

| Step | Integrity | Provenance | Atomicity |
|---|---|---|---|
| CSV import | exact decimals, versioned mappings, dedup | file/row hash, importer, mapping version | ✅ one transaction |
| atVenu import | integer cents, dedup, supersede | importer, file hash, evidence | ✅ one transaction, but no gross=fees+taxes+net check (DAT-008) |
| Reconciliation | exact decimals, integer cents, states | state + reviewer + evidence gaps + disclaimers | ✅ pure computation |
| Cash match/unmatch | integer cents | matched-by identity | ❌ two separate writes, no transaction (DAT-003) |
| Close finalization | n/a | review states only | n/a — no close entity exists |
