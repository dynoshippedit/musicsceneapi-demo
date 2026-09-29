# LESSONS — durable engineering lessons (music-scene review)

## L-001 · 2026-09-29 (ms-cycle-01): byte-compare before exact-match patching
Terminal display layers lie about file bytes: a `sed`/`grep` printout showed
`{ error: "Deposit is already matched" }` (double quotes) while the file actually
held single quotes, and an em-dash looked identical to its escape. Two patch
attempts failed with `count=0` assertions before the mismatch was found by
programmatic comparison (`repr()` per line, longest-common-prefix diff).
Rule: never assert an exact string replacement against eyeballed output — compare
bytes programmatically first.

## L-002 · 2026-09-29 (ms-cycle-01): deterministic rollback tests via fault injection
Atomicity can be proved without flaky concurrency races: create a SQLite trigger
on a second connection that makes one side's UPDATE fail (RAISE(ABORT)), run the
API call, assert the other side rolled back. Always remove the injected fault in a
`finally` block — on the old (broken) tree the rollback assertion failed before
cleanup ran, and the leftover trigger poisoned the following tests.

## L-003 · 2026-09-29 (ms-cycle-01): prove the regression test captures the defect
`git stash` the source fix (keep the tests), run the suite: the new tests must
FAIL on the old tree and PASS on the fixed tree. A test that passes on both proves
nothing about the defect.

## L-004 · 2026-09-29 (ms-cycle-01): transaction error translation pattern (Sequelize)
Inside `sequelize.transaction(async (t) => ...)`: throw expected rejections as
`Error` with a `statusCode` property; translate to HTTP responses in the outer
catch (`if (err && err.statusCode) ...`). Keep response JSON shapes identical so
the fix is a pure integrity repair with no contract change. Fire audit events
after the transaction commits, never inside it.
