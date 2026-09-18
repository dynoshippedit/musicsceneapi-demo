#!/usr/bin/env node
/**
 * server.js — CANONICAL APPLICATION ENTRYPOINT
 *
 * Resolves the audit's R1 finding: package.json declared
 * `"main": "server.js"` / `"start": "node server.js"` but no such file
 * existed, so `npm start` failed with MODULE_NOT_FOUND (verified EXIT: 1).
 *
 * This file is intentionally thin. It owns exactly three things:
 *   1. the production secret guard  (was api L215-218)
 *   2. database initialization      (was api L212, called before its deps existed)
 *   3. binding the HTTP listener    (was api L3180-3205)
 *
 * The Express app itself still lives in mau5trap-production-api.js, which is
 * now a pure module (`module.exports = app`) and binds no port. That keeps
 * Phase 1 a move, not a rewrite.
 *
 * Boot order here is explicit and deliberate: the secret guard runs BEFORE any
 * database work. The original dispatched initDB() at L212 and only checked
 * JWT_SECRET at L215, so a misconfigured production process opened a DB
 * connection before failing its own security precondition.
 */

'use strict';

const config = require('./src/config');

// 1. Environment validation — must precede all side effects.
// CRITICAL-2: JWT_SECRET is now required in every environment (no fallback).
config.assertSecrets();

const logger = require('./src/config/logger');
const profile = require('./src/profile');
const api = require('./mau5trap-production-api');
const { registerJobs } = require('./src/jobs');

const app = api.app || api;
const PORT = config.port;

async function start() {
    // 2. Database init + seeding. The original swallowed errors and continued
    //    serving; that behavior is preserved (initDB resolves false on failure).
    try {
        const ok = await api.initializeDatabase();
        if (!ok) {
            logger.error('Database initialization reported failure; continuing to serve.');
        }
    } catch (err) {
        // Defensive: initDB already catches internally.
        logger.error('Unexpected database initialization error; continuing to serve.', err);
    }

    // 2b. Scheduled jobs. PHASE 2: previously registered as a side effect of
    //     requiring the API module; now explicit so tests can require the app
    //     without starting timers. Disable with SCHEDULE_JOBS=false.
    registerJobs({ enabled: process.env.SCHEDULE_JOBS !== 'false' });

    // 3. Bind listener. Banner text sourced from the active Label Intelligence
    //    Profile (PHASE 4CF); mau5trap values are verbatim, minus the stale
    //    joel@deadmau5.com line (that account was never seeded — see the 4CF
    //    phase doc). Account lines derive from profile.seedUsers. Box lines
    //    are padded programmatically so the box stays rectangular for any
    //    profile (the original byte-counted padding was ragged on two lines).
    const server = app.listen(PORT, () => {
        const BOX_INNER = 61; // border line is 63 chars: two corners + 61 '═'
        const boxLine = (text) => `║   ${String(text).slice(0, BOX_INNER - 3).padEnd(BOX_INNER - 3)}║`;
        const seedLines = profile.seedUsers
            .map((s) => `- ${s.email} (${s.password}) - ${s.bannerLabel}`)
            .join('\n');
        const bannerTop = '═'.repeat(BOX_INNER);
        console.log(`
╔${bannerTop}╗
${boxLine('')}
${boxLine(profile.identity.bannerTitle)}
${boxLine(profile.identity.bannerSubtitle)}
${boxLine('')}
${boxLine(`Server: http://localhost:${PORT}`)}
${boxLine(`Environment: ${config.env}`)}
${boxLine('')}
${boxLine('Features:')}
${profile.identity.bannerFeatures.map((f) => boxLine(`✓ ${f}`)).join('\n')}
${boxLine('')}
╚${bannerTop}╝

Default Users:
${seedLines}

⚠️  CHANGE DEFAULT PASSWORDS IMMEDIATELY!
    `);
    });

    const shutdown = (signal) => {
        logger.info(`Received ${signal}, closing server.`);
        server.close(() => process.exit(0));
        // Do not hang forever on lingering keep-alive sockets.
        setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // ==========================================================================
    // NEW-2 defense-in-depth — controlled failure, not silent continuation
    // ==========================================================================
    // NEW-2 is fixed at the source (src/reports/monthlyReport.js), but the
    // right general posture for Node 22 (which treats unhandled rejections as
    // fatal) is to log the full error and shut down cleanly rather than crash
    // with a bare stack, or worse, keep serving with corrupted state.
    //
    // This only fires for errors that escaped EVERY route/service boundary;
    // it is a backstop, not the fix. Route-level async errors are still handled
    // at their own try/catch boundary.
    process.on('unhandledRejection', (reason) => {
        logger.error('[unhandledRejection] an async error escaped all handlers; shutting down.', reason);
        shutdown('unhandledRejection');
    });
    process.on('uncaughtException', (err) => {
        logger.error('[uncaughtException] process state may be inconsistent; shutting down.', err);
        shutdown('uncaughtException');
    });

    return server;
}

if (require.main === module) {
    start();
}

module.exports = { app, start };
