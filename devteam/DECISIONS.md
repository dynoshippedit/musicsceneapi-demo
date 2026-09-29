# DECISIONS

### D-001 · P1's 17 known leads are stale; verify each, dismiss stale ones outside the ledger — 2026-09-29 · Tech Lead (LEAD)
- Context: Appendix P1 lists 17 "known leads" pre-scanned 2026-09-29 against the OLD pre-refactor
  codebase (mau5trap-production-api.js ~3.2k lines, Server v5.js, single-file HTML frontends).
  The repo was heavily refactored on 2026-09-28 (server.js + production-api.js + src/*,
  React/Vite frontend, 361 tests green). Owner instruction: verify each lead against CURRENT code;
  where fixed/obsolete, dismiss with a note citing the fix; do not log stale leads as findings.
- Options considered: A) pre-enter all 17 as ledger entries (noisy, misleading); B) verify each
  during review, record dispositions in devteam/notes/known-leads-verification.md, promote only
  confirmed-current problems to the ledger with fresh evidence.
- Decision & why: B. The ledger must contain only problems in the code as it is. Stale leads are
  dismissed in the verification note with the fix commit cited (e.g. lead 7 command injection →
  fixed in 8d1a6ac).
- Consequences: known-leads-verification.md must disposition all 17 before the Phase 4 gate.

### D-002 · Canonical entry point is server.js, not src/api.js — 2026-09-29 · Tech Lead (LEAD)
- Context: inherited note said "Current entry point is src/api.js". Recon: src/api.js does not
  exist. server.js header declares itself the canonical entrypoint (secret guard → DB init →
  listen) and requires ./production-api (Express app module). package.json main/start = server.js.
- Decision & why: B3 records server.js → production-api.js → src/routes/*.js. Correct the record;
  do not trust inherited corrections without verifying.
- Consequences: flow tracing starts at server.js.

### D-003 · Workspace staging: /tmp/ms-devteam (not /tmp/devteam) — 2026-09-29 · Tech Lead (LEAD)
- Context: /tmp/devteam on the shared agent VM belongs to the sibling Decentralflix tech-lead
  (same branch name, different repo). Writing there would clobber its workspace.
- Decision & why: this run stages at /tmp/ms-devteam and writes devteam/ directly into
  /home/dino/mau5trap-repo on the Threadripper. Child agents are told the same.
- Consequences: no local /tmp/devteam writes, ever, from this run.
