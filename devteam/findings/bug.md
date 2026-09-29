<!-- C12 findings ledger — Logic & Correctness Reviewer (BUG), Phase 2 / Pass 3. -->
<!-- One entry per problem: ID · title · severity · confidence · location · -->
<!-- evidence (quoted) · what's wrong · impact · suggested fix.              -->
<!-- Statuses follow the Playbook B7 lifecycle. The Tech Lead merges these    -->
<!-- into devteam/ISSUES.md.                                                 -->
# Findings — BUG (Logic & Correctness Reviewer)

Scope: five critical flows traced hop-by-hop on branch `devteam/review-2026-09-29`
(verified 2026-09-29; `master`/`main` untouched; source read-only throughout):
login → JWT → authenticateToken → RBAC; royalty import → matching → reconciliation →
monthly close → payout; demo vs customer boot; password reset; PDF/CSV exports.
Flow notes: `devteam/notes/flows/{login-jwt-rbac,royalty-reconciliation-close-payout,
demo-customer-boot,password-reset,pdf-csv-export}-bug.md`.

Verification method: close code reading against current HEAD with exact line cites.
No finding below was live-reproduced against a running server; each is marked
Confirmed only where the code path is unambiguous with no assumptions left (B7).
No commits, no pushes, no source edits.

| ID | Sev | Conf | Status | Title | Location |
|---|---|---|---|---|---|
| BUG-001 | S1 | Confirmed | NEW | Payout/deposit match & unmatch are two separate writes with no transaction; a half-written match is API-unrepairable | src/routes/monthlyclose.js:198-207, 232-243; src/models/index.js:628-668 |
| BUG-002 | S2 | Confirmed | NEW | Commission worksheet defaults to the newest contract even when it doesn't cover the requested period; commissionCents computed under the wrong rate | src/routes/monthlyclose.js:425-434; src/finance/commission.js:139, 251-253 |
| BUG-003 | S2 | Confirmed | NEW | `generateMonthlyReport` uses `new Promise(async …)` — any throw becomes an unhandled rejection (server shutdown) plus a hung request | src/reports/monthlyReport.js:45; server.js:104-107 |
| BUG-004 | S3 | Confirmed | NEW | `POST /v3/reports/generate-all` writes to `src/routes/reports/<month>`; the scheduled job uses repo-root `reports/<month>` | src/routes/reports.js:119; src/jobs/monthlyReportJob.js:42,118 |
| BUG-005 | S3 | Confirmed | NEW | `/v3/exports` interpolates raw `req.query.artistId` into `Content-Disposition` — the HIGH-6 sanitization was not applied to this endpoint | src/routes/reports.js:183,233 (contrast :96) |
| BUG-006 | S3 | Confirmed | NEW | CSV export temp file lives in `src/routes/` with a `Date.now()`-millisecond name — concurrent exports can collide | src/routes/reports.js:221,233-243 |
| BUG-007 | S3 | Confirmed | NEW | Startup banner prints `profile.seedUsers` credentials even on customer boots where zero users are seeded | server.js:59-62; src/models/index.js:225+ |
| BUG-008 | S3 | Confirmed | NEW | Deposit creation passes `depositAt` through `new Date()` unchecked — invalid values become 500 instead of 400 | src/routes/monthlyclose.js:129 |

P1 known-lead dispositions: #6 **CONFIRMED, catalog complete (already MAP-001; no new BUG)** ·
#11 **PARTIALLY CONFIRMED (orphaned float schema + dead reader; trusted pipeline exact)** ·
#13 **CONFIRMED AS DOCUMENTED (manual-only scripts; consistent with TST-006; no BUG)**.
See "P1 lead dispositions" below.

## BUG-001 · Non-atomic payout/deposit match & unmatch

- **Severity:** S1 (data integrity in the cash-evidence domain; repair path blocked).
- **Confidence:** Confirmed (unambiguous code; no assumptions).
- **Location:** `src/routes/monthlyclose.js:198-207` (match), `:232-243` (unmatch);
  `src/models/index.js:628-668` (no constraints).
