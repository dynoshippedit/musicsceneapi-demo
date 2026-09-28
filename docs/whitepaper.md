# The Music Scene — White Paper

**Pulsegrid Intelligence Platform · Label Financial Operations**
**Version 1.0 — September 28, 2026**

---

## 1. What this is

The Music Scene is a label financial-operations platform. It answers one question, precisely:

> *For a given artist and a given month, how much income has been reported, how much of it has been reviewed, what cash has actually arrived, and what is still unexplained?*

Everything in the system serves that question. The platform ingests royalty statements, merch settlements, direct sales, and manual adjustments; tracks each record through a human review workflow; matches bank deposits to provider payouts as cash evidence; flags the gaps; and produces a monthly close that an artist's team can read, verify, and share.

What it is not: it is not accounting software, not a P&L generator, not a credit instrument, not a tax product, and not a royalty *calculator* in the contractual sense. It reports what sources said, what humans reviewed, and what cash arrived. It never invents numbers.

---

## 2. The problem

An independent label's income arrives as a mess. A distributor sends a CSV with one column layout; a merch company sends a PDF settlement with another; Stripe pays out on its own schedule in its own timezone; a manager emails a spreadsheet correction. Each source uses different identifiers (ISRC, UPC, internal SKUs), different amount formats (dollars, cents, fractional cents, locale-formatted strings), different period conventions, and different ideas of what "September" means.

The failure modes are well known:

1. **Silent double-counting.** A revised statement is imported alongside the original; both count.
2. **Precision loss.** A $0.003-per-stream rate rounded to cents per line turns a million streams into $0.00.
3. **Cash confusion.** A bank deposit is treated as new income on top of the royalty statement it settles — the same money counted twice.
4. **Unreviewed trust.** Numbers flow from CSV to dashboard with no record of who looked at them.
5. **Schema drift.** A source changes its column layout; the import silently mis-maps columns.
6. **Missing reports.** A source that usually reports monthly goes quiet; nobody notices.

The Music Scene is built as a direct answer to each of these.

---

## 3. Architecture

The system is a Node.js/Express API (`/v3/*`) with a React 18 + Vite frontend, backed by Sequelize (SQLite for demo/dev, Postgres for production). The entry point is `server.js`, which enforces three boot invariants in order: secrets are validated before any side effect; the database initializes before the listener binds; scheduled jobs register explicitly and can be disabled.

The backend is organized by domain:

- **`src/routes/royalties.js`** — CSV import, statement identity, review transitions, merch settlements.
- **`src/routes/monthlyclose.js`** — deposits, payouts, cash matching, commission contracts, expected reports, manual adjustments, gap annotations.
- **`src/routes/analytics.js`** — projections and manual sales entries.
- **`src/routes/label.js`** — the label overview (reviewed KPIs only).
- **`src/finance/`** — the money library: exact-decimal parsing (`decimal.js`), income fetching and aggregation (`income.js`), reconciliation (`reconciliation.js`), deterministic commissions (`commission.js`), the review-state machine (`reviewState.js`).
- **`src/models/`** — Sequelize models and transactional migrations.
- **`src/auth/`** — JWT authentication, role checks, per-artist grants.
- **`src/profile/`** — the Label Intelligence Profile: white-label brand, seed data, and AI fallback strings isolated per label.

The frontend (`web/src`) is a 14-page React application with a design-token system. The financial workspace (`FinancePage`) is a five-step monthly-close wizard: review income, match cash, resolve gaps, draft commissions, close and share. Every view carries loading, error, and empty states.

---

## 4. The financial core

### 4.1 Exact money

Money is stored as integer cents (BigInt-safe) for settlement boundaries, and as exact scaled decimals (`amountDecimal` / `amountScale` / `sourceAmount`) for source precision. A DDEX-style amount of `$0.003` is stored exactly — never as a float, never pre-rounded.

The boundary rule: **rounding (round-half-up to cents) is applied once per aggregate, never per line.** One million lines at $0.003 sum to exactly $3,000.00. Per-line cent rounding would have produced $0.00. The aggregate response carries both the exact decimal (`royaltiesExact: "110.007"`) and the boundary value (`royaltiesCents: 11001`) so the derivation is always inspectable.

### 4.2 Review states

