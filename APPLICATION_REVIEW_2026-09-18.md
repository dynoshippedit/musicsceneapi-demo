Application review, 2026-09-18 — repository `/home/dino/pulsegrid-repo`, commit `9101746`.

**Subsequent repair pass:** See [REPAIR_RESULTS_2026-09-18.md](REPAIR_RESULTS_2026-09-18.md) for implemented changes, migration/backup evidence and remaining gaps. This review is retained as the original findings.


The application is partially connected and is not ready to be treated as a reliable operational system. Its pages render and its existing backend tests pass, but ordinary workflows still fail, some successful responses represent simulated work, and several endpoints bypass artist access restrictions. This review verifies the existing handoff and adds reproducible findings; it does not claim that repairs have been completed.

Read this alongside [ERROR_LEDGER.md](ERROR_LEDGER.md), [FULL_SYSTEM_FORENSIC_AUDIT.md](FULL_SYSTEM_FORENSIC_AUDIT.md), and [API_CONNECTION_MATRIX.md](API_CONNECTION_MATRIX.md). The corrections below supersede conflicting conclusions in those documents. No application source or operator data was changed by this review.

**The most urgent newly confirmed defect is already present in the operator database.** Startup's `sequelize.sync({ alter: true })` changes the sales table's intended unique pair `(artistId, month)` into additional individual uniqueness constraints on both columns. After that, a second month for the same artist fails; a different artist in an already used month also fails. The existing 143-test suite does not catch this.

| Priority | Finding | Evidence and practical effect |
|---|---|---|
| P1 | RV-001: sales schema changes incorrectly on restart | Reproduced with the actual Sequelize models; read-only inspection confirms the same invalid constraints in the operator database. Ordinary sales writes return 500. |
| P1 | RV-002: AI cache bypasses artist authorization | An injected-provider test warms the cache as admin, then retrieves the same private revenue context as an account authorized for another artist. |
| P1 | RV-003: artist restrictions are missing from additional APIs | The NOVAKIN account receives 403 for lumenveil's artist record but 200 with lumenveil's royalty amounts from the royalty endpoint. |
| P1 | AUTH-002: authentication proceeds after database revalidation fails | Injected database failure still calls the protected handler with the JWT's existing admin claims. |
| P1 | API-003 / CRUD-001: A&R room workflow and persistence are incomplete | A browser submission appears in Scouting, not in the room queue. Room demos, ratings, board and listening state remain in memory. |
| P1 | AI-001 / API-005: simulated success is shown as a working service | No AI key produces a fabricated recommendation and a READY chip; integration connect marks a mock token as connected. |
| P2 | RV-004: forecasts assume exactly twelve historical months | Three months of 100, 200, 300 project 1300 instead of 400. Labels and data lengths disagree. |
| P2 | GRAPH-001/002, VIS-001: graph and map are not usable as presented | Graph has 29 anonymous nodes, no relationships, no artist links; map has repeated API KEY REQUIRED watermarks. |
| P2 | RV-005: campaign failures disappear | A 503 during Generate Plan leaves the user on step 2 with no error message or alert. |

