# Execution results — D0 (blocked, then integrity-corrected)

First validation date: 2026-09-17 (EDT). Integrity correction: 2026-09-18.
Repository: `/home/dino/mau5trap-repo`.
Starting HEAD: `7efb44b4ac88f9a512a5370a3c76553dd5e21a72`.
D0 checkpoint commit: first pass **NONE**; second pass **Option A after B1/B2/B3/FE-01/FE-02 repair** (see §11).
Numbered execution steps implemented: **Step 1 complete** (see §12).

Sections 1–10 are the first-pass stop record and are retained. Do not treat their
"BLOCKED / FAILED" footer as current; §11 and the footer below it are current.

## 1. Decision and stop boundary

The operator explicitly approved D0 Option A: checkpoint the validated inherited 4C + 4CF/pre-execution tree before Step 1. That approval remains in force. It does not make a failing validation pass.

The inherited implementation and planning artifacts are present and belong to the described phases. The existing regression suite, operational verifier, build and live frontend gate all pass. However, focused checks of the user's required CRUD/error-handling invariants reproduce failures that those gates do not cover. In particular, failed database writes are acknowledged and audited as successful, concurrent acknowledged votes are lost, malformed input terminates the API, and the frontend can save an image draft to the wrong artist.

These findings materially contradict the inherited commercial-foundation completion claims. This triggers the requested stop condition: do not certify a validated checkpoint or build the next sequence on a source state that contradicts its prerequisites. No WIP/as-found commit was substituted for the approved validated checkpoint, and no unrelated repair phase was silently started.

This stop is **at D0**, not because D7 or D12F is pending. Those later decisions have not been reached. A narrow pre-D0 integrity correction is required before the existing guide can resume; the guide has not been replaced with a new plan.

## 2. Repository recovery and file coverage

Executed the requested `pwd`, `git rev-parse --show-toplevel`, `git status --short`, `git log -12 --oneline`, and `git diff --stat`, then repeated state discovery on resumption. Starting HEAD is the Phase 4B commit above. The dirty tree contains the inherited 4C, 4CF and planning work, not implementations of the next numbered sequence.

Read all six primary records completely, plus PHASE_4CF_COMMERCIAL_FOUNDATION, both commercial audits, PHASE_4C_HANDOFF, PHASE_4C_PREREQUISITE_VALIDATION, PHASE_4B_HANDOFF, BACKEND_ARCHITECTURE, API_INVENTORY, FRONTEND_API_MAP, SECURITY_AUDIT, both brand-portability audits, and PHASE_3_VALIDATION. Current source was used to resolve historical-document disagreements.

Three disjoint read-only reviewers inspected the inherited files:

- Backend runtime/configuration: 34 files.
- Frontend source, package/lock and environment templates: 73 files.
- Documentation, tests and validation artifacts: 37 primary files; four web-root files additionally cross-checked.

The parent programmatically verified the union against the current changed/untracked paths: **144 required, 144 unique reviewed, no missing or extra paths**. `execution-validation/d0-inherited-file-review.json` records the paths and pre-validation SHA-256 values. All 13 inherited Phase 4C PNG files are intentional handoff artifacts; the reviewer checked PNG structure, CRCs and decompression, not a new visual approval.

No candidate file was an operator `.env`, working database, dependency directory, build directory, log, WAL/journal, or temporary backup. No new real credential was identified. Published demo seed passwords and test-only credentials remain inherited, documented debt; they are not represented as production-safe secrets.

The inherited deterministic baseline diff was inspected in full: only the four additive `pageAccess` fields and `users_delete_nonexistent` changing from 200/success to 404/User not found. No baseline or snapshot was regenerated or edited during this run.

## 3. Parent-reproduced blocking failures

All writes below used disposable databases. Production source was unchanged.

