# Findings — Cartographer (MAP)
Owner: MAP · Lane: map/oddities · Phase 1
ID range: MAP-001… · Status values per B7 (NEW → CONFIRMED → …)
Ledger entry fields per B8: ID · title · severity · confidence · location · evidence · what's wrong · impact.

## Index
| ID | Severity | Confidence | Title | Status |
|---|---|---|---|---|
| MAP-001 | S4 | Confirmed | Duplicate DELETE /v3/users/:id registration — second handler is dead code | NEW |
| MAP-002 | S4 | Confirmed | sync/masterLoop.js is an orphan — the intended live-data sync path is unwired | NEW |
| MAP-003 | S4 | Confirmed | Two parallel integration trees: integrations/ (legacy) still live behind src/integrations/ facade | NEW |
| MAP-004 | S4 | Confirmed | src/routes/anrRoom.js registers only via require inside anr.js, not DOMAIN_ORDER — asymmetric, fragile | NEW |
| MAP-005 | S4 | Confirmed | Unreferenced tooling: scripts/generate_roster.js and scripts/run-visual-gate.js have no callers | NEW |
| MAP-006 | S4 | Suspected | Which tests/snapshots/*.json baseline is authoritative is unclear (three generations) | NEW |
| MAP-007 | S4 | Confirmed | Committed binary/evidence artifacts: execution-validation/ (67 files) + web/validation/*.png | NEW |

---

### MAP-001 · Duplicate DELETE /v3/users/:id registration — second handler is dead code
- **Severity:** S4 (info/hygiene — the reachable handler is the guarded one; no behavior bug)
- **Confidence:** Confirmed
- **Location:** `src/routes/users.js:207` (reachable) and `src/routes/users.js:288` (shadowed)
- **Evidence:** two `app.delete('/v3/users/:id', authenticateToken, …)` registrations in the same
  `register()`; in-code comment at L196-206 states "the SHADOWED duplicate below, which Express never
  binds. Guards now live on the reachable handler". Express binds the first registration; the second
  is unreachable dead code.
- **What's wrong:** dead handler (~17 lines) remains in the file; a future editor may "fix" the wrong one.
- **Impact:** maintainer confusion only. Suggested fix (Phase 5, pre-approved: removing dead code inside
  a file): delete the L285-303 shadowed block.
- **Related:** P1 lead verification is the Lead's lane; this duplicate is post-refactor and self-documented.

### MAP-002 · sync/masterLoop.js is an orphan — the intended live-data sync path is unwired
- **Severity:** S4 (info — deliberate per audit R5, but the map must record it)
- **Confidence:** Confirmed
- **Location:** `sync/masterLoop.js` (entire file); referenced only in a comment at `src/jobs/index.js:14-22`
- **Evidence:** `grep -rn "require.*masterLoop" src/ tests/ scripts/ sync/` → zero code hits.
  `src/jobs/index.js` header: "NOT REGISTERED (audit R5): sync/masterLoop.js exports masterSyncLoop(),
  the intended live-data path that would populate the `Stats` table. It has never been wired to a
  schedule — only test_sync.js requires it" (test_sync.js does not exist in this branch).
- **What's wrong:** the only code path that would write live provider data into `Stats` is dead;
  `GET /v3/analytics/projections` is served from synthetic data by design decision, not accident —
  but nothing enforces or documents that choice outside a code comment.
- **Impact:** ARC/DAT: if a future agent "wires it up", analytics silently switch from synthetic to real
  (behavior change the comment warns about). Recommend a decision record (DECISIONS.md) or removal.

### MAP-003 · Two parallel integration trees: integrations/ (legacy) still live behind src/integrations/ facade
- **Severity:** S4 (info — architecture smell for ARC)
- **Confidence:** Confirmed
- **Location:** `integrations/` (7 files: index, spotify, youtube, twitter, instagram, tiktok, ticketmaster)
  vs `src/integrations/` (4 files: index, rateLimiter, scoutService, wikipedia.fixtures)
- **Evidence:** `src/integrations/index.js:19` → `require('../../integrations')`; also required by
  `src/repositories/artistRepository.js`, `src/services/catalogIntegrityService.js`,
  `src/integrations/scoutService.js`, `src/jobs/providerSync.js`, `sync/masterLoop.js`.
- **What's wrong:** two homes for provider code; the legacy tree is not legacy-dead, it is live.
- **Impact:** ARC: unclear ownership; changes may land in the wrong tree. Consolidation is a
  REFACTOR_MODE=propose item, not a Phase 5 fix.

### MAP-004 · src/routes/anrRoom.js registers only via require inside anr.js, not DOMAIN_ORDER — asymmetric, fragile
- **Severity:** S4 (info)
- **Confidence:** Confirmed
- **Location:** `src/routes/anr.js:252` (`require('./anrRoom').register(app, ctx)`); `src/routes/index.js`
  DOMAIN_ORDER has no `'anrRoom'` entry (verified by grep)
- **Evidence:** 22 of 23 files in `src/routes/` export `register` and are loaded by the DOMAIN_ORDER loop;
  `anrRoom.js` is the exception — loaded imperatively from inside `anr.js`'s register.
- **What's wrong:** single binding verified (no double-registration), but the pattern breaks the
  "registration order is part of the contract" invariant documented in `src/routes/index.js` and
  `production-api.js`; route-order tooling/tests that enumerate DOMAIN_ORDER will miss anrRoom's routes.
- **Impact:** BUG/SEC flow tracing must remember anrRoom routes bind inside anr's register.
  Recommend either adding to DOMAIN_ORDER (order-sensitive — needs test re-run) or a comment at the
  DOMAIN_ORDER list. NEEDS-OWNER if behavior/order is touched.

### MAP-005 · Unreferenced tooling: scripts/generate_roster.js and scripts/run-visual-gate.js have no callers
- **Severity:** S4 (info — hygiene)
- **Confidence:** Confirmed
- **Location:** `scripts/generate_roster.js`, `scripts/run-visual-gate.js`
- **Evidence:** `grep -rn "generate_roster" package.json scripts/ tests/` → no hits;
  `grep -rn "run-visual-gate" package.json` → no hits (only referenced in `web/validation/gate.mjs`
  header comment: "Preferred: node scripts/run-visual-gate.js").
  (`scripts/serve-static.js` IS referenced — by `scripts/deploy-client.sh:267-269,311` — not orphaned.)
- **What's wrong:** runnable tools with no documented invocation path; `test:all` runs
  `web run gate -- --static-only`, never the self-hosted `run-visual-gate.js`.
- **Impact:** DOC/BLD: either document the invocation or fold into npm scripts. No behavior impact.

### MAP-006 · Which tests/snapshots/*.json baseline is authoritative is unclear (three generations)
- **Severity:** S4 (info)
- **Confidence:** Suspected (needs TST/Lead confirmation)
- **Location:** `tests/snapshots/baseline.json` (1729 lines), `tests/snapshots/phase2_baseline.json`
  (2801 lines), `tests/snapshots/repaired_contracts.json` (2386 lines)
- **Evidence:** `npm run snapshot:baseline` → `tests/support/probe.js server.js
  tests/snapshots/phase2_baseline.json` writes phase2_baseline; `snapshot.test.js` is in the suite;
  `repaired_contracts.json` is referenced by memory as alphabetically-keyed drift target.
- **What's wrong:** three snapshot generations coexist; the map cannot tell TST which one the suite
  asserts against vs which are historical.
- **Impact:** TST lane: confirm and document; stale baselines are misleading fixtures.

### MAP-007 · Committed binary/evidence artifacts: execution-validation/ (67 files) + web/validation/*.png
- **Severity:** S4 (info — repo hygiene, BLD/DOC lanes)
- **Confidence:** Confirmed
- **Location:** `execution-validation/` (31 + 21 + 10 + 2 + 3 = 67 files: JSON evidence + PNG screenshots
  from a 2026-09-18 validation run), `web/validation/*.png` (~17 screenshots)
- **Evidence:** `git ls-files` lists them; they are run outputs, not sources. B1 OUT OF SCOPE covers
  "binary assets (review whether they belong, not their contents)".
- **What's wrong:** ~80 binary/evidence files inflate the repo and the review surface.
- **Impact:** none on behavior. Recommend BLD/DOC decide: keep as audit trail, move to releases, or
  gitignore going forward. No action by MAP.
