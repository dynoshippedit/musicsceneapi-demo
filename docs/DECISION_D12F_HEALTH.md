# DECISION D12F — /health Body Change

**Status:** PENDING SIGN-OFF
**Decision number:** D12F
**Date:** 2026-09-17 · **Operator:** ________ · **Repo HEAD:** `7efb44b`
**Authority:** EXECUTION_GUIDE.md §10 (Step 12F, gated)

## Question

Make /health DB-aware and truthfully versioned (Step 12F)? Yes/No + sub-options.

Today: GET /health is a static literal — `{status:'operational', version:'3.0-production',
timestamp}` (src/routes/system.js:37-43). The version string is a hardcoded copy that
drifts from package.json (5.0.0) and the banner (v5.0). There is no DB reachability signal.

## What shipping flips (deliberate pin edits — ledger in EXECUTION_GUIDE.md)

- version literal pinned in FOUR places → '5.0.0': snapshot.test.js:165-170,
  verify_phase2.js:47-49, tests/snapshots/baseline.json:8, phase2_baseline.json:8.
- If the health case is byte-compared (check cases.js NONDETERMINISTIC at implementation
  time), the two baseline health BODIES must also gain any new key.

## Options

- [ ] A. Version source: __ read package.json at runtime (recommended — cannot drift)
      / __ keep a literal, bumped once.
- [ ] B. DB signal: __ add `database: 'ok'|'unreachable'` to the body (recommended —
      watchdog depends on it) / __ keep the body shape identical and report DB status
      only in logs.
- [ ] C. Status semantics: __ `status:'degraded'` when DB unreachable / __ keep
      `'operational'` and signal via `database` only.

## Signature

Operator: ______________________   Date: __________

Cross-reference after signing: REFACTOR_PROGRESS.md §Status: `| 12F | /health truth | SIGNED-OFF — D12F |`