| ID | Source | Actual result | Required result / smallest repair direction |
|---|---|---|---|
| B1 | `src/routes/finance.js:39-73`; `server.js:112-115` | Authenticated `POST /v3/royalties/calculate` with an existing artist and `revenueSources: {streaming: true}` causes an unhandled rejection. The request loses its connection, subsequent `/health` cannot connect, and the child exits with code 0 after logging the unhandled-rejection shutdown. | Validate the input and return controlled 4xx; keep the API alive. Cover the complete async handler, including awaited reads. Review the related newly asynchronous persistence boundaries without broad route redesign. |
| B2 | `src/repositories/artistRepository.js:257-311`; artist write handlers | A SQLite trigger on the disposable `Artists` table deliberately rejects UPDATE. Archive still returns `200 {success:true, message:'REZZ archived'}`. Image update returns 200 and echoes the requested URL. Immediate canonical reads and a full restart still show `tier:'flagship'` and no image. `artist.archive` and `artist.image` success audit rows are nevertheless written. | Propagate persistence failures/zero-row writes; do not update mirrors or emit success audits until persistence succeeds. This is retained lying-success behavior, not a successful durability implementation. |
| B3 | `src/routes/anr.js:143-183` | In each of four trials, two distinct authenticated users submit simultaneous up-votes. Both receive 200/success, but the stored submission contains only one vote. | Protect the entire read/modify/write with a SQLite-appropriate atomic/concurrency mechanism and bounded retry. Preserve up/down/toggle semantics; do not merge the two A&R stores. |
| FE-01 | `web/src/pages/DashboardPage/DashboardPage.jsx:100`; `web/src/api/endpoints.js:67-68`; `src/routes/analytics.js:94-102` | The real browser form sends `{artistId, amount, date}` and receives `400 {error:'Missing fields'}`. The backend requires `{artistId, month, revenue}`. Selecting a real artist does not fix it. | Restore the existing API contract in the form, with required artist/month and revenue. Do not invent label-wide sales or change the backend to accept a mistaken client payload. |
| FE-02 | `web/src/pages/ArtistDetailPage/ArtistDetailPage.jsx:35-61,94,249-265`; `useApiQuery.js:10-14` | Entering an image draft on ATTLAS, using the normal next-artist control to BlackGummy, then clicking APPLY retains and saves the ATTLAS draft on BlackGummy. A controlled browser 403 for the next artist leaves the BlackGummy heading and image editor visible under the next artist's URL, with no ACCESS DENIED. | Reset/key resource-local data and form state by artist ID; prevent stale-resource mutation and render the new resource's error. The 403 was deliberate browser fault injection, not a claim that backend authorization was bypassed. |

Durable copies of the actual probe output:

- `execution-validation/d0-backend-evidence.json` — four failed checks (B1/B2/B3 and the sales payload).
- `execution-validation/d0-frontend-evidence.json` — three failed browser checks (sales, carried image write, denied-resource state).

The backend and browser sales checks overlap; do not count them as separate defects. Probe exit codes were 1, as expected for the reproduced failures. No simulated passing output was substituted.

Session-local reproduction scripts remain at:

- `/tmp/mau5-d0-y1p___d4/tests/support/d0-integrity-probe.js`
- `/tmp/mau5-d0-y1p___d4/web/validation/d0-ui-integrity.mjs`

The first script owns its temporary database and listener and removes its database after use. The browser script was run only against the disposable backend on 3312 and the dedicated frontend on 5276; do not point it at an operator deployment. These scripts are diagnostic artifacts, not additions to the committed regression suite. The JSON evidence above is retained in the repository even if `/tmp` is later cleared.

## 4. Additional review disposition

The parent does not adopt every reviewer severity as a verdict.

