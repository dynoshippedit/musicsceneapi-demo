# Data Model Notes — DAT

Branch: `devteam/review-2026-09-29` · read-only review · 2026-09-29
Primary source: `src/models/index.js` (761 lines), `src/models/migrations.js` (159 lines),
`src/config/index.js`, `scripts/run-demo.sh`, `demo/dataset-v1/load.js`.

## 1. Stores

| Store | What | Backed by | Notes |
|---|---|---|---|
| Relational DB (canonical) | All 30 Sequelize models | SQLite by default (`DB_STORAGE`, default `./data/label.sqlite`); Postgres via `DATABASE_URL`/dialect config | `sequelize.sync()` at startup — **creates** missing tables, never evolves existing ones |
| Demo fixtures | Fictional Pulsegrid roster/catalog/users/A&R seeds | `initDB({demoMode})` — seeded ONLY when `DEMO_MODE=true` (`src/models/index.js:225–245`) | Customer boot = empty DB; first admin bootstrapped via `ADMIN_EMAIL`/`ADMIN_PASS` first-login override (`src/routes/auth.js:108–134`) |
| Throwaway runtime state | Demo runs | `.demo-data/` (gitignored); `scripts/run-demo.sh` sets `DB_STORAGE=$ROOT/.demo-data/demo.sqlite` | Never a customer artifact |
| Demo dataset v1 | Deterministic royalty/reconciliation fixture | `demo/dataset-v1/` (CSVs + `load.js` + `expected.json`) | Idempotent loader; asserts counts/totals; unmatched rows rejected, never persisted |
| In-memory | `src/services/cacheService.js` (NodeCache: stdTTL 3600, ARTIST_DATA 24h, entity-audit composite 2 weeks), `src/repositories/inMemoryStores.js` (legacy demo stores, two unrelated live demo stores) | Process memory | Single PM2 fork instance; lost on restart; no cross-process story |
| Files | Multer memory uploads (CSV imports), generated PDF/CSV reports, evidence dir in demo loader | Buffer → DB or disk | No object storage |

## 2. Models — full inventory (30)

Auth/identity
1. `User` (line 25) — email unique, bcrypt `passwordHash`, role, artistAccess ('all'|ids), pageAccess JSON string, `resetToken`/`resetTokenExpiry` (STRING epoch millis — see DAT-015), sessionVersion, active flag
2. `ArtistOAuth` (392) — unique (artistId, provider); accessTokenEnc + **refreshTokenEnc** (stored, never used — DAT-006), expiresAt, scopes

Money in (statements/lines)
3. `RoyaltyStatement` (574) — unique (source, period, sourceFileHash); status; provenance (importedBy, importVersion, reviewedBy…)
4. `RoyaltyLine` (433) — belongs to statement (`RoyaltyLine.belongsTo(RoyaltyStatement)`, statement hasMany — the **only** explicit FK association in the schema); `amountDecimal` DECIMAL-as-string, **nullable** (DAT-010); rowHash dedup; mappingVersion; reviewState; supersedesId; artistId plain string (no FK)
5. `MerchSettlement` (126) — atVenu settlements; unique named index on (artistId, showDate, venue, source, sourceFileHash); reviewState; supersedesId; grossCents/feesCents/taxesCents/netCents integers — **no check that net = gross−fees−taxes** (DAT-008)

Money out / cash evidence
6. `Payout` (628) — unique (provider, providerPayoutId); status; arrival fields; optional link to BankDeposit
7. `BankDeposit` (654) — bankRef index; optional link back to Payout
8. `ManualAdjustment` (602) — **integer** amountCents; the current writer for manual sales (replaces SalesEntry)
9. `CashGapAnnotation` (676) — unique gapKey; human explanation for reconciliation gaps

Catalog/rights
10. `Artist` (45) — catalog artist
11. `Recording` (403), 12. `Release` (412), 13. `Work` (421), 14. `WorkRecording` (428) — join table, plain IDs, no FK
15. `CommissionContract` (699) — artist commission terms (worksheet inputs)
16. `SourceMapping` (742) — unique (source, headerHash); CSV header→canonical mapping versions

Direct sales / payments
17. `PaymentConnection` (499) — Stripe Connect link per artist/provider
18. `DirectSale` (518) — unique (provider, providerSaleId); integer cents
19. `ArtistPaymentMapping` (548) — unique (provider, matchType, matchValue); payout→artist resolution
20. `Subscription` (376) — billing read model updated by Stripe webhooks; no event-id dedup (DAT-009)

