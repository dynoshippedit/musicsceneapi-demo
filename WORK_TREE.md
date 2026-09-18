# Work tree — current vs Astra findings

**Date:** 2026-09-18 · **HEAD:** Step 2 on `4b00c8c` / D0 `7336323` · **Operator DB:** do not touch
**Authority:** this file maps the operator work tree onto the repo. Execution recipes stay in `EXECUTION_GUIDE.md`. Evidence of the Astra stop/repair is in `EXECUTION_RESULTS.md`.

ChatGPT's recap described the **Astra stop** (D0 blocked). That stop is closed. Do not restart D0 discovery, do not re-audit the 144-file tree, do not re-run the five failing probes as if they were still open.

---

## 1. Operator work tree (status against this repo)

```
mau5trap / Music Label Intelligence Platform
│
├── COMPLETE
│   ├── Phase 1 — canonical entrypoint/config
│   ├── Phase 2 — backend decomposition
│   ├── Phase 3 — security/API hardening
│   ├── Phase 4A — frontend architecture
│   ├── Phase 4B — React/Vite reference slice
│   ├── Phase 4C — bulk frontend migration          committed in 7336323
│   ├── Phase 4CF — commercial foundation           committed in 7336323
│   └── commercial-readiness audits                 committed in 7336323
│
├── CURRENT — Commercial/API foundation execution   EXECUTION_GUIDE.md Steps 1–13
│   ├── Step 1  deployment truth / PM2 fork         COMPLETE  4b00c8c
│   ├── Step 2  hermetic verify                     COMPLETE  (npm run verify:hermetic)
│   ├── Step 3  malformed-JSON error contract       COMPLETE  d6b692d (review GO in EXECUTION_RESULTS §14)
│   ├── Step 4  pagination (users, A&R submissions)
│   ├── Step 5  labelSlug on AnrSubmission/SalesEntry   (no operator-DB rebuild)
│   ├── Step 6  campaign/integration persistence, A&R/cache/jobs docs
│   ├── Step 7  password reset                      BLOCKED on D7 sign-off
│   ├── Step 8  password policy / quota seams
│   ├── Step 9  API keys / service-account groundwork
│   ├── Step 10 OpenAPI / versioning
│   ├── Step 11 frontend debt (RR7, RevenueBarChart, UniversalPlayer)
│   ├── Step 12 ops/health                          12F BLOCKED on D12F sign-off
│   └── Step 13 Postgres/migrations/licensing       PILOT-GATED — no build
│
├── Astra remaining (not a new phase)               §3 below
│
├── NEXT — Phase 4D                                 NOT STARTED — after Steps 1–12 unless operator re-scopes
│   ├── cross-feature integration
│   ├── remaining frontend/backend contract cleanup
│   ├── feature interaction testing
│   ├── admin/permissions integration
│   ├── AI/integration surface completion
│   ├── reporting/export integration
│   └── close remaining parity gaps (incl. NetworkGraph if still open)
│
├── Phase 5 — E2E / parity / cleanup                NOT STARTED
├── Phase 6 — production/deployment                 partial overlap with Steps 1, 2, 12, 13
├── Commercial pilot readiness                      partial overlap with 4CF + Steps 5–13
└── LATER — only if customers justify it            do not start
```

---

## 2. Astra five blockers — CLOSED

Reproduced on disposable SQLite only. Operator `mau5trap_v5.sqlite` never migrated. Regression coverage: `tests/regression/integrity.test.js`.

| ID | Defect | Repair | Evidence |
|---|---|---|---|
| B1 | Malformed `revenueSources` killed the API | 400 + handler try/catch; process stays up | integrity test + postfix probe |
| B2 | Failed artist UPDATE still 200 + success audits | persist-first; 5xx; no audit on failure | integrity test + postfix probe |
| B3 | Concurrent A&R votes lost | IMMEDIATE txn + SQLITE_BUSY retry | integrity test + postfix probe |
| FE-01 | Log Sale sent `{amount,date}` | form posts `{artistId,month,revenue}` | UI probe 200 |
| FE-02 | Stale artist image draft / 403 still showed previous artist | detail keyed by `artist.id` | UI probe ACCESS DENIED |

Post-repair gates (disposable): `npm test` 142/0/32 · verify 54/0 · live gate 70/0.

The original backend probe assertion “old sale keys must 2xx” was a **probe defect**. The API contract remains `{artistId, month, revenue}`; stale keys stay 400.

---

## 3. Remaining Astra items — working queue

These were **not** D0 blockers. Do not silently turn them into a product rewrite. Each row is a disposition, not an automatic fix.

### 3a. Integrity / parity — do before Phase 4D, may interleave with Steps 2–4

| ID | Finding | Disposition | Notes |
|---|---|---|---|
| A-GRAPH | `NetworkGraph.jsx` invents edges from screen proximity; legacy used collaboration IDs and excluded archived artists | **OPEN — real semantic defect** | Not Step 11 (11A is RevenueBarChart). Smallest fix: derive edges from `artist.collaborations`, drop archived. Failure-first test if a deterministic assertion exists; otherwise a unit of the edge builder. |
| A-PAGEACCESS | malformed `pageAccess` test accepts 200 or 400 | **OPEN** | Pick one contract, pin it, match the handler. Do not leave the ambiguous assertion. |
| A-MOCKID | AI query context still `findMockById` | **OPEN** | Canonical read is `artistRepo.findById`. Happy-path snapshots may pin mock order — check before flipping. |
| A-REQID | parser failures can occur before request-id middleware | **OPEN** | Traceability. Likely adjacent to Step 3 (malformed JSON) / 12E. |
| A-VOTEDIR | omitted A&R vote `direction` has a permissive whitelist exception | **OPEN** | Confirm current `anr.js` vote handler; pin exact omitted-direction behavior. |

### 3b. Review inputs — not independently runtime-proven; disposition, don’t expand

| ID | Finding | Disposition |
|---|---|---|
| A-AUDITUI | omitted entity-audit outputs / submission links in migration | 4D / parity |
| A-CAMPERR | hidden campaign errors | likely Step 6a surface |
| A-DATE | calendar/date conversion | review input |
| A-MOCKDISC | mock integration data not always disclosed | review input |
| A-GATEWEAK | some gate boxes too weak to prove the named contract | strengthen only when touching that box |
| A-PROVERR | provider errors classified too broadly | review input |

### 3c. Inherited policy / debt — DO NOT silently redesign

sales/projection artist-access policy · fail-open JWT during DB outage · id-less ADMIN override · navigation-only pageAccess · published seed passwords · demo integrations · ephemeral A&R room workspace · synthetic projections · no quotas · `sync({alter:true})` · no backups.

These stay debt until a named step or a new operator decision.

---

## 4. What this tree is not

- **Not** a restart of D0 file review.
- **Not** authorization for D7 or D12F.
- **Not** authorization for Phase 4D, 5, 6, pilot, or LATER enterprise items.
- **Not** a replacement of `EXECUTION_GUIDE.md`. Guide §14 already records the recipe corrections Astra found (absolute verify URL, isolated PM2, hermetic dialect, no operator-DB wipe, etc.).

---

## 5. Recommended next move

1. **Next:** Step 4 — opt-in pagination on GET /v3/users and GET /v3/anr/submissions.
2. Then Step 5 (data-preserving) → 6… Stop at D7 until signed.
3. Remaining Astra integrity (A-GRAPH, A-PAGEACCESS) can interleave; it is not a new phase.

Green baseline now: `npm test` 143/143/32, snapshot 91-case, `npm run verify:hermetic` 54/54, gate 70 for frontend steps.
