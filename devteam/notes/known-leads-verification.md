# Known-lead verification — the 17 P1 pre-scan leads vs current HEAD

## 2026-09-29 (ms-cycle-02) — genuine re-verification against HEAD `728c4e5`

This supersedes the ms-cycle-01 spot-check (written against `9bb0f7a`, evidence
mostly file:line citations). Every lead below was re-checked against the current
tree on `devteam/bug001-leads-accounting`. DISMISSED leads cite one line of
current-code evidence; VERIFIED/REMAINING leads were genuinely exercised (live
server boots on scratch ports 3993/3994/3997/3998, or existing regression tests
run against the current tree).

Disposition vocabulary: **DISMISSED** (the lead's scary behavior does not exist
in current code — fixed, or the code is gone), **VERIFIED** (still a real issue
in current code), **REMAINING** (narrowed to a live surface that still needs
work). Tracked residuals name the finding/task that owns them.

**Counts: DISMISSED 13 · VERIFIED 3 · REMAINING 1**

| # | Lead | Verdict | Evidence (current HEAD `728c4e5`) |
|---|------|---------|-----------------------------------|
| 1 | Admin-override login branch when ADMIN_EMAIL/ADMIN_PASS unset (suspected S0) | DISMISSED | `src/routes/auth.js:111` guards `adminEmail && adminPass` truthy; empty body → 401 before it. Live retest: empty-body login with ADMIN_* unset → 401, no token minted. |
| 2 | JWT_SECRET fallback to hardcoded string; Server v5.js plaintext passwords | DISMISSED | `assertSecrets()` (`src/config/index.js`) prints CRITICAL + exits on missing/short secret — genuinely exercised (`JWT_SECRET=` → CRITICAL message, fail-fast branch taken). `Server v5.js` absent from tree. |
| 3 | Login tokens missing `id` claim while routes read `req.user.id` | DISMISSED | Both sign sites include `id: user.id` (`src/routes/auth.js:124` admin branch, `:152` standard). review-fixes.test.js 7/7 pass, incl. "auth rejects legacy ID-less tokens" (ID-less → 401). |
| 4 | `/v3/royalties/calculate` unchecked, trusts client splits | DISMISSED | `src/routes/finance.js:39`: `authenticateToken` + `hasArtistAccess` + splits validated (numbers 0–1, sum=1). Live retest: anonymous → 401; splits {0.9,0.9} → 400 "Royalty splits must sum to 1". |
| 5 | AI answer cache keyed by prompt+artistId only | DISMISSED | `src/ai/aiService.js` appends `sha256([user.id, role, artistAccess, contextData])` scope to the cache key. review-fixes.test.js: "scopes label context to current grants" passes — changed grants force a fresh provider call, never the warmed cache. |
| 6 | Duplicate routes (POST /v3/users ×3, PUT/DELETE ×2, POST /v3/ai/analyze ×2) | VERIFIED | Still registered: POST /v3/users ×3 (`src/routes/users.js:68,130,254`), PUT ×2 (:150,268), DELETE ×2 (:207,288). Live retest: valid POST → handler-1 (validated) shape; missing password → 400 "Validation failed"; handlers 2–3 unreachable dead code. `ai/analyze` double-registration claim was wrong (1 exists). Residual: MAP-001 + TASKS S4 cleanup. |
| 7 | Shell command from artist name (auto-print `exec`) | DISMISSED | `src/jobs/monthlyReportJob.js:75-92`: `execFile` with argument arrays + filename sanitization; grep finds zero `exec(` shell-string calls in `src/` (only historical comments). services.test.js 65/65 pass. |
| 8 | Incomplete password reset (unhashed tokens, no consumer, hardcoded localhost link, 404 enumeration) | DISMISSED | password-reset.test.js 10/10 pass against the current flow. Residual availability nit → SEC-007 (S3). |
| 9 | CORS reflects any origin; unread env vars; `err.message` leaks | DISMISSED | CORS: `ALLOWED_ORIGINS` allowlist (`src/middleware/index.js:40-44`); production locked down, dev-only localhost fallback. Residual `err.message` to client on two routes confirmed live (`src/routes/directsales.js:544`) → SEC-003 (S3, Confirmed) — REMAINING there. |
| 10 | PM2 cluster ×N vs in-memory state, per-worker cron, `sync({alter:true})` on boot | DISMISSED | `ecosystem.config.js`: `instances: 1, exec_mode: 'fork'` (no cluster); `sequelize.sync()` plain, no alter (`src/models/index.js:233`) + explicit migrations. Residual single-instance in-memory state → ARC-004 (S2) — REMAINING there. |
| 11 | Float money math; splits not validated | REMAINING | Settlement money is exact (integer cents) — dismissed for settlement. One live user-facing float surface, genuinely exercised: POST /v3/royalties/calculate returned `payout.artist = 3524382.142281` — unrounded fractional cents → MUS-001 (S1). Schema residue (dead `SalesEntry.revenue` float column) → DAT-001 (S3). |
| 12 | Broken start script (`server.js` missing); three diverging manifests; no test script | DISMISSED | `package.json`: `start` → `node server.js` (exists), `test` → `node --test tests/regression/*.test.js`; this cycle's full suite run is the proof. |
| 13 | 18 `test_*`/`verify_*`/`check_*` scripts with no assertions | DISMISSED | Zero `test_*`/`verify_*`/`check_*` scripts remain in `scripts/` (9 operational scripts only). Residual: manual scripts lack a distinguishing manifest → TST-006 (S4) — REMAINING there. |
| 14 | Frontend: in-browser Babel, unpinned CDN, hardcoded localhost:3000, localStorage token, `innerHTML` | DISMISSED | Babel/CDN/`innerHTML` gone with the old HTML dashboards (`innerHTML` only in `web/node_modules`). Residual: JWT in `localStorage` (`web/src/auth/AuthContext.jsx:58` stores `authToken`) → SEC-006 (S4, trade-off accepted with mitigations) — REMAINING there. |
| 15 | Docs mojibake + stale references; README/QUICKSTART default credentials | VERIFIED | Genuine mojibake: `docs/MASTER_GUIDE.md` line 1 `# ðŸŽ§ COMPLETE…` (UTF-8 emoji read as Latin-1); `README.md:39` still lists default creds `admin@pulsegrid.fm` / `admin123`. Tracked: DOC-005/006/007/008. |
| 16 | Generated PDFs/JPEGs/CSVs + ~20 ad-hoc scripts committed at root | DISMISSED | `ls *.pdf *.jpg *.jpeg *.csv` at repo root → none. |
| 17 | Simulated features unlabeled; unofficial-project disclaimer README-only | VERIFIED | No "unofficial"/"fan project"/"fictional data" text in `web/src` UI (the `disclaimer` hits are CSS class names on draft/cash-basis notes). → DOC-004 (S2). |

No lead was silently dropped: every VERIFIED/REMAINING lead has a corresponding
entry in `devteam/findings/*.md` and/or `devteam/TASKS.md`; every DISMISSED lead
cites current-code evidence or a genuinely exercised test.

## 2026-09-29 (ms-cycle-01) — spot-verification against `9bb0f7a` (superseded)

The pre-scan described the PRE-REFACTOR code (`mau5trap-production-api.js`,
`Server v5.js`, single-file HTML dashboards). Spot-verified dispositions were:
DISMISSED-FIXED (1,2,3,8), FIXED (5,7,9,12,16), OBSOLETE (10),
PARTIALLY CONFIRMED (11), CONFIRMED (6,15,17), CONFIRMED-AS-DOCUMENTED (13),
PARTIAL-STALE (14). Kept for history; the table above is authoritative.
