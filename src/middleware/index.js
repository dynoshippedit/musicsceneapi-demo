/**
 * src/middleware/index.js
 *
 * Express middleware stack extracted from production-api.js
 * L240-263 (request pipeline) and L3157-3174 (error + 404 handlers).
 *
 * Order is load-bearing and preserved exactly:
 *   helmet -> compression -> cors -> express.json -> request logger -> rate limit
 *
 * Preserved audit findings (Phase 2):
 *   HIGH-5  cors({ origin: true, credentials: true })      — api L246-249
 *   MED-9   error handler returns err.message to clients    — api L3165
 *   MED-11  express.json() with no size limit (100kb dflt)  — api L250
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Applies the request pipeline to an app, in original order.
 * @param {import('express').Express} app
 * @param {object} deps
 * @param {object} deps.logger
 */
function applyRequestPipeline(app, { logger }) {
    // api L242 — Security headers
    app.use(helmet());

    // api L244 — Gzip compression
    app.use(compression());

    // api L246-249 — CORS.
    // HIGH-5 FIX (Phase 3): the previous config reflected ANY origin
    // (origin: true) with credentials. It now reads ALLOWED_ORIGINS (a
    // comma-separated list) and falls back to a permissive localhost list only
    // in development. Production is locked down; local dev on 8080/3000 and
    // file:// still works.
    app.use(cors(config.cors));

    // Request identity MUST run before express.json(). Body-parser failures
    // skip later middleware and jump to the error handler; without this, those
    // 400s have no X-Request-Id and cannot be correlated (A-REQID).
    app.use((req, res, next) => {
        const upstream = req.headers['x-request-id'];
        const requestId = (typeof upstream === 'string' && /^[A-Za-z0-9_.-]{8,64}$/.test(upstream))
            ? upstream
            : crypto.randomUUID();
        req.requestId = requestId;
        req._startedAt = Date.now();
        res.setHeader('X-Request-Id', requestId);
        next();
    });

    // api L250
    // Stripe webhook signatures are computed over the RAW request body, so the
    // raw bytes are stashed for the billing webhook before JSON parsing
    // consumes the stream. All other routes are unaffected (verify is a no-op
    // for them). MED-11 preserved: still no explicit size limit.
    app.use(express.json({
        verify: (req, _res, buf) => {
            if (req.path === '/v3/billing/webhook') req.rawBody = buf;
        }
    }));

    // api L253-256 — Request logger (with token redaction added in Phase 3).
    app.use((req, res, next) => {
        // Redact any Authorization header and query-string tokens before
        // logging; log only method + clean path + ip.
        const url = req.url.replace(/([?&](token|api_key|apikey|access_token|refresh_token|code|password)=)[^&]*/gi, '$1[REDACTED]');
        logger.info(`${req.method} ${url}`, { ip: req.ip });

        // PHASE 4CF: completion log with post-auth identity. This hook runs on
        // response finish, AFTER route-level authenticateToken has populated
        // req.user — the request log above cannot see the user yet. userId is
        // null for unauthenticated/401 paths, which is correct attribution.
        res.on('finish', () => {
            logger.info('request', {
                requestId: req.requestId,
                userId: req.user?.id ?? null,
                method: req.method,
                path: req.path,
                status: res.statusCode,
                durationMs: Date.now() - (req._startedAt || Date.now())
            });
        });
        next();
    });

    // api L259-263 — Rate limiting on /v3/
    const limiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max
    });
    app.use('/v3/', limiter);
}

/**
 * Applies the terminal error + 404 handlers. MUST be called after all routes.
 * api L3161-3174.
 *
 * MEDIUM-9 FIX (Phase 3): the error handler no longer returns err.message to
 * the client. The full error (with stack) is logged server-side; the client
 * receives a generic body so Sequelize/SDK internals (table names, SQL, Groq
 * metadata) cannot leak.
 * @param {import('express').Express} app
 * @param {object} [deps]
 * @param {object} [deps.logger]
 */
function applyErrorHandlers(app, { logger } = {}) {
    app.use((err, req, res, next) => {
        if (err && err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Malformed JSON body' });
        }
        // Full detail goes to logs only, never to the response.
        (logger || console).error('Unhandled error:', err);
        res.status(500).json({
            error: 'Internal server error'
        });
    });

    // api L3169-3174 — 404 fallthrough
    app.use((req, res) => {
        res.status(404).json({
            error: 'Endpoint not found',
            path: req.path
        });
    });
}

module.exports = { applyRequestPipeline, applyErrorHandlers };
