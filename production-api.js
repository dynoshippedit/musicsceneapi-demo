// production-api.js - application assembler (white-label build).
// Fictional demo label: Pulsegrid. All artist names and figures are invented.
// APPLICATION ASSEMBLER
// ============================================================================
// After Phase 2 this file no longer contains business logic, data access,
// prompts, PDF layout, cron schedules or route handlers. It assembles the
// Express application from the modules under src/ and exposes it for the
// canonical entrypoint (server.js).
//
// Layout of the extracted backend:
//   src/config/        configuration + winston logger
//   src/middleware/    request pipeline and terminal error/404 handlers
//   src/auth/          JWT verification and the authorization helpers
//   src/models/        sequelize instance, User/Artist/Stats, initDB
//   src/repositories/  artist data access, in-memory stores, ops fixtures
//   src/services/      cache, email, entity-audit orchestration
//   src/integrations/  facade over social/metadata providers + rate limiter
//   src/ai/            groq client, prompts, response parsing, ai service
//   src/analytics/     regression and synthetic history
//   src/reports/       monthly PDF report builder
//   src/jobs/          scheduled work (registered by server.js, not here)
//   src/routes/        68 endpoints grouped by domain (incl. Stripe billing)
//   src/utils/         charts and pure data-shaping helpers
//
// BEHAVIOR IS UNCHANGED. Endpoint paths, methods, auth requirements, request
// shapes, response bodies and status codes are identical to the pre-refactor
// application, including the defects catalogued in SECURITY_AUDIT.md. Each
// module header names the specific finding it preserves.

'use strict';

const express = require('express');

const config = require('./src/config');
const logger = require('./src/config/logger');
const { initDB } = require('./src/models');
const { applyRequestPipeline, applyErrorHandlers } = require('./src/middleware');
const artistRepo = require('./src/repositories/artistRepository');
const { registerRoutes } = require('./src/routes');

const app = express();
const PORT = config.port;

// ---------------------------------------------------------------------------
// 1. Middleware pipeline.
//    Order is load-bearing: helmet -> compression -> cors -> json ->
//    request logger -> rate limiter. See src/middleware/index.js.
// ---------------------------------------------------------------------------
applyRequestPipeline(app, { logger });

// ---------------------------------------------------------------------------
// 2. Routes.
//    Registration order is part of the contract — five duplicate routes are
//    shadowed and unreachable, and the winner depends on order. See the long
//    note in src/routes/index.js.
// ---------------------------------------------------------------------------
registerRoutes(app);

// ---------------------------------------------------------------------------
// 3. Terminal handlers. MUST come after all routes.
//    PRESERVED (audit MEDIUM-9): the error handler returns err.message to the
//    client, which can leak Sequelize/SDK internals.
// ---------------------------------------------------------------------------
applyErrorHandlers(app);

// ---------------------------------------------------------------------------
// 4. Database initialization.
//    Exposed rather than executed: server.js awaits this BEFORE binding the
//    listener. The original called initDB() at module scope and bound the
//    listener immediately, which made seeded logins fail on a cold database
//    (measured: 1 of 6 cold starts returned 401 for admin@pulsegrid.fm).
// ---------------------------------------------------------------------------
function initializeDatabase() {
    // DEMO_MODE (2026-09-28, audit gap 2): fictional demo seeding is opt-in.
    // Customer boots (DEMO_MODE unset) get an empty database.
    return initDB({ logger, labelData: artistRepo.labelData, demoMode: config.demoMode });
}

module.exports = app;
module.exports.app = app;
module.exports.initializeDatabase = initializeDatabase;
module.exports.PORT = PORT;
