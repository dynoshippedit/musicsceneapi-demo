# Music & Rights — specialist notes (MUS)

Phase 2 domain-depth notes for the Tech Lead / Verifier. Evidence for the
MUS-001…MUS-011 findings lives in `devteam/findings/mus.md`; this file holds
the supporting inventories and convention tables.

## 1. Money-arithmetic map (all quoted code verified 2026-09-29)

| Layer | Representation | Rounding | File |
|---|---|---|---|
| Royalty import | exact decimal string → BigInt mantissa + scale | none at import | `src/routes/royalties.js:255-276`, `src/finance/decimal.js` |
| Royalty aggregation | `sumDecimals` exact → `decimalToCents` **once per aggregate** | round-half-up to 2dp | `src/finance/decimal.js:98-112`, `income.js:royaltyCentsFor` |
| Merch / direct sales / manual adjustments | integer cents natively | none | models `DirectSale`, `MerchSettlement`, `ManualAdjustment` |
| Commission | BigInt cents × integer bps / 10000 | round-half-up in BigInt (`commissionCents`, `commission.js:95-103`) | `src/finance/commission.js` |
| Boundary export | `centsToNumber` | **throws** out of safe-integer range | `src/finance/income.js:268-274` |
| Projections | float regression over integer-cent inputs | `Math.round` to cents, floored at 0 | `salesService.js:forecast`, `regression.js:performLinearRegression` |
| One-off calculator | **float** fractions × float totals, unrounded | none — MUS-001 | `src/routes/finance.js:55-82` |

No FX, no cross-currency summation anywhere (currency-mismatch
payout↔deposit match rejected at `monthlyclose.js:197-199`).

## 2. Period / time-zone conventions (verified — MUS-002, MUS-003)

| Category | Month assignment | Time zone rule |
|---|---|---|
| Royalties | `line.period` exact string match (validated only non-empty at import — MUS-002) | n/a (string) |
| Merch settlements | `showDate` string prefix `YYYY-MM-DD → YYYY-MM` | as entered (label-local) |
| Direct sales | `new Date(occurredAt).toISOString().slice(0,7)` | **UTC** |
| Manual adjustments | `month` declared string (validated `validMonth`) | n/a (string) |
| Bank deposits (commission cash base) | `toISOString().slice(0,10)` → period | **UTC** |

Header `income.js:34-41` documents the per-category filtering but states no
time-zone rule. Mixed conventions = the MUS-003 finding.

## 3. PII inventory (verified — MUS-007)

| Store | PII fields |
|---|---|
| `User` (DB) | email (unique), name, passwordHash, resetToken(+expiry), artistAccess, pageAccess |
| `AuditEvent` (DB, append-only, `updatedAt: false`) | `actorEmail` on every action |
| Money records (DB) | `enteredBy`, `reviewedBy`, `matchedBy`, `reviewedBy`, `reviewEvidence`, `matchNote` — email strings on RoyaltyLine, RoyaltyStatement, ManualAdjustment, MerchSettlement, DirectSale, Payout, BankDeposit, CommissionContract, ExpectedReport |
| `ArtistOAuth` (DB) | provider OAuth tokens, AES-256-GCM encrypted at rest |
| Files | `reports/<YYYY-MM>/` PDFs (names/emails), `.demo-data/` sqlite, winston log files |
| In-memory | artist OAuth user ids, `userIntegrations` store |

Deletion: `DELETE /v3/users/:id` removes the row only (self-delete + root-admin
guards verified at `users.js:207-236`). No export endpoint exists anywhere in
`src/routes/`. See MUS-007 for the retention-policy question.

## 4. Provenance labeling by surface (verified)