**RV-001 — sales schema and restart safety.** See [model definition](src/models/index.js#L96) and [startup schema alteration](src/models/index.js#L137). A new table initially allows multiple months per artist and multiple artists per month. Running the same schema alteration again produces:

```sql
CREATE TABLE SalesEntries (
  id INTEGER PRIMARY KEY,
  artistId VARCHAR(255) NOT NULL UNIQUE,
  month VARCHAR(255) NOT NULL UNIQUE,
  revenue FLOAT NOT NULL
);
```

The composite unique index also remains, but it cannot cancel these stricter constraints. In the disposable API, January saved and February for the same artist returned `500 Failed to persist sale`; the server recorded `SequelizeUniqueConstraintError` on `artistId`. A separate in-memory model reproduction also rejected another artist in January, on `month`. Read-only schema inspection of `pulsegrid_v5.sqlite` found both individual constraints already installed.

Repair requires an explicit migration that preserves rows and restores only the composite uniqueness rule, plus removal of automatic production schema alteration. Back up and rehearse that migration on a copy of the actual database. Acceptance must include two artists in the same month and two months for the same artist, both before and after restart. The current durability test only verifies an existing saved record after restart, so it misses newly broken writes. This review did not run a migration on the operator database.

**RV-002 — cached AI answers can disclose an unauthorized artist's context.** [aiService.js](src/ai/aiService.js#L60) returns a cache hit before checking artist access. Its cache key contains the prompt and artist ID, without the requesting user's access scope. The reproduction uses the real service and key builder with an injected provider: an admin's answer includes private revenue `$123456`; the restricted account receives that same answer with `kind: cached`. Only one repository read occurs, proving the second call skips the access check. This also applies after access is revoked while an answer remains cached.

Check artist authorization before every cache lookup and before provider work. Return an explicit denial for unauthorized artist IDs. Cache invalidation and keys must respect any user-specific context. Fixing the frontend to send `artistId` should happen together with this authorization repair.

**RV-003 — direct APIs bypass artist restrictions.** With `tours@novakin.band`, both `GET /v3/artists/art_lumenveil` and its monthly-sales endpoint return 403. However, `POST /v3/royalties/calculate` with the same artist ID returns 200, including streaming, touring, merchandise, total revenue and payouts. [finance.js](src/routes/finance.js#L39) performs authentication but never calls `hasArtistAccess`.

The same account receives lumenveil's development response, all-label campaign statistics, and other artists' fan-growth information. The projections handler also lacks an artist access check by source inspection; the prior entity-audit finding remains valid. Decide which aggregate views are intentionally shared and apply consistent artist scoping to the rest. The protected artist detail page cannot serve as the authorization boundary for separate API requests.

**AUTH-002 — database errors leave token permissions in effect.** In [context.js](src/routes/context.js#L82), the database lookup catch logs the failure and calls `next()`. The reproduction confirms that protected work proceeds after a failed revalidation. Return a temporary service error when permissions cannot be checked. `/health` is unprotected, so denying protected work does not require denying health checks.

**A&R — submission, listening and persistence remain incomplete.** The browser's Submit Demo request writes `/v3/anr/submissions`; a subsequent room read from `/v3/anr/state` does not contain the track. Scouting and SQLite do contain it. The form does display a SCOUTING note, so the transfer is partially disclosed, but the room still has no connected submission workflow. [AnrRoomView.jsx](web/src/pages/AnrPage/AnrRoomView.jsx#L136) explicitly preserves this mismatch.

Room votes work during the process lifetime: the browser changed one demo from `0/2` to `1/2`. Those ratings, demos, whiteboard and listening state remain in `anrState`, with no database model. Whiteboard and listening have backend writes but no React editor; the player is absent. Persist the room model independently, then wire the intended controls to that model. Keep Room and Scouting distinct unless the product explicitly chooses to merge them.

**AI and simulated service results.** The browser sends only `{prompt}` even when the prompt names an artist. `GET /v3/ai/providers` returns 404. With an empty Groq key in development, the console prints `[Dev Fallback] Growth is stable at 2.5%...` as a successful answer, while the chip reads SYSTEM DEFAULT · READY. The legacy analyze endpoint is keyword matching with a fixed confidence, rather than a model call. Provider state should describe whether the server can actually call the configured provider; missing credentials and provider failures must be visible as unavailable or failed.

Other truthfulness problems remain:

| Feature | Observed behavior | Required outcome |
|---|---|---|
| Integrations | Connect returns a mock success; status reports Spotify connected without OAuth. State is in memory. | Implement real authentication and stored connection state, or expose the action as a simulation. |
| Campaigns | POST returns `status: created` and a generated ID, with no persistent campaign. GET campaign list is absent. | Save a retrievable campaign/plan, or describe the response as an unsaved preview. |
| Rights | Unknown artist receives `success: true` and a fabricated PDF download path. | Validate the artist and return an actual generated artifact, or an explicit unsupported response. |
| Generate all reports | Injecting failure for every file write still yields HTTP 200, “Reports generated successfully”, count 0. | Return failed/partial status with per-artist outcomes and actual successful file counts. |
| Scouting | Search is a fixture with artificial latency. | Mark fixture data clearly or connect a real search implementation. |
| Operations and fans | Display profile fixtures; operational mutations are absent. | Keep provenance visible and define which operations are expected to work. |

The marketing UI already says GENERATE PLAN and marks its result PROTOTYPE. The prior audit's “launch” wording overstates that UI claim. The API's `created` status and generated ID still imply persistence it does not provide.

**RV-004 — revenue chart calculations and provenance.** [analytics.js](src/routes/analytics.js#L186) always predicts from index `12 + i`, always creates twelve historical labels, and always anchors the future series at `historyValues[11]`. The stored sales series can have any length once at least three records exist. With three values of 100, 200, 300, the next value should be 400 but the handler returns 1300, with a null anchor and inconsistent array lengths. With thirteen months, the first future value repeats month thirteen instead of predicting month fourteen. The twelve-month case works.

Use the actual history length and recorded calendar months for labels, fit positions, forecast start and anchor. Define how missing months are handled. The label-wide dashboard currently generates random synthetic history from roster revenue instead of aggregating SalesEntry records, so recording a sale cannot make that chart accurately reflect saved sales. The monthly KPI also uses a fixture total, while quarterly and annual totals are calculated from a different roster aggregate. Users need coherent periods, shared revenue definitions and visible provenance.

The attempted live three-month forecast check stopped at the second write because of RV-001. Forecast arithmetic was independently reproduced through the actual route handler with injected sales rows; the stopped live check is not counted as a passing forecast test.

**Visual windows.** The [Intelligence screenshot](execution-validation/review-2026-09-18/_intelligence.png) shows what the browser actually rendered: 29 orbiting dots, without names, hover details, navigation or edges. Every roster artist has an empty collaborations array. The graph correctly avoids inventing relationships, but provides no useful explanation of the missing data. The renderer's orbit is based on array position, not a relationship layout. Add names and accessible selection/navigation, a clear no-relationships state, and a stable layout. Real relationship data is required before a network can be shown meaningfully.

The [dashboard screenshot](execution-validation/review-2026-09-18/_dashboard.png) shows repeated API KEY REQUIRED messages in map tiles. The default tile service configuration is incomplete. The map also scatters markers randomly around region centers; those dots are not individual observed listeners. Configure a working basemap and describe aggregate locations accurately. At widths 1440, 1024 and 390, the graph did not cause horizontal document overflow; its main failure is meaning and interaction, rather than container width.

**RV-005 — marketing error feedback.** [MarketingPage.jsx](web/src/pages/MarketingPage/MarketingPage.jsx#L59) stores `planError` on failure, but renders it only inside step 3. The failure leaves the wizard on step 2. The browser test injected a 503 response and found no error text and zero alerts; [screenshot](execution-validation/review-2026-09-18/marketing-failure.png). Render the error where Generate Plan is available. The name entered at step 1 is also omitted from the API request and result, so it currently has no effect on the generated plan.

The remaining inherited gaps are still relevant, with the following limits:

| Area | Review conclusion |
|---|---|
| Startup and data integrity | Database initialization failure is swallowed and startup continues. `/health` reports operational without a database readiness check. Automatic schema alteration is now demonstrated to be unsafe for SalesEntry. |
| Concurrency | Sales use find-then-create; artist/user updates overwrite whole records without conflict checks. Existing SQLite submission-vote concurrency tests pass. PostgreSQL concurrency was not validated. |
| Authentication lifecycle | Environment-admin login still omits a database user ID. Password-reset redemption is absent and Forgot Password is disabled. Logout clears client state; it does not revoke an already issued JWT. |
| Entity audit | The backend returns issues, AI analysis and schema data that the React tab does not render. The browser rendered platform statuses, including unconfigured providers; no paid refresh was tested. |
| Frontend state | Provider metadata is cached outside React without session identity. Sales/marketing selections are not reconciled with roster changes. These remain source findings, not newly reproduced race conditions. |
| Product completeness | A&R playback, finance UI, and bulk/monthly-report UI remain absent. Operations is a fixture viewer. These are missing functionality, not proof that the routes which do exist crash. |
| External providers | Social data defaults to mock; only two artists have external identity mappings. Live OAuth, real AI output, and paid upstream correctness are unverified. |
| Tests | Backend snapshots preserve several historical behaviors, including unsupported routes and mock results. Browser gates chiefly check rendering and brand rules, not completed business workflows. |

**Corrections to the earlier audit.** AI-004's specific claim that the losing promise in `Promise.race` causes an unhandled rejection is incorrect for this implementation. The test forces a timeout, then rejects the transport later: `AiTimeoutError` is caught, the late rejection occurs, the unhandled-rejection list stays empty, and the process survives. `Promise.race` observes rejections of all its input promises. Cancellation of outstanding work can still be improved, but this is not evidence of a process-death blocker. Do not add a redundant catch and describe it as fixing a reproduced crash.

`pageAccess` is explicitly a navigation-visibility setting in the current design. Its absence from backend authorization is not sufficient evidence of a defect by itself. The missing artist access checks demonstrated above are actual authorization defects. Changing page visibility into a permission system requires a clear product decision and consistent enforcement, rather than treating that decision as already made.

An injected rejection in the rights-handler probe shows a missing handler boundary, but the real artist repository normally catches database lookup errors. That probe alone does not prove a live database-outage crash. No new live process crash is claimed in this report.

**Validation performed.** Chromium login and a crawl covered 13 primary application routes, all nine artist-detail tabs, and four restricted-account routes. There were no uncaught page exceptions in either crawl. The main desktop pages had no document overflow or broken image elements. Artist pagination preserved the selected revenue tab; authorized artist pages loaded and forbidden artist/admin pages showed access denied. A sale entered in the UI was read back from disposable SQLite as `art_echoharbor / 2026-09 / 125`; the submission was also read back from the separate Scouting table.

The complete existing backend suite passed **143/143** in a temporary `git archive HEAD` copy with the installed dependencies. It was deliberately run there because `snapshot.test.js` renames and replaces the database under its project root. Running unit tests from the original working directory also exposed an environment-sensitive assertion: an empty admin override value fails a test that expects `undefined`; isolated execution passes. Frontend `npm run build` passed, with its existing bundle-size warning.

Evidence and repeatable review scripts:

- [Browser and API evidence](execution-validation/review-2026-09-18/browser-api-evidence.json)
- [Focused browser evidence](execution-validation/review-2026-09-18/focused-evidence.json)
- [Injected source-probe evidence](execution-validation/review-2026-09-18/source-evidence.json)
- [Browser harness](execution-validation/review-2026-09-18/review.mjs), including `--focused`
- [Source probes](execution-validation/review-2026-09-18/source-probes.cjs)
- [Environment, checks and database fingerprint](execution-validation/review-2026-09-18/verification.json)

The first browser harness used the wrong button name for the marketing check; that harness error is retained, and the focused run correctly tests GENERATE PLAN. Findings distinguish live observations from injected/source checks. This review is not an exhaustive security test, PostgreSQL certification or live-provider acceptance test.

**Recommended repair order:** first fix sales migrations and artist authorization, including AI cache access and auth revalidation. Next make AI/integration/report outcomes truthful and complete the persistent A&R room workflow. Then repair forecasts, campaign feedback, graph interaction and map configuration. Add workflow checks that verify saved data after restart, restricted access to every related endpoint, and visible error states before accepting the old completion claims.

The operator database SHA-256 was identical before and after this review: `a71f9ec104d5bbcf66a471dbd03a1dac477403aac86aa2cf592c9f5a93aa919a`. All application writes used `/tmp/legacy-review-20260918-Dhbr1Q/review.sqlite` on API port 4011; the browser used frontend port 4174. No production migration, commit or push was performed.