Pipeline/ops
21. `ProviderSyncExecution` (71) — unique idempotencyKey (provider/kind/hour); status/result JSON; stale-takeover is read-then-update without CAS (DAT-013)
22. `AuditEvent` (195) — actorId/actorEmail, action, entity; **no FKs** — survives user deletion (DAT-011)
23. `Campaign` (176) — userId/artistId plain strings, no FKs
24. `AnrSubmission` (100) — A&R intake
25. `RoomDemo` (159), 26. `RoomVote` (168) — userId plain, no FK; 27. `RoomSetting` (172)
28. `Stats` (53) — unique (artistId, month); **no writers and no readers in `src/`** — dead table (DAT-012); providerSync deliberately does not write it (Phase 1B honesty)
29. `SalesEntry` (114) — `revenue` is the **only FLOAT money column** in the schema; vestigial: no product writer, `salesService.history()` uncalled by routes (DAT-001)
30. `ExpectedReport` (721) — unique (customer, source, period); expected-report calendar

## 3. Types, constraints, indexes

- Money: exact-decimal strings (`parseDecimal`, `src/finance/decimal.js`) or integer cents — **except** `SalesEntry.revenue` (FLOAT), projections (deliberate float, labeled), and display percentages.
- Relationships: almost entirely logical (plain ID strings); the sole enforced association is RoyaltyStatement↔RoyaltyLine. No FK cascades anywhere — orphan rows possible on delete (Artist→recordings/lines; User→Campaign.userId/RoomVote.userId/AuditEvent.actorId).
- Index coverage is good on financial tables: 15 of 30 models declare `indexes`; dedup uniques on (provider, providerSaleId), (provider, providerPayoutId), (source, period, sourceFileHash), idempotencyKey, gapKey, (customer, source, period), (source, headerHash).
- No `paranoid` soft deletes. "Supersede" is a domain state on financial rows, not general soft deletion.
- Transactions: royalty import and atVenu import are wrapped in one Sequelize transaction each. Payout/deposit match/unmatch and direct-sales sync are **not** (DAT-003, DAT-004).

## 4. Migrations — the weak link (DAT-002)

`src/models/migrations.js` holds named ad-hoc repair functions (`repairSalesSchema`, `addUserSecurityColumns`, `addRoyaltyDedupColumns`, `addMonthlyCloseColumns`). Every one **returns immediately for non-SQLite**. There is no versioned migration ledger, no migration history table, no rollback chain. Startup runs plain `sequelize.sync()` (`src/models/index.js:233`) — creates absent tables, never alters existing ones.

Consequences:
- Existing Postgres deployments never receive column/index evolutions (dedup columns, security columns, monthly-close columns, FLOAT→DECIMAL conversions).
- Schema drift between fresh installs (correct) and upgraded installs (stale) is silent.
- `repairSalesSchema` recreates `SalesEntries.revenue` as FLOAT inside a transaction with a secured backup — careful for SQLite, but the FLOAT type itself is preserved.

## 5. Seed / demo-customer separation

- Verified: fictional data gates on `DEMO_MODE=true` (`src/models/index.js:238–245`, `src/config/index.js` comments). Customer boot leaves all tables empty; admin bootstraps via env credentials on first login.
- Demo scripts write only under `.demo-data/` (gitignored).
- `demo/dataset-v1/load.js` is a well-built deterministic fixture: idempotent (marker source `demo-dataset-v1`, 409-tolerant reviews), asserts against `expected.json`, rejects unmatched rows without persisting.
- Residual mock surfaces: legacy `integrations/index.js` `fetchArtistData` merges live results over a mock base and returns mock on failure with only `console.warn` (DAT-007); `/v3/artists/:id` `totalRevenue`/`projectedAnnual` float-sums mock `artist.revenue` (DAT-001); `/v3/anr/scout` correctly labels `{ source: 'fixture' }`.

## 6. Concurrency

- PM2: `instances: 1`, `exec_mode: 'fork'` — single Node process.
- SQLite defaults: no `journal_mode=WAL`, no `busy_timeout` configured in the Sequelize options. Concurrent writers exist (HTTP request + cron/provider-sync job in the same process). Under write contention the loser gets SQLITE_BUSY (DAT-014).
- ProviderSync stale-takeover is read-then-update without lock or compare-and-swap (DAT-013); single process limits the blast radius to cron-vs-manual-trigger races.
- Non-atomic multi-write flows: payout↔deposit match/unmatch, direct-sales sync loop (DAT-003, DAT-004).
