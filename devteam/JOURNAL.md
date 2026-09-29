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
