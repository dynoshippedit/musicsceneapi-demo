# Financial Data Policy

**The platform is a lens on the label's finances, not a custodian of them.**
This is a product and privacy posture, not legal advice, and it does not
claim to eliminate legal liability. Have counsel review before relying on it.

## The lens, not the custodian

- The API reads the label's sales and statements and presents them back in
  one place. It never takes custody of the label's money and never moves
  money: every payment integration is **read-only** (Stripe Connect is
  authorized with `read_only` scope).
- Platform subscription billing (what the label pays for this software) and
  the label's own direct sales (what the label's customers pay the label)
  are **separate accounts, separate code paths, separate keys**. One can
  never be confused for the other.
- Payouts from the provider to the label's bank are pulled only as
  **reconciliation visibility** — evidence that money moved, not revenue to
  attribute. They never touch per-artist P&L math.

## The user's records stay the user's

- Source files (royalty statements, settlement CSVs, the label's Stripe
  dashboard records) remain the user's records of origin. The API holds a
  normalized, queryable copy with provenance (where it came from, when it
  was imported, by whom); the copy is for the label's own analysis and
  export, not a transfer of custody.
- Disconnecting an integration destroys the stored credentials. Imported
  records remain because the label imported them for its own books — they
  were never the platform's property to keep or delete on its behalf.
- Every imported financial record and every derived report is exportable as
  CSV (`GET /v3/financials/export`), with source provenance per row.

## Money discipline

- **Source precision is preserved exactly.** Imported royalty lines keep
  the source amount as an exact decimal (`amountDecimal` + `amountScale`,
  plus the original `sourceAmount` string) — never a float, never
  pre-rounded to cents. DDEX DSR uses decimal fields, and line-level cent
  rounding would destroy real money (1,000,000 lines × $0.003 = $3,000).
- **Integer cents only at documented boundaries.** `amountCents` is the
  settlement/payment boundary value, computed once per aggregate by a
  single reproducible rule: **round-half-up to 2 decimals**
  (`src/finance/decimal.js`). Aggregation sums the exact decimals first,
  then rounds once — never per line.
- **Provenance on every imported line:** source file SHA-256
  (`sourceFileHash`), row reference (`rowRef`), and import version
  (`importVersion`), alongside imported-by/at.
- **ISO 4217 currency codes**, uppercase, stored per record.
- **No cross-currency conversion.** Totals are per-currency; converting is
  the label's accounting decision, not the API's.
- Imports are **idempotent and supersede-safe**: re-uploading the same file
  (same SHA-256) is rejected as a duplicate and can never double-count.
  Uploading a *revised* file (same statement key, different hash)
  **supersedes** the prior lines — the old rows are marked `superseded`
  (excluded from totals) and the new rows link to them. Revised statements
  replace; they never duplicate.
- Attribution is **explicit or nothing**: sales are mapped to artists only
  through label-managed mappings (product/price/metadata rules). Sales with
  no mapping are reported as **unattributed** — never guessed.

## Review state machine: humans control final amounts

Every financial record (royalty line, merch settlement, direct sale)
carries a review state:

- `reported` → `reconciled` → `approved` — the normal path. Each step
  records **reviewer identity** (`reviewedBy`), **supporting evidence**
  (`reviewEvidence`), and a timestamp.
- `disputed` — a reviewer flagged the record; the dispute evidence is
  stored, and the record is flagged (not silently counted) in outputs.
- `estimated` — the amount is an estimate, not source-backed. Estimates
  are labeled as such everywhere they appear; they are never presented
  as exact.
- `superseded` — replaced by a revised import (terminal; set only by the
  supersede mechanism).

Transitions happen only through the review endpoints
(`PATCH /v3/royalties/lines/:id/review`,
`PATCH /v3/royalties/settlements/:id/review`,
`PATCH /v3/direct-sales/:id/review`), admin-only, with invalid transitions
rejected. Deterministic calculations and authorized human reviewers
control final amounts — nothing auto-approves.

## What the numbers are — and are not

- The first output is an **income and cash reconciliation**
  (`GET /v3/financials/reconciliation`), shipped with a **coverage
  statement**: which sources and periods are included, which review states
  count, what is excluded (costs, expenses, liabilities), and the precision
  rule. It is **not a profit-and-loss statement** — it becomes one only
  with cost inputs and an accountant-approved policy.
- A source-backed income record is **never presented as a credit rating**,
  and nothing in the API implies acceptance by any funder, lender, or
  investor. The reconciliation carries that disclaimer in the response
  itself.
- When evidence is absent, the API **shows the gap** (unattributed sales,
  missing sources, unreconciled lines) — it never manufactures a plausible
  figure to fill it.

## AI and financial data: explicit user initiation and opt-in only

- AI never autonomously touches financial information. No scheduled job,
  sync, or report generator invokes AI on its own. The monthly report job
  runs in deterministic, non-AI mode; the interactive report endpoints
  default to non-AI as well.
- Financial AI analysis exists behind exactly one door:
  `POST /v3/ai/financial-analysis`, which requires the request body to
  contain `acknowledgeNotAdvice: true` — an explicit, per-request
  acknowledgment that the output is **not financial advice** and the user is
  responsible for their own decisions. There is no ambient, default-on, or
  inferred-consent path.
- Every AI-produced financial output carries the disclaimer from
  `src/ai/disclaimer.js` with user responsibility stated in the response
  itself.
- Deterministic (non-AI) reporting — summaries, reconciliation, CSV export
  — is always available and is the default.

## What AI may and may not do with financial data

AI is an assistant to the label's reviewers, never a decider:

- **May:** propose field mappings for an import (e.g. suggest which CSV
  column is the amount), explain anomalies in financial data, and draft
  follow-up questions for the label's reviewers. Proposals are shown to a
  human; they are never auto-applied to financial records.
- **May not:** set, adjust, or approve amounts. Deterministic calculations
  and authorized human reviewers (via the review state machine) control
  final amounts.
- **When evidence is absent, show the gap.** AI must not manufacture a
  plausible figure — no invented amounts, no filled-in missing periods, no
  guessed attributions. An unattributed sale stays unattributed; a missing
  statement stays missing, visibly.

## What this policy does not claim

- It does not claim the product has no legal exposure, and it does not
  constitute legal advice. Data-handling, money-transmission, tax, and
  consumer-protection obligations still apply and need counsel's review.
- "Test mode only" is a guardrail, not a certification: no code path is
  *allowed* to touch live money, but that is enforced by key checks and
  refused livemode accounts, not by an external audit.