- **Confirmed source-level parity defect, not needed to establish the runtime stop:** `NetworkGraph.jsx:38-74` creates edges by animated screen proximity and does not read collaborations; the legacy graph at HTML lines 348-369 derives edges from collaboration IDs and excludes archived artists. This is semantic data loss/fabrication, not a cosmetic design preference. No canvas runtime assertion was claimed.
- **Confirmed source-level exceptions to inherited claims:** omitted A&R vote direction is exempted from the whitelist; parser failures occur before request-ID middleware; the real AI-query context still reads `findMockById`; malformed `pageAccess` test accepts 200 or 400 rather than proving exact rejection. These need explicit disposition in the correction pass, not an unqualified claim of closure.
- **Inherited policy/debt, not newly authorized product changes:** sales/projection artist-access policy, fail-open JWT revalidation during database failure, id-less administrator override sessions, navigation-only pageAccess, published seeds, demo integrations, ephemeral room workspace, synthetic data, lack of quotas, migrations and backups. Do not silently redesign these while repairing the reproduced defects.
- **Other frontend/gate findings remain review inputs:** omitted entity-audit outputs and submission links, hidden campaign errors, calendar-date conversion, mock integration disclosure, weak content assertions in some gate boxes, broad absent-provider error classification, and diagnostic-script output/exit behavior. These are not represented here as independently runtime-proven blockers. The three original review reports are `/tmp/mau5-d0-{backend,frontend,evidence}.json`.

No fix was implemented for any of these findings during the **first** stopped
execution pass. The five runtime blockers were repaired in the 2026-09-18
correction (`7336323`). Remaining §4 items are queued in `WORK_TREE.md` §3 —
disposition, not an automatic rewrite.

## 5. Guide/source discrepancies to resolve without discarding the guide

The original recipes remain historical guidance. The execution addendum in EXECUTION_GUIDE.md records these source-correct qualifications:

1. Step 2 must pass an absolute URL to `verify_phase2.js`, not a bare port. Its `BASE` is argv[2] verbatim. Keep the existing verifier assertions unchanged at that step.
2. Step 1 PM2 verification needs an isolated namespace, process identity, disposable database and unused port. The literal recipe against the normal PM2 name and port could touch an operator deployment.
3. A hermetic verifier must force SQLite/reference profile and isolate `.env`, database URL, mail/provider credentials and working directory. `DB_STORAGE` alone does not isolate the PostgreSQL branch.
4. Step 5 may not delete/rebuild the operator database. The NOT NULL hazard is real, but seed regeneration cannot recover customer rows/audit/sales. A data-preserving nullable-add/backfill/constraint transition must first pass fresh/upgrade tests on disposable copies. No migration was run here.
5. Step 6b's new User.integrations column must be excluded from the public users-list projection to avoid an unrelated baseline change. Its id-less override behavior is not contract-neutral if it stops retaining the existing ephemeral connection state. Returning mock success after a rejected persisted connect also conflicts with the user's no-fake-success requirement.
6. Step 6e must keep `/sync/masterLoop.js` dormant. Scheduling it alone would not make current projections Stats-backed: the projection handler reads SalesEntry or synthetic history, not Stats.
7. `tests/snapshots/baseline.json` is historical Phase-1 evidence, not a file read by the current regression suite. The D7/D12F ledger must distinguish historical literals from executable pins. Preserve the four documented health-literal locations for review; do not silently rewrite historical evidence. D7/D12F remain unsigned.
8. Route additions must be relative to the immediately preceding validated checkpoint. No route-count change was made here. Preserve the fifth seed stamp, unnamed reset pins, static-serving pin invisibility and Step 6b/9 owningUserId dependency.

These are corrections to future execution mechanics, not implementation or product sign-offs.

## 6. Validation actually executed

