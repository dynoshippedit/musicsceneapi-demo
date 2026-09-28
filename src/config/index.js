/**
 * src/config/index.js
 *
 * Canonical configuration surface. Single place where process.env is read.
 *
 * PHASE 1 CONSTRAINT: this module preserves EXISTING behavior exactly, including
 * behavior the audit flagged as insecure. Defaults below are reproduced verbatim
 * from production-api.js so that no endpoint response changes.
 *
 * Audit findings intentionally NOT fixed here (deferred to Phase 2, pinned by
 * tests/regression/*.test.js so a future fix cannot land silently):
 *   - CRITICAL-1 adminEmail/adminPass are undefined when unset (api L482)
 *   - CRITICAL-2 jwtSecret falls back to a hardcoded literal (api L411)
 *   - HIGH-5     cors origin: true (api L246)
 */

'use strict';

require('dotenv').config();

// PHASE 4CF: the Label Intelligence Profile is data-only (dotenv + datasets,
// no app modules), so this edge is acyclic; db.storage defaults to the active
// profile's sqlite file when DB_STORAGE is unset.
const profile = require('../profile');

const env = process.env.NODE_ENV || 'development';

/**
 * HIGH-5 FIX (Phase 3): build a CORS origin policy instead of reflecting any
 * origin. Reads ALLOWED_ORIGINS (comma-separated); in development falls back to
 * a permissive localhost/file allowlist so the static frontends on :8080 keep
 * working. In production an absent ALLOWED_ORIGINS disables cross-origin access.
 */
function buildCorsConfig() {
    const allowed = (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (allowed.length > 0) {
        return {
            origin: allowed,
            credentials: true
        };
    }

    if (env !== 'production') {
        // Development fallback: allow localhost on any port and file:// origin
        // (the legacy static frontends load from file://).
        return {
            origin: (origin, cb) => {
                if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                    return cb(null, true);
                }
                return cb(null, false);
            },
            credentials: true
        };
    }

    // Production with no explicit allowlist: block cross-origin by default.
    return { origin: false, credentials: false };
}

const config = {
    env,
    isProduction: env === 'production',
    isDevelopment: env !== 'production',

    // api L238
    port: process.env.PORT || 3000,

    // CRITICAL-2 FIX (Phase 3): no fallback secret. jwtSecret is read from the
    // environment only; absence is caught by assertSecrets() at startup so a
    // missing secret fails loudly instead of silently using a public literal.
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: '24h',

    // api L482 — PRESERVED VERBATIM (CRITICAL-1). Both undefined when unset,
    // which makes an empty login body match. Pinned by regression test.
    adminEmail: process.env.ADMIN_EMAIL,
    adminPass: process.env.ADMIN_PASS,

    // api L128-142
    db: {
        dialect: process.env.DB_DIALECT || 'sqlite',
        // PHASE 4CF: storage was a hardcoded literal. DB_STORAGE env now
        // selects the file, defaulting to the active Label Intelligence
        // Profile's sqliteFile ('pulsegrid_v5.sqlite') — the
        // dedicated-instance deployment seam: each label instance points
        // at its own database without a source edit.
        storage: process.env.DB_STORAGE || profile.db.sqliteFile,
        url: process.env.DATABASE_URL,
        logging: false
    },

    // api L280
    useRealData: process.env.USE_REAL_DATA === 'true',

    // api L24
    groqApiKey: process.env.GROQ_API_KEY,
    // GROQ_MODEL env override (added Phase 3). Default is a model currently
    // available on Groq; the previous default (llama-3.1-8b-instant) was
    // retired and returned 404 model_not_found.
    groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',

    // api L25
    cache: { stdTTL: 3600, checkperiod: 600 },

    // api L259-263
    rateLimit: { windowMs: 60 * 60 * 1000, max: 1000 },

    // HIGH-5 FIX (Phase 3): CORS is configured from ALLOWED_ORIGINS when set,
    // or a permissive development allowlist when not. Production requires an
    // explicit ALLOWED_ORIGINS (empty in production -> no cross-origin access).
    cors: buildCorsConfig(),

    // api L530-549
    email: {
        enabled: !!(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY),
        host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
        port: process.env.SMTP_PORT || 587,
        user: process.env.SMTP_USER || 'apikey',
        pass: process.env.SMTP_PASS || process.env.SENDGRID_API_KEY,
        // PHASE 4CF: the brand default ('"pulsegrid OS" <notify@pulsegrid.fm>')
        // moved to the Label Intelligence Profile (profile.email.from);
        // the operative default is resolved by the email service.
        from: process.env.EMAIL_FROM || '',
        // api L583 — hardcoded localhost preserved; Phase 2 concern.
        resetLinkBase: process.env.RESET_LINK_BASE || 'http://localhost:5173/reset-password'
    },

    // api L2493
    autoPrint: process.env.AUTO_PRINT === 'true',

    // api L226-227
    logging: {
        level: 'info',
        errorFile: 'logs/error.log',
        combinedFile: 'logs/combined.log'
    }
};

/**
 * Startup secret validation.
 *
 * CRITICAL-2 FIX (Phase 3): JWT_SECRET is now REQUIRED in every environment.
 * The previous code only checked it when NODE_ENV === 'production' AND silently
 * fell back to a public literal otherwise. Now a missing/empty secret fails
 * fast regardless of environment, so no process ever signs tokens with a
 * publicly-known key.
 *
 * Called explicitly by the entrypoint so that require()ing the app in a test
 * never terminates the test process. Tests must set JWT_SECRET themselves
 * (the suite's global setup and the probe harness both do).
 */
function assertSecrets() {
    // JWT_SECRET is required in EVERY environment (option (b), Phase 3 sign-off).
    // No hardcoded fallback, no ephemeral generated dev secret: fail fast so no
    // process ever signs tokens with a missing or publicly-known key.
    if (!config.jwtSecret) {
        console.error('CRITICAL: JWT_SECRET is required in every environment.');
        console.error('Set it in the environment (see .env.example).');
        process.exit(1);
    }
    if (config.jwtSecret.length < 16) {
        console.error('CRITICAL: JWT_SECRET is too short (min 16 chars).');
        process.exit(1);
    }
}

// Backwards-compatible alias retained so existing call sites still resolve.
const assertProductionSecrets = assertSecrets;

module.exports = config;
module.exports.assertSecrets = assertSecrets;
module.exports.assertProductionSecrets = assertProductionSecrets;
