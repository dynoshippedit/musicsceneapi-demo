# Findings — Music Data & Rights Specialist (MUS)

<!-- C12 ledger header -->
- **Lane:** MUS (Music Data & Rights Specialist) · **Phase:** 2 (domain depth on the money)
- **Branch:** `devteam/review-2026-09-29` · **Date:** 2026-09-29
- **ID range:** MUS-001 – MUS-011 (this lane owns MUS-*)
- **Source code:** READ-ONLY this phase. Nothing fixed; fixes land in Phase 5 per the Playbook.
- **Evidence standard:** every finding cites `path:line` and quotes the arithmetic.
- **Scope note:** public repo → no exploit walkthroughs. Never touched `bufirstrepo/mau5trap-repo`.
- **Finding format:** ID · title · severity · confidence · status · location ·
  evidence (quote) · what's wrong · impact · suggested fix · related.

## Index

| ID | Severity | Confidence | Status | Title |
|---|---|---|---|---|
| MUS-001 | S1 | Confirmed | NEW | POST /v3/royalties/calculate computes "payout" on floats: unrounded fractional cents, epsilon-sum tolerance |
| MUS-002 | S2 | Confirmed | NEW | Royalty CSV import accepts any non-empty `period` string — no YYYY-MM validation; lines vanish from the close |
| MUS-003 | S2 | Confirmed | NEW | Three different month-assignment conventions; direct-sales + deposits use UTC while merch uses the entered date |
| MUS-004 | S2 | Confirmed | NEW | Mock-data float "Total Revenue" / "projectedAnnual" presented as real money in API + scheduled PDFs, no provenance label |
| MUS-005 | S2 | Confirmed | NEW | Commission worksheet silently picks latest-effective contract; overlapping contracts not validated on create |
| MUS-006 | S3 | Confirmed | NEW | A&R voting never locked by submission/demo status; tally denominator counts ineligible users |
| MUS-007 | S2 | Confirmed | NEW | No GDPR-style data export; user delete is DB-row only — PII persists in audit trail, logs, reports/, provenance fields |
| MUS-008 | S3 | Confirmed | NEW | Identifier validation gaps: UPC without GTIN-12 check digit, any 3-letter "currency", no ISWC anywhere |
| MUS-009 | S3 | Confirmed | NEW | fetchIncomeData hardcodes `provider: 'stripe'` — any non-stripe DirectSale row silently excluded from income/commission/KPI |
| MUS-010 | S4 | Confirmed | NEW | Not modeled / retired: advances & recoupment; dead float paths (salesService.history, generateSyntheticHistory) |
| MUS-011 | S4 | Confirmed | NEW | Outbound rate limiters exist but are unwired (preserved defect); Wikipedia etiquette OK (User-Agent, 24h cache, URL attribution) |

---

### MUS-001 · POST /v3/royalties/calculate computes "payout" on floats: unrounded fractional cents, epsilon-sum tolerance
- **Severity:** S1 (user-visible "payout" money math on floats; not the settlement path, so not S0) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/routes/finance.js:55-82` (`/v3/royalties/calculate`)
- **Evidence (quote):**
  ```js
  const targetSplits = splits || { artist: 0.7, label: 0.3 };
  if (![targetSplits.artist, targetSplits.label].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) || Math.abs(targetSplits.artist + targetSplits.label - 1) > 0.000001) return res.status(400).json({ error: 'Royalty splits must sum to 1' });
  ...
  payout: {
      artist: totalRevenue * targetSplits.artist,
      label: totalRevenue * targetSplits.label
  },
  ```
- **What's wrong:** (1) Split shares are user-supplied floats; `totalRevenue * 0.7` yields fractional cents (e.g. `12345.67 * 0.7 = 8641.969`) returned as a "payout" with no rounding to cents and no label that it is an estimate. (2) The sum check uses an epsilon (`> 0.000001`), so `{artist: 0.4999999, label: 0.4999999}` passes while artist+label ≠ total (a ~0.1¢ gap, and larger shapes like 0.7000004/0.2999996 also pass). (3) The input total is `artist.revenue.*` — mock fiction floats (`mock/artistData.js:16` etc.), so this is float-on-fiction presented as a royalty calculation. The exact-money path (commission worksheet, basis points) uses a different unit and validation regime than this endpoint.
- **Impact:** a label user can read an unrounded fractional-cent "payout" and an inconsistent artist+label ≠ total. This is the one remaining live float-money surface outside projections.
- **Suggested fix:** compute in integer cents (basis points for shares, exact split validation `a + b === 10000`), round half-up to cents, and label the response `estimate: true` (it's a what-if calculator, not settlement). NEEDS OWNER per B1 (changes response shape).
- **Related:** DOC-002 (whitepaper overreach), MUS-004 (mock totals).

### MUS-002 · Royalty CSV import accepts any non-empty `period` string — no YYYY-MM validation; lines vanish from the close
- **Severity:** S2 (imported money silently missing from its own month's close) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/routes/royalties.js:281-283` (parseRoyaltyRow); compare `src/finance/income.js:53-56` (`monthOfRoyalty`)
- **Evidence (quote):**
  ```js
  const period = String(raw.period || '').trim();
  if (!period) return { error: 'period is required' };
  ```
  vs. the consumer: `function monthOfRoyalty(line) { const p = String(line.period || ''); return MONTH_RE.test(p) ? p : null; }` and royalty aggregation: `if (period && String(l.period) !== period) continue;`
