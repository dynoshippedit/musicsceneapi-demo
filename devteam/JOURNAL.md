# JOURNAL (append-only — never edit past entries)

## 2026-09-29 02:05 UTC · Tech Lead (LEAD) · Phase 0
- Did: Boot. Read MASTER_PROMPT.md (1090 lines) in full via threadripper-ssh. Ran A1 recon:
  git status clean, branch master @ 89e222e, remotes demo (dynoshippedit/musicsceneapi-demo) +
  origin (bufirstrepo/mau5trap-repo, read-only). 418 tracked files: web/ 149, src/ 72,
  execution-validation/ 67, docs/ 65, tests/ 28. ~27k lines JS, 4.2k JSX, 15k MD.
- Found: none yet (Phase 0)
- Notes updated: repo devteam/PLAYBOOK.md (extracted verbatim via sed, 727 lines; B1/B3 filled
  from own recon; B17 changelog updated)
- Commands: recon via threadripper-ssh; playbook extract via sed on Threadripper
- Corrections to inherited notes: (1) canonical entry point is server.js -> production-api.js,
  NOT src/api.js (src/api.js does not exist — verified). Recorded as D-002. (2) Appendix P1's
  17 known leads are pre-scans of the OLD pre-refactor code — each verified against current code
  in notes/known-leads-verification.md; stale leads dismissed there (not as findings). D-001.
- Tool quirks: threadripper-scp needs dino@100.85.119.8: form (bare `dino:` fails at proxy name
  resolution; bare IP defaults to root, denied). /tmp/devteam on this VM belongs to the
  sibling Decentralflix tech-lead — this run stages at /tmp/ms-devteam and writes devteam/
  directly into /home/dino/mau5trap-repo on the Threadripper.
- Next: copy devteam/ to repo, AGENTS.md pointer, branch + commit + push; then Phase 1 specialists.

## 2026-09-29 02:10 UTC · Tech Lead (LEAD) · Phase 1
- Did: verified Cartographer deliverables on Threadripper: COVERAGE.md 431 data rows
  (H 68 / M 113 / L 250), MAP.md 299 lines (all 6 entry points verified by reading,
  Mermaid module map, 31-model data map, 50-var config summary, 9 proposed critical
  flows), findings/map.md 7 findings (MAP-001..007, all S4 info). git status shows
  changes only under devteam/. Spot checks passed — accepted.
- Found: MAP-001..007 (S4; merge into ISSUES at Phase 4). Notable: MAP-001 confirms P1
  lead #6 (duplicate routes) PARTIALLY current — duplicate DELETE /v3/users/:id still
  present in src/routes/users.js (self-documented dead code). MAP-004: anrRoom.js route
  registration asymmetry. SalesEntry.revenue FLOAT flagged for DAT/BUG lanes.
- Notes updated: STATUS.md (Phase 1 progress); PLAYBOOK.md B1 file count clarified
  (418 @ 89e222e + devteam/ workspace = 431 on this branch); B17 changelog.
- Commands: verification via threadripper-ssh (grep/wc/head on devteam files)
- Next: BLD/TST/DOC reports pending; then Phase 1 gate, commit, Phase 2 lanes.

## 2026-09-29 02:20 UTC · Tech Lead (LEAD) · Phase 1
- Did: verified TST deliverables: notes/testing.md (160 lines, inventory + flake analysis +
  crown-jewel map + Phase 5 test plan), findings/tst.md (10 findings TST-001..010).
  Independently reproduced the headline: my own back-to-back `npm test` runs gave
  357 pass/4 fail, then 361/361 pass — suite is load-flaky under parallel execution.
  TST-001 (S2) CONFIRMED by Lead with own evidence.
- Baseline correction: the "361/361 green" claim (reported to parent 2026-09-29 from a
  single green run) is not reliably true. B3 Test line amended: "361 tests, flaky under
  parallel load (observed 361/361, 357/4, 290/64f/7c)". This matters: no fix can be
  verified against an unreliable gate — stabilizing the harness is Phase 5 priority #1
  (after blockers).
- TST questions triaged: Q1 (concurrency cap / serial heavy lane) = PRE-APPROVED test
  harness work, default YES, no owner question. Q2 (GDPR export endpoint) = new API =
  NEEDS APPROVAL → QUESTIONS.md in Phase 4, default = document absence + test delete.
  Q3 (delete gitignored pulsegrid_v5.sqlite residue) = deletion → QUESTIONS.md Phase 4.
- Notes updated: STATUS.md; PLAYBOOK.md B3 test line amended + B17 changelog.
- Next: BLD/DOC reports pending; then Phase 1 gate.

## 2026-09-29 02:30 UTC · Tech Lead (LEAD) · Phase 1
- Did: verified DOC deliverables: notes/claims-audit.md (61-claim table:
  51 TRUE / 6 FALSE / 1 PARTIAL / 3 UNVERIFIABLE — README itself is accurate),
  findings/doc.md (11 findings DOC-001..011, all with path:line evidence).
  Spot checks passed — accepted.