Every money record carries a review state: `reported → reconciled → approved`, plus `disputed`, `estimated`, and `superseded`. The transitions are:

- Forward-only through reported → reconciled → approved (a record cannot skip).
- `disputed` and `estimated` are terminal-ish flags: they are reported as separate lines and **never summed into trusted totals**.
- `superseded` is set only by the import path when a revised statement arrives — never by the review API, never by a human clicking.

Every transition records `reviewedBy`, `reviewedAt`, and optional evidence. "Counted income" — the only number that feeds KPIs and projections — is the sum of reported + reconciled + approved.

### 4.3 Statement identity and supersession

Each imported file becomes a `RoyaltyStatement`: source, period, file hash, status. Each line carries its `statementId`, the file's SHA-256, its row reference, and an import version.

When a new file arrives for the same source and period, it revises prior statements **only where rows overlap by catalog key**. The overlapped statement is superseded as a unit — all of its active lines move to `superseded` together. A file with no overlapping keys is additive, not a revision. Byte-identical rows appearing across two disjoint active statements are rejected as cross-statement duplicates: the system refuses to double-count rather than guessing.

### 4.4 Mapping history

Column layouts are fingerprinted (SHA-256 of the normalized header) and versioned per source in `SourceMapping`. The rules:

- An identical layout to an **approved** mapping is reused, with the approver named.
- An identical layout to an **unapproved** mapping stays visibly review-required on every repeat — repetition never earns trust.
- A **changed** layout creates a new version with status `seen`; approval is never inherited across layouts. The import report says plainly: "column layout changed since approved mapping v3 — re-review required."

### 4.5 Cash is evidence, not income

Bank deposits and provider payouts are recorded as cash evidence. They are **never** added to income totals. Matching a payout to a deposit links two observations of the same money; it does not create income. The reconciliation shows matched pairs, unmatched items, and per-(period, currency) gaps between reported income and matched cash — each gap carrying an owner and a next action, assigned by a human.

Amount mismatches between a payout and its deposit are flagged, not auto-resolved. Unmatched deposits are unresolved items, never silently absorbed into income.

### 4.6 Commissions

A commission contract is data: rate in basis points, basis (counted net income, counted gross income, or cash receipts), effective dates, exclusions, and a source description. The worksheet is a deterministic function of (contract, counted income) — same inputs, same output, every time. No model, no randomness, no judgment in the calculation path. The contract is shown alongside the worksheet so the basis is always visible.

### 4.7 Expected reports

Each source has an expected-report calendar. A source that usually reports monthly and goes quiet appears as an evidence gap — missing, not zero. Changed schemas and unexplained variances are flagged the same way. Gaps are annotated by humans with owners and next actions.

---

## 5. Provenance: every number traces to its source

Any figure in the reconciliation can be drilled down: totals → category → individual lines, each line carrying its statement ID, the source file's SHA-256 hash, the row reference within that file, the exact source amount as written, the review state and reviewer, and the import version. The chain is:

```
reconciliation total
  → /v3/royalties/lines?artistId=…&period=…
    → line { id, statementId, sourceFileHash, rowRef, sourceAmount, reviewState }
      → statement { source, period, fileHash, status }
```

There is no number in the system that cannot be walked back to the file and row it came from.

---

## 6. Authorization and isolation

Authentication is JWT. Authorization is three layers: authentication on every route except the auth flows, webhooks (signature-verified), and OAuth callbacks; role checks (`admin` vs `artist`) on write paths; and per-artist grants on read paths. An artist sees only the artists in their grant list — cross-artist access returns 403, verified live. The grant model is fail-closed: no grant, no access.

Financial write paths (imports, review transitions, deposits, matches, adjustments, commission contracts) are admin-only. Artists get read access to their own reconciliation, statements, and worksheets.

---

## 7. AI boundaries

The platform uses a language model for two things: natural-language queries over label data, and entity-audit assistance. The boundaries are hard:

- **No LLM output enters any financial calculation.** Commissions, reconciliations, projections, and KPIs are deterministic code over reviewed records.
- **Provider failure never fabricates an answer.** A failed AI call returns an explicit error, not a plausible-sounding substitute. Parse failures are returned with `ok: false` and a reason — the failure is marked, never laundered.
- **Access control runs before the AI call**, not after. An artist cannot use the AI to reach another artist's data.
- **Projections are labeled.** Forecasts require at least three months of counted, reviewed income; missing months are shown as gaps, not zeros; disputed and estimated amounts are excluded; the basis is stated in the response.