- **What's wrong:** the import validates amount (exact decimal string, `DECIMAL_RE`) and currency (3-letter, `CURRENCY_RE`) rigorously but `period` only for non-emptiness. A line imported with period `"2026-9"`, `"Q3"`, `"Sept"` imports successfully (gets a RoyaltyStatement identity, provenance, reviewState) yet is excluded from every YYYY-MM close view: `aggregateIncome(data, '2026-09')` skips it (`String(l.period) !== period`), the commission worksheet skips it (same exact match), and the KPI monthly series drops it (`monthOfRoyalty` → null → `addMonth` early-return). It still counts in "all-period" totals, so the label's all-time total and the monthly closes stop reconciling, with no error anywhere.
- **Impact:** real imported royalty money is invisible in the monthly close and commission bases for the intended month. Statement identity `(source, period, sourceFileHash)` stays self-consistent, so the import "looks fine."
- **Suggested fix:** validate `/^\d{4}-(0[1-9]|1[0-2])$/` on import (same `validMonth` the manual-adjustment and analytics routes use). Note the model comment says period is `'2026-09'` — enforce it.
- **Related:** MUS-003 (period conventions).

### MUS-003 · Three different month-assignment conventions; direct-sales + deposits use UTC while merch uses the entered date
- **Severity:** S2 (wrong-month assignment at month boundaries for money that settles the close) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/finance/income.js:63-72` (`monthOfMerch`, `monthOfSale`); `src/finance/commission.js:174-177`; `src/finance/reconciliation.js` (deposit bucketing)
- **Evidence (quote):**
  ```js
  function monthOfMerch(s) { const d = String(s.showDate || ''); return DAY_RE.test(d) ? d.slice(0, 7) : null; }   // calendar date as entered
  function monthOfSale(s) { if (!s.occurredAt) return null; const d = new Date(s.occurredAt); ... return d.toISOString().slice(0, 7); }  // UTC
  ```
  commission.js cash base: `const dd = d.depositAt ? new Date(d.depositAt).toISOString().slice(0, 10) : '';` (UTC), and merch: `String(s.showDate || '').slice(0, 7)` (entered).
- **What's wrong:** the module header (`income.js:34-41`) documents per-category period filtering but never states a time-zone rule. A direct sale at 23:30 label-local on Aug 31 lands in the September close (UTC conversion); a merch show entered as `2026-08-31` stays in August. Cash deposits in the commission base follow UTC too. So one economic event can be split across two months depending on category, and the label gets no stated rule to audit against.
- **Impact:** month-boundary money lands in the wrong close for sales/deposits relative to the venue's calendar; the commission worksheet can compute on a different month's cash than the income close shows.
- **Suggested fix:** pick one rule (label-local calendar date for all categories, or documented UTC) and state it in `income.js`'s header + the worksheet contract. Default if owner is silent: keep UTC, document it — deterministic and reviewable.
- **Related:** MUS-002.

### MUS-004 · Mock-data float "Total Revenue" / "projectedAnnual" presented as real money in API + scheduled PDFs, no provenance label
- **Severity:** S2 (forwarded artifacts read as authoritative financials; mock data with float formatting) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/routes/artists.js:239-240` (artist detail); `src/reports/monthlyReport.js:96-99`; `src/utils/dataShape.js:17-21` (`calculateTotalRevenue`); `src/jobs/monthlyReportJob.js:113-128` (scheduled cron)
- **Evidence (quote):**
  ```js
  return Object.values(artist.revenue).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);   // float sum over mock floats
  ```
  ```js
  res.json({ ...artist, wikipedia: wikiData, totalRevenue: calculateTotalRevenue(artist), projectedAnnual: calculateTotalRevenue(artist) * 12 });
  ```
  ```js
  doc.text(`Total Revenue: $${totalRevenue.toLocaleString()}`);
  ```
