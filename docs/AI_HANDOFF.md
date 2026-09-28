# HANDOFF FOR THE NEXT AGENT

**Repair update, 2026-09-18:** The user authorized repairs after the review. Read [REPAIR_RESULTS_2026-09-18.md](REPAIR_RESULTS_2026-09-18.md) for the current state. Sales schema, access/cache checks, AI errors, persistent Room/campaigns, forecasts, graph/map, form refresh and session verification have been repaired. The operator database was backed up and migrated with all original rows preserved; API 3000/UI 5173 are running the repaired code. Gates: 150 backend tests, 54 API checks, 9 brand checks, 8 browser workflows passed. External OAuth/contracts remain explicitly unavailable; other feature gaps are listed in the repair report. **The ledger and “no repairs” statements below describe the earlier audit, not current status.**


**Review update, 2026-09-18:** Read [APPLICATION_REVIEW_2026-09-18.md](APPLICATION_REVIEW_2026-09-18.md) before using the priorities below. No product repairs have landed. New verified priorities are **RV-001** (startup schema alteration makes sales artist/month individually unique; the operator DB already has the broken constraints), **RV-002** (AI cache checked before artist authorization), and **RV-003** (additional APIs disclose other artists' data). **AI-004 is retracted:** the late transport rejection after `Promise.race` timeout was handled and did not kill the process. Evidence and screenshots are in `execution-validation/review-2026-09-18/`. Existing 143 backend tests pass in an isolated copy despite these defects. The operator DB hash below remains unchanged.

**Read this first.** Then `ERROR_LEDGER.md`, `FULL_SYSTEM_FORENSIC_AUDIT.md`, `API_CONNECTION_MATRIX.md`.

The previous operator ran out of usage after a **forensic audit**, not a repair. They want the next model to **own the repair pass** against the ledger, not restart discovery.

Date of this note: 2026-09-18.

---

## Do not

- Do **not** restart D0 discovery, Steps 1–13, Phase 4D, or another full-tree “is it perfect” audit as if the ledger does not exist.
- Do **not** treat `npm test` 143/143 or `verify:hermetic` 54/54 as “the product works.”
- Do **not** treat Phase 4C / 4CF / EXECUTION_GUIDE completion claims as certified.
- Do **not** mutate operator DB `pulsegrid_v5.sqlite` (see hash below). Probes use throwaway SQLite + isolated ports.
- Do **not** regenerate snapshots merely because they fail; if a pin was a **lie**, change product first, then recapture with evidence.
- Do **not** weaken assertions (`200 || 400`).
- Do **not** “fix” A&R split-brain by deleting a store without an explicit product decision — Room vs Scouting are two different APIs on purpose in legacy, but Room **Submit** writing the other store is a defect (`API-003`).
- Do **not** print `.env` secrets.

---

## Repo state when the operator left

| | |
|---|---|
| Path | `/home/dino/pulsegrid-repo` |
| HEAD | `9101746` — *Close crash, vote-corruption, and stale-UI bugs from the full-tree re-read* |
| Branch | `master` **ahead of origin by 11**. Not pushed. |
| Dirty | **Untracked (must keep):** `AI_HANDOFF.md`, `ERROR_LEDGER.md`, `FULL_SYSTEM_FORENSIC_AUDIT.md`, `API_CONNECTION_MATRIX.md`, `execution-validation/forensic-2026-09-18/` |
| Operator API | `http://localhost:3000` — `node server.js` from repo root (gitignored `.env` `JWT_SECRET`). Confirm with `curl -sS http://127.0.0.1:3000/health`. If down: `cd /home/dino/pulsegrid-repo && node server.js`. |
| Operator UI | `http://127.0.0.1:5173` → `VITE_API_BASE_URL=http://localhost:3000`. Confirm `ss -ltn \| grep 5173`. |
| Login | `admin@pulsegrid.fm` / `admin123` · `tours@novakin.band` / `novakin123` |

Operator DB (do not write in tests):

```
pulsegrid_v5.sqlite
size     196608
sha256   a71f9ec104d5bbcf66a471dbd03a1dac477403aac86aa2cf592c9f5a93aa919a
```

**Note:** this hash is **not** the older freeze `46afbd4aca…` / 184320. A “make it run” boot used the default sqlite path and grew the file **before** the forensic pass. Forensic probes used `/tmp/legacy-forensic.sqlite` and did not change the operator file. Treat **current** hash as the new do-not-touch baseline unless the operator says otherwise.

`.env` exists, gitignored, contains a generated `JWT_SECRET` (required to boot). `npm start` without it exits 1.

---

## What is already true at HEAD `9101746`

These Astra/full-tree items were **independently re-verified as fixed**. Do not re-implement them:

- Sales body is `{artistId, month, revenue}`; `$0` allowed; old `{amount,date}` → 400; process stays up on bad month type.
- A&R vote **requires** `direction` `up`|`down`; omitted `{}` → 400 and does not `++votes`. Concurrent two-user votes persist on **SQLite**.
- `pageAccess` object PUT → **400**, grant unchanged (no more `200||400`).
- Request id **before** `express.json()`; malformed JSON 400 + `X-Request-Id`.
- `useApiQuery` clears data on query change and error (FE-02 artist-body leak closed).
- NetworkGraph edges are **collaboration** `linked()`, not screen proximity.
- Artist create `findByPk` inside try; A&R list/shortlist/counts caught; generate-all rejects non-string month.
- AI `query()` prefers `findById` (DB-first). **UI still never sends `artistId`.**

`anr_submission_vote_sub1` snapshot pin is **400** (empty body). That is intentional.

---

## What is actually wrong (repair this)

Full IDs: `ERROR_LEDGER.md`. Priority from the forensic status block:

### Batch 1 — process death / lying success (do first)

| ID | Bug |
|---|---|
| **AI-004 — RETRACTED** | Independent late-rejection probe disproved this claimed crash. `Promise.race` observes the transport rejection after timeout. See current review; prioritize RV-001/002/003 instead. |
| **AI-001** | No Groq key + `NODE_ENV=development` → HTTP **200** `{source:'fallback', answer:'[Dev Fallback]…'}`. Console shows success. Chip READY. |
| **API-002 / CRUD-002** | `POST /v3/marketing/campaigns` returns `status:'created'` + id; **nothing stored**. |
| **API-005 / CRUD-003** | `GET /v3/integrations/auth/:service` mock token; UI “Connected”. |
| **API-008** | `GET /v3/rights/contracts` `success:true` + fake `downloadUrl` even for unknown artist. |
| **API-009** | generate-all `"Reports generated successfully"` when `count=0`. |

### Batch 2 — A&R truth / authz

| ID | Bug |
|---|---|
| **API-003** | Room **Submit Demo** → store #1 DB; Room list → store #2 memory. Demo never appears in the room. `AnrRoomView.jsx` |
| **CRUD-001** | Room demos / ratings / whiteboard / listening = process memory. Restart wipes. |
| **API-004** | Whiteboard / now-listening **display-only** in React; POSTs exist unused. |
| **AUTH-001** | `pageAccess` is nav-only; not backend authorization. |
| **AUTH-002** | Auth revalidation **fails open** on DB error. `src/routes/context.js:81-84` |
| **AUTH-005 / AI-006** | Entity-audit GET has **no** `hasArtistAccess`. |
| **AUTH-003** | ADMIN_EMAIL override JWT has **no `id`**. |

### Batch 3 — AI / graph / leftover state

| ID | Bug |
|---|---|
| **API-001** | `GET /v3/ai/providers` **does not exist**; every console 404s; chip still READY. |
| **AI-002** | CommandConsole never sends `artistId`. |
| **AI-003** | `POST /v3/ai/analyze` is keyword fake, confidence 0.98. |
| **GRAPH-001** | 0/29 `collaborations: []` → unlabeled orbiting dots, 0 edges. Semantics of edges are OK; **data/copy are not**. |
| **GRAPH-002** | No node labels / click (legacy had names). |
| **STATE-001** | Sale + marketing `artistId` can go stale vs roster. |
| **STATE-002** | `useAiProviders.js` module cache survives logout. |

### Batch 4 — parity / tests (after truth)

- **PARITY-001** no A&R player
- **PARITY-002** entity-audit UI drops issues/AI/schema/wiki
- **API-010** Forgot disabled; `POST /v3/auth/reset-password` **404** (blocked on old D7 unless operator overrides)
- **TEST-001** `npm test` never loads `web/src`
- Playwright sale/vote/pager; `linked()` unit; persistence readback; Groq timeout must not kill process

---

## How to run / probe (copy this)

Operator (already up if those ports listen):

```bash
# UI
http://127.0.0.1:5173
# API
http://localhost:3000/health
```

Disposable (required for writes):

```bash
cd /home/dino/pulsegrid-repo
JWT_SECRET=forensic-audit-secret-32chars PORT=4010 \
  DB_STORAGE=/tmp/legacy-repair.sqlite SCHEDULE_JOBS=false GROQ_API_KEY= \
  NODE_ENV=development USE_REAL_DATA=false node server.js

cd web && VITE_API_BASE_URL=http://127.0.0.1:4010 npx vite --host 127.0.0.1 --port 4173
```

Existing gates (baseline only):

```bash
npm test
npm run verify:hermetic
```

---

## Suggested first commit of the next session

If the operator wants the forensic artifacts durable:

```
docs: full-system forensic audit, error ledger, API matrix, handoff
```

Files: the four markdowns + `execution-validation/forensic-2026-09-18/`.

Then repair **Batch 1** as one checkpoint with tests that assert: no 200 on AI fallback in the env you ship; Groq timeout does not shutdown; campaign/connect/rights do not claim success without a store/file.

---

## Status the operator was given (do not water down)

```
FULL SYSTEM FORENSIC AUDIT: COMPLETE
CURRENT APP END-TO-END CONNECTED: PARTIAL
FRONTEND ↔ BACKEND CONTRACTS: PARTIAL
CRUD / PERSISTENCE TRUTH: PARTIAL
PROCESS STABILITY: FAIL
AUTH / RBAC: PARTIAL
AI RUNTIME CONNECTION: PARTIAL
EXTERNAL INTEGRATIONS: MOSTLY DEMO
NETWORK GRAPH SEMANTICS: PASS
LEGACY BEHAVIORAL PARITY: PARTIAL
REACT RESOURCE-STATE SAFETY: PASS
CONCURRENCY SAFETY: PARTIAL
TEST / GATE COVERAGE QUALITY: MAJOR GAPS
D0 VALIDATED CHECKPOINT READY: NO
REPAIR PASS REQUIRED BEFORE EXECUTION GUIDE: YES
```

D0 is **not** certified. Execution Guide Steps 4+ wait until Batch 1–2 (and tests that would have caught the lies) land.

Operator instruction when they left: *“leave notes for another ai, i am out of use here.”*