---

## 8. What the system refuses to do

- It will not double-count. (Supersession, cross-statement dedup, cash-evidence discipline.)
- It will not round away money. (Exact decimals, single boundary rounding.)
- It will not trust an unreviewed number. (Review states; disputed/estimated never in totals.)
- It will not silently accept a changed file format. (Mapping versions, re-review.)
- It will not treat cash as income. (Deposits/payouts are evidence.)
- It will not auto-approve, auto-match, or auto-resolve. (Humans act; the system records.)
- It will not invent data when a provider fails. (Explicit errors, marked fallbacks.)

---

## 9. Operating the demo

### 9.1 One-command launch

```bash
cd /home/dino/mau5trap-repo
./scripts/run-demo.sh
```

This starts the API on port 4000 and the frontend on port 5173 (configurable), writes PID files, and verifies both are responding before returning. To stop:

```bash
./scripts/stop-demo.sh
```

The stop script reads the PID files and terminates exactly those processes — no broad process killing.

URLs (on the demo host): frontend `http://<host>:5173`, API `http://<host>:4000`.

### 9.2 Demo accounts

- Admin: `admin@pulsegrid.fm` / `admin123` — full access.
- Artist: `tours@novakin.band` / `novakin123` — scoped to their own artist.

All names, figures, and activity are fictional and seeded for demonstration.

### 9.3 Backup and restore

The demo database is a SQLite file (`.demo-data/demo.sqlite` by default). Back up by copying the file while the API is stopped, or via `VACUUM INTO` for a hot copy. Restore by replacing the file and restarting. Migrations back up the database automatically before any destructive schema repair.

### 9.4 The monthly-close walkthrough (admin)

1. **Import.** Upload a royalty CSV (Finance → Evidence → Import). Check the per-row report: imported, superseded, rejected with reasons. New column layouts will be flagged for mapping review.
2. **Review.** Open Finance → Monthly Close → step 1. Move lines from `reported` to `reconciled` to `approved`, attaching evidence notes.
3. **Cash.** Step 2: record the bank deposit (unique bank reference), record the provider payout, match them. Watch the totals: matched cash never inflates income.
4. **Gaps.** Step 3: assign owners and next actions to unmatched items and missing expected reports.
5. **Commissions.** Step 4: create the contract (rate, basis, dates, exclusions), then generate the worksheet. Verify the basis shown matches the contract.
6. **Close.** Step 5: review the reconciliation summary and export/share.

### 9.5 The artist walkthrough

Log in as the artist. The dashboard shows only their income: counted totals, review-state breakdown, per-currency figures, and the commission worksheet for their contract. Every number links back to its source lines. There is deliberately no admin surface: no imports, no review transitions, no other artists.

---

## 10. Honest limitations

- **Demo data is fictional.** All artists, statements, amounts, and payouts are invented. Nothing here is financial advice.
- **Single-currency maturity.** Multi-currency is tracked per currency; there is no FX conversion and no consolidated cross-currency total. That is deliberate — invented exchange rates would be worse than none.
- **SQLite demo.** The demo runs on SQLite. Production deployments should use Postgres (`DB_DIALECT=postgres`).
- **AI is assistive.** The language model answers questions and drafts audits; it does not touch money, and its failures are explicit.
- **Statement-level supersession.** If one revised file overlaps two prior statements, both are superseded but only the first supersession link is stored. Line-level provenance is unaffected.
- **No DDEX.** The importer handles CSV layouts. Native DDEX (ERN/DSR XML) is out of scope until a customer supplies DDEX files.
- **Contracts are unaudited code.** The commission engine is deterministic and tested, but it is not a legal instrument. Commission terms live in real contracts; the system mirrors them as data.
- **Reconciliation is not a P&L.** It reports reviewed income and cash evidence. It does not do accruals, depreciation, tax, or anything else a real accounting system does.

---

## 11. Test coverage