- **What's wrong:** `artist.revenue` is mock fiction (`mock/artistData.js:16` etc. — hard numbers like streaming/merch/touring). The API returns `totalRevenue` and `projectedAnnual` (float × 12, so e.g. `$8641.969 × 12`) with no `source: 'fixture'`, no "mock", no "demo data" marker anywhere in the JSON. The monthly PDF renders `Total Revenue: $X` with only the AI disclaimer (DOC-003). The scheduled cron (`monthlyReportJob`, 1st of each month 03:00) writes these same mock-revenue PDFs into `reports/<YYYY-MM>/` automatically — the artifact most likely to be forwarded to an artist's team.
- **Impact:** exactly the provenance gap the MUS card forbids: metrics not labeled real/mock/estimated in API responses, UI, PDF. This is the money-lens instance of DOC-003/DOC-004's evidence.
- **Suggested fix:** add a provenance field to the artist responses (`revenueSource: 'mock' | 'counted'`), label the PDF's revenue section as demo figures, and have the cron carry the same label. Changing user-visible output → NEEDS OWNER per B1.
- **Related:** DOC-003, DOC-004 (same gap, different evidence); MUS-001.

### MUS-005 · Commission worksheet silently picks latest-effective contract; overlapping contracts not validated on create
- **Severity:** S2 (wrong commission basis selectable without error) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/routes/monthlyclose.js:419-429` (worksheet endpoint); `src/routes/monthlyclose.js:364-379` (contract create)
- **Evidence (quote):**
  ```js
  const contracts = await CommissionContract.findAll({ where, order: [['effectiveFrom', 'DESC'], ['id', 'DESC']] });
  if (!contracts.length) return res.status(404).json({ error: 'No commission contract for this artist' });
  ... contract: contracts[0].get({ plain: true }) ...
  ```
- **What's wrong:** contract creation validates `rateBps` (integer 0..10000) and `basis` but never checks whether another contract for the same artist already covers the new one's date range (no overlap validation; model index is only `commission_contracts_artist`, not a range exclusion). The worksheet then silently picks `contracts[0]` (latest `effectiveFrom`) even if an older contract is still open-ended and covers the requested period. `buildWorksheet` does flag `coversPeriod` on the chosen contract (`commission.js:125-131` — correct lexicographic YYYY-MM-DD comparison against STRING columns, verified in `src/models/index.js:697-698`), but it cannot warn about the contract it never saw.
- **Impact:** when a rate changes and both contracts overlap a close period, the worksheet computes against whichever has the later `effectiveFrom` — the wrong rate is a money error, silent by design.
- **Suggested fix:** on create, reject date ranges overlapping an existing contract for the same artist (unless the old one is closed), or make the worksheet return all covering contracts and require an explicit `contractId`. Default recommendation: reject overlaps on create (cheapest, matches "stored as data" posture).

### MUS-006 · A&R voting never locked by submission/demo status; tally denominator counts ineligible users
- **Severity:** S3 (label-internal admin tool; integrity polish, not a live money path) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/routes/anr.js:145-226` (submission vote); `src/routes/anrRoom.js:22-29` (`tally`); `src/models/index.js:159-176`
- **Evidence (quote):**
  ```js
  app.post('/v3/anr/submissions/:id/vote', ...); // no status check before applyVote
  app.post('/v3/anr/vote/:demoId', ...);          // only findByPk(demoId) — no status check
  ```
  ```js
  const users = await User.findAll({ attributes: ['id'] });
  const votes = ... RoomVote.count({ where: { demoId: id, userId: { [Op.in]: users.map(u => u.id) } } });
  const ratio = users.length ? votes / users.length : 0;
  ```