| Check | Actual result |
|---|---|
| Backend `npm test` on a byte-verified copy of the complete inherited working tree | **141 pass, 0 fail, 32 suites**; includes the 91-case snapshot probe and restart-durability test |
| `npm run verify -- http://127.0.0.1:3310` on disposable clean-seed state | **54 passed, 0 failed** |
| Frontend production build | **PASS**; Vite 6.4.3, 146 modules; JS 618.18 kB / gzip 200.00 kB; >500 kB warning retained |
| Static portability gate | **9 pass, 0 fail** |
| Static gate self-tests | **23 pass, 0 fail** |
| Full live frontend gate, current frontend and disposable backend | **70 pass, 0 fail**; includes human auth/session checks and Example Records display portability |
| Targeted backend integrity probe | **FAIL**, all four checks reproduce defects; see evidence JSON |
| Targeted browser integrity probe | **FAIL**, all three checks reproduce defects; see evidence JSON |
| Fresh SQLite boot | **PASS** under the existing inherited schema and default profile; no claim about the future Step 5 schema |
| Existing-schema ownership upgrade | **NOT RUN** — Step 5 not reached; operator DB never migrated |
| Restart durability | Existing happy-path regression PASS; failed-write acknowledgement/read-back/restart invariant FAIL (B2) |
| Legacy HTML integrity | Both live legacy HTML files SHA-256-identical to HEAD; neither edited |
| `git diff --check` | PASS at validation |
| Backend `npm audit --json` | Exit **1**: **23 affected packages — 2 low, 6 moderate, 14 high, 1 critical** |
| Frontend `npm audit --json` | Exit **1**: **2 moderate**, react-router/react-router-dom |

The audit is **not clean**. The backend audit includes direct affected dependencies (axios, express, mathjs, nodemailer, sequelize, sqlite3); the inherited claim that all advisories are transitive is inaccurate. No `npm audit fix`, upgrade or suppression was applied.

The old verifier is still non-idempotent: it creates an artist and does not delete it. Its passing run used disposable clean-seed state, not an operator DB or a second run on polluted state. `verify:hermetic` has not yet been implemented.

The first browser-gate attempt failed because the disposable copy symlinked web/node_modules outside Vite's filesystem allowlist: the actual 403s were Remixicon font requests, not API regressions. A second attempt collided with a still-terminating validation Vite process and failed with connection refusals. Both were diagnosed without changing app code, assertions or expected errors. The final passing run used a new direct Vite process on 5275 from the current frontend tree, a disposable backend on 3310 and an external screenshot directory. The successful gate therefore does not hide either failed attempt, nor the separate integrity failures.

Full session logs: `/tmp/mau5-execution-state/d0-npm-test.log`, `d0-gate.log`, `d0-gate-corrected.log`, `d0-backend-audit.json`. The corrected gate log is the 70/70 run.

## 7. Database, source and process safety

The existing snapshot harness renames/unlinks ROOT/cwd `mau5trap_v5.sqlite`; simply setting DB_STORAGE would not protect the operator checkout. Therefore it ran in `/tmp/mau5-d0-y1p___d4`, a copy of the entire tracked plus untracked working tree, with every copied file hash checked. No operator `.env`, DB, logs or build products were copied. Runtime environments excluded real credentials and disabled real integrations, mail configuration, printing and jobs.

Operator DB at discovery:

- `mau5trap_v5.sqlite`: 184320 bytes.
- mtime_ns: `1789669747955597618`.
- SHA-256: `46afbd4aca031b6684e2547fde01171c3c33faef27bd00c75af1151f4df98a2f`.

Size, mtime and hash were repeatedly compared and unchanged. No reset, clean, stash, checkout-over-work, schema experiment, or cleanup of operator data was performed. Validation-created backend/Vite processes were stopped by their tool handles; the pre-existing operator Vite process was not intentionally managed. No normal PM2 namespace was touched.

The app source, frontend source, dependency manifests/locks, regression tests, snapshots and inherited screenshots were not edited in this pass. Only the execution records and the evidence JSON files were added/updated. No schema, API, security or pin change was implemented.

## 8. Per-step result and deferred work

| Step | Result |
|---|---|
| D0 | Option A approved; **validation blocked**, checkpoint not created |
| 1 — deployment truth | NOT STARTED |
| 2 — hermetic verify | NOT STARTED |
| 3 — error contract | NOT STARTED |
| 4 — pagination | NOT STARTED |
| 5 — ownership consistency | NOT STARTED |
| 6a — campaign persistence/read-back | NOT STARTED |
| 6b — integration persistence | NOT STARTED |
| 6c — ephemeral A&R decision documentation | NOT STARTED |
| 6d — old apiCache removal | NOT STARTED |
| 6e — dormant jobs documentation | NOT STARTED |
| 7 — password reset | NOT REACHED; D7 still PENDING SIGN-OFF |
| 8 — password policy/quota seams | NOT STARTED |
| 9 — API keys | NOT STARTED |
| 10 — OpenAPI/versioning | NOT STARTED |
| 11 — router/chart/player debt | NOT STARTED |
| 12A–G — ops/health | NOT STARTED; D12F still PENDING SIGN-OFF |
| 13 — Postgres/migrations/licensing | PILOT-GATED; no build authorized, unchanged |

