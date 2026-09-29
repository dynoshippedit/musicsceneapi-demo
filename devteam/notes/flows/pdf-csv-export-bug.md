# Flow note (BUG) — PDF/CSV exports

Branch `devteam/review-2026-09-29`, read 2026-09-29. Source read-only; this note is BUG-lane only.

## Hop chain

All routes in `src/routes/reports.js` (246 lines), behind the composite `authenticateToken`.

1. `GET /v3/reports/monthly/:artistId/:month` (`reports.js:75-103`)
   - `checkExportAccess` (admin, or artistId within the user's artist access).
   - `reportFilename(artist, month)` — HIGH-6 fix: `safeFilename` + `assertValidMonth`
     (`src/utils/safeFilename.js`); path traversal neutralized here.
     Used for the download header at `reports.js:96`.
   - `artistRepo.findById(artistId)` — DB-first; 404 when null. Created artists resolve
     with the full mock-compatible shape (tier, revenue, listeners) because
     `createArtist` (`src/repositories/artistRepository.js`) stores the complete object
     in the row's `data` JSON column.
   - `generateMonthlyReport(artist, month, { aiInsights })` (`src/reports/monthlyReport.js:44`):
     AI insights strictly opt-in per request; default path invokes no AI.
   - NEW-2 (pdfkit-table `addBackground` positional-args crash) is fixed at the source
     (`monthlyReport.js:158-170`); footer drawn once on the final page.
2. `POST /v3/reports/generate-all` (`reports.js:105-160`) — admin only (inline role check,
   `reports.js:106-108`); `month` from body, validated via `salesService.validMonth` → 400.
   - Per artist: `artistRepo` lookup → `generateMonthlyReport` → `fs.writeFileSync`
     into `path.join(__dirname, 'reports', month)` (`reports.js:119`).
   - **Divergent directory:** `__dirname` is `src/routes`, so files land in
     `src/routes/reports/<YYYY-MM>/`, while the scheduled job
     (`src/jobs/monthlyReportJob.js:42,118`) uses `REPORTS_ROOT = path.join(__dirname,
     '..', '..', 'reports')` → repo-root `reports/<YYYY-MM>/`. Two producers, two
     different "generated reports" directories; the HTTP path additionally writes
     generated artifacts into the **source tree** → **BUG-004 (S3)**.
   - A throw inside `generateMonthlyReport` for one artist is caught per-artist
     (`reports.js:131-143`) and recorded as `failed` — one bad artist does not abort the
     batch. (But see BUG-003: the anti-pattern means a throw never settles the promise
     at all — the batch would hang, not record `failed`.)
3. `GET /v3/exports?format=pdf|csv&artistId=...` (`reports.js:163-246`)
   - `checkExportAccess`; `format` must be `pdf`/`csv` else 400.
   - PDF: `getLabelOverview()` (mock label data) → pdfkit `PDFDocument` piped to `res`;
     `Content-Disposition: attachment; filename="${artistId || 'label_overview'}_${Date.now()}.pdf"`
     (`reports.js:183`) — **`artistId` interpolated RAW from `req.query`, no sanitization**.
     The HIGH-6 `reportFilename` hardening was applied to the monthly-report routes but
     not this legacy endpoint → **BUG-005 (S3)**. (Node rejects header control chars,
     so this is a 500/quoting inconsistency rather than response splitting, but it is
     the exact pattern HIGH-6 fixed elsewhere.)
   - CSV: `flattenData(dataToExport)` (`src/utils/dataShape.js:27-41`; nested objects
     flattened, arrays JSON-stringified) → written to
     `path.join(__dirname, \`temp_${Date.now()}.csv\`)` (`reports.js:221`) → `res.download`
     → `fs.unlinkSync` in the callback (`reports.js:233-243`). Two problems → **BUG-006 (S3)**:
     (a) temp files live in `src/routes/` (source tree), not the OS temp dir;
     (b) `Date.now()`-millisecond names collide under concurrent exports — two simultaneous
     CSV exports can write/read/delete each other's file (one response's `unlinkSync`
     can remove the other's in-flight download).
     The download filename `${artistId || 'label'}_export.csv` (`reports.js:233`) is likewise
     raw `artistId` (same BUG-005 instance).
   - If pdfkit throws mid-stream after headers are sent, the outer `catch` calls
     `res.status(500).json(...)` on an already-piped response → `ERR_HTTP_HEADERS_SENT`
     inside the catch. Latent; needs a `res.headersSent` guard (noted, not separately filed).

## BUG-003 — `generateMonthlyReport` async-executor anti-pattern (`src/reports/monthlyReport.js:45`)

`return new Promise(async (resolve, reject) => { ... })`. Any throw inside the executor
(e.g. `artist.tier.toUpperCase()` on a row whose `data` lacks the mock shape, an
unguarded `artist.revenue` access, a pdfkit-table throw outside the per-chart try/catch)
does **not** reject the constructed promise — it rejects the executor's implicit promise,
which is unhandled. Two consequences at once: (1) `await generateMonthlyReport(...)` in
the route **never settles** — the request hangs until the client gives up, no 500;
(2) Node 22 emits `unhandledRejection` → `server.js:104-107` logs and **shuts the whole
process down**. A single malformed artist row (or a future unguarded field access) in a
report request therefore hangs that request AND kills the server. Currently latent —
`createArtist` stores the full shape, so live artists carry `tier`/`revenue` — but one
unguarded access away from a crash. **Filed as BUG-003 (S2).**
Suggested fix: drop the `new Promise` wrapper (make the function `async` and let throws
reject naturally), or wrap the executor body in try/catch → `reject(err)`.

## Authorization observed

- Monthly report: `checkExportAccess` — admin bypass; non-admin needs the artistId in
  their grant.
- generate-all: admin only (`reports.js:106-108`).
- exports: `checkExportAccess`.

## BUG observations filed

- **BUG-003 (S2)** — async-executor anti-pattern in `generateMonthlyReport`.
- **BUG-004 (S3)** — generate-all writes to `src/routes/reports/<month>`, job uses repo-root `reports/<month>`.
- **BUG-005 (S3)** — raw `artistId` in `Content-Disposition` on `/v3/exports` (HIGH-6 pattern not applied).
- **BUG-006 (S3)** — CSV temp file in source tree with millisecond-collision names.