- **Verified good (not findings):** double-vote prevention is sound in both paths — `RoomVote.upsert({demoId, userId})` on the composite PK (`RoomVote` model: `demoId`+`userId` primary keys, `src/models/index.js:168-176`), and the submission vote runs the read-modify-write inside an IMMEDIATE transaction against a per-user `voters` map (`anr.js:171-210`) with explicit direction required and toggle-off semantics (A-VOTEDIR fix). Tally numerator correctly excludes votes from deleted users.
- **What's wrong:** (1) Neither vote endpoint checks `status` — votes can be cast on archived/closed submissions and demos indefinitely. (2) `tally()`'s denominator is `User.count()` — *all* users including non-admin roles that can never vote — while the numerator only counts existing users' votes, so the ratio understates support whenever non-voting users exist.
- **Impact:** cosmetic/misleading ratios in an internal A&R tool; no money involved (flow 8 is curation, not settlement). Thinly tested per TST-004 — this entry gives the Verifier the concrete behaviors to pin.
- **Suggested fix:** add an `archived`/closed-status check to both vote endpoints (400 on closed), and scope the tally denominator to votable roles (or to users who have ever voted in the room). NEEDS OWNER for the behavior change.

### MUS-007 · No GDPR-style data export; user delete is DB-row only — PII persists in audit trail, logs, reports/, provenance fields
- **Severity:** S2 (missing compliance capability with concrete incompleteness; fictional demo data today, real PII by design) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** product-wide; `src/routes/users.js:207-236` (DELETE /v3/users/:id); `src/models/index.js:195-205` (AuditEvent); no `/export` route found anywhere in `src/routes/`
- **PII inventory (verified in code):**
  - `User`: email (unique), name, passwordHash, resetToken, artistAccess grants.
  - `AuditEvent`: `actorEmail` on every action (`models/index.js:199`) — append-only design (`updatedAt: false`), kept for integrity.
  - Money records: `enteredBy`, `reviewedBy`, `matchedBy`, `reviewEvidence`, `matchNote` email fields across RoyaltyLine, ManualAdjustment, Payout, BankDeposit, CommissionContract, ExpectedReport.
  - `ArtistOAuth`: encrypted provider tokens (`accessTokenEnc` AES-256-GCM — good).
  - Files: `reports/<YYYY-MM>/` PDFs (contain names/emails), `.demo-data/` sqlite, winston log files (request data).
- **What's wrong:** there is no data-export endpoint at all (searched `src/routes/users.js`, `src/routes/system.js` — no GDPR/export route). `DELETE /v3/users/:id` deletes the row (with self-delete and root-admin guards — good) but the user's email remains in every `AuditEvent.actorEmail`, every `enteredBy/reviewedBy/matchedBy` provenance field, winston logs, and generated PDFs. That is arguably correct for audit integrity, but it is undocumented — there is no stated retention/deletion policy distinguishing "immutable audit" from "erasable profile."
- **Impact:** a deployed instance holding real artist/team PII cannot fulfill an export or complete erasure request today.
- **Suggested fix:** define a retention policy (audit trail immutable, profile/log/report data erasable), add an export endpoint, and add a documented purge that clears non-audit PII across DB/files/reports/logs. Design decision → NEEDS OWNER.
- **Related:** TST-003 (privacy test gap — the Verifier can use this inventory).

### MUS-008 · Identifier validation gaps: UPC without GTIN-12 check digit, any 3-letter "currency", no ISWC anywhere
- **Severity:** S3 (missing validation, no wrong data observed) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/routes/catalog.js:31-54`; `src/routes/royalties.js:278-281`; `src/models/index.js:421-426` (Work)
- **Evidence (quote):** `const UPC_RE = /^[0-9]{12}$/;` — "upc must be exactly 12 digits"; `CURRENCY_RE` checked as `/^[A-Z]{3}$/` only ("currency ... must be a 3-letter ISO code").
- **What's wrong:** (1) UPC accepts any 12 digits without the GTIN-12 check-digit validation (ISRC has no check digit in the standard — correctly not checked; format regex `/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/` is right). (2) "currency" accepts any 3 letters (`ZZZ` passes) rather than a real ISO-4217 list. (3) `Work` (compositions) carries no ISWC field at all — publishing-side identifiers are absent by design gap, not validated. (4) Verified good: demo ISRCs use the unassigned `ZZ` country code by design (`catalog.js:21-23` header), so demo-shaped codes structurally *cannot* collide with real assignments — the reverse worry does not hold.
- **Impact:** a typo'd UPC (bad check digit) or nonsense currency imports cleanly and flows into the money pipeline.
- **Suggested fix:** add GTIN-12 check-digit validation on UPC; validate currency against an ISO-4217 list; decide whether ISWC belongs on Work (NEEDS OWNER).

### MUS-009 · fetchIncomeData hardcodes `provider: 'stripe'` — any non-stripe DirectSale row silently excluded from income/commission/KPI
- **Severity:** S3 (latent completeness bug; entire pipeline is stripe-only today) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/finance/income.js:139` (`DirectSale.findAll({ where: { provider: 'stripe', ...where } ... })`)
- **Evidence (quote):**
  ```js
  DirectSale.findAll({ where: { provider: 'stripe', ...where }, order: [['id', 'ASC']] }),
  ```