| Surface | Provenance label present? |
|---|---|
| `/v3/financials/*` reconciliation/close | **yes** — `disclaimers[]` incl. "not a profit-and-loss statement", "no floating-point money" (`reconciliation.js:118-129`); rendered in `ReconciliationView.jsx:86`, `MonthlyCloseView.jsx:86,342` |
| Commission worksheet | **yes** — "Draft worksheet only — not a payment instruction and not legal or tax advice", `computedBy: 'deterministic calculation — no AI involved'` (`commission.js:267-275`); rendered in `CommissionsView.jsx:161-162` |
| AI financial outputs | **yes** — `AI_FINANCIAL_DISCLAIMER` "Not financial advice" (`src/ai/disclaimer.js`); AI strictly opt-in |
| `/v3/anr/scout`, `/v3/anr/evaluate` | **yes in JSON** — `source: 'fixture'` (UI confirmation is UIX's lane, per DOC tail) |
| `/v3/royalties/calculate` response | **no** — float payout, no estimate/mock label (MUS-001) |
| `/v3/artists/:id` `totalRevenue`/`projectedAnnual` | **no** — float sums over mock fiction (MUS-004) |
| Monthly PDF report (`generateMonthlyReport`) | **no** — `Total Revenue: $…` with only the AI disclaimer (MUS-004); scheduled cron writes these monthly |

## 5. A&R voting integrity (verified — MUS-006)

- `/v3/anr/submissions/:id/vote`: one vote per user via `voters[userId]` map in
  an IMMEDIATE transaction (`anr.js:171-210`); explicit up/down required
  (A-VOTEDIR fix); toggle-off semantics; race-safe with SQLite-busy retry.
- `/v3/anr/vote/:demoId`: `RoomVote.upsert({demoId, userId})` on the composite
  PK (`demoId`, `userId`) — double-vote impossible by construction.
- Residuals (MUS-006): no status lock on either path; `tally()` denominator is
  all Users, numerator excludes deleted users' votes.

## 6. Identifier validation (verified — MUS-008)

- ISRC: `/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/`, stored uppercase, unique
  (`catalog.js:31-43`). Demo uses unassigned `ZZ` country code by design
  (`catalog.js:21-23`) — cannot collide with real assignments.
- UPC: `/^[0-9]{12}$/` only — no GTIN-12 check digit (MUS-008).
- ISWC: no field on `Work` at all (MUS-008).
- Currency: 3-letter shape only, not a real ISO-4217 list (`royalties.js:278-281`,
  `monthlyclose.js:119`).

## 7. Platform-terms posture (verified — MUS-011)

- Wikipedia: profile-owned User-Agent (`entityAudit.js:214`), 24h cache
  (`artists.js:231`), URL attribution returned (`wikiUrl`); `musicRelated`
  rejection verified (LUMEN VEIL "Veil of Isis" stays `wikipedia: null`).
- `src/integrations/rateLimiter.js` advertises per-service token-bucket
  limiters but they are unwired — documented in-code as a PRESERVED DEFECT;
  only the diagnostic `/v3/integrations/test-limit/:service` touches them.
- Scout service is mock fixtures (`source: 'fixture'` in response); the dead
  Spotify placeholder client was removed (`scoutService.js` header).
- No TikTok/Instagram/Ticketmaster ToS compliance notes found where the code
  touches them beyond the integration modules' `isConfigured()` guards and
  fail-closed attribution (Instagram) — a light read; SEC/ARC lanes may want
  the full pass.

## 8. Money paths covered (for COVERAGE)

decimal.js, commission.js, income.js, reconciliation.js, kpi.js, reviewState.js
(referenced), salesService.js, regression.js, royalties.js, monthlyclose.js
(all 564 lines), directsales.js (stripe pipeline lines 128-286), catalog.js,
finance.js (`/v3/royalties/calculate`, `/v3/rights/contracts` 501),
analytics.js (projections + sales routes), monthlyReport.js (PDF),
monthlyReportJob.js (cron), anr.js, anrRoom.js, src/ai/disclaimer.js,
src/integrations/{index,rateLimiter,wikipedia.fixtures}.js,
modules/entityAudit.js (wikipedia section), artistRepository.js (hybrid union),
models/index.js (User, Artist, RoyaltyLine, RoyaltyStatement, DirectSale,
MerchSettlement, ManualAdjustment, Payout, BankDeposit, CashGapAnnotation,
CommissionContract, ExpectedReport, RoomDemo, RoomVote, AnrSubmission,
Recording, Release, Work, AuditEvent), web finance views
(ReconciliationView, MonthlyCloseView, CommissionsView disclaimer rendering).