- **Backend:** 333 tests across 56 suites — routes, financial logic, review-state machine, import/supersede behavior, authorization boundaries, migrations.
- **Frontend static gates:** 9 checks — brand isolation, design-token discipline, no hardcoded identities or credentials.
- **Visual/contract gates:** login geometry, page-access contracts, live API payload shapes.
- **Browser workflows:** 8 end-to-end journeys through the real UI against the live API.
- **Snapshot contracts:** API response shapes pinned; repairs go to `repaired_contracts.json`, never by editing the baseline.

The rule is: a failing test is fixed in code, or the contract is updated deliberately with a comment explaining why. Tests are never weakened to pass.

---

## 12. Roadmap (not promises)

- Native DDEX ERN/DSR ingestion when a customer supplies files.
- Postgres-backed multi-user production profile.
- Per-label data residency options.
- Read-only artist API keys.
- Expanded evidence-gap automation (still human-resolved).

None of these are committed until a paying label asks for them.

---

*The Music Scene · Pulsegrid Intelligence Platform · demo build · September 2026.*
*All figures fictional. Not financial advice.*

---

## 13. The review-state machine in detail

The review workflow is the system's central trust mechanism. Every money record — royalty line, merch settlement, direct sale, manual adjustment — carries a `reviewState` that moves through a strict machine:

```
reported ──→ reconciled ──→ approved
   │              │              │
   └──────→ disputed ←───────────┘
   └──────→ estimated
```

`reported` is the entry state: the record exists, parsed from a source, and nobody has vouched for it. `reconciled` means a human has checked it against its source and found it consistent. `approved` means it is accepted into the label's trusted figures. `disputed` and `estimated` are quarantines: the record is visible, counted separately, and excluded from every trusted total.

The machine enforces three invariants:

1. **Forward-only progression.** A record moves reported → reconciled → approved. It cannot skip from reported to approved, and it cannot move backward. Disputed and estimated can be entered from any state but require a fresh review cycle to leave.
2. **Supersession is not a review action.** When a revised statement arrives, the import path moves the old lines to `superseded` as a unit. The review API rejects any attempt to set `superseded` — it is a provenance fact, not a judgment.
3. **Identity on every transition.** Each move records who made it, when, and with what evidence. The audit log carries a parallel entry so the history survives even if the record is later corrected.

"Counted income" — the single most consequential definition in the system — is the sum of records in reported, reconciled, or approved states. Disputed and estimated records appear in the reconciliation as their own lines with their own counts, so a reviewer sees exactly how much is trusted and how much is not. Superseded records appear nowhere in any total.

## 14. Exact-decimal arithmetic, worked

Consider three royalty lines from a distributor that pays fractional cents per stream:

| Line | Source amount | Stored exact | Boundary (cents) |
|------|--------------|--------------|------------------|
| 1 | `0.003` | 0.003 (scale 3) | 0 |
| 2 | `10.005` | 10.005 (scale 3) | 1001 |
| 3 | `99.999` | 99.999 (scale 3) | 10000 |

The aggregate: exact sum `110.007`, boundary `11001` cents ($110.01, round-half-up applied once to the sum).

A naive implementation would round each line to cents first (0 + 1001 + 10000 = 11001) — coincidentally the same here, but consider a million lines at $0.003: exact math gives $3,000.00; per-line rounding gives $0.00. The error is not theoretical. Streaming distributors really do pay sub-cent rates, and catalog-scale aggregation really does multiply the error by the line count.

The system stores three representations per line: `sourceAmount` (the original string, for audit), `amountDecimal`/`amountScale` (the exact scaled integer, for math), and `amountCents` (the boundary value, for settlement). Aggregation sums the exact values first and rounds once. The API returns both the exact decimal and the boundary cents so any consumer can verify the derivation.

All internal arithmetic uses integer or scaled-integer math. There is no float anywhere in the money path — not in parsing, not in aggregation, not in commissions, not in projections.

## 15. Threat model

The system is a demo, but it is built as if the data mattered, because the habits transfer:

