# DECISION D0 — Checkpoint Strategy

**Status:** APPROVED — Option A
**Decision number:** D0
**Date:** 2026-09-17 · **Operator:** Dino · **Repo HEAD at decision:** `7efb44b`
**Authority:** EXECUTION_GUIDE.md §0.1
**Checkpoint:** executed 2026-09-18 after the bounded pre-D0 integrity correction (B1/B2/B3/FE-01/FE-02). The first validation pass did not commit.

## Question

How do we land Steps 1–13 on top of the uncommitted Phase 4C+4CF tree?

The working tree carries the entire uncommitted 4C+4CF implementation (dozens of modified
+ untracked files). Every step recipe's rollback uses `git restore`, which is only safe if
4C+4CF is committed first.

## Options

- [x] A. Commit the current tree as one 4C+4CF checkpoint commit, then one commit per
      step afterwards (recommended — clean per-step rollback).
- [ ] B. Work in-place on the dirty tree (rollback = manual file restores; fragile).
- [ ] C. Other: ____________________________________________

## Signature

Operator: Dino   Date: 2026-09-17 (approval); 2026-09-18 (checkpoint after integrity correction)

Cross-reference after signing: REFACTOR_PROGRESS.md §Status: `| 0 | Checkpoint | D0: <A/B/C> |`