## 9. Product acceptance assessment

1. Trustworthy system of record for customer writes: **NO**, B2/B3 and FE-02 disprove an unqualified claim.
2. CRUD/persistence agreement: **FAIL** on acknowledged failed writes and concurrent votes. Existing happy-path CRUD/session tests pass but are insufficient.
3. Dedicated label ownership: active profile plus dedicated DB selection exists. Required new-table stamps and this sequence's persistence changes are not implemented; full requested acceptance is not met. This is not a demonstrated cross-label leak.
4. Second dedicated label: profile-driven seams and mau5trap intelligence preservation are present; no new end-to-end backend second-label deployment was certified. Example Records passed the frontend display gate only.
5. Human vs machine authentication: current JWT path was tested; API keys are absent, not a completed machine-auth foundation.
6. Password reset: NOT REACHED. The dead redeem flow and pending D7 decision remain.
7. Health: NOT REACHED. Existing literal liveness/version body remains; operational truth was not implemented or certified.
8. New mau5trap hardcoding: none introduced; runtime source unchanged.
9. Premature enterprise architecture: none introduced; no tenancy/billing/enterprise IAM work started.
10. Ready for ordinary next product phase: **NO**.

## 10. Required next boundary

Recommended next work is a **bounded pre-D0 4C/4CF integrity correction**, not ordinary Phase 4D and not a replacement of the 13-step guide. Resolve B1/B2/B3/FE-01/FE-02 with failure-first regression coverage; explicitly disposition the source-confirmed graph parity defect and the remaining review inputs. The repair must preserve the default intelligence, dedicated-label architecture, existing happy-path contracts and historical baseline provenance. Any unrelated product policy remains a decision, not an automatic fix.

The narrow authorization/scope choice is whether to perform those prerequisite repairs before retrying the approved validated checkpoint. Do not silently substitute a WIP checkpoint or change the meaning of “validated.” After the correction is validated, execute D0 Option A, require a clean tree, and resume **Step 1 of the existing EXECUTION_GUIDE.md**. D7 and D12F still require their own decisions at their boundaries. No next phase was started.

## 11. Pre-D0 integrity correction (2026-09-18)

Hermes interrupted during interpretation of the disposable probes. Recovery
reconfirmed operator DB unchanged (`mau5trap_v5.sqlite` size 184320, mtime_ns
`1789669747955597618`, sha256 `46afbd4aca031b6684e2547fde01171c3c33faef27bd00c75af1151f4df98a2f`)
and classified the probe failures without restarting D0 discovery.

| ID | Class | Repair |
|---|---|---|
| B1 | Real current-tree defect | Validate `revenueSources` as a string array; wrap the royalties handler. Object payload now 400; `/health` stays 200; no unhandledRejection shutdown. |
| B2 | Real current-tree defect | Persist archive/restore/image first; return 5xx and skip success audits when SQLite rejects the write; do not mutate the memory mirror. |
| B3 | Real current-tree defect | IMMEDIATE SQLite transaction + bounded SQLITE_BUSY retry around the vote read/modify/write. Four concurrent two-user trials stored `votes=2`. |
| FE-01 | Real frontend defect; backend-probe assertion that old keys must 2xx was a probe defect against the existing API contract | Dashboard form now posts `{artistId, month, revenue}`. Stale `{amount, date}` remains 400. |
| FE-02 | Real current-tree defect | Artist detail keyed by `artist.id`; stale image drafts are not applied to the next artist; injected 403 renders ACCESS DENIED without the previous image control. |
| NetworkGraph collaboration edges | Source-level parity defect, not a D0 runtime blocker | Documented debt. Not changed. |
| D7 / D12F | Unauthorized | Untouched. |