- Notable: DOC-002 (whitepaper "no float in money path" vs float projections in
  src/services/salesService.js + src/analytics/regression.js) joins MAP's
  SalesEntry.revenue FLOAT note and P1 lead #11 (float money math) — all routed
  to DAT/BUG lanes in Phase 2/3. DOC-004 (no fan-project disclaimer in UI/PDFs)
  is user-visible → NEEDS-OWNER question in Phase 4. DOC's npm test run (356/5 fail)
  is further TST-001 evidence. DOC flagged a secret-shaped JWT_SECRET test value
  in scripts/run-browser-workflows.js → routed to SEC (not reproduced by DOC).
- P1 lead dispositions recorded: #14 partial-stale (Babel/CDN/innerHTML gone;
  localStorage token CONFIRMED → SEC), #15 confirmed (mojibake + stale refs),
  #17 confirmed (simulations de-mocked; disclaimers missing from product).
- Notes updated: STATUS.md.
- Next: BLD is the last Phase 1 lane; then the P1 gate.

## 2026-09-29 02:45 UTC · Tech Lead (LEAD) · Phase 1→2
- Did: verified BLD deliverables (BASELINE.md real outputs, env-inventory 73 vars,
  dependencies.md, findings/bld.md 12 findings with C12 headers). Ran PHASE 1 GATE:
  PASS — 431 files tiered, BASELINE real, crown jewels + 9 flows set.
- BLD root-caused the flaky suite: BLD-002 (duplicate fixed port 32193 in directsales +
  financials test files; sync SIGKILL without exit-wait lets a stale server squat the
  port, so the second file's tests run against the WRONG server/DB) explains the serial
  5-fails; BLD-003 (parallel contention: ~10 heavy server instances on 32 cores)
  explains the parallel blowups. Serial honest baseline: 356/361.
- P1 lead dispositions now: #7 fixed (8d1a6ac), #9 fixed (d8a7b5f), #10 obsolete,
  #12 fixed, #14 partial (localStorage token confirmed → SEC), #15 confirmed,
  #16 fixed, #17 confirmed. Remaining: #1,2,3,4,5,6,8,11,13 → assigned to Phase 2/3 lanes.
- Notes updated: STATUS.md (Phase 2).
- Next: 6 Phase 2 specialists dispatched (BUG, SEC, ARC, DAT, MUS, AIX).

## 2026-09-29 02:55 UTC · Tech Lead (LEAD) · Phase 2
- Did: verified AIX deliverables (findings/aix.md 8 findings C12 headers, notes/ai-integration.md).
  Spot-checked AIX-001..003 paths — accepted.
- INCIDENT: AIX's repro accidentally reached live Groq API twice (401 invalid_api_key, zero spend).
  Cause: Threadripper runtime env carries a GROQ_API_KEY that dotenv loads; AIX's `env -u`
  did not clear it. No completion generated, no spend, key value never read/recorded,
  no further live calls. Treating as a procedural lesson: repros touching AI clients must
  sanitize env first (added to DEV_NOTES as a lane-briefing rule for future agents).
- P1 lead #5 → FIXED (cache now keyed per user/role/access). Gap-6 fail-closed VERIFIED by AIX.
- Notes updated: STATUS.md.
- Next: BUG, SEC, ARC, DAT, MUS still running.

## 2026-09-29 03:00 UTC · Tech Lead (LEAD) · Phase 2
- Did: verified ARC deliverables: devteam/ARCHITECTURE.md (5 sections: as-is, B9.3 assessment,
  target structure, 14-step migration plan with needs-owner flags on steps 3,7-12, open design
  questions), findings/arc.md (10 findings: ARC-001..010 = 2×S2 + 7×S3 + 1×S4), plus
  notes/architecture-notes-2026-09-29.md. ARC appended 6 questions (Q-ARC-1..6, status OPEN)
  directly to devteam/QUESTIONS.md itself — acceptable deviation, recorded.
- Notable: ARC-002 (S2) money domains have no service layer — business logic + data access inline
  in route handlers. ARC-004 (S2) in-memory state assumes single instance. ARC-007 (S3)
  demo-vs-real separation is by convention, not construction — this is the gap-2
  remediation's weakest structural guarantee; BUG/DAT findings will sharpen it in Phase 3.
- Notes updated: STATUS.md.
- Next: BUG, SEC, DAT, MUS still running.

## 2026-09-29 03:05 UTC · Tech Lead (LEAD) · Phase 2
- Did: verified MUS deliverables (findings/mus.md 11 findings C12, notes/music-rights.md PII
  inventory). Independently read src/routes/finance.js:55-82 to confirm MUS-001: payout math is
  `totalRevenue * targetSplits.artist` float multiply with no cent rounding, and the split-sum
  check uses epsilon tolerance 0.000001. Accepted at S1 (live float-money surface; what-if
  calculator on mock revenue, not the settlement path).
- Key: settlement money is EXACT per MUS (BigInt cents / exact-decimal, round-half-up once per
  aggregate). Float exists in: projections (rounded, floored, labeled — acceptable), dead
  SalesEntry.revenue FLOAT (zero callers), and two live user-facing surfaces (MUS-001, MUS-004).
  DOC-002's whitepaper overreach stands. MUS-004 (mock revenue as $... in scheduled PDFs, no
  provenance label) is money-lens evidence for DOC-003/004. MUS-007 strengthens TST-003
  (delete is DB-row only; PII persists in AuditEvent/logs/PDFs).