- **Evidence:**
  ```js
  // src/routes/monthlyclose.js — POST /v3/financials/matches
  payout.matchedDepositId = deposit.id;
  payout.matchedAt = now;
  payout.matchedBy = who;
  payout.matchNote = note ? String(note) : (...);
  await payout.save();              // <-- write 1 commits here
  deposit.matchedPayoutId = payout.id;
  deposit.matchedAt = now;
  deposit.matchedBy = who;
  deposit.matchNote = payout.matchNote;
  await deposit.save();             // <-- write 2; if this throws, write 1 stands
  ```
  ```js
  // src/routes/monthlyclose.js — DELETE /v3/financials/matches
  if (payout.matchedDepositId !== deposit.id || deposit.matchedPayoutId !== payout.id) {
      return res.status(409).json({ error: 'This payout and deposit are not matched to each other' });
  }
  ```
  `matchedDepositId` / `matchedPayoutId` are plain nullable INTEGERs
  (`src/models/index.js:638,661`) — no unique constraint, no foreign key, no transaction
  anywhere in either handler.
- **What's wrong / impact:** (1) If `deposit.save()` throws after `payout.save()` succeeded,
  the match is half-written: the payout points at the deposit but the deposit doesn't point
  back. The unmatch handler's 409 guard then *refuses* to unlink them — the only API repair
  path is blocked by the inconsistency itself, so the rows are stuck until someone edits the
  DB by hand. (2) Check-then-act race: two concurrent match requests for the same payout
  can both pass the `already matched` 409 checks before either saves, producing conflicting
  links. Cash evidence is the domain where double-counting must be impossible; the link
  has no database-level protection at all.
- **Suggested fix:** wrap both saves in a Sequelize transaction (with row locks on the
  `findByPk`s), and add partial unique indexes on `matchedDepositId` / `matchedPayoutId`
  (unique where not null) so the database — not the request interleaving — enforces
  one-deposit-per-payout.

## BUG-002 · Commission worksheet uses the newest contract regardless of period coverage

- **Severity:** S2 (financial calculation correctness; mitigated by a status flag).
- **Confidence:** Confirmed.
- **Location:** `src/routes/monthlyclose.js:425-434`; `src/finance/commission.js:139, 251-253`.
- **Evidence:**
  ```js
  // src/routes/monthlyclose.js — GET /v3/financials/commissions/worksheet
  const contracts = await CommissionContract.findAll({ where, order: [['effectiveFrom', 'DESC'], ['id', 'DESC']] });
  if (!contracts.length) return res.status(404).json({ error: 'No commission contract for this artist' });
  const { buildWorksheet } = require('../finance/commission');
  const sheet = await buildWorksheet(
      { RoyaltyLine, MerchSettlement, DirectSale, ManualAdjustment, BankDeposit },
      { artistId, period, contract: contracts[0].get({ plain: true }) }  // <-- newest, unfiltered
  );
  ```
  ```js
  // src/finance/commission.js
  const coversPeriod = contractCoversPeriod(contract, period);   // :139
  ...
  status: coversPeriod
      ? (allApproved ? 'draft_basis_approved' : 'draft_basis_not_fully_approved')
      : 'draft_contract_not_effective_for_period',               // :251-253
  ```
- **What's wrong / impact:** requesting a worksheet for period `2025-03` when the artist has
  contract A (2024-01-01…2025-12-31) and newer contract B (2026-06-01…open) computes
  `commissionCents` with **B's rate** — the rate that did not apply in the requested period.
  The only disclosure is the `status` string; `commissionCents`, `basisCents`, and `rateBps`
  are all B's numbers. Any consumer that reads the numbers without checking `status`
  (dashboards, exports, follow-on jobs) silently uses the wrong contract. The
  `contractCoversPeriod` comparison itself is sound (`effectiveFrom`/`effectiveTo` are
  `DataTypes.STRING` YYYY-MM-DD columns, `src/models/index.js:704-705` — verified, not a bug).
- **Suggested fix:** default-select the contract covering the requested period
  (newest covering contract; fall back to newest overall with the not-effective flag),
  or suppress/zero `commissionCents` when `coversPeriod` is false. See question Q1.

## BUG-003 · `generateMonthlyReport` async-executor anti-pattern

- **Severity:** S2 (reliability: hung request + full process shutdown from one bad input).
- **Confidence:** Confirmed (the anti-pattern's semantics are unambiguous; the shutdown
  handler is verbatim in `server.js`).
- **Location:** `src/reports/monthlyReport.js:45`; `server.js:104-107`.
- **Evidence:**
  ```js
  // src/reports/monthlyReport.js
  async function generateMonthlyReport(artist, month, options = {}) {
      const aiInsights = options.aiInsights === true;
      return new Promise(async (resolve, reject) => {   // <-- async executor
  ```
  ```js
  // server.js
  process.on('unhandledRejection', (reason) => {
      logger.error('[unhandledRejection] an async error escaped all handlers; shutting down.', reason);
      shutdown('unhandledRejection');
  });
  ```