- **Cross-artist data leakage.** Mitigated by per-artist grants enforced on every read path, fail-closed. Verified live: an artist requesting another artist's reconciliation receives 403.
- **Privilege escalation.** All financial writes are admin-only. The review API rejects non-admin callers. JWT secrets are required in every environment — there is no fallback secret.
- **Import poisoning.** A malicious or malformed CSV cannot corrupt existing data: imports run in transactions, unknown catalog keys are rejected per-row (not silently dropped, not auto-created), and supersession only touches statements with genuine key overlap.
- **Webhook forgery.** The Stripe webhook verifies the payload signature and returns 503 when Stripe is not configured. There is no code path that processes an unsigned webhook.
- **Audit tampering.** Audit events are append-only and fire-and-forget: a failed audit write is logged, never allowed to convert a successful business write into an error (which would create an incentive to break auditing to break writes).
- **Credential exposure.** Seed credentials exist only in the demo profile and are fenced out of the frontend source by static gate S09. Production deployments use environment-provided secrets.

Out of scope for the demo: at-rest encryption beyond SQLite/Postgres defaults, key rotation procedures, and SOC 2 controls. These are documented as required before any production deployment handling real label data.

## 16. Data model reference

| Table | Purpose | Money fields |
|-------|---------|--------------|
| RoyaltyLines | Imported royalty lines | amountCents, amountDecimal/Scale, sourceAmount |
| RoyaltyStatements | Import batches (identity + supersede) | — |
| MerchSettlements | Merch company settlements | amountCents |
| DirectSales | Label's own direct sales (Stripe) | amountCents |
| ManualAdjustments | Human-entered corrections | amountCents (signed) |
| BankDeposits | Bank deposits (cash evidence) | amountCents |
| Payouts | Provider payouts (cash evidence) | amountCents |
| CommissionContracts | Commission terms as data | rateBps, basis |
| ExpectedReports | Report calendar + gaps | — |
| SourceMappings | Versioned column-layout history | — |
| CashGapAnnotations | Human ownership of gaps | — |
| AuditEvents | Append-only audit trail | — |
| Users | Accounts, roles, artist grants | — |
| Artists, Recordings, Releases, Works | Catalog | — |

Every money table carries `reviewState`, `reviewedBy`, `reviewedAt`, and `reviewEvidence`. Every imported row carries `statementId`, `sourceFileHash`, `rowRef`, and `importVersion`.

## 17. The monthly close, step by step

The close is a five-step guided workflow in the frontend, each step backed by explicit API calls:

**Step 1 — Review income.** The reviewer sees every counted line for the period, grouped by category, with review states. Lines move reported → reconciled → approved with evidence notes. Disputed and estimated lines are visible but quarantined from totals.

**Step 2 — Match cash.** The reviewer records bank deposits (unique bank reference enforced) and provider payouts, then links them. The UI shows matched pairs, unmatched items, and amount differences. The income total does not move when cash is matched — the UI makes this visible by showing both numbers side by side.

**Step 3 — Resolve gaps.** Unmatched cash, missing expected reports, unapproved column layouts, and unexplained variances each get an owner and a next action. Nothing auto-resolves.

**Step 4 — Commission draft.** The reviewer selects or creates the commission contract (rate, basis, dates, exclusions all shown), then generates the worksheet. The worksheet shows its inputs alongside its outputs.

**Step 5 — Close and share.** The reconciliation summary — income, cash, gaps, commissions — is reviewed as a whole and exported. The export carries the same disclaimers as the API: reviewed income and cash evidence, not a P&L.

## 18. Deployment profiles

The system ships with a Label Intelligence Profile per deployment. The profile carries the brand (name, theme, favicon), the seed data (demo users, demo artists), locale and currency defaults, and the AI fallback strings. Generic code never contains brand identity — nine static gates enforce this, so a second label's profile cannot leak into the first label's build.

The demo profile (`pulsegrid`) seeds two users and a fictional roster. A production profile would seed nothing and connect to Postgres. The profile is the only thing that changes between "demo" and "real" — the financial engine is identical.

## 19. What "done" means for a monthly close

A close is done when:

1. Every expected report for the period has arrived or is flagged as an evidence gap with an owner.
2. Every counted line has been reviewed to at least `reconciled`.
3. Every material cash movement is matched or has an owner and next action.
4. The commission worksheet has been generated from an explicit contract.
5. The reconciliation has been exported and shared with the artist.

The system does not declare a close complete on its own. There is no "close the books" button that locks the period — the demo deliberately leaves the final judgment to the humans, because the system's job is to make the judgment informed, not to make it.

---

*Word count: ~3,400. The Music Scene · Pulsegrid Intelligence Platform · demo build · September 2026.*
*All figures fictional. Not financial advice. Not accounting software.*
