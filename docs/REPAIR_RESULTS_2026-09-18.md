# Application repairs — 2026-09-18

Implemented in the working tree after the user's “fix those problems” instruction. No commit or push was made. The earlier review and forensic evidence remain historical records.

## Fixed

| Area | Result |
|---|---|
| Sales schema / RV-001 | Removed startup `sync({alter:true})`. A transactional SQLite migration replaces the broken single-column uniqueness with unique `(artistId, month)`. The migration saves a consistent, private backup before changing a damaged file. Startup refuses to listen when database initialization fails. |
| Artist access / RV-002, RV-003 | AI checks access before cache reads; cached answers include user/grants/context in their key. Sales, royalties, forecasts, entity audit and development enforce artist access. Label aggregates, geography, tours and marketing reads are scoped to accessible artists. |
| Authentication | Database revalidation returns 503 during an outage. ID-less tokens are rejected. Environment-admin login resolves a persisted user ID and cannot promote an existing non-admin account. The browser verifies `/auth/me` before mounting protected pages and offers retry when verification fails. |
| AI truthfulness | Added authenticated provider metadata. An unconfigured/failed provider returns an error, including in development. Legacy analyze now uses the real provider path. Console sends the selected artist, displays unavailable status, and provider state is scoped to the session. |
| A&R Room | Separate persistent room demo, vote and settings tables. Submitting in Room updates Room. Whiteboard and listening URL are editable. Votes/settings/demos survive restarts. Playback controls support direct audio, SoundCloud and Spotify embeds; other links can be opened externally. Scouting remains a separate catalogue and displays fixture provenance. |
| Campaigns / RV-005 | Campaign name and strategy drafts persist and can be reopened after reload. Step 2 shows save failures. Drafts explicitly say that ads/messages have not been sent. |
| Revenue / RV-004 | Actual recorded sales drive dashboard history and KPIs. Forecasts use calendar positions and the requested horizon, including 3- and 13-month histories. Missing months are gaps. Fewer than three recorded months produces no forecast. Individual recorded points remain visible. |
| Graph | Stable labeled artist nodes, search, accessible selection and profile navigation. Only recorded collaborations create edges. A clear empty-relationship message replaces unexplained orbiting dots. Desktop and mobile checks pass. |
| Map | Working OpenStreetMap default with visible attribution and load-failure feedback. One marker represents each mapped region total; randomized listener-like scatter was removed. Dataset coordinates are validated. |
| Other false-success paths | OAuth connect reports unavailable instead of minting mock tokens. Contract generation validates the artist and returns unsupported rather than a nonexistent PDF. Batch reports distinguish complete, partial, failed and empty results. |
| UI state / entity audit | Roster selections reconcile with loaded data. Same-resource refresh preserves form edits; different query/session and failures discard old results. Entity audit renders issues, narrative and schema, and hides prior results after a failed paid refresh. |
| Tests | Snapshot/probe databases now live in temporary directories, never by renaming the operator DB. The original baseline is preserved; `repaired_contracts.json` overrides only reviewed behavior changes. Added persistence, access, cache, forecast, migration, graph and report-failure tests plus an isolated browser workflow runner. |

## Database repair and running app

- Rehearsed on a consistent SQLite copy, then ran the migration twice: first repairs, second is a no-op.
- All original table contents matched before/after by row count and SHA-256 of serialized rows: 29 artists, 2 users, 2 scouting submissions, 0 recorded sales, 0 stats, 0 audit events.
- Stopped the old API before migrating the operator file. A private backup is saved at:
  `/home/dino/pulsegrid-repo/backups/before-sales-repair-1789709474929-b8be77a9-0646-4b11-a95b-124f16a92c7d.sqlite`
- SQLite integrity check passed. The only sales unique index is `(artistId, month)`.
- Restarted the operator API on port 3000 using existing local credentials, with `SCHEDULE_JOBS=false` during verification. Existing UI on `http://127.0.0.1:5173` loads the fixes.
- Startup created the new Room/Campaign tables; all original rows were checked again afterward and remain unchanged. No test sales, demos or campaigns were written to the operator database.
- Repair CLI for an existing SQLite file: `node scripts/repair-sales-schema.js /absolute/path/database.sqlite`. It creates a backup only if repair is necessary.

## Verification

| Gate | Result |
|---|---|
| `npm test` | **150 passed, 0 failed** |
| `npm run verify:hermetic` | **54 passed, 0 failed** |
| `npm --prefix web run build` | Passed; existing Vite bundle-size warning remains |
| Frontend static brand checks | **9 passed, 0 failed** |
| Browser workflow checks | **8 passed**, including demo save/readback and audio playback, campaign failure/reopen, graph interaction, sales writes, mobile overflow and tampered stored session claims |
| Browser page sweep | 12 routes at desktop width; no document overflow or uncaught page exceptions |
| Operator app smoke | Health 200; dashboard, room, intelligence, marketing and AI settings loaded; 29 labeled graph artists; no uncaught page exceptions |

`npm run test:workflows` starts its own API, frontend and disposable database on free local ports, runs Chromium, and removes those processes/data afterward. Results go to ignored `execution-validation/browser-workflows/`. It uses tile/audio fixtures so repeated test runs do not depend on public media servers. The separate live basemap check in `execution-validation/repair-2026-09-18/` successfully loaded actual tiles with attribution. OpenStreetMap's [tile policy](https://operations.osmfoundation.org/policies/tiles/) governs use of the public default; deployment can configure a different tile URL and attribution.

`npm run test:all` combines backend tests, frontend build, brand checks and browser workflows. Each component gate was run successfully; the new combined alias was not rerun redundantly.

Evidence: [database-repair.json](execution-validation/repair-2026-09-18/database-repair.json), [workflow-results.json](execution-validation/repair-2026-09-18/workflow-results.json), [isolated-workflow-results.json](execution-validation/repair-2026-09-18/isolated-workflow-results.json), [operator-smoke.json](execution-validation/repair-2026-09-18/operator-smoke.json), and screenshots beside them.

## Remaining feature gaps and limits

These repairs do not certify the unfinished product features:

- Live OAuth account linking and contract generation remain unimplemented; their API/UI now state that clearly.
- A valid server-side Groq key is required for actual AI answers. Provider configuration is reported separately from successful calls; no paid provider call was exercised.
- Password-reset redemption, a finance UI, monthly/bulk-report UI, operational CRUD and server-side logout revocation remain existing feature work. Forgot Password stays disabled. The legacy forgot-password API must not be enabled in the UI until the redemption/delivery flow exists.
- Operations, scouting and portions of roster/fan/social data are fixtures/reference data. No external identity coverage or provider correctness is certified. Existing empty collaboration data is now explained, not invented.
- `pageAccess` remains navigation visibility by design; backend permission decisions use role and artist access.
- Artist/user whole-record concurrent edits still use last-write-wins behavior. PostgreSQL migration/concurrency behavior was not exercised. Paid-service metering remains incomplete.
- Embedded media availability depends on the supplied URL/provider. The automated playback check uses local audio; third-party account restrictions were not tested.

AI-004 remains retracted: the prior late-rejection crash theory was disproved, and is not claimed as a repair.