- **What's wrong:** the one shared money pipeline (`fetchIncomeData` → `aggregateIncome` → reconciliation, commission worksheet, KPIs, projections) silently drops any DirectSale whose provider isn't `'stripe'`. Today `src/routes/directsales.js` is stripe-only end to end (lines 128-286), so nothing is dropped — but the `provider` column exists precisely to hold other values, and the moment a second provider writes rows, that revenue disappears from income, the close, the KPIs and the commission base with no error. `fetchIncomeData` is also called by `buildWorksheet` (`commission.js:176,222`) and the projections route, so the exclusion propagates everywhere.
- **Impact:** latent; becomes a silent money-completeness bug the day a second payment provider is connected.
- **Suggested fix:** drop the hardcoded filter (aggregate all providers) or reject non-stripe rows at write time; per-provider buckets already exist in the bucket design.

### MUS-010 · Not modeled / retired: advances & recoupment; dead float paths (salesService.history, generateSyntheticHistory)
- **Severity:** S4 (informational — domain gaps and dead code, not defects) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/profile/labels/pulsegrid.js:309-311`; `src/services/salesService.js:11-17`; `src/analytics/regression.js:72-84`
- **Evidence:** advances/recoupment appear only as fiction display strings in the demo profile (`advance: '$150k', recoupable: '$120k remaining'`) — no model, no math, no recoupment against income anywhere in `src/finance/` or `src/models/`. `salesService.history()` (float sum over `SalesEntry.revenue` FLOAT, `models/index.js:114-119`) has **zero callers** — the old float history was retired by fix 2 (`analytics.js:67`, `label.js:96` comments confirm). `generateSyntheticHistory()` (Math.random fabrication) is exported via `routes/context.js:187` but has **zero call sites**; `/v3/analytics/projections` now regresses over counted reviewed income, not synthetic data (its docstring comment in `regression.js:56-70` is stale — already covered by DOC-011).
- **Impact:** none on current money math; records the domain boundary (no advance/recoupment modeling exists to audit) and confirms the float-era code is truly dead.
- **Suggested fix (info only):** none required; keep as the record that advances/recoupment are a future domain item (IDEAS.md material).

### MUS-011 · Outbound rate limiters exist but are unwired (preserved defect); Wikipedia etiquette OK
- **Severity:** S4 (informational; the defect is already documented in-code) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/integrations/rateLimiter.js:1-24` (PRESERVED DEFECT header); `modules/entityAudit.js:197-260` (`auditWikipedia`); `src/routes/artists.js:217-237`
- **Evidence:** rateLimiter.js header states `limiters` is referenced by exactly one diagnostic route and "No real outbound HTTP call in integrations/*.js passes through a limiter, so the advertised per-service rate limiting does not happen" — preserved deliberately. Wikipedia access itself is well-behaved: profile-owned `User-Agent` (`entityAudit.js:214`), 24h result cache (`artists.js:231`), and the returned `wikiUrl` gives CC BY-SA attribution-by-link. The `musicRelated` rejection (LUMEN VEIL "Veil of Isis" fix) is verified in place (`artists.js:218-229`).
- **Impact:** no platform-terms violation observed; if live enrichment volume grows, the unwired limiters become a real 429/abuse risk.
- **Note for BUG/ARC lanes:** the unwired limiter is their lane if they want it; MUS records only the platform-terms posture.

---

## Verdicts (money paths reviewed)