Post-repair disposable evidence:

- `npm test` **142 pass / 0 fail / 32 suites** ( +1 integrity test )
- `verify_phase2.js http://127.0.0.1:3312` **54 passed / 0 failed**
- static portability **9/9**, `--self-test` **23/23**
- live gate **70 pass / 0 fail**
- `d0-integrity-probe.js` **FE-01/B1/B2/B3 pass** (`/tmp/mau5-execution-state/d0-integrity-evidence-postfix.json`)
- `d0-ui-integrity.mjs` **FE-01-browser / FE-02-image / FE-02-denial pass**

Operator Vite on :5173 was not managed. Disposable :3312/:5276 were stopped after validation.

D0 Option A checkpoint proceeds on this corrected tree.

## Final status

EXECUTION SEQUENCE STATUS: IN PROGRESS — D0 + Steps 1–3 complete; Step 4 next

D0 CHECKPOINT: `7336323` (Option A after integrity correction)

CRUD / DATA INTEGRITY: PASS on the reproduced B1/B2/B3/FE-01/FE-02 failures

CUSTOMER/LABEL OWNERSHIP: UNCHANGED (Step 5 not reached)

API PRODUCT FOUNDATION: PARTIAL (sequence not started)

PASSWORD RESET: NOT REACHED; D7 still PENDING SIGN-OFF

HEALTH CONTRACT: NOT REACHED; D12F still PENDING SIGN-OFF

DEDICATED-LABEL COMMERCIAL PATH: inherited seams present; Step 5 not started

READY FOR NEXT PRODUCT PHASE: YES — Steps 1–3 complete; Step 4 is next

## 12. Step 1 — Deployment truth (2026-09-18)

- `ecosystem.config.js`: `script:'./server.js'`, `exec_mode:'fork'`, `instances:1`, `restart_delay:3000`, `max_memory_restart:'1G'`.
- README / QUICKSTART / PRODUCTION_DEPLOYMENT / package-production.json now name `server.js`.
- Isolated PM2 (`PM2_HOME=/tmp/mau5-step1-pm2`, PORT 3992, scratch SQLite): online, fork_mode, health 200, then `pm2 delete` + `pm2 kill` on that home only.
- Default `~/.pm2` process list stayed `[]`. Operator DB hash/mtime unchanged.
- `npm test` 142/142 after the step. No pins flipped.

## 13. Step 2 — Hermetic verify (2026-09-18)

- New `scripts/run-verify-hermetic.js` + `"verify:hermetic"` script.
- Spawns `server.js` on port 3971, isolated cwd, throwaway SQLite, `DB_DIALECT=sqlite`,
  empty `DATABASE_URL`, ephemeral JWT, jobs/mail/providers off.
- Refuses an occupied 3971 (no probing a foreign listener). Waits for **this** child's
  `Server: http://localhost:3971` banner, then `/health` 200.
- Invokes `tests/support/verify_phase2.js http://127.0.0.1:3971` unchanged.
- `npm run verify:hermetic` **54/54** twice, then a third time while a disposable API
  occupied `:3000` (copy of operator DB, original file never opened). Operator
  `mau5trap_v5.sqlite` size/mtime/sha256 unchanged.
- `npm test` 142/142 after the step. `verify_phase2.js` not edited. No pins flipped.

## 14. Step 3 — Error contract (2026-09-18)

- Malformed JSON (`entity.parse.failed`) → 400 `{ error: 'Malformed JSON body' }`.
- Five `'Internal error'` sites → `'Internal server error'` (unpinned).
- `API_INVENTORY.md` documents `{error}` / `{error,details}` / `{error,path}` plus `{error,id}` outlier.
- Additive snapshot test in `snapshot.test.js` (not a cases.js entry — caseCount stays 91).
- `npm test` **143/143**; `npm run verify:hermetic` **54/54**. Operator DB hash unchanged. No pin flips.
