# Findings — Product & Docs Auditor (DOC)

<!-- C12 ledger header -->
- **Lane:** DOC (Product & Docs Auditor) · **Phase:** 1 (claims audit + setup truth)
- **Branch:** `devteam/review-2026-09-29` · **Date:** 2026-09-29
- **ID range:** DOC-001 – DOC-011 (this lane owns DOC-*)
- **Source code:** READ-ONLY this phase. No docs were fixed; corrections land in Phase 5 per B9.10.
- **Evidence standard:** every finding cites `path:line` and quotes the evidence.
- **Full claims table:** `devteam/notes/claims-audit.md` (51 TRUE · 6 FALSE · 1 PARTIAL · 3 UNVERIFIABLE across README + whitepaper).
- **Finding format note:** the Part C/C6 ledger template was not in my context; entries follow
  ID · title · severity · confidence · status · location · evidence (quote) ·
  what's wrong · impact · suggested fix · related.

## Index

| ID | Severity | Confidence | Status | Title |
|---|---|---|---|---|
| DOC-001 | S2 | Confirmed | NEW | Whitepaper §11 test counts are stale (333/56 vs actual 361/60) |
| DOC-002 | S2 | Confirmed | NEW | Whitepaper §14 "no float anywhere in the money path" overreaches — projections use float |
| DOC-003 | S2 | Confirmed | NEW | Whitepaper §17 claims the PDF export carries "not a P&L" disclaimers — it carries only the AI disclaimer |
| DOC-004 | S2 | Confirmed | NEW | No unofficial/fan-project/fictional-data disclaimer in the UI or generated PDFs (README-only) |
| DOC-005 | S2 | Confirmed | NEW | docs/QUICKSTART.md is entirely stale (pre-refactor; references files that don't exist) |
| DOC-006 | S3 | Confirmed | NEW | docs/START_HERE.md is stale and contains a broken link |
| DOC-007 | S3 | Confirmed | NEW | docs/MASTER_GUIDE.md and docs/SYSTEM_OVERVIEW.md have mojibake + stale pre-refactor content |
| DOC-008 | S3 | Confirmed | NEW | docs/API_INVENTORY.md is a stale pre-refactor inventory |
| DOC-009 | S3 | Likely | NEW | Whitepaper §11 "8 end-to-end browser journeys" is unverifiable |
| DOC-010 | S3 | Confirmed | NEW | docs/runbook.md: "(frontend proxies /v3 to it)" is inaccurate |
| DOC-011 | S4 | Confirmed | NEW | Stale comment in src/analytics/regression.js about a README projection claim |

---

### DOC-001 · Whitepaper §11 test counts are stale (333/56 vs actual 361/60)
- **Severity:** S2 (docs materially mislead about test coverage) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `docs/whitepaper.md` §11 (line ~268: "**Backend:** 333 tests across 56 suites")
- **Evidence (quote):** whitepaper: "- **Backend:** 333 tests across 56 suites — routes, financial logic, review-state machine, import/supersede behavior, authorization boundaries, migrations."
- **Counter-evidence:** `npm test` run 2026-09-29 on this branch: `# tests 361`, `# suites 60`, `# pass 356`, `# fail 5` (exit 1).
- **What's wrong:** the whitepaper's counts are stale (and the suite is not currently green — see notes/claims-audit.md Observations for the 5 failures, which belong to TST/BUG triage).
- **Impact:** anyone relying on the whitepaper for a coverage claim (e.g. a label evaluating the platform) gets wrong numbers.
- **Suggested fix:** update §11 to the verified counts once the suite is green again, or state the count as of a dated verification.

### DOC-002 · Whitepaper §14 "no float anywhere in the money path" overreaches — projections use float
- **Severity:** S2 (a precise technical claim that is false for one named component) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `docs/whitepaper.md` §14 ("All internal arithmetic uses integer or scaled-integer math. There is no float anywhere in the money path — not in parsing, not in aggregation, not in commissions, not in projections.")
- **Evidence (quote):** `src/services/salesService.js:26`: `const model = performLinearRegression(rows.map(r => monthIndex(r.month) - first), rows.map(r => r.revenue));`
- **Counter-evidence:** `src/analytics/regression.js:12` (`const math = require('mathjs');`) and `:18-40` — `performLinearRegression` builds mathjs float matrices and inverts them; `salesService.js:25` then does `Math.round(model.predict(...))`. The live `/v3/analytics/projections` path (`src/routes/analytics.js:150-184`) converts exact cents to JS numbers (`centsToNumber`) before regressing.
- **What's wrong:** parsing/aggregation/commissions genuinely are exact (decimal.js, BigInt), but projections are float-based. The sentence claims all four.
- **Impact:** low for money correctness (forecasts are estimates, labeled as such), but the claim as written is disprovable by reading the code, which erodes trust in the doc's other precise claims.
- **Suggested fix:** narrow the sentence to parsing/aggregation/commissions/settlement; add "projections are statistical estimates computed in floating point and labeled as forecasts."

### DOC-003 · Whitepaper §17 claims the PDF export carries "not a P&L" disclaimers — it carries only the AI disclaimer
- **Severity:** S2 (docs describe a safeguard the product doesn't have) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `docs/whitepaper.md` §17 ("The export carries the same disclaimers as the API: reviewed income and cash evidence, not a P&L.")
- **Evidence (quote):** `src/reports/monthlyReport.js:115`: `doc.text(\`AI-generated. ${AI_FINANCIAL_DISCLAIMER}\`, ...)` and `:108`: `doc.text(AI_INSIGHTS_NOT_REQUESTED, ...)` — these are the **only** disclaimer strings written into the PDF. A full scan of `doc.text` calls in `monthlyReport.js` (`:69-:420`) shows sections for Total Revenue, Growth Rate, AI insights, Genres, Revenue Breakdown, Visual Analytics, Streaming Geography, Social & CRM, Tour Performance — no "not a P&L", no "cash evidence", no "fictional/demo data" text anywhere.
- **What's wrong:** the doc asserts an export disclaimer that does not exist in the generated artifact.
- **Impact:** the monthly PDF is the artifact most likely to be forwarded out of context (to an artist's team); it currently reads as authoritative financial output with no "not a P&L" framing.
- **Suggested fix:** either add the disclaimer to the PDF (user-visible change — NEEDS OWNER per B1) or correct §17 to describe what the export actually carries. Related: DOC-004.

### DOC-004 · No unofficial/fan-project/fictional-data disclaimer in the UI or generated PDFs (README-only)
- **Severity:** S2 (brand/legal risk: fictional artists presented without in-product framing) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** product-wide — `web/src/` (no match for `fictional|not affiliated|unofficial|fan project|demo build` in any `.jsx`/`.js`); `src/reports/monthlyReport.js` (see DOC-003).
- **Evidence:** README.md:7-10 carries the disclaimer ("Pulsegrid is the fictional demo label … Nothing in this repository is affiliated with or endorsed by any real-world artist"). Greps over `web/src/` and `src/reports/` return zero disclaimer strings; the whitepaper's own demo walkthrough (§9.2) says "All names, figures, and activity are fictional" — but only in the doc, not the product. (The MUS card requires this disclaimer "visible in the product UI and in exported reports, not only the README".)
- **What's wrong:** the only place the fictional/unofficial framing exists is prose docs. Screenshots of the UI or forwarded PDFs carry no such framing.
- **Impact:** brand/legal exposure if demo artifacts circulate; also a stated project standard (MUS card) that is not met.
- **Suggested fix:** add a small persistent "Demo — fictional data" marker in the UI chrome and a one-line footer in generated PDFs. This changes user-visible behavior → NEEDS-OWNER decision; recommended default: add it (cheap, matches the project's own standard).

### DOC-005 · docs/QUICKSTART.md is entirely stale (pre-refactor; references files that don't exist)
- **Severity:** S2 (a new user following it cannot succeed at all) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `docs/QUICKSTART.md` (57 lines, whole file)
- **Evidence (quotes):** `docs/QUICKSTART.md:38`: "> http://localhost:8080/pulsegrid-frontend-connected.html"; `:41`: "> http://localhost:8080/pulsegrid-terminal-dashboard.html"; `:17`: "Start the API server. This handles authentication, database (in-memory), and AI logic."; `:15`: "`✅ Server should show: \`Server: http://localhost:3000\``".
- **Counter-evidence:** `ls pulsegrid-frontend-connected.html pulsegrid-terminal-dashboard.html` → "No such file or directory" (both; also absent from `find .`); current stack is React/Vite on :5173 + API on :4000 with SQLite file (`.demo-data/demo.sqlite`), launched via `scripts/run-demo.sh`.
- **What's wrong:** every setup step describes the pre-refactor system (single-file HTML frontends, port 3000, in-memory DB, `npx http-server`).
- **Impact:** the file is named as the entry point for new users (`docs/START_HERE.md` points here first); following it wastes an hour and fails.
- **Suggested fix:** rewrite against `scripts/run-demo.sh` / `docs/runbook.md`, or delete and redirect to README + runbook. (Deletion needs owner approval per B1; recommend rewrite.)

### DOC-006 · docs/START_HERE.md is stale and contains a broken link
- **Severity:** S3 · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `docs/START_HERE.md:14-16` ("Critical Files" lists `pulsegrid-frontend-connected.html`, `pulsegrid-terminal-dashboard.html` — neither exists); `:11` link `[README.md](README.md)` resolves to `docs/README.md`, which does not exist (`ls docs/README.md` → "No such file or directory").
- **What's wrong:** the orientation doc points at dead files and a dead link; also "Generated: 2025-12-10".
- **Impact:** first-impression doc sends newcomers down the stale QUICKSTART path.
- **Suggested fix:** point to root `../README.md`, `../docs/runbook.md`, `../docs/whitepaper.md`; drop the dead file list.

### DOC-007 · docs/MASTER_GUIDE.md and docs/SYSTEM_OVERVIEW.md have mojibake + stale pre-refactor content
- **Severity:** S3 · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `docs/MASTER_GUIDE.md:1` (`# ðŸŽ§ COMPLETE pulsegrid Intelligence Platform`), `:6-186` (`ðŸ“¦`, `ðŸš€`, `ðŸ”`, …); `docs/SYSTEM_OVERVIEW.md:1`, `:371` (same `ðŸŽ§` sequences) — UTF-8 emoji decoded as Latin-1.
- **What's wrong:** encoding damage on headings throughout, plus pre-refactor content ("18 Files", "TWO PATHS TO CHOOSE").
- **Impact:** cosmetic but visible; these read as neglected docs, which undermines the docs set.
- **Suggested fix:** fix encoding (re-encode as UTF-8) and either refresh or archive as historical. Low priority.

### DOC-008 · docs/API_INVENTORY.md is a stale pre-refactor inventory
- **Severity:** S3 · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `docs/API_INVENTORY.md:3` ("Generated by parsing `production-api.js` (commit `c0281d8`). 65 `app.*` declarations")
- **Evidence:** the inventory lists old-monolith line numbers (e.g. `POST /v3/auth/login` at "L478") and its Consumers legend maps `WS` = `pulsegrid-frontend-connected.html`, which no longer exists. Current API surface is `src/routes/*.js` with `docs/openapi.json` (102 paths).
- **What's wrong:** a reader using it as an API reference gets wrong line numbers and dead consumer mappings.
- **Impact:** misleading reference doc; superseded by `docs/openapi.json`.
- **Suggested fix:** mark as historical/superseded at the top, or regenerate from current routes.

### DOC-009 · Whitepaper §11 "8 end-to-end browser journeys" is unverifiable
- **Severity:** S3 · **Confidence:** Likely · **Status:** NEW
- **Location:** `docs/whitepaper.md` §11 ("**Browser workflows:** 8 end-to-end journeys through the real UI against the live API.")
- **Evidence:** `scripts/run-browser-workflows.js` delegates to `execution-validation/repair-2026-09-18/workflows.mjs` (187 lines), whose committed output `execution-validation/browser-workflows/workflow-results.json` has keys `tileMode, checks, pageErrors, pages, tiles` — a dashboard-tile validation result, not 8 named end-to-end journeys. No "8 journeys" enumeration found in the runner or its output.
- **What's wrong:** the specific number "8" and the "end-to-end journeys" characterization could not be confirmed from the workflow artifacts.
- **Impact:** minor; the workflows do exercise the real UI against a live API (throwaway DB, ephemeral ports), so the substance is close.
- **Suggested fix:** enumerate the actual journeys in the workflow output/README of that script, then align the whitepaper number — or soften to "browser workflow suite".

### DOC-010 · docs/runbook.md: "(frontend proxies /v3 to it)" is inaccurate
- **Severity:** S3 · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `docs/runbook.md` §9 troubleshooting ("verify API is up (frontend proxies `/v3` to it)")
- **Counter-evidence:** `web/vite.config.js` contains no proxy configuration (only `plugins: [react()]`); the frontend reaches the API via `VITE_API_BASE_URL` (`web/src/api/client.js:1`, set by `scripts/run-demo.sh:80`).
- **What's wrong:** a troubleshooter looking for proxy config won't find any; the actual mechanism is the env var.
- **Impact:** tiny; one parenthetical.
- **Suggested fix:** replace with "(frontend calls the API at `VITE_API_BASE_URL`)".

### DOC-011 · Stale comment in src/analytics/regression.js about a README projection claim
- **Severity:** S4 (info — code comment, not user-facing docs) · **Confidence:** Confirmed · **Status:** NEW
- **Location:** `src/analytics/regression.js:60-66`
- **Evidence (quote):** "README.md claims projections regress over \"12 months of historical revenue data\". No such history exists…"
- **What's wrong:** README.md makes no such claim (verified by full read). The comment documents a stale grievance against an old doc version; `generateSyntheticHistory` itself is dead code (never called at runtime — only unit tests).
- **Impact:** none on users; mildly confusing for the next reader.
- **Suggested fix:** trim the comment to describe the function as test-only/dead, or remove the function if the owner agrees it's permanently superseded.

---

## Deferred / not DOC findings (recorded for routing)

- **R21** ("Every request is authorized server-side") → **SEC** authz matrix.
- **W7** ("Every view carries loading, error, and empty states") → **UIX**.
- **localStorage `authToken`** (`web/src/auth/AuthContext.jsx:9,58-59`) → **SEC** (XSS trade-off; docs never claim otherwise, so no DOC finding).
- **5 failing tests on this branch** (`npm test`: 361 tests / 60 suites, 356 pass, 5 fail — `durability.test.js:122`, four `snapshot.test.js` subtests) → **TST/BUG** triage; also contradicts PLAYBOOK B3's "green" record.
- **Hardcoded `JWT_SECRET` value in `scripts/run-browser-workflows.js`** (committed, test-only throwaway DB; value not inspected) → **SEC**.
- **Fixture labeling at API but unconfirmed in UI** (`source: 'fixture'` on `/v3/anr/evaluate`, `/v3/anr/scout`; `fixture: true` on provider sync) → **UIX** to confirm the labels surface to users.
