# ARC reading notes — 2026-09-29 (Phase 2)

Evidence backing findings/arc.md. All paths relative to /home/dino/mau5trap-repo,
branch devteam/review-2026-09-29. Source read-only; only devteam/ was written.

## Files read (as-is)
- devteam/PLAYBOOK.md (B9.3 role card), devteam/MAP.md (full), devteam/STATUS.md, devteam/DECISIONS.md
- server.js — canonical entrypoint: assertSecrets → initializeDatabase (refuses to listen on failure) → registerJobs → listen; graceful shutdown + unhandledRejection/uncaughtException backstop
- production-api.js — pure assembler: applyRequestPipeline → registerRoutes (DOMAIN_ORDER) → applyErrorHandlers; exports app, initializeDatabase, PORT; binds no port
- src/routes/index.js — DOMAIN_ORDER (20 entries: auth..sync); registerRoutes(app, ctx=buildContext()); five shadowed duplicate registrations documented as order-contract
- src/routes/context.js (204 lines) — buildContext(): config, logger, profile, JWT_SECRET (=config.jwtSecret, confirmed via reversed-line read), bcrypt, jsonwebtoken, fs, path, all 31 models, auth helpers (composite authenticateToken with per-request DB revalidation: row/active/sessionVersion → 401/503), services, repos, in-memory stores, aiService, regression, integrationFacade, rateLimiter, generateMonthlyReport, validateBody
- src/middleware/index.js — helmet→compression→cors(ALLOWED_ORIGINS)→request-id→express.json(raw-body stash for /v3/billing/webhook)→request logger (token redaction)+completion log→rate limit on /v3/; terminal: 400 malformed JSON, generic 500 (no err.message leak), 404
- src/config/index.js — single env surface (~50 vars); assertSecrets fail-closed; profile required for db.storage default; stragglers reading process.env directly: PROVIDER_SYNC_ENABLED (src/jobs/index.js), SCHEDULE_JOBS (server.js)
- src/models/index.js — 31 sequelize.define models (761 lines); initDB({logger,labelData,demoMode}): explicit migrations (repairSalesSchema w/ VACUUM INTO backup mode 0600, addUserSecurityColumns, addRoyaltyDedupColumns, addMonthlyCloseColumns) then sequelize.sync(); demoMode gates fictional seeding
- src/jobs/index.js — explicit registry; monthlyReportJob '0 3 1 * *' always; providerSync '0 4 * * *' only when PROVIDER_SYNC_ENABLED=true; sync/masterLoop.js deliberately unregistered (MAP-002)
- src/profile/index.js — resolves LABEL_PROFILE/LABEL_SLUG/ACTIVE_LABEL → labels/<slug>.js, sanitized, fallback pulsegrid; data-only rule (no config/logger/models/services/routes requires) verified holding (grep hits were comment text only)
- src/repositories/artistRepository.js — DB-first with labelData in-process mirror; PRESERVED DEFECTS documented: hybrid union, mutable shared labelData, in-place sort pinned by tests, no FK Stats.artistId; demoMemoryAllowed() gate
- src/repositories/inMemoryStores.js — six process-memory stores; header: lost on restart, not shared between PM2 workers; split-brain A&R documented (anrSubmissions scalar votes vs anrState ratings[])
- src/services/cacheService.js — single NodeCache owner, byte-identical key strings, createCacheService() for test injection
- src/routes/royalties.js — header documents statement identity (SHA-256, supersede chain), row-content-hash dedup, review states, field-mapping history; 1076 lines; 8 registrations incl. PATCH review transitions via listRecords/reviewTransition factories
- src/routes/directsales.js — 712 lines; /v3/financials/reconciliation + /v3/financials/export live here (not in finance domain)
- src/routes/catalog.js — hand-rolled validators (validateRecording/validateRelease return strings); requires services/catalogIntegrityService
- src/validation/index.js — zod schemas: login, forgotPassword, createUser, aiQuery; validateBody middleware
- web/src/main.jsx, web/src/api/client.js — BrandProvider→AuthProvider→App; apiFetch/readJson/ApiError; 401 → onUnauthorized

## Measurements
- Route registrations across src/routes/*.js: 118 (app.get/post/put/delete/patch)
- Error-shape histogram: 400 {error} ×89, 500 {error} ×87, 403 {error} ×74, 404 {error} ×45, 401 ×18, 503 ×17, 409 ×11, 502 ×3, 501 ×2; no {error} on 200
- validateBody usage: ai.js ×3, users.js ×2, 0 elsewhere (20 domains)
- Cross-route requires: anr.js:252 → ./anrRoom (only one); royalties.js:82 → ./catalog
- No route/repo/service file requires src/routes/* or context.js from outside routes/ (DAG holds)

## Not verified by ARC (other lanes)
- docs/openapi.json sync vs the 22 domains (DOC claims audit)
- ecosystem.config.js currency (BLD)
- Load behavior of monthlyReportJob on the event loop (PRF)
- Which tests/snapshots/*.json baseline is authoritative (TST; MAP-006)
- Whether 118 registrations vs the "68 endpoints" comment in production-api.js is drift (minor doc drift, noted not filed)
