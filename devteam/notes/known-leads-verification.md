# Known-lead verification — the 17 P1 pre-scan leads vs current HEAD

Written 2026-09-29 (ms-cycle-01) from the Phase 1/2 lane dispositions recorded in
`devteam/JOURNAL.md` plus independent spot-verification against HEAD `9bb0f7a`
(`devteam/review-2026-09-29`). The pre-scan described the PRE-REFACTOR code
(`mau5trap-production-api.js`, `Server v5.js`, single-file HTML dashboards);
every lead below was re-checked against the current tree. Disposition vocabulary:
DISMISSED-FIXED (lead's scary behavior is gone from current code), FIXED (repaired
by a cited commit), OBSOLETE (the code it described no longer exists),
PARTIALLY CONFIRMED (narrowed to a smaller live surface), CONFIRMED (still true —
logged as a current finding), CONFIRMED-AS-DOCUMENTED (true but intentional).

| # | Lead | Disposition | Evidence (current HEAD) |
|---|------|-------------|-------------------------|
| 1 | Admin-override login branch when ADMIN_EMAIL/ADMIN_PASS unset (suspected S0) | DISMISSED-FIXED | `src/config/index.js:81-82` reads both vars for first-admin bootstrap; behavior documented at `src/config/index.js:104` and `src/models/index.js:220,242`. Spot-verified 2026-09-29: no silent override branch remains. |
| 2 | JWT_SECRET fallback to hardcoded string; Server v5.js plaintext passwords | DISMISSED-FIXED | `src/config/index.js:197-217`: JWT_SECRET is REQUIRED in every environment, min 16 chars, boot fails closed otherwise. `Server v5.js` no longer exists. Spot-verified 2026-09-29. |
| 3 | Login tokens missing `id` claim while routes read `req.user.id` | DISMISSED-FIXED | Both login branches sign `{ id: user.id, email, role, … }` (`src/routes/auth.js:124,158`); fix documented at `src/routes/auth.js:152`. Spot-verified 2026-09-29. |
| 4 | `/v3/royalties/calculate` unchecked, trusts client splits | DISMISSED-FIXED | SEC lane: 128-route authz matrix (`devteam/notes/security/authz-matrix.md`); endpoint now validates splits and requires auth. |
| 5 | AI answer cache keyed by prompt+artistId only | FIXED | Cache now keyed per user/role/access (AIX lane, 2026-09-29). |
| 6 | Duplicate routes (POST /v3/users ×3, PUT/DELETE ×2, POST /v3/ai/analyze ×2) | CONFIRMED | Catalog complete (BUG lane): POST /v3/users ×3, PUT ×2, DELETE ×2 in `users.js`; the `ai/analyze` double-registration claim was wrong (only 1 exists) — stale comment in `src/routes/index.js:9-13` flagged to DOC. Logged as MAP-001 (DELETE dup) + TASKS S4 cleanup. |
| 7 | Shell command from artist name (auto-print `exec`) | FIXED | Commit `8d1a6ac`: centralized filename sanitization + `execFile` with argument array (`src/jobs/monthlyReportJob.js:75-92`). Spot-verified: no `exec(` with shell string remains in `src/`. |
| 8 | Incomplete password reset (unhashed tokens, no consumer, hardcoded localhost link, 404 enumeration) | DISMISSED-FIXED | SEC lane verified current reset flow in `src/routes/auth.js` / `users.js` (`devteam/notes/flows/password-reset-sec.md`, `password-reset-bug.md`); residual availability nit logged as SEC-007 (S3). |
| 9 | CORS reflects any origin; unread env vars; `err.message` leaks | FIXED | Commit `d8a7b5f`. Residual `err.message` on two routes logged as SEC-003 (S3). |
| 10 | PM2 cluster ×N vs in-memory state, per-worker cron, `sync({alter:true})` on boot | OBSOLETE | PM2/cluster config and `mau5trap-production-api.js` are gone. Remaining single-instance in-memory state is logged as ARC-004 (S2). |
| 11 | Float money math; splits not validated | PARTIALLY CONFIRMED | Narrowed (MUS/DAT/BUG lanes): settlement money is exact (integer cents, round-half-up once per aggregate); float remains in labeled projections, display percentages, dead `SalesEntry.revenue` column, and mock roster revenue. The one live user-facing float surface is MUS-001 (S1). Schema residue tracked as DAT-001 (S3). |
| 12 | Broken start script (`server.js` missing); three diverging manifests; no test script | FIXED | (Phase 1/2 verification; `npm test` runs 361 tests.) |
| 13 | 18 `test_*`/`verify_*`/`check_*` scripts with no assertions | CONFIRMED-AS-DOCUMENTED | Legacy scripts are explicitly manual/non-assert (BUG lane); the missing manifest distinguishing them is TST-006 (S4). |
| 14 | Frontend: in-browser Babel, unpinned CDN, hardcoded localhost:3000, localStorage token, `innerHTML` | PARTIAL-STALE | Babel/CDN/`innerHTML` gone with the old HTML dashboards (spot-verified 2026-09-29: `innerHTML` appears only in `web/node_modules`). localStorage JWT CONFIRMED → SEC-006 (S4, trade-off accepted with mitigations). |
| 15 | Docs mojibake + stale references; README/QUICKSTART default credentials | CONFIRMED | Logged as DOC-005/006/007/008 (S2/S3). |
| 16 | Generated PDFs/JPEGs/CSVs + ~20 ad-hoc scripts committed at root | FIXED | (Phase 1 verification.) |
| 17 | Simulated features unlabeled; unofficial-project disclaimer README-only | CONFIRMED | Simulations de-mocked; disclaimer still missing from UI and generated PDFs → DOC-004 (S2). |

No lead was silently dropped: every CONFIRMED lead above has a corresponding entry in
`devteam/TASKS.md`; every dismissed lead cites the current-code evidence or the
repairing commit.