**Paths reviewed:** `src/finance/decimal.js` (exact decimals), `commission.js` (worksheet), `income.js` (aggregation), `reconciliation.js` (close), `kpi.js` (KPIs), `src/services/salesService.js` + `src/analytics/regression.js` (projections), `src/routes/royalties.js` (import + statement supersede, transactional), `src/routes/monthlyclose.js` (564 lines: deposits, matches, adjustments, contracts, expected reports), `src/routes/directsales.js` (stripe pipeline), `src/routes/catalog.js` (ISRC/UPC), `src/routes/finance.js` (`/v3/royalties/calculate`), `src/routes/analytics.js` (projections endpoint), `src/reports/monthlyReport.js` + `src/jobs/monthlyReportJob.js` (PDF), `src/routes/anr.js` + `anrRoom.js` (voting), `src/ai/disclaimer.js` (financial disclaimers), `src/integrations/` (facade, rateLimiter, wikipedia.fixtures), `modules/entityAudit.js` (wikipedia), `src/repositories/artistRepository.js` (hybrid/dedup), `src/models/index.js` (money + identity models), finance web views (disclaimer rendering).

**Settlement money is exact.** Royalty import parses exact decimal strings only (`royalties.js:259-276`, `DECIMAL_RE`); source precision is preserved as BigInt mantissa + scale; aggregation sums exactly and rounds **once per aggregate** with round-half-up to 2 decimals (`decimal.js:98-112` `decimalToCents`); everything else is integer cents natively; `centsToNumber` **throws** out of safe-integer range instead of degrading to float; safe-integer guards at every input boundary (`monthlyclose.js:117,272`, `royalties.js:270-273`). No cross-currency summation, no FX anywhere (currency-mismatch match rejected at `monthlyclose.js:197-199`). Review-state machine keeps disputed/estimated out of trusted totals; superseded lines are excluded everywhere; statement supersede is transactional and unit-scoped. Rounding policy (round-half-up, once per aggregate, cents only at settlement boundaries) is documented in `decimal.js:14-21` and echoed in the reconciliation disclaimers. Division-by-zero is guarded in all ratio paths (`tally`, `approvedShare`, reconciliation totals).

**Float money verdict (DOC-002 + SalesEntry.revenue):** the settled money path contains **no float**. Float exists in exactly three places: (1) `salesService.forecast` ← `performLinearRegression` — a statistical estimate over integer-cent inputs, `Math.round` to cents at the boundary, floored at zero, labeled "Forecast based on counted, reviewed income… Not a guarantee" in both `kpi.js:95-98` and the `/v3/analytics/projections` response (`analytics.js:156-180`) — acceptable for estimates; the whitepaper's "no float anywhere in the money path" sentence overreaches only on this point (DOC-002 stands as written). (2) `SalesEntry.revenue` FLOAT + `salesService.history` — **dead code, zero callers** (retired by fix 2). (3) The two live float-money surfaces that remain user-facing and are *not* settlement: **MUS-001** (`/v3/royalties/calculate` unrounded fractional-cent "payouts") and **MUS-004** (mock float revenue sums rendered as `$` in API + PDFs). These two, not the settlement engine, are where float touches users.

**Splits:** the only real split math is the commission rate in integer basis points (`commissionCents = roundHalfUp(baseCents * rateBps / 10000)` in BigInt, `commission.js:95-103`), validated 0..10000 at both create and compute. Multi-party splits summing to 100% are not otherwise modeled; the `/v3/royalties/calculate` endpoint's float fractions are the exception (MUS-001).

**Advances/recoupment:** not modeled (MUS-010). **Currency:** per-currency buckets, no conversion, ISO-format validated (3-letter shape only — MUS-008). **Contract AI analysis:** does not exist; `/v3/rights/contracts` is an honest 501, and the worksheet carries "not legal or tax advice" in API + UI (verified in `CommissionsView.jsx:161-162`, `MonthlyCloseView.jsx:86`).

## Questions for the owner (defaults if unanswered)

1. **(MUS-003)** Period boundaries: document UTC as the rule for all categories, or move everything to label-local calendar dates? **Default: keep UTC, document it** in `income.js` header.
2. **(MUS-005)** Overlapping commission contracts: reject overlap on create, or worksheet returns all covering contracts for explicit choice? **Default: reject overlap on create.**
3. **(MUS-002)** Royalty import period format: strict YYYY-MM on import (reject otherwise)? **Default: yes.**
4. **(MUS-006)** Archived A&R submissions/demos: lock voting on closed status? **Default: yes (400 on closed).**
5. **(MUS-007)** Audit trail vs erasure: is `AuditEvent` immutable by policy (documented), with purge covering only profile/log/report PII? **Default: yes.**

## Blockers

- None. One transient SSH drop mid-session (recovered after 8s backoff); no work lost.
- No live-browser work was required; nothing in this mission needed sign-in, purchase, or clicking.
