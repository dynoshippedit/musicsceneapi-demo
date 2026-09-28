# PHASE_4C_PREREQUISITE_VALIDATION.md

## 0. Status

**PRE-4C CONTRACT ALIGNMENT VALIDATED — PHASE 4C READY: YES. Nothing committed; the working tree is
left for operator review. Phase 4C NOT started.**

- Repo: `/home/dino/pulsegrid-repo`, HEAD `7efb44b4ac88f9a512a5370a3c76553dd5e21a72` (Phase 4A/4B committed).
- Validation session: 2026-09-17, 00:10 → 00:20 EDT. Node v22.23.2. Chromium 153.0.8010.12 / Playwright 1.63.0 (as printed by the gate).
- Inputs reviewed as hypotheses: the backend agent's report (`/tmp/pre4c_backend.md`, Decisions 1-backend and 4) and the
  frontend agent's report (`/tmp/pre4c_frontend.md`, Decisions 5, 1-frontend and 3); every changed file was `git diff`-read
  independently before validation. No claim below is taken from those reports without being re-observed here, except where
  marked "(per backend report)" in §9.

## 1. Scope

The five operator-approved decisions, as validated:

| # | Decision | What landed (uncommitted) |
|---|---|---|
| D1 | `pageAccess` — login (DB path) and `GET /v3/auth/me` include the backend's authoritative `pageAccess` array; frontend nav consumes it; backend authorization remains authoritative; no new endpoint, no role redesign; additive contract change documented | `src/routes/auth.js` (+`parsePageAccess`, two additive fields), `web/src/auth/permissions.js` (role table removed), 2 new tests, 4-case additive re-baseline, gate `G05`/`F10`/`F18`, doc amendments in `API_INVENTORY.md`, `BACKEND_ARCHITECTURE.md`, `PHASE_4A_HANDOFF.md` §15, `web/README.md` |
| D2 | React Router — stay on 6.30.6 for 4C; record advisories as known debt; do not suppress/falsify/upgrade | Nothing changed in `web/package.json` / lockfile; advisories recorded verbatim in §7 and in `REFACTOR_PROGRESS.md` |
| D3 | Portability gate — §15 greps corrected to scope-aware semantic-leak rules (tokens.css comments allowed; A&R headphone icon only on the `nav.js` A&R entry; label email domains only under `brand/profiles/**`); generic runtime code must still fail on embedded label identity | `web/validation/static-checks.mjs` (new, S01-S09 + `--self-test`), `web/validation/gate.mjs` (`--static-only`, S-checks run first), `PHASE_4A_HANDOFF.md` §15 / `web/README.md` marked amendments |
| D4 | Stale snapshot — investigate; classification A; no baseline changed for D4; docs amended; F-12 "re-baseline baseline.json" withdrawn | No snapshot file changed for D4 (the 14-line `phase2_baseline.json` diff is D1 only). Marked `> Amended pre-4C (Decision 4 …)` notes added to `PHASE_4A_HANDOFF.md` (L49-54, L729-734, plus the frontend agent's L476-479) and `FRONTEND_ARCHITECTURE.md` (L91-98, L861-869, L900-904) |
| D5 | `/me` 404 — 401 and 403 still log out; 404 must NOT destroy stored auth; override-JWT-without-`id` recorded as backend debt, not fixed | `web/src/auth/AuthContext.jsx` L43 (one condition narrowed + early return); gate `F19`; debt recorded in §4 / §9 |

**Explicitly NOT done:** no Phase 4C screens, routes or components (`web/src/pages` = `DashboardPage`, `LoginPage`; `web/src/router.jsx`
unchanged); no React Router upgrade; no auth/permissions redesign; no backend change beyond the `auth.js` diff already present
(no defect found in it that required a fix); no edits to `PHASE_4B_HANDOFF.md`, `PHASE_4B_VALIDATION.md`, `PHASE_4B_STATIC_AUDIT.md`,
`PHASE_4A_DESIGN_AUDIT.md`, `PULSEGRID_VISUAL_DESIGN_CONTRACT.md`, `BRAND_PORTABILITY_*.md`; no commit.

## 2. Exact files changed

`git status --short` at the end of this session (the operator's `pulsegrid_v5.sqlite` is gitignored and restored; no stray DB,
journal or probe-backup file exists — §8 item 13 / teardown):

```
 M API_INVENTORY.md
 M BACKEND_ARCHITECTURE.md
 M FRONTEND_ARCHITECTURE.md
 M PHASE_4A_HANDOFF.md
 M REFACTOR_PROGRESS.md
 M src/routes/auth.js
 M tests/regression/snapshot.test.js
 M tests/snapshots/phase2_baseline.json
 M web/README.md
 M web/src/auth/AuthContext.jsx
 M web/src/auth/permissions.js
 M web/validation/gate.mjs
?? PHASE_4C_PREREQUISITE_VALIDATION.md
?? web/validation/static-checks.mjs
```

`git diff --stat` (tracked files; the two `??` files are new):

```
 API_INVENTORY.md                     |  8 +++++
 BACKEND_ARCHITECTURE.md              |  5 +++
 FRONTEND_ARCHITECTURE.md             | 23 +++++++++++++
 PHASE_4A_HANDOFF.md                  | 42 ++++++++++++++++++++++++
 REFACTOR_PROGRESS.md                 | 35 ++++++++++++++++++++
 src/routes/auth.js                   | 21 +++++++++---
 tests/regression/snapshot.test.js    | 57 ++++++++++++++++++++++++++++++++
 tests/snapshots/phase2_baseline.json | 14 ++++++++
 web/README.md                        | 63 +++++++++++++++++++++++++++++++++---
 web/src/auth/AuthContext.jsx         |  9 ++++--
 web/src/auth/permissions.js          | 14 +++++---
 web/validation/gate.mjs              | 59 +++++++++++++++++++++++++++------
 12 files changed, 327 insertions(+), 23 deletions(-)
```

| File | Decision | Change (one line) |
|---|---|---|
| `src/routes/auth.js` | D1 | Local `parsePageAccess(raw)` (L45-54, the original inline `JSON.parse(raw \|\| '["overview"]')` expression); DB-login response gains `pageAccess: parsedPageAccess` (L111); `/me` response gains `pageAccess: parsePageAccess(user.pageAccess)` (L201). Nothing else. |
| `tests/regression/snapshot.test.js` | D1 | +57 lines inside `describe('canonical entrypoint')`: `loginBody()` helper (L195) and two tests (L205, L223) pinning `pageAccess` on login and `/me` for both seeded users, plus "every pre-existing key still present". |
| `tests/snapshots/phase2_baseline.json` | D1 | +14 / −0: the `pageAccess` array inserted into the four deterministic auth cases only (`login_admin_seeded`, `login_artist_seeded`, `auth_me_admin`, `auth_me_artist_role`). Not a D4 change. |
| `web/src/auth/permissions.js` | D1 | Role→permission table (`artist → ['overview','roster']`, `viewer → ['overview']`) removed; contract comment added; `admin → ['all']` retained; `canSee()` unchanged. |
| `web/src/auth/AuthContext.jsx` | D5 | `/me` catch: `401 \|\| 403 \|\| 404 → logout()` becomes `401 \|\| 403 → logout(); return;` with an explanatory comment; 404 now falls through like a network failure. |
| `web/validation/gate.mjs` | D3, D1, D5 | Runs `static-checks.mjs` first (S01-S09), `--static-only` mode, `summarizeAndExit()`; `SPEC.navArtist` constant → `SPEC.navByPerm` + `expectedNav(user)` derived from the live login payload; new `G05`, `F18`, `F19`; `F10` re-derived. |
| `web/validation/static-checks.mjs` (new) | D3 | The nine scope-aware rules, walker, reporter, `--root`, `--self-test` (14 synthetic leaks in a temp copy). |
| `web/README.md` | D1, D3, D4, D5 | "Verified Phase 4B notes" bullets rewritten to the new contract (this is the one non-additive doc edit; it is the frontend agent's living README, not a historical record); new **Gate** section; the five `> Amended pre-4C` blocks mirrored into the verbatim §15 copy. |
| `PHASE_4A_HANDOFF.md` | D1, D3, D4 | Additions only (42 / 0): frontend agent's five `> Amended pre-4C` blocks in §15 (D1 L472-475, D4 L476-479, D3 L510-513, L516-520, L522-526, L537-543); this session's D4 notes at L49-54 (beneath "KPI data … tests/snapshots/baseline.json", L45-48) and L729-734 (beneath the §18 risk table row "Artist-role … returns all zeros in the frozen snapshot" — placed after the table's last row so the table still renders). |
| `FRONTEND_ARCHITECTURE.md` | D4 | Additions only (23 / 0): `> Amended pre-4C (Decision 4 …)` beneath §(audit) item 8 (the `baseline.json → label_overview_admin` citation, ~L79), beneath §13.5.1 "Admin values shown are the frozen snapshot (`tests/snapshots/baseline.json` …)" (~L857), and beneath the §13.5.4 bullet "(the snapshot's artist-role response is all zeros …)" (~L899). |
| `API_INVENTORY.md` | D1 | Additions only (8 / 0): `> Amended pre-4C (Decision 1 …)` after the route table, for rows 1 (`POST /v3/auth/login`) and 4 (`GET /v3/auth/me`): before/after shapes, parser, seeds, "nav visibility only". |
| `BACKEND_ARCHITECTURE.md` | D1 | Additions only (5 / 0): `> Amended pre-4C (Decision 1 …)` beneath the §5 model table (`User.pageAccess` now parsed and served on login + `/me`; write-side debt pointer). |
| `REFACTOR_PROGRESS.md` | all | Additions only (35 / 0): `4C-pre` status row; post-alignment totals paragraph (123 / 26, verify 54, gate 66); "Recorded pre-4C" debt bullets (react-router advisories, override `id` claim, `users.js` `pageAccess` write defects, stale PINS test name, `baseline.json` naming). |
| `PHASE_4C_PREREQUISITE_VALIDATION.md` (new) | — | This document. |

`FRONTEND_API_MAP.md` was checked and not amended: it maps the *legacy HTML* frontends' consumption (L30 `POST /v3/auth/login … ok`,
L128 lists `GET /v3/auth/me` as having no frontend consumer) and does not describe either response shape.

## 3. `pageAccess` contract change (Decision 1)

### 3.1 Response shapes — before (HEAD `7efb44b`) → after (working tree), observed live on a fresh-DB server (§8 items 5-7)

`POST /v3/auth/login` (DB path)

```
before: {"token":"<REDACTED>","user":{"id":1,"name":"Admin User","email":"admin@pulsegrid.fm","role":"admin","artistAccess":"all"}}
after : {"token":"<REDACTED>","user":{"id":1,"name":"Admin User","email":"admin@pulsegrid.fm","role":"admin","artistAccess":"all","pageAccess":["all"]}}
before: {"token":"<REDACTED>","user":{"id":2,"name":"Vera Kessler","email":"tours@novakin.band","role":"artist","artistAccess":"art_novakin"}}
after : {"token":"<REDACTED>","user":{"id":2,"name":"Vera Kessler","email":"tours@novakin.band","role":"artist","artistAccess":"art_novakin","pageAccess":["overview","roster"]}}
```

`GET /v3/auth/me`

```
before: {"id":1,"email":"admin@pulsegrid.fm","name":"Admin User","role":"admin","artistAccess":"all"}
after : {"id":1,"email":"admin@pulsegrid.fm","name":"Admin User","role":"admin","artistAccess":"all","pageAccess":["all"]}
before: {"id":2,"email":"tours@novakin.band","name":"Vera Kessler","role":"artist","artistAccess":"art_novakin"}
after : {"id":2,"email":"tours@novakin.band","name":"Vera Kessler","role":"artist","artistAccess":"art_novakin","pageAccess":["overview","roster"]}
```

("before" bodies are the HEAD shapes as recorded in `tests/snapshots/phase2_baseline.json` at HEAD and re-observed by the backend
agent on the unmodified tree; "after" bodies are this session's curls.) The ADMIN_EMAIL override login (`auth.js` L74-78) already
returned `pageAccess: ['all']` at HEAD and is untouched. Error paths unchanged: bad credentials → `401 {"error":"Invalid credentials"}`,
empty body → 401 (CRITICAL-1 contract).

### 3.2 Source

- `src/routes/auth.js` L45-54 — `parsePageAccess(raw) { return JSON.parse(raw || '["overview"]'); }` with a comment stating the
  field is nav/UI visibility only. This is byte-for-byte the expression that sat inline at HEAD L78; moving it into one local function
  is what keeps login and `/me` from drifting.
- L88-89 — login uses the shared parser; L111 — `pageAccess: parsedPageAccess` appended to the `user` object.
- L201 — `/me` appends `pageAccess: parsePageAccess(user.pageAccess)`; still inside the existing `try` → a malformed column value
  gives the existing `500 {"error":"Internal error"}` (same class of failure login already had; unreachable from seeds — §9).
- Data: `src/models/index.js` L50 `pageAccess: { type: DataTypes.STRING, defaultValue: '["overview"]' }`; seeds L100
  `JSON.stringify(['all'])`, L105 `JSON.stringify(['overview','roster'])`.

### 3.3 Tests added

`tests/regression/snapshot.test.js` L190-246 (inside the only suite that boots a live server):
`POST /v3/auth/login returns pageAccess as the seeded array (Decision 1)` (L205) and
`GET /v3/auth/me returns pageAccess as the seeded array (Decision 1)` (L223) — both `ok` in §8 item 1; suite count 26 → 26,
test count 121 → 123.

### 3.4 Snapshot re-baseline (D1 only)

```
$ git diff --stat tests/snapshots/phase2_baseline.json
 tests/snapshots/phase2_baseline.json | 14 ++++++++++++++
 1 file changed, 14 insertions(+)
```

Read in full (`git diff tests/snapshots/phase2_baseline.json`): four hunks, each inserting only a `"pageAccess": [...]` key into
`login_admin_seeded.body.user`, `login_artist_seeded.body.user`, `auth_me_admin.body`, `auth_me_artist_role.body`; zero deletions;
no other case, no `__meta`, no nondeterministic case touched. `npm test`'s byte comparison of the 77 deterministic cases passed
against it on a fresh seed (§8 item 1), which is the proof the re-baseline matches what the server serves.

### 3.5 Authorization unchanged

`git diff src/routes/auth.js` (21 insertions / 3 deletions, all quoted in §8 item 8) contains only: the parser function + comment,
the replacement of the inline parse by the parser call, and the two additive response fields. No middleware, no JWT claim, no
role check, no route guard is touched. `pageAccess` is never read by `src/auth/index.js` (`authenticateToken`, `hasArtistAccess`,
`filterDataByAccess`, `checkExportAccess`) or by any `req.user.role` check — it was, and remains, a frontend-visibility hint.
`npm run verify` §4 "Authorization" checks passed (54/54, §8 item 2).

## 4. Auth session error handling (Decision 5)

`web/src/auth/AuthContext.jsx` boot effect L30-51 (`getMe(session.token, …).then(merge).catch(…)`); backend statuses from
`src/auth/index.js` L57 (401 missing bearer), L62 (403 invalid/expired), `src/routes/auth.js` L190-192 (404 `User not found`).

| `/me` outcome | Before (HEAD L41: `401 \|\| 403 \|\| 404 → logout()`) | After (L43: `401 \|\| 403 → logout(); return;`) | Evidence this session |
|---|---|---|---|
| 401 (no bearer) | `logout()` → keys cleared → `/login` | unchanged | curl no-bearer → `401 {"error":"Authentication required"}`; gate `F12` (intercepted 401 → `/login`, keys null) PASS ×2 |
| 403 (garbage/expired bearer) | `logout()` → `/login` | unchanged | curl garbage bearer → `403 {"error":"Invalid or expired token"}`; gate `F11` (garbage token + reload → `/login`, `backend=[/v3/auth/me:403]`) PASS ×2 |
| 404 (`User not found`) | `logout()` — destroyed the stored session | **session kept**: `authToken`/`userData` untouched, no navigation, silent like a network failure | gate `F19` (route-intercepted 404 on `**/v3/auth/me`, reload → still `/dashboard`, `token-unchanged=true userData-kept=true`) PASS ×2; the 404 resource error lands in `C02`'s expected list (`expected resource errors=10`, C02 PASS) |
| network / 5xx / other | swallowed | unchanged | gate `F14` (API unreachable → CONNECTION FAILURE, `session-kept=true`, RETRY renders KPIs) PASS ×2 |
| `AbortError` | return | unchanged | — |

Override-login debt (recorded, not fixed): booted a second backend with `ADMIN_EMAIL`/`ADMIN_PASS` set (§8 item 10):
override login → `200 {"token":"<REDACTED>","user":{"name":"Admin","email":"override@example.test","role":"admin","pageAccess":["all"]}}`;
decoded JWT payload keys `email, role, artistAccess, integrationCount, iat, exp` — **no `id`** (`auth.js` L74); `GET /v3/auth/me`
with that token → `404 {"error":"User not found"}` (L190 `User.findByPk(undefined)` → null → L192); `GET /v3/label/overview` with
the same token → 200 (authorization is unaffected). Before D5 this 404 terminated the override session on its first boot
reconciliation (PHASE_4B_STATIC_AUDIT F-10); after D5 the session survives but its `userData` is never reconciled (keeps the login
payload). Same gap for `DELETE /v3/auth/me` (L169) and change-password (L217). No admin model was invented.

## 5. Portability gate correction (Decision 3)

Rules (`web/validation/static-checks.mjs` `RULES[]`; each is `{ id, scope(rel), pattern, prepare?, allow?, boundary }`, tested per
line over `web/src/**/*.{js,jsx,css,html,json,svg,mjs}`):

| Id | Scope | Pattern | Allowed boundary | Replaces §15 |
|---|---|---|---|---|
| S01 | `web/src` minus `brand/**` | `/pulsegrid\|lumenveil\|novakin\/i` | only inside `/* */` comments of `styles/tokens.css` (comments blanked to spaces before matching, line numbers preserved); a tokens.css declaration/selector still fails | L497 first grep + L495 slug rule |
| S02 | `brand/**` minus `profiles/**`, `themes/**` | same | `brand/registry.js` | L497 second grep |
| S03 | `web/src` minus `brand/profiles/pulsegrid/**` | `/INTELLIGENCE PLATFORM\|pulsegrid Intelligence Platform\|pulsegrid\.com/i` | tokens.css comments | L494 |
| S04 | all | `/@(pulsegrid\|novakin)\.com/i` | `brand/profiles/**` | L498 second grep |
| S05 | `*.js/jsx/css/mjs` minus `tokens.css`, `global.css`, `**/chartDefaults.js`, `brand/themes/**`, `brand/profiles/**` | `#hex{3,4,6,8}\b`, `rgb(a)(`, `hsl(a)(` | those files | L482 |
| S06 | all | import/from/require specifier containing a `profiles/` or `themes/` path segment | `brand/registry.js` | L506-507 |
| S07 | all | `/ri-(headphone\|music\|disc)[\w-]*/` | the single `layout/nav.js` line matching both `id: 'anr'` and `icon: 'ri-headphone-line'` | L508 |
| S08 | all | `/\bart_[a-z0-9]+/` | nowhere | L498 first grep |
| S09 | all | `/<admin-seed-pw>\|<artist-seed-pw>/` | nowhere | new (architecture §14.5) |

Doc amendments: the four `> Amended pre-4C (Decision 3 …)` blocks beneath the §15 grep boxes (HEAD numbering L494-495, L497, L498,
L508; now L510-513, L516-520, L522-526, L537-543) in `PHASE_4A_HANDOFF.md`, plus the D1 block at L472-475, and the same five in
`web/README.md`'s verbatim copy (frontend agent; read in full this session — additions only, wording matches
the implemented rules). This session added no D3 doc text.

Evidence (all §8 item 11):
- `node web/validation/gate.mjs --static-only` → `GATE SUMMARY: 9 pass, 0 fail, 9 checks`, exit 0.
- `node web/validation/static-checks.mjs --self-test` → `SELF-TEST SUMMARY: 23 pass, 0 fail, 23 assertions (9 rules × real tree + 14
  synthetic leaks); temp copy removed=true`, exit 0 — every synthetic leak line reads `FLAGGED at L…`, including the boundary cases
  the amendments must not soften: identity in a tokens.css **selector** (S01), disc glyph on a **non-A&R** `nav.js` entry (S07),
  label email in `brand/schema.js` (S04), theme import in `BrandContext.jsx` (S06). No `/tmp/brand-static-selftest-*` left behind.
- Independent probe (this session, file not used by the frontend agent's self-test): appended
  `export const PLATFORM_LABEL = 'pulsegrid';` to `web/src/api/client.js` → `FAIL | S01 … | 1 hit(s): api/client.js:37 …`,
  `GATE SUMMARY: 8 pass, 1 fail, 9 checks`, exit 1; restored from a byte copy → sha256 `86370023d006dc7f…` identical before/after,
  `git diff --stat -- web/src/api/client.js` empty; re-run → `9 pass, 0 fail`, exit 0.

## 6. Deterministic baseline investigation (Decision 4)

| File | Tracked | `__meta` | Read by a test? | What it is |
|---|---|---|---|---|
| `tests/snapshots/phase2_baseline.json` | yes | `entry: "server.js"`, `caseCount: 91` | **yes** — `snapshot.test.js` L31 `BASELINE`; L100-134 compare all 91 statuses + 77 deterministic bodies | the deterministic baseline, re-captured after the Phase 3 fixes (PHASE_3_VALIDATION §7 L141) |
| `tests/snapshots/baseline.json` | yes | `entry: "production-api.js"`, 50 cases | **no** — zero references from `*.js/*.mjs/*.json`; `.md` only | Phase-1 capture of the pre-refactor monolith |
| `tests/snapshots/current.json` | no (gitignored) | `entry: "server.js"`, 50 cases | no | Phase-1 counterpart |
| `tests/snapshots/.live.json` | no (gitignored) | 91 cases | written by `snapshot.test.js` on every `npm test` | latest live probe |

Clean-seed observed values this session (fresh DB, `GET /v3/label/overview`, §8 item 7 block): artist token →
`{"monthlyRevenue":8464217,"quarterlyProjection":25392651,"annualProjection":101570604,"activeArtists":1,"topArtists":[{"name":"NOVAKIN","revenue":8464217,"roi":8.7}],…}`;
admin token → `3202870 / 134773080 / 539092320 / 29`. Gate `G04` printed the same artist numbers and `F10` rendered them as
`$8.5M · $25.4M · $101.6M · 1` on both runs. `npm test` (123/123) passed its byte comparison against `phase2_baseline.json` on a
fresh seed, i.e. the test-consumed baseline already holds these values.

**Classification A — intentional repository change (Phase 3 HIGH-4), already reflected in the deterministic baseline.** Evidence:
`src/auth/index.js` L69-97 `normalizeArtistAccess` ("HIGH-4 FIX (Phase 3)": the seeded scalar `'art_novakin'` previously fell through
to `return false` and artists were denied their own data → zero accessible artists → the all-zeros body) and L99-105
`hasArtistAccess`; `src/routes/label.js` L109-133 (overview filters `labelData.artists` by `hasArtistAccess`, non-admin
`monthlyRevenue` = own total); PHASE_3_VALIDATION.md §3 row HIGH-4 (L53) and §4 rows 7-11 (L87-91, artist-role contract changes
attributed to HIGH-4); §7 L141 (`phase2_baseline.json` re-captured after the fixes). `baseline.json` also records
`auth_me_artist_role = 404` and `artists_artist_role total 0` — the pre-Phase-3 behaviours §4 lists as intentionally changed.

**Action:** no baseline file changed for D4. `baseline.json` is left intact — its zeros are correct for what it records (the monolith),
it cannot be regenerated by current tooling (`cases.js` is a 91-case catalogue with different names; the monolith file is an 82-line
shim), and it is the reference PHASE_3_VALIDATION §4 compares against. Docs that treated it as the current frozen snapshot were
amended additively (marked `> Amended pre-4C (Decision 4, 2026-09-17)`): `PHASE_4A_HANDOFF.md` L49-54 (beneath "KPI data …
tests/snapshots/baseline.json"), L476-479 (frontend agent, beneath the §15 artist line `$0 · $0 · $0 · 0` — HEAD L465, now L470-471),
L729-734 (beneath the §18 risk table row "returns all zeros in the frozen snapshot"); `FRONTEND_ARCHITECTURE.md` L91-98 (item 8 citation), L861-869 (§13.5.1 admin
values paragraph), L900-904 (§13.5.4 "artist-role response is all zeros" bullet).

**PHASE_4B_STATIC_AUDIT.md F-12 recommendation "backend owner to re-baseline `tests/snapshots/baseline.json`
(`label_overview_artist_role`)" (L217, L289) and the echo in PHASE_4B_VALIDATION.md §7 #8 / §9 F-12 are hereby WITHDRAWN**: the
file it names is not the deterministic baseline and is read by no test; the deterministic baseline already carries the live artist
values. The doc-fix half of F-12 ("replace the zero snapshot with the live artist values or 'as served'") is done by the amendments
above. The audit and validation files themselves are historical and were not edited.

## 7. React Router advisory disposition (Decision 2)

Installed: `react-router` 6.30.6, `react-router-dom` 6.30.6 (`web/package.json` range `^6.30.1`). Command and verbatim result
(`cd web && npm audit --omit=dev --audit-level=moderate`, exit **1**):

```
# npm audit report

react-router  6.0.0 - 7.17.0
Severity: moderate
React Router: Open redirect via backslash in <Link> and useNavigate (CVE-2025-68470 bypass) - https://github.com/advisories/GHSA-wrjc-x8rr-h8h6
React Router: Arbitrary Constructor Injection via deserializeErrors() in React Router SSR Hydration - https://github.com/advisories/GHSA-337j-9hxr-rhxg
fix available via `npm audit fix --force`
Will install react-router-dom@7.18.4, which is a breaking change
node_modules/react-router
  react-router-dom  6.0.0-alpha.0 - 7.17.0
  Depends on vulnerable versions of react-router
  node_modules/react-router-dom

2 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force
```

Advisory ids (from `npm audit --json`): **1124268 / GHSA-wrjc-x8rr-h8h6** and **1124272 / GHSA-337j-9hxr-rhxg**; vulnerable range
`6.0.0 - 7.17.0`; fixed in `react-router-dom@7.18.4` (major bump). `metadata.vulnerabilities = {moderate: 2, total: 2}`.

**Disposition: DEFERRED (operator Decision 2).** Not upgraded, not suppressed, not "fixed"; the audit is NOT clean and no claim to
the contrary is made anywhere in the tree. Rationale for accepting the exposure through 4C: (a) GHSA-337j-9hxr-rhxg is in SSR
hydration (`deserializeErrors()`); `web/` is a client-only Vite SPA with no `hydrateRoot`/`renderToString`/`StaticRouter` usage
(`grep -rn` over `web/src` — none). (b) GHSA-wrjc-x8rr-h8h6 concerns user-controlled path strings reaching `<Link to>`/`useNavigate`;
every navigation target in `web/src` today is a static literal (`/login`, `/dashboard`, `nav.js` `to` values) or a `NavLink to={item.to}`
from the static `NAV_PRIMARY` table — no query/`state.from`-derived redirect is performed (ProtectedRoute stores `location.pathname`
in `state.from` but nothing navigates to it). **Review trigger:** re-evaluate before any 4C screen introduces a redirect-after-login
(`state.from`), an `?next=` parameter, or any `navigate(userSuppliedString)`; and in any case before the first production deploy of
`web/`. The upgrade is a bounded, separate task (RR7 future-flag warnings are already printed by the gate — 26 console warnings, `INFO` line).

## 8. Validation log (every command from this session; verbatim results — the two seed passwords are redacted as `<admin-seed-pw>` / `<artist-seed-pw>` wherever tool output printed them; JWTs as `<REDACTED>`)

Server boots for items 2, 4-7, 9, 10 used a **fresh DB** by the repository's own rename procedure (`tests/support/probe.js` L140 /
L185-186, `snapshot.test.js` L61-65 / L83-85, PHASE_3_VALIDATION §7): `mv pulsegrid_v5.sqlite pulsegrid_v5.sqlite.pre4c-val-backup`;
boot; at the end `rm -f pulsegrid_v5.sqlite` (the fresh file) and `mv pulsegrid_v5.sqlite.pre4c-val-backup pulsegrid_v5.sqlite`.
Backend: `JWT_SECRET=pre4c-validation-secret-0123456789 SCHEDULE_JOBS=false npm start` (background, `/tmp/pre4c_val_backend.log`),
`/health` 200 after 1 s, fresh DB 94 208 B. Frontend: `cd web && npm run dev -- --host 127.0.0.1` (Vite 6.4.3 on :5173).

**(1) `npm test` (repo root, self-cleaning — renames the DB itself) — PASS**

```
# tests 123
# suites 26
# pass 123
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 9602.958283
```
exit 0; both new tests `ok 4 - POST /v3/auth/login returns pageAccess as the seeded array (Decision 1)` and
`ok 5 - GET /v3/auth/me returns pageAccess as the seeded array (Decision 1)`; `[probe] wrote …/.live.json (91 cases)`. Operator DB
afterwards: 167 936 B, mtime `Sep 16 23:41` (unchanged). Expected 123 / 26 — actual 123 / 26.

**(2) `npm run verify` against the fresh-DB server (run after the gate, item 4, on the same boot) — PASS**

```
=== Phase 2 operational verification against http://127.0.0.1:3000 ===
[1] Health / status … [10] A&R stores (split-brain preserved)
=== 54 passed, 0 failed ===
```
exit 0. (`verify` is non-idempotent — fresh DB grew 94 208 → 167 936 B; that file was deleted at teardown.)

**(3) `cd web && npm run build` — PASS**

```
vite v6.4.3 building for production...
✓ 81 modules transformed.
dist/index.html                           0.78 kB │ gzip:   0.42 kB
dist/assets/index-5LZDk4Jh.css          147.22 kB │ gzip:  24.07 kB
dist/assets/index-Cxvocn9C.js           228.30 kB │ gzip:  75.22 kB
✓ built in 1.35s
```
exit 0 (`web/dist/` is gitignored).

**(4) Full Phase 4B gate, live, twice — PASS**

Run 1: `GATE SUMMARY: 66 pass, 0 fail, 66 checks`, exit 0. Run 2: `GATE SUMMARY: 66 pass, 0 fail, 66 checks`, exit 0. The
PASS/FAIL-id columns of the two runs are identical (`diff` empty). Only textual difference: `F11` observed
`backend=[/v3/auth/me:403]` (run 1) vs `backend=[/v3/label/overview:403, /v3/auth/me:403]` (run 2) — the known race
(PHASE_4B_VALIDATION §3 row 9). The five tracked `web/validation/phase4b-*.png` were rewritten byte-identical (no git change).
Final run (run 2), verbatim, JWTs would be redacted (none are printed):

```
Phase 4B gate — static checks over /home/dino/pulsegrid-repo/web/src
PASS | S01 label identity in generic runtime code (web/src outside brand/; tokens.css comments stripped) | clean over 36 file(s) — allowed boundary: nowhere in generic code — including comments, class names and storage keys — except inside tokens.css /* */ comments (the byte-for-byte contract blocks)
PASS | S02 label identity in brand core (brand/ outside profiles/ and themes/) → only registry.js | clean over 9 file(s) — allowed boundary: brand/registry.js only (composition root, architecture §14.3)
PASS | S03 brand strings ("INTELLIGENCE PLATFORM", "pulsegrid Intelligence Platform", pulsegrid.fm) outside brand/profiles/pulsegrid/ (tokens.css comments stripped) | clean over 48 file(s) — allowed boundary: brand/profiles/pulsegrid/** and tokens.css /* */ comments
PASS | S04 label email domains (@pulsegrid.fm / @novakin.band) outside brand/profiles/ | clean over 52 file(s) — allowed boundary: brand/profiles/** only (profile contact/email data, architecture §14.2)
PASS | S05 raw colour literals (#hex / rgb() / hsl()) outside tokens.css, global.css, chartDefaults.js, brand/themes/, brand/profiles/ | clean over 43 file(s) — allowed boundary: styles/tokens.css, styles/global.css, **/chartDefaults.js, brand/themes/**, brand/profiles/**
PASS | S06 profile / theme imports outside brand/registry.js | clean over 52 file(s) — allowed boundary: brand/registry.js only (architecture §14.6: marks and loaders are looked up in the registry, never imported)
PASS | S07 Remixicon used as a brand mark (ri-headphone / ri-music / ri-disc) — allowed only as the A&R entry icon in layout/nav.js | clean over 52 file(s) — allowed boundary: layout/nav.js, the `{ id: 'anr', …, icon: 'ri-headphone-line', … }` entry only (architecture §5 A&R Room icon)
PASS | S08 artist ids (art_*) in frontend source | clean over 52 file(s) — allowed boundary: nowhere in web/src (artist identities are runtime data — architecture §14.5)
PASS | S09 seed credential passwords (<admin-seed-pw> / <artist-seed-pw>) in frontend source | clean over 52 file(s) — allowed boundary: nowhere in web/src (fixtures live in the §15 gate text and web/README.md only — architecture §14.5)
Phase 4B gate — BASE_URL=http://127.0.0.1:5173 API_URL=http://localhost:3000 viewport=1440x900 headless=true
node v22.23.2 icu 78.2 chromium 153.0.8010.12 playwright 1.63.0
PASS | G01 frontend reachable | GET http://127.0.0.1:5173/login -> 200
PASS | G02 backend health | GET http://localhost:3000/health -> 200
PASS | G03 live API overview (admin) | login 200 pageAccess-in-payload=true; overview 200 monthlyRevenue=3202870 quarterlyProjection=134773080 annualProjection=539092320 activeArtists=29
PASS | G04 live API overview (artist) | login 200 role=artist pageAccess-in-payload=true; overview 200 monthlyRevenue=8464217 quarterlyProjection=25392651 annualProjection=101570604 activeArtists=1
PASS | G05 login payloads carry pageAccess arrays (pre-4C Decision 1 contract: admin ⊇ all, artist non-empty) | admin.pageAccess=["all"] artist.pageAccess=["overview","roster"] → expected artist nav [Dashboard, Artists]
INFO | expected (Node Intl) admin en-US/USD: $3.2M · $134.8M · $539.1M · 29 | admin en-GB/GBP: £3.2m · £134.8m · £539.1m · 29 | artist en-US/USD: $8.5M · $25.4M · $101.6M · 1 (values as served by the API — not a contractual constant)
PASS | F01 unauthenticated / -> /login | http://127.0.0.1:5173/login
PASS | F02 unauthenticated /dashboard -> /login | http://127.0.0.1:5173/login
PASS | V01 pulsegrid identity (title/favicon/theme) on /login | {"title":"pulsegrid Intelligence Platform","favicon":"/brands/pulsegrid/favicon.svg","bodyTheme":"pulsegrid-console","htmlTheme":"pulsegrid-console"}
PASS | V02 login card geometry (420/48/1px accent .35/4px/no shadow/centered) | width=420 padding=48px border=1px solid color(srgb 0 1 0.372549 / 0.35) radius=4px shadow=none centerOffset=(0.00,0.00) sidebar/header=false logo/img=0
PASS | V03 login wordmark lowercase 32px/700 -1px Inter; tagline 12px mono muted (not green) | wordmark="pulsegrid" 32px/700 ls=-1px Inter; tagline="INTELLIGENCE PLATFORM" 12px rgb(181, 181, 181) "JetBrains Mono"
PASS | V04 login button full-width 48px accent fill, black 14px/700 mono uppercase | w=322 (card inner 322) h=48 bg=rgb(0, 255, 95) color=rgb(0, 0, 0) 14px/700 "JetBrains Mono" uppercase
PASS | F16 Forgot Password? present, disabled, 11px accent | text="Forgot Password?" disabled=true 11px rgb(0, 255, 95)
PASS | V05 login labels 11px/700 mono muted; inputs 14px mono radius 2px bg rgba(0,0,0,.3); placeholder from profile | labels=ACCESS ID 11px/700 rgb(181, 181, 181); PASSPHRASE 11px/700 rgb(181, 181, 181) input=14px "JetBrains Mono" r=2px bg=rgba(0, 0, 0, 0.3) placeholder=user@pulsegrid.fm
PASS | V06 login footer: hairline top, two 11px mono muted lines (pulsegrid has no legal line); body bg #0A0A0A + decoration gradient; login radial gradient | footer=["RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.","Authorized personnel only."] borderTop=1px 11px rgb(181, 181, 181); bodyBg=rgb(10, 10, 10) bodyImg=linear-gradient(color(srgb 0 1 0.372549 … loginImg=radial-gradient(circle, color(srgb 0 1 0…
PASS | V15 keyboard focus ring (2px accent outline) on login controls | access-id: 2px solid rgb(0, 255, 95) +glow; passphrase: 2px solid rgb(0, 255, 95) +glow; INITIALIZE SESSION: 2px solid rgb(0, 255, 95) +glow; pulsegridINTELLIGENCE: 3px none rgb(245, 245, 245)
PASS | F03 wrong password -> inline server error, button restored, still /login | alert="Invalid credentials" submit="INITIALIZE SESSION" disabled=false path=/login
PASS | V07 login error = panel variant (danger-dim bg, danger border, 4px, 12px pad, 13px centered) | bg=rgba(255, 50, 50, 0.1) border=1px solid rgba(255, 50, 50, 0.3) radius=4px pad=12px msg=13px center
PASS | F04 seeded admin login -> /dashboard | http://127.0.0.1:5173/dashboard
PASS | F05 admin KPI row === live API formatted en-US/USD | MONTHLY REVENUE $3.2M · QUARTERLY PROJECTION $134.8M · ANNUAL PROJECTION $539.1M · ACTIVE ARTISTS 29 (expected $3.2M · $134.8M · $539.1M · 29)
PASS | F06 no NaN/undefined/null on /dashboard | body text 286 chars, tokens absent=true
PASS | F07 admin nav: 8 primary + Settings + Terminate Session | primary=[Dashboard, Artists, A&R Room, Intelligence, Marketing, Fans, Operations, Admin] secondary=[Settings] bottom="Terminate Session" header="Dashboard Real-time label performance metrics AU Admin User"
PASS | V08 shell geometry: sidebar 224 / 24px 16px / hairline / blur(20px); main 24px; header 56 + 24mb | sidebar=224px pad=24px 16px border-right=1px solid rgba(255, 255, 255, 0.1) blur(20px) fixed; main pad=24px ml=224px; header=56px mb=24px
PASS | V09 header: h1 28px/700 "Dashboard", 14px subtitle, user chip; no input/select/a | h1="Dashboard" 28px/700; subtitle="Real-time label performance metrics" 14px; chip=["AU","Admin User"]; input/select/a=0
PASS | V10 nav items 40px, 2px radius, 18px icon, 14px label; inactive muted; active text 600 on accent .1 | active "Dashboard" h=40 r=2px icon=18px label=14px bg=color(srgb 0 1 0.372549 / 0.1) color=rgb(245, 245, 245) w=600; inactive "Artists" color=rgb(181, 181, 181) w=400 bg=rgba(0, 0, 0, 0)
PASS | V11 bottom group: Settings -> hairline -> Terminate Session (ri-logout-box-line, 14px muted, no fill) pinned bottom | "Terminate Session" icon=ri-logout-box-line 14px rgb(181, 181, 181) bg=rgba(0, 0, 0, 0) divider=1px gap-to-viewport-bottom=24px
PASS | V12 brand block: PulseMark SVG 40x40 (3 circle/2 ellipse/1 path, accent+text fills), wordmark 20px/800 lowercase, sublabel 11px mono accent uppercase; nothing else | svg 40x40 circles=3 ellipses=2 paths=1 d="M 30 70 Q 50 90 70 70 Q 50 82 30 70" fill=rgb(0, 255, 95) eyes=rgb(245, 245, 245) (rail copy width=0); wordmark="pulsegrid" 20px/800; sub="INTELLIGENCE PLATFORM" 11px rgb(0, 255, 95) uppercase; block text=["pulsegrid","INTELLIGENCE PLATFORM"]
PASS | V13 KPI row: 4 cards, 4 columns, gap 16, align start, 88-112px, pad 16, 4px, hairline, no shadow, no icons | cards=4 cols=4 gap=16px align=start; heights=[91.4,91.4,91.4,91.4] pad=16px r=4px border=1px solid rgba(255, 255, 255, 0.1) shadow=none
PASS | V14 KPI anatomy: 2px accent left rule @.5 full height; .label 11px mono muted uppercase; .kpi 32px/700 mono text tabular-nums | rule=2px rgb(0, 255, 95) op=0.5 h=89.3906px (card inner 89px); label 11px rgb(181, 181, 181) uppercase; kpi 32px/700 "JetBrains Mono" rgb(245, 245, 245) tabular-nums
PASS | V16 nothing below the KPI row (main = header + grid), no Vite error overlay | main children=[HEADER, DIV] overlay=false
PASS | F08 persisted session survives reload; userData reconciled with /v3/auth/me | path=/dashboard token-unchanged=true userData={"id":1,"name":"Admin User","email":"admin@pulsegrid.fm","role":"admin","artistAccess":"all","pageAccess":["all"]}
PASS | F18 reconciled userData carries the /me pageAccess array (pre-4C Decision 1 contract) | userData.pageAccess=["all"]
PASS | F15 unbuilt routes redirect to /dashboard (nav click + direct) | Artists->/dashboard Settings->/dashboard /anr->/dashboard /does-not-exist->/dashboard 404text=false newErrors=0
PASS | F17 localStorage keys ⊆ {authToken,userData,platform.brandProfile} | keys=[authToken, userData]
PASS | V17 full-page loader is the legacy mark (80px ring + 2 ears, pulse) on #0A0A0A, no spinner text | fixed=true bg=rgb(10, 10, 10) ring=80x80 border=4px solid rgb(0, 255, 95) anim=pulse running=1 ears=2 (50pxx50px 4px rgb(0, 255, 95) top=-30px left=-25px; 50pxx50px right=-25px) text="" svg/img=0
PASS | F09 Terminate Session -> /login, authToken/userData cleared | path=/login authToken=null userData=null
PASS | F10 seeded artist: primary nav === pageAccess-derived items (Decision 1), Settings+Terminate Session; KPI === live artist API en-US/USD; no NaN | primary=[Dashboard, Artists] (expected from pageAccess ["overview","roster"]: [Dashboard, Artists]) secondary=[Settings] bottom="Terminate Session" kpi=$8.5M · $25.4M · $101.6M · 1 (expected $8.5M · $25.4M · $101.6M · 1) header="Dashboard Real-time label performance metrics IR Vera Kessler"
PASS | F19 intercepted 404 on /v3/auth/me keeps the stored session (Decision 5): still /dashboard, authToken/userData intact | path=/dashboard token-unchanged=true userData-kept=true
PASS | F11 garbage authToken + reload -> back to /login, session cleared (records backend status) | path=/login authToken=null userData=null backend=[/v3/label/overview:403, /v3/auth/me:403]
PASS | F12 intercepted 401 on overview -> session cleared -> /login | path=/login authToken=null userData=null
PASS | F13 intercepted 403 on overview -> fullscreen ACCESS DENIED, no retry, session kept | kicker="ACCESS DENIED" message="Access denied: insufficient permissions" buttons=[] fixed path=/dashboard kpis=0 token-kept=true
PASS | F14 API unreachable on reload -> CONNECTION FAILURE fullscreen; RETRY CONNECTION renders KPIs without reload | kicker="CONNECTION FAILURE" message="Failed to connect to Neural Link" button="RETRY CONNECTION" white-screen=false overlay=false session-kept=true; after retry: reload=false kpi=$3.2M · $134.8M · $539.1M · 29 alert=false
PASS | V18 fullscreen ErrorState anatomy: fixed inset 0 #0A0A0A; 48px danger icon; 16px mono danger kicker; 14px muted message; danger button (dim fill, danger text, 2px, 32px, mono uppercase) | inset=0px 0px 0px 0px bg=rgb(10, 10, 10) icon=ri-error-warning-line 48px rgb(255, 68, 68); kicker 16px rgb(255, 68, 68); msg 14px rgb(181, 181, 181); button bg=rgba(255, 50, 50, 0.1) color=rgb(255, 68, 68) r=2px h=32 uppercase
PASS | R01 1280x800: 4 KPI columns, full 224px sidebar | cols=4 sidebar=224 scrollWidth=1280
PASS | R02 1024x768: 56px icon rail (24px mark only), KPIs 2x2, no horizontal overflow | cols=2 sidebar=56 visibleMarks=[24] navLabelsVisible=0 wordmarkVisible=false main-ml=56px scrollWidth=1024
PASS | P00 switch to example-records via localStorage override (dev hook), session cleared | keys=[platform.brandProfile]
PASS | P01 example-records identity (title/favicon/theme) | {"title":"Example Records — Label Operations","favicon":"/brands/example-records/favicon.svg","bodyTheme":"example-records-magenta","htmlTheme":"example-records-magenta"}
PASS | P02 example login: wordmark/sublabel/placeholder/3rd footer line; platform voice unchanged | wordmark="Example Records" tagline="LABEL OPERATIONS" placeholder=user@example-records.test footer=["RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.","Authorized personnel only.","© Example Records — portability test profile"] voice-present=true
PASS | P03 example login: card border, button fill, Forgot link are magenta; card geometry unchanged | width=420 pad=48px border=color(srgb 1 0.176471 0.584314 / 0.35) button=rgb(255, 45, 149)/rgb(0, 0, 0) forgot=rgb(255, 45, 149)
PASS | P04 example dashboard: admin KPI === live API formatted en-GB/GBP (lowercase m) | MONTHLY REVENUE £3.2m · QUARTERLY PROJECTION £134.8m · ANNUAL PROJECTION £539.1m · ACTIVE ARTISTS 29 (expected £3.2m · £134.8m · £539.1m · 29)
PASS | P05 example shell: MonogramMark "E" 40x40 magenta mono (no svg), wordmark/sublabel from profile, sublabel magenta | glyph="E" bg=rgb(255, 45, 149) color=rgb(0, 0, 0) "JetBrains Mono" r=2px svgs=0; wordmark="Example Records" sub="LABEL OPERATIONS" rgb(255, 45, 149); block=["E","Example Records","LABEL OPERATIONS"]
PASS | P06 example shell: nav/header/Terminate Session identical to pulsegrid run; active tint + StatCard rules magenta | nav-identical=true header="Dashboard Real-time label performance metrics AU Admin User" activeBg=color(srgb 1 0.176471 0.584314 / 0.1) rules=[rgb(255, 45, 149)]
PASS | P07 example: no "pulsegrid" in body text (/login + /dashboard), no class containing "legacy", no green element colour | dashboard: pulsegrid-in-text=false legacy-classes=0 green-elements=0; login: pulsegrid-in-text=false legacy-classes=0 green-elements=0
PASS | P08 example: full-page loader is the RingLoader (80px ring, pulse, no ears) | ring=80x80 border=4px solid rgb(255, 45, 149) anim=pulse running=1 ears=0 bg=rgb(10, 10, 10)
PASS | P09 example: fullscreen ErrorState unchanged except hue (kicker/button copy identical, button magenta-free danger) | kicker="CONNECTION FAILURE" button="RETRY CONNECTION" btn=rgba(255, 50, 50, 0.1)/rgb(255, 68, 68) bg=rgb(10, 10, 10)
PASS | P10 remove override -> pulsegrid identity, accent, mark, wordmark and $ KPIs return with no edits | title="pulsegrid Intelligence Platform" theme=pulsegrid-console favicon=/brands/pulsegrid/favicon.svg wordmark="pulsegrid" sub="INTELLIGENCE PLATFORM" rgb(0, 255, 95) mark=40x40 circles=3 kpi=$3.2M · $134.8M · $539.1M · 29 keys=[authToken, userData]
PASS | C01 no uncaught page errors during the run | none
PASS | C02 no unexpected console.error during the run (resource errors during provoked 401/403/network phases are listed separately) | none; expected resource errors=10 [Failed to load resource: the server responded with a status of 401 (Unauthorized) | Failed to load resource: the server responded with a status of 404 (Not Found) | Failed to load resource: the server responded with a status of 403 (Forbidden) | Failed to load resource: net::ERR_CONNECTION_REFUSED]
INFO | console warnings (26): ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` futur
INFO | screenshots written to /home/dino/pulsegrid-repo/web/validation: phase4b-pulsegrid-login.png phase4b-pulsegrid-dashboard.png phase4b-example-login.png phase4b-example-dashboard.png phase4b-error.png
GATE SUMMARY: 66 pass, 0 fail, 66 checks
```

**(5) Login works — seeded admin and artist (fresh DB, tokens redacted) — PASS**

```
POST /v3/auth/login {"email":"admin@pulsegrid.fm","password":<seed>}
{"token":"<REDACTED>","user":{"id":1,"name":"Admin User","email":"admin@pulsegrid.fm","role":"admin","artistAccess":"all","pageAccess":["all"]}}
HTTP 200
POST /v3/auth/login {"email":"tours@novakin.band","password":<seed>}
{"token":"<REDACTED>","user":{"id":2,"name":"Vera Kessler","email":"tours@novakin.band","role":"artist","artistAccess":"art_novakin","pageAccess":["overview","roster"]}}
HTTP 200
POST /v3/auth/login (wrong password)  → {"error":"Invalid credentials"} HTTP 401
POST /v3/auth/login {}                → {"error":"Invalid credentials"} HTTP 401
```

**(6) `/me` works for a persisted session — fresh tokens from item 5 — PASS**

```
GET /v3/auth/me  Authorization: Bearer <admin token>
{"id":1,"email":"admin@pulsegrid.fm","name":"Admin User","role":"admin","artistAccess":"all","pageAccess":["all"]}
HTTP 200
GET /v3/auth/me  Authorization: Bearer <artist token>
{"id":2,"email":"tours@novakin.band","name":"Vera Kessler","role":"artist","artistAccess":"art_novakin","pageAccess":["overview","roster"]}
HTTP 200
```
Gate `F08` additionally proved the browser flow: reload with a stored token → `/dashboard`, `userData` reconciled from `/me`
(`{"id":1,…,"pageAccess":["all"]}`).

**(7) `pageAccess` present in BOTH login and `/me`, admin `["all"]`, artist `["overview","roster"]` — PASS** (bodies in items 5-6;
gate `G05` `admin.pageAccess=["all"] artist.pageAccess=["overview","roster"]`; `F18` `userData.pageAccess=["all"]`). Decoded
DB-login JWT claim keys: `id, email, role, artistAccess, integrationCount, iat, exp` — `pageAccess` is in the body, not the token
(unchanged). Also captured on the same fresh seed for §6: `GET /v3/label/overview` artist →
`{"monthlyRevenue":8464217,"quarterlyProjection":25392651,"annualProjection":101570604,"activeArtists":1,"topArtists":[{"name":"NOVAKIN","revenue":8464217,"roi":8.7}],"timestamp":"2026-09-17T04:12:30.024Z"}` HTTP 200;
admin → `{"monthlyRevenue":3202870,"quarterlyProjection":134773080,"annualProjection":539092320,"activeArtists":29}`.

**(8) Frontend nav consumes backend `pageAccess`; backend authorization untouched — PASS**

- `web/src/auth/permissions.js` (read in full): `effectivePageAccess(user)` = `user.pageAccess` if array, else `['all']` if
  `role === 'admin'`, else `[]`; `canSee(user, perm)` = `isAdmin || access.includes('all') || access.includes(perm)`. No
  `artist`/`viewer` branch remains. `grep -rn "'artist'\|\"artist\"\|'viewer'\|\"viewer\""` over `web/src` → **no matches**;
  `grep -rn "role ===\|\.role" web/src` outside `permissions.js` → **no matches**. So the only role rule anywhere in `web/src` is
  `isAdmin → all`.
- `web/src/layout/Sidebar.jsx` L5 imports `canSee, isAdmin`; L20 `NAV_PRIMARY.filter((item) => (!item.adminOnly || isAdmin(user)) &&
  canSee(user, item.perm))`. `web/src/layout/nav.js` maps `perm` keys `overview, roster, anr_room, ai_lab, marketing, fans,
  operations, admin` (the last `adminOnly`).
- Gate: `G05` derives the expected artist nav from the served array (`["overview","roster"]` → `[Dashboard, Artists]`); `F10`
  observed `primary=[Dashboard, Artists]` === that derivation; `F07` admin `8 primary`; `F18` reconciled `userData.pageAccess`.
- Backend authorization untouched: `git diff src/routes/auth.js` = +21 / −3, consisting of the `parsePageAccess` function + comment
  (L45-54), the replaced inline parse (L88-89) and the two additive response fields (L111, L201) — no change to `authenticateToken`,
  `hasArtistAccess`, any `role !== 'admin'` guard, JWT claims or status codes. `src/auth/index.js`, `src/routes/*.js` other than
  `auth.js`: **not in the diff**. Live: artist token still gets its own overview only (`activeArtists 1`), `verify` §4 Authorization
  checks pass.

**(9) `/me` 401 still clears auth — PASS**

Backend statuses (fresh server): no bearer → `{"error":"Authentication required"}` **HTTP 401**; garbage bearer
`Authorization: Bearer garbage.token.value` → `{"error":"Invalid or expired token"}` **HTTP 403** (as PHASE_4B_VALIDATION §7 #3
documents — the backend answers 403, not 401, to an invalid token). Frontend logs out on both: `AuthContext.jsx` L43
`if (error.status === 401 || error.status === 403) { logout(); return; }`. Gate ids: `F11` (garbage `authToken` + reload →
`/login`, `authToken=null userData=null`, `backend=[/v3/auth/me:403]`) and `F12` (intercepted 401 → `/login`, keys null) — PASS on
both runs.

**(10) `/me` 404 keeps stored auth — PASS**

Gate `F19` PASS ×2 (`path=/dashboard token-unchanged=true userData-kept=true` with `/v3/auth/me` fulfilled as
`404 {"error":"User not found"}`). `git diff web/src/auth/AuthContext.jsx` read in full: the single behavioural change is L41→L43
(`404` removed from the logout condition, early `return` added); the rest is comment. Live backend evidence of the real 404 case:
override-login token (no `id` claim) → `GET /v3/auth/me` → `{"error":"User not found"}` HTTP 404, while `GET /v3/label/overview`
with the same token → HTTP 200 (§4).

**(11) Corrected portability gate — PASS**

`node web/validation/gate.mjs --static-only`:
```
Phase 4B gate — static checks over /home/dino/pulsegrid-repo/web/src (--static-only: browser checks skipped)
PASS | S01 … | clean over 36 file(s) — allowed boundary: nowhere in generic code — including comments, class names and storage keys — except inside tokens.css /* */ comments (the byte-for-byte contract blocks)
PASS | S02 … | clean over 9 file(s) — allowed boundary: brand/registry.js only (composition root, architecture §14.3)
PASS | S03 … | clean over 48 file(s) — allowed boundary: brand/profiles/pulsegrid/** and tokens.css /* */ comments
PASS | S04 … | clean over 52 file(s) — allowed boundary: brand/profiles/** only (profile contact/email data, architecture §14.2)
PASS | S05 … | clean over 43 file(s) — allowed boundary: styles/tokens.css, styles/global.css, **/chartDefaults.js, brand/themes/**, brand/profiles/**
PASS | S06 … | clean over 52 file(s) — allowed boundary: brand/registry.js only (architecture §14.6: marks and loaders are looked up in the registry, never imported)
PASS | S07 … | clean over 52 file(s) — allowed boundary: layout/nav.js, the `{ id: 'anr', …, icon: 'ri-headphone-line', … }` entry only (architecture §5 A&R Room icon)
PASS | S08 … | clean over 52 file(s) — allowed boundary: nowhere in web/src (artist identities are runtime data — architecture §14.5)
PASS | S09 … | clean over 52 file(s) — allowed boundary: nowhere in web/src (fixtures live in the §15 gate text and web/README.md only — architecture §14.5)
GATE SUMMARY: 9 pass, 0 fail, 9 checks
exit=0
```
(rule names elided with `…` here only; they are printed in full in the item 4 transcript above.)

`node web/validation/static-checks.mjs --self-test`:
```
static-checks self-test — real tree /home/dino/pulsegrid-repo/web/src; synthetic leaks in a temp copy under /tmp
PASS | real-tree | S01 | clean (36 files)
PASS | real-tree | S02 | clean (9 files)
PASS | real-tree | S03 | clean (48 files)
PASS | real-tree | S04 | clean (52 files)
PASS | real-tree | S05 | clean (43 files)
PASS | real-tree | S06 | clean (52 files)
PASS | real-tree | S07 | clean (52 files)
PASS | real-tree | S08 | clean (52 files)
PASS | real-tree | S09 | clean (52 files)
PASS | fake-leak | S01 | components/primitives/StatCard.jsx (+"// leak: this is the pulsegrid console") — identity in a comment in a generic component: FLAGGED at L13
PASS | fake-leak | S01 | styles/tokens.css (+".pulsegrid-console-badge { color: red; }") — identity in a tokens.css SELECTOR (not a comment) — the comment-strip must not hide it: FLAGGED at L157
PASS | fake-leak | S02 | brand/BrandMark.jsx (+"const fallbackSlug = 'pulsegrid';") — profile identity in brand core outside registry.js: FLAGGED at L11
PASS | fake-leak | S03 | layout/Header.jsx (+"const subtitle = 'INTELLIGENCE PLATFORM';") — brand tagline in a platform component: FLAGGED at L36
PASS | fake-leak | S04 | pages/LoginPage/LoginPage.jsx (+"const devLogin = 'admin@pulsegrid.fm';") — label email in generic code (a prefilled login): FLAGGED at L58
PASS | fake-leak | S04 | brand/schema.js (+"export const DEFAULT_SUPPORT = 'admin@pulsegrid.fm';") — label email in brand core (outside profiles/): FLAGGED at L47
PASS | fake-leak | S05 | layout/Sidebar.module.css (+".leak { color: #00FF5F; }") — raw brand hex in a component stylesheet: FLAGGED at L58
PASS | fake-leak | S05 | components/primitives/Panel.jsx (+"const tint = 'rgba(0, 255, 95, 0.1)';") — raw brand rgba in a component: FLAGGED at L5
PASS | fake-leak | S06 | layout/Sidebar.jsx (+"import { PulseMark } from '../brand/profiles/pulsegrid/LegacyHea") — profile component imported outside registry.js: FLAGGED at L65
PASS | fake-leak | S06 | brand/BrandContext.jsx (+"import './themes/pulsegrid-console.css';") — theme imported outside registry.js: FLAGGED at L36
PASS | fake-leak | S07 | layout/Sidebar.jsx (+"const brandGlyph = <i className=\"ri-headphone-line\" />;") — headphone glyph in the sidebar (brand block) instead of BrandMark: FLAGGED at L65
PASS | fake-leak | S07 | layout/nav.js (+"export const NAV_EXTRA = [{ id: 'catalog', label: 'Catalog',") — a disc glyph on a NON-A&R nav entry in nav.js — the allowance is that one entry, not the file: FLAGGED at L18
PASS | fake-leak | S08 | hooks/useApiQuery.js (+"const DEFAULT_ARTIST = 'art_novakin';") — fixture artist id as a default: FLAGGED at L22
PASS | fake-leak | S09 | pages/LoginPage/LoginPage.jsx (+"const devPassword = '<admin-seed-pw>';") — seed password as a dev shortcut: FLAGGED at L58
SELF-TEST SUMMARY: 23 pass, 0 fail, 23 assertions (9 rules × real tree + 14 synthetic leaks); temp copy removed=true
exit=0
```
`ls -d /tmp/brand-static-selftest-*` afterwards → none.

Independent fake-leak probe (this session):
```
$ F=web/src/api/client.js; sha256sum $F → 86370023d006dc7f…; git diff --stat -- $F → (empty)
$ cp $F /tmp/pre4c_probe_client.js.bak; printf '\nexport const PLATFORM_LABEL = %s;\n' "'pulsegrid'" >> $F
$ node web/validation/gate.mjs --static-only
FAIL | S01 label identity in generic runtime code (web/src outside brand/; tokens.css comments stripped) | 1 hit(s): api/client.js:37 export const PLATFORM_LABEL = 'pulsegrid';
GATE SUMMARY: 8 pass, 1 fail, 9 checks
exit=1
$ cp /tmp/pre4c_probe_client.js.bak $F; rm -f /tmp/pre4c_probe_client.js.bak
$ sha256sum $F → 86370023d006dc7f… (identical); git diff --stat -- web/src/api/client.js → (empty)
$ node web/validation/gate.mjs --static-only | tail -1
GATE SUMMARY: 9 pass, 0 fail, 9 checks
exit=0
```

**(12) `cd web && npm audit --omit=dev --audit-level=moderate` — recorded (exit 1, 2 moderate; expected) — see §7 for the verbatim output.** Not fixed, not suppressed.

**(13) No 4C started — PASS**

```
$ ls web/src/pages
DashboardPage
LoginPage
$ git diff --quiet -- web/src/router.jsx && echo "router.jsx: no diff vs HEAD"
router.jsx: no diff vs HEAD
$ git status --short web/src ; git ls-files --others --exclude-standard web/src
 M web/src/auth/AuthContext.jsx
 M web/src/auth/permissions.js
(no untracked files under web/src)
```
`git diff --stat` (§2) lists no new page, route or component; the only `web/src` changes are the two auth files. `web/package.json`
and `web/package-lock.json` are unchanged (no React Router upgrade).

**Teardown:** backend (`npm start`, two boots) and Vite killed via the process tool; `ss -ltnp | grep -E ':3000|:5173'` → nothing;
no `node server.js` / `vite` process; fresh DB `rm -f`'d; operator DB restored by rename — `pulsegrid_v5.sqlite` 167 936 B, mtime
`Sep 16 23:41` (identical to session start); `test.sqlite` 16 384 B untouched; no `*-journal`, `*.probe-backup`, `*.test-backup`,
`*.pre4c-*` files; no `/tmp/brand-static-selftest-*`. Logs left in `/tmp/pre4c_val_*.log` only (outside the repo).

## 9. Remaining known debt (observed or confirmed this session; none fixed here)

1. **Override token has no `id` claim → `/me` 404** — `src/routes/auth.js` L74 `jwt.sign({ email, role: 'admin', artistAccess: 'all',
   integrationCount: 10 }, …)`. Confirmed live this session (§4). Also affects `DELETE /v3/auth/me` (L169-170) and change-password
   (L217). PHASE_4B_STATIC_AUDIT F-10. Decision: record, do not fix, no admin model.
2. **Live `POST /v3/users` drops `pageAccess`** — `src/routes/users.js` L48-88 is the registration Express binds (`routes.test.js`
   L67 pins the shadowing); L53 destructures `email, password, name, role, artistAccess` only, so `User.create` (L65-75) never sets
   `pageAccess` → model default `'["overview"]'`. The later registrations that persist it (L91-108 `pageAccess: pageAccess || []` —
   itself wrong for a STRING column; L148-159) are unreachable. `API_INVENTORY.md` L99 already notes this.
3. **Live `PUT /v3/users/:id` assigns the raw array to a STRING column** — `users.js` L111-127, L122 `if (pageAccess) user.pageAccess =
   pageAccess;` with no `JSON.stringify` and no try/catch; the shadowed L162-179 copy stringifies. Per the backend report, Sequelize
   rejects an array for `DataTypes.STRING` (`string violation`), so the handler's rejected promise surfaces as an unhandled rejection
   caught by the `server.js` guard (not exercised live here). A 4C Admin › Team UI must not rely on this route as-is.
4. **`parsePageAccess` throws on non-JSON column content → 500 on login and (now) `/me`.** Unreachable from seeds and from the live
   create route (#2), but a future writer must store stringified JSON.
5. **Stale PINS test name** — `tests/regression/units.test.js` L140 "PINS: tokens signed by the live login handlers carry no `id`
   claim": the DB login path has carried `id` since Phase 3 (`auth.js` L96 `id: user.id`); only the override path omits it; the test inspects
   hand-signed tokens only and cannot fail.
6. **react-router / react-router-dom 6.30.6 — 2 moderate advisories** (GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg); DEFERRED with
   review trigger (§7). 26 React Router v7 future-flag console warnings per gate run (informational).
7. **`auth.js` header comment L4-8** still describes the pre-Phase-3 CRITICAL-1 behaviour ("an empty JSON body yields an admin
   token") although L64-66 fixes it — comment-only staleness (per backend report; not edited to keep the diff minimal).
8. **`web/src/auth/permissions.js` comment cites `src/routes/auth.js` L66** for the override `pageAccess: ['all']`; after the
   concurrent `parsePageAccess` insertion that line is now L77 (and the `jwt.sign` is L74). Comment-only; the rule it documents is
   correct. Not edited (would require re-running the full gate for a line-number nit).
9. **`tests/snapshots/baseline.json` naming** — a tracked file named `baseline.json`, read by no test, next to the real
   `phase2_baseline.json`, is what produced F-12's confusion. Consider renaming to `phase1_monolith_baseline.json` or documenting it
   in `tests/support/` (repo-owner decision; not done here).
10. **`verify_phase2.js` non-idempotency** re-confirmed (fresh DB 94 208 → 167 936 B after one run; admin `activeArtists` would read
    30 on a second run) — PHASE_3_VALIDATION §7.
11. **`PHASE_4A_HANDOFF.md` §18 L689-equivalent** ("§15 label greps run over ALL of `web/src` outside `brand/`, including comments")
    is now true for every file except `tokens.css` comments (S01); left untouched as historical wording (frontend report §6).
12. **Transitional `userData`** — a `userData` persisted before the backend change carries no `pageAccess`; a non-admin sees only the
    secondary nav until the boot `/me` reconciliation (sub-second with the backend up). Expected, self-healing.

## 10. Verdict

PRE-4C CONTRACT ALIGNMENT: PASS
PAGEACCESS CONTRACT: PASS
AUTH SESSION ERROR HANDLING: PASS
PORTABILITY GATE: PASS
DETERMINISTIC BASELINE STATUS: VERIFIED
REACT ROUTER 7: DEFERRED
PHASE 4C READY: YES

Phase 4C NOT started. Nothing committed — operator review pending.
