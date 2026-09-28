# Step 6 — AI, Analytics, Automation, Billing, Commercial Controls

**Date:** 2026-09-28

---

## 1. AI Boundaries — Verified

**Rule:** No LLM output ever enters a financial calculation. No mock data in money paths.

- **AI routes** (`/v3/ai/*`): Groq-backed queries with access control enforced BEFORE provider work. Provider failure returns a discriminated `{kind:'error'}` — never a fabricated answer.
- **Entity-audit parsing:** `validateEntityAudit` returns the fallback ONLY with `{ok:false, reason, stage}` — the failure is marked, not laundered as a success.
- **Artist metadata fallback:** `artistRepo.findById` falls back to in-memory seed data if the DB read fails. This is display metadata (names), NOT financial data. **All money** (`src/finance/income.js`) reads directly from Sequelize models (`RoyaltyLine.findAll`, etc.) — no fallback, no mocks.
- **Commissions:** pure deterministic function (`src/finance/commission.js`). No AI involvement.
- **Projections:** linear regression on counted income. No AI involvement.

## 2. Analytics Honesty — Verified

`/v3/analytics/projections` carries the note: *"Forecast based on counted, reviewed income (reported, reconciled, approved). Missing months are gaps, not zero sales. Disputed and estimated amounts are excluded."*
- Requires ≥3 months of data before forecasting.
- Reconciliation disclaimers state explicitly: not a P&L, not a credit rating.

## 3. Automation Safety — Verified

- Scheduled jobs (`src/jobs/`) are registered explicitly by `server.js` — never as a require side effect.
- Disabled with `SCHEDULE_JOBS=false` (tests use this).
- Only job: monthly report generation. No auto-approval, no auto-matching, no auto-payout.

## 4. Billing Controls — Verified

- Stripe is **disabled by default**. All billing routes return `503 SETUP_NOT_CONFIGURED` without keys.
- Webhook verifies the Stripe signature (`constructEvent`) and rejects invalid signatures with 400.
- No charges, no money movement in the demo. The demo dataset uses fictional figures.

## 5. Commercial Controls

- White-label: the Label Intelligence Profile (`src/profile/`) isolates brand, seed data, and AI fallback strings per label. Generic code carries no brand identity (enforced by static gates S01–S09).
- No customer data, no real credentials, no production deployment. Demo-only.