- **What's wrong / impact:** a throw anywhere inside the executor (e.g.
  `artist.tier.toUpperCase()` at `monthlyReport.js:99` on a row whose `data` lacks the
  mock shape, an unguarded `artist.revenue` access, a pdfkit-table throw outside the
  per-chart try/catches) does **not** reject the constructed promise — it rejects the
  executor's implicit promise, which nothing handles. Two failures at once: (1) the
  route's `await generateMonthlyReport(...)` never settles, so the HTTP request hangs
  until the client times out — no 500, and the per-artist `failed` recording in
  generate-all (`reports.js:131-143`) never runs; (2) Node 22 emits `unhandledRejection`
  and the backstop in `server.js` **shuts down the entire process**. Currently latent:
  `createArtist` stores the full mock-compatible shape, so live artists carry
  `tier`/`revenue` — but the function is one unguarded field access away from turning a
  single report request into a server kill.
- **Suggested fix:** remove the `new Promise` wrapper (make the function `async` and let
  throws reject naturally into the routes' existing try/catch), or wrap the executor body
  in try/catch → `reject(err)`.

## BUG-004 · generate-all writes reports to a different directory than the scheduled job

- **Severity:** S3 (operational inconsistency; source-tree pollution).
- **Confidence:** Confirmed.
- **Location:** `src/routes/reports.js:119`; `src/jobs/monthlyReportJob.js:42,118`.
- **Evidence:**
  ```js
  // src/routes/reports.js — POST /v3/reports/generate-all
  const reportsDir = path.join(__dirname, 'reports', month);   // __dirname = src/routes
  ```
  ```js
  // src/jobs/monthlyReportJob.js
  /** Directory reports are written to, relative to the repo root. */
  const REPORTS_ROOT = path.join(__dirname, '..', '..', 'reports');  // repo root
  ```
- **What's wrong / impact:** the HTTP endpoint lands files in `src/routes/reports/<YYYY-MM>/`
  while the cron job's own docstring promises `reports/<YYYY-MM>/` at the repo root and
  writes there. Two producers of "the monthly reports" disagree on where they live; an
  operator (or the print step's `execFile` path, which is rooted at `REPORTS_ROOT`) will
  not find HTTP-generated reports, and vice versa. The HTTP path also creates directories
  and writes generated artifacts inside the **source tree**, which breaks read-only
  deployments and pollutes the repo.
- **Suggested fix:** point the route at the job's `REPORTS_ROOT` (single canonical
  directory). See question Q4.

## BUG-005 · Raw `artistId` in `Content-Disposition` on the legacy `/v3/exports` endpoint

- **Severity:** S3 (inconsistent sanitization; the fixed pattern exists one screen away).
- **Confidence:** Confirmed.
- **Location:** `src/routes/reports.js:183, 233`; contrast the hardened path at `:96`.
- **Evidence:**
  ```js
  // src/routes/reports.js — GET /v3/exports (legacy endpoint)
  res.setHeader('Content-Disposition', `attachment; filename="${artistId || 'label_overview'}_${Date.now()}.pdf"`);  // :183
  ...
  res.download(filePath, `${artistId || 'label'}_export.csv`, (err) => {   // :233
  ```
  vs the monthly-report route in the same file:
  ```js
  res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(artist, month)}"`);  // :96
  ```
  where `reportFilename` applies the HIGH-6 `safeFilename` + `assertValidMonth` hardening.
- **What's wrong / impact:** `artistId` comes straight from `req.query` with no validation
  on this endpoint (`checkExportAccess` gates *access*, not shape). The HIGH-6 fix
  sanitized the sibling routes but missed this one. Modern Node rejects header control
  characters (so this surfaces as a 500 / broken quoting rather than response splitting),
  but it is the exact unsanitized-interpolation pattern the codebase already decided to
  eliminate.
- **Suggested fix:** run `artistId` through the same `safeFilename` helper (or reuse
  `reportFilename`) for both the PDF header and the CSV download name.

## BUG-006 · CSV export temp file races in the source tree

- **Severity:** S3 (correctness under concurrency; source-tree pollution).
- **Confidence:** Confirmed.
- **Location:** `src/routes/reports.js:221, 233-243`.
- **Evidence:**
  ```js
  // src/routes/reports.js — GET /v3/exports?format=csv
  const filePath = path.join(__dirname, `temp_${Date.now()}.csv`);   // :221
  ...
  res.download(filePath, `${artistId || 'label'}_export.csv`, (err) => {
      // unlinkSync(filePath) on completion                            // :233-243
  ```
- **What's wrong / impact:** (1) Two concurrent CSV exports landing in the same millisecond
  share one filename: their `writeRecords` interleave into one file and the first
  response's `unlinkSync` can delete the file while the second download is still streaming
  it — corrupted downloads and `ENOENT` mid-stream. (2) Temp files are created in
  `src/routes/` (the source tree), not the OS temp dir; any crash or error path that skips
  the unlink leaves CSV residue in the repo, and read-only deployments break.
- **Suggested fix:** use `fs.mkdtemp`/`os.tmpdir()` with a random suffix (or stream the CSV
  directly to the response with no temp file at all).

## BUG-007 · Startup banner advertises seed users on customer boots

- **Severity:** S3 (misleading operational output).
- **Confidence:** Confirmed.
- **Location:** `server.js:59-62`; `src/models/index.js:225+`.
- **Evidence:**
  ```js
  // server.js — runs on EVERY boot, demo or customer
  const seedLines = profile.seedUsers
      .map((s) => `- ${s.email} (${s.password}) - ${s.bannerLabel}`)
      .join('\n');
  // ...
  `Default Users:\n${seedLines}\n\n⚠️  CHANGE DEFAULT PASSWORDS IMMEDIATELY!`
  ```
  ```js
  // src/models/index.js:225+
  if (demoMode) { /* fictional users/artists/statements seeded here */ }
  // customer boot: schema only, zero users seeded
  ```
- **What's wrong / impact:** the banner is unconditional, but seeding is gated on
  `DEMO_MODE`. On a customer boot the database contains none of the listed accounts, yet
  the banner prints their emails and passwords as "Default Users" — an operator can
  reasonably conclude default credentials are live (and try them, or conversely assume an
  account exists for recovery). The password-in-logs aspect belongs to SEC; this finding
  is the BUG angle: the banner does not reflect the booted instance's reality.
- **Suggested fix:** gate the `Default Users:` block on the same `demoMode` flag used for
  seeding (or list only actually-seeded rows). See question Q3.

## BUG-008 · Invalid `depositAt` becomes a 500 instead of a 400

- **Severity:** S3 (error-contract inconsistency).
- **Confidence:** Confirmed.
- **Location:** `src/routes/monthlyclose.js:129`.
- **Evidence:**
  ```js
  // src/routes/monthlyclose.js — POST /v3/financials/deposits
  const dep = await BankDeposit.create({
      ...
      depositAt: depositAt ? new Date(depositAt) : new Date(),   // :129 — unchecked
  ```
- **What's wrong / impact:** every other field on this endpoint is validated with a 400
  (`amountCents` regex + safe-integer, `currency` 3-letter, `bankRef` required + 409 on
  duplicates), but `depositAt` goes through `new Date()` unchecked. `new Date('garbage')`
  is Invalid Date; the Sequelize create then throws and the catch returns 500
  `Database error` — a client input error masquerading as a server/database failure,
  and inconsistent with the endpoint's own validation discipline.
- **Suggested fix:** `const d = new Date(depositAt); if (isNaN(d)) return res.status(400)...`.

## P1 lead dispositions

### P1 #6 — duplicate routes → CONFIRMED, catalog complete (already MAP-001; no new BUG)

Whole-repo sibling search over `src/routes/*.js` (single- and double-quoted registrations)
finds exactly the duplicates the code itself documents in `src/routes/index.js:9-13`:

| Registration | Count | Winner (first registered) | Dead |
|---|---|---|---|
| `POST /v3/users` (`src/routes/users.js:68,130,254`) | 3 | :68 (validated `createUser` body, audits, persists pageAccess) | :130, :254 |
| `PUT /v3/users/:id` (`src/routes/users.js:150,268`) | 2 | :150 | :268 |
| `DELETE /v3/users/:id` (`src/routes/users.js:207,288`) | 2 | :207 | :288 |

- Express binds the first matching handler; the later registrations are unreachable.
  `tests/regression/routes.test.js:88-90` pins the counts (`3`/`2`/`2`), so reordering
  would fail the suite — the fragility the `index.js` comment warns about is real but
  guarded.
- **The `index.js` comment's claim of `POST /v3/ai/analyze x2` ("five duplicate
  registrations") is STALE**: current code registers it exactly once
  (`src/routes/ai.js:50`), and the regression test asserts the count is 1
  (`tests/regression/routes.test.js:91`). Actual shadowed registrations: 4, not 5.
  Flagging the stale comment for DOC (not filed as BUG — comment-only).
- Correctness consequence today: none beyond what MAP-001 records. Notable for the
  record: the dead `POST /v3/users` at `users.js:130` has a bizarre body (hashes the
  password, then *lists* users and returns them) — harmless while dead, but the most
  dangerous of the shadowed handlers if registration order ever changed.
  **No new BUG filed; belongs with MAP-001.**

### P1 #11 — float money math → PARTIALLY CONFIRMED (no live money bug)

- `src/models/index.js:114-120`: legacy `SalesEntry.revenue` is `DataTypes.FLOAT` — but the
  model is orphaned: nothing in the reviewed income path writes or reads it. The live
  analytics path uses `ManualAdjustment` integer cents.
- `src/services/salesService.js` uses floating-point linear regression for **forecasts**;
  `src/routes/analytics.js:149+` converts exact cents to JS numbers before forecasting.
  This matches the existing `DOC-002` posture: exact money/reconciliation paths are
  integer/BigInt/exact-decimal (`src/finance/decimal.js`); forecasts are floating-point
  *estimates*, clearly separated from counted money.
- Report display (`src/reports/monthlyReport.js`: `calculateTotalRevenue`, `toLocaleString`,
  `Math.random()` trend line) operates on mock/demo fixture data, not the counted path.
- **Disposition:** the trusted pipeline (royalty lines → reconciliation → close → payout →
  commission) is exact; the FLOAT instances are a dormant legacy schema, a dead reader,
  and documented forecast estimates. No live money-math defect; no BUG filed. Recommend
  TST/DOC note the dormant `SalesEntry` model as dead legacy (drop or annotate), owned by
  ARC/BLD.

### P1 #13 — scripts without assertions → CONFIRMED AS DOCUMENTED (no BUG)

- `scripts/`: `deploy-client.sh`, `generate_roster.js` (demo fixture generator, integer
  `Math.floor`'d values), `repair-sales-schema.js` (one-shot migration repair),
  `run-browser-workflows.js` (manual browser QA), `run-demo.sh`/`stop-demo.sh`,
  `run-verify-hermetic.js` (**has assertions** — 4 assert/exit matches),
  `run-visual-gate.js` (visual gate), `serve-static.js` (static server).
- `tests/support/run_legacy_scripts.sh` explicitly documents the pre-existing ad-hoc
  scripts as NOT part of `npm test` (no assertions, many need live credentials).
- Consistent with the existing TST-006 record (manual scripts live beside tests, tracked
  separately). No correctness defect in shipped behavior; no BUG filed.

## Dismissed candidates (verified, not filed)

- **Reset-audit rejection:** `emitPasswordResetAudit` (`src/routes/auth.js:66-77`) calls
  `auditService.emitAudit()` without awaiting — but `emitAudit` is synchronous and
  internally `.catch`es its `model.create` (`src/services/auditService.js:30-44`).
  No floating promise; audit failure cannot break the reset. Dismissed.
- **`contractCoversPeriod` string comparison:** sound — `effectiveFrom`/`effectiveTo` are
  `DataTypes.STRING` YYYY-MM-DD columns (`src/models/index.js:704-705`), so lexicographic
  comparison against `${period}-01` is correct. Dismissed.
- **`directsales.js:544` `err.message` in the 500 body:** information-disclosure surface;
  SEC's lane (noted in the royalty flow note without duplicating).
- **Login/RBAC chain:** no defect found (composite revalidation + fail-closed 503 +
  sessionVersion revocation coherent end to end).

## Questions for Dino (recommended defaults)

- **Q1 (BUG-002):** Should the commission worksheet default to the contract *covering the
  requested period* (falling back to newest with the not-effective flag), rather than
  always the newest? Recommended: **yes**.
- **Q2 (BUG-001):** OK to wrap payout/deposit match+unmatch in a transaction and add
  partial unique indexes on the link columns? Recommended: **yes**.
- **Q3 (BUG-007):** Suppress the `Default Users:` banner block when not booting demo mode?
  Recommended: **yes**.
- **Q4 (BUG-004):** Unify HTTP generate-all onto the job's repo-root `reports/<YYYY-MM>/`
  directory? Recommended: **yes**.

## Blockers

None. All reads completed over SSH; the recurring `.bashrc:47` quoting noise never
blocked a command. No findings required live reproduction.