- Notes updated: STATUS.md.
- Next: BUG, SEC, DAT still running.

## 2026-09-29 03:15 UTC · Tech Lead (LEAD) · Phase 2
- Did: verified DAT deliverables (findings/dat.md 16 findings C12, notes/data-model.md,
  notes/integrations.md 19 rows, notes/flows/2-dat.md, 3-dat.md, 6-dat.md). All spot-checked.
- Correction: MAP said 31 models; DAT counted 30 verified define calls (confirmed independently
  by grep: exactly 30 `sequelize.define` calls). Fixed MAP.md in both places, attribution noted.
- Notable DAT findings: DAT-002 (S2) migrations are ad-hoc SQLite-only repairs — Postgres
  upgrades silently skip schema evolution (DAT's Q2 recommends versioned migrations; the repo
  supports Postgres via DATABASE_URL, so this is real). DAT-003/004 (S2) non-atomic payout
  match/unmatch and direct-sales sync (stale payout rows on rerun). DAT-005 (S2) Stripe lists
  stop at first 100 records (no pagination). DAT-006 (S2) OAuth refresh tokens stored but never
  used. DAT-009 (S3) billing webhook lacks event-id idempotency. DAT-010 (S3) legacy NULL
  amountDecimal crashes reconciliation — escalates to S1 if any deployed DB has NULLs (Q1).
  P1 lead #11: CONFIRMED but narrowed — settlement exact; float only in projections (labeled),
  display percentages, dead SalesEntry.revenue, and mock roster revenue.
- SEC is writing its flow notes concurrently (ai-query, login, oauth, password-reset,
  royalty-csv — visible in notes/flows/); BUG still running.
- Notes updated: STATUS.md.
- Next: BUG + SEC reports; then Phase 2 gate.

## 2026-09-29 03:20 UTC · Tech Lead (LEAD) · Phase 2
- Did: verified SEC deliverables (findings/sec.md 10 findings C12, notes/security/threat-model.md,
  notes/security/authz-matrix.md 128 bound routes all tiered, 5 flow notes). All spot-checked.
- Big result: P1 leads #1 (admin-override when unset), #2 (fallback secrets), #3 (token id claim),
  #4 (royalty-calculate authz), #8 (password reset) ALL DISMISSED-fixed against current code.
  Six of the scariest auth leads are dead. Remaining P1 leads: #6 (duplicate routes — BUG's lane),
  #13 (scripts w/o assertions — largely TST's, BUG to confirm).
- Routed items resolved: secret-shaped JWT_SECRET in scripts/run-browser-workflows.js is a
  freshly-generated random 32-byte test value (sec.md:236) — not a leak. localStorage JWT →
  SEC-006 (S4, trade-off accepted with mitigations documented).
- Top SEC findings: SEC-001 (S2) CSV formula injection in financial export (attacker-influenced
  Stripe descriptions + atVenu venue names flow into exported CSV unneutralized). SEC-002 (S2)
  payment-matching rules visible to any authed user, no artist scoping.
- Notes updated: STATUS.md.
- Next: BUG only. Then Phase 2 gate.

## 2026-09-29 03:25 UTC · Tech Lead (LEAD) · Phase 2→3
- Did: verified BUG deliverables (findings/bug.md 8 findings C12, 5 flow notes). Independently
  read src/routes/monthlyclose.js:190-250 to confirm BUG-001: `await payout.save()` then
  `await deposit.save()` with no transaction; the DELETE guard requires both sides to agree
  (409 otherwise), so a half-write is API-unrepairable. Accepted at S1.
- P1 leads: #6 CONFIRMED (duplicate routes catalog complete: POST /v3/users x3, PUT x2,
  DELETE x2 in users.js; stale comment in src/routes/index.js:9-13 claims 5 duplicates incl.
  double POST /v3/ai/analyze — only 1 exists; flagged to DOC). #13 CONFIRMED-as-documented
  (no bug; legacy scripts are explicitly non-assert manual). #11 PARTIALLY CONFIRMED, no live bug.
  All 17 P1 leads are now dispositioned.
- Ran PHASE 2 GATE: PASS — all 9 critical flows traced with notes (BUG 5, SEC 5, DAT 3, MUS/AIX
  in findings), threat model + 128-route authz matrix done, ARCHITECTURE.md + data model +
  integrations + ai-integration notes all present.
- Next: Phase 3 deep review — 5 pattern sweep lanes (async/promise, injection/validation,
  money/finance, React frontend, jobs/sync) dispatched in parallel.
