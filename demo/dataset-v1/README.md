# Demo dataset v1

Versioned, deterministic, idempotent fixture dataset for exercising the
royalty pipeline end to end. **Everything here is fictional**: invented
artists, ISRCs, UPCs, amounts, and periods. Demo ISRCs use the unassigned
`ZZ` country code; the demo UPC uses an `88888` prefix. No real
distributor, label, or financial data is represented.

## Contents

- `statements/statement-2026-07-initial.csv` — first July statement.
  4 rows: 3 match the demo catalog, 1 (`ZZAAA2699999`) is a well-formed
  ISRC with no catalog match.
- `statements/statement-2026-07-revised.csv` — revised July statement.
  The distributor corrected one amount; the import supersedes the initial
  July statement **as a unit** (3 lines superseded, 3 imported).
- `statements/statement-2026-08.csv` — August statement. 4 rows: 2 match
  (one ISRC, one UPC), 1 unmatched (`ZZAAA2699999`), 1 invalid amount
  (`not-a-number`, rejected by validation).
- `expected.json` — the deterministic contract: import counts, active line
  counts per period, review states, trusted reconciliation totals, and the
  explicit guarantee that unmatched rows are **never persisted** (they are
  rejected by the import workflow and appear only in the import report).
- `load.js` — the loader (CLI + requireable). See its header for the full
  step list.

## What a load covers

1. Successful imports (July initial, July revised, August).
2. Unmatched records — rejected with `unmatched_catalog`, reported, not
   persisted.
3. Revised statements — statement-level supersede with reviewer identity
   and evidence on every superseded line.
4. Disputed amounts — the revised July `ZZAAA2600001` line (140.00 USD) is
   moved to `disputed` with evidence; disputed amounts are excluded from
   trusted reconciliation totals.
5. Reconciliation differences — the income/cash reconciliation for 2026-08
   is pulled and saved; with no cash evidence on file it records the
   income-vs-cash difference explicitly.
6. Approved export — the two August lines are reconciled then approved, and
   the full financial CSV export is saved under `evidence/`.

## Usage

Against a server booted with `DEMO_MODE=true` (the dataset's ISRCs only
resolve against the demo catalog):

```bash
node demo/dataset-v1/load.js \
  --base http://127.0.0.1:4000 \
  --email admin@pulsegrid.fm --password admin123 \
  --evidence demo/dataset-v1/evidence
```

Every run ends with the same counts and totals; the loader asserts them
against `expected.json` and exits non-zero on any deviation. Re-running is
safe: imports are skipped once lines exist for the marker source
`demo-dataset-v1`, and review transitions tolerate HTTP 409.

`evidence/` is generated output (import reports, reconciliation JSON, the
approved financial CSV export) and is not committed — regenerate it any
time with `--evidence`. The committed contract is `expected.json`, enforced
by `tests/regression/demoDataset.test.js`.
