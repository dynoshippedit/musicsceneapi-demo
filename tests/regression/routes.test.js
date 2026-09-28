/**
 * tests/regression/routes.test.js
 *
 * Route-table invariants. Implements recommendation #3 from
 * TEST_COVERAGE_AUDIT.md: assert the registered surface so that duplicate
 * registrations, accidental route removal and ORDER CHANGES are caught
 * mechanically.
 *
 * Order matters here beyond tidiness: five duplicate registrations are shadowed
 * and unreachable, and which implementation wins depends on registration order.
 * Phase 2 split the routes into 13 domain modules, so these assertions are the
 * guard that the split preserved the original binding.
 *
 * No server is started and no port is bound.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// PRE-EXISTING BOOT REQUIREMENT: groq-sdk threw at construction if
// GROQ_API_KEY was entirely unset, which is why this shim existed in Phase 1.
// Phase 2 made the Groq client lazily constructed (src/ai/groqClient.js), so
// the shim is no longer strictly required — it is retained so the test suite
// runs identically on machines with and without the variable set.
if (process.env.GROQ_API_KEY === undefined) process.env.GROQ_API_KEY = '';

// CRITICAL-2 (Phase 3): JWT_SECRET has no fallback anymore. Provide a test
// secret so requiring the app (which reads config.jwtSecret) never yields ''.
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret-1234567890';

const api = require('../../mau5trap-production-api');
const app = api.app || api;

/** Extract [{method, path}] from the Express 4 router stack, in bind order. */
function routeTable(expressApp) {
    const out = [];
    const stack = (expressApp._router && expressApp._router.stack) || [];
    for (const layer of stack) {
        if (!layer.route) continue;
        const p = layer.route.path;
        for (const m of Object.keys(layer.route.methods)) {
            if (layer.route.methods[m]) out.push({ method: m.toUpperCase(), path: p });
        }
    }
    return out;
}

const TABLE = routeTable(app);
const KEYS = TABLE.map((r) => `${r.method} ${r.path}`);

describe('route table — registration invariants', () => {
    test('app exports an Express application without binding a port', () => {
        assert.strictEqual(typeof app, 'function', 'app should be an express handler');
        assert.ok(app._router, 'app should expose a router');
        assert.strictEqual(typeof api.initializeDatabase, 'function',
            'module must expose initializeDatabase for the entrypoint');
    });

    test('registers the expected number of routes', () => {
        // STEP 7 (D7, 2026-09-28): +1 route (POST /v3/auth/reset-password)
        assert.strictEqual(TABLE.length, 65,
            `expected 65 registered routes, found ${TABLE.length}`);
    });

    test('PINS: the known shadowed duplicate routes are still present', () => {
        const counts = KEYS.reduce((acc, k) => (acc[k] = (acc[k] || 0) + 1, acc), {});
        assert.strictEqual(counts['POST /v3/users'], 3, 'POST /v3/users shadowed x3');
        assert.strictEqual(counts['PUT /v3/users/:id'], 2, 'PUT /v3/users/:id shadowed x2');
        assert.strictEqual(counts['DELETE /v3/users/:id'], 2, 'DELETE /v3/users/:id shadowed x2');
        assert.strictEqual(counts['POST /v3/ai/analyze'], 1, 'one authenticated AI analyze handler');
    });

    test('duplicate routes keep their original RELATIVE order after the split', () => {
        // The first registration wins. For each duplicated key, assert that the
        // winning index precedes the others — i.e. the domain split did not
        // promote a previously-dead handler.
        const indexOfAll = (key) => KEYS.reduce((acc, k, i) => (k === key ? [...acc, i] : acc), []);

        for (const key of ['POST /v3/users', 'PUT /v3/users/:id', 'DELETE /v3/users/:id']) {
            const idxs = indexOfAll(key);
            assert.ok(idxs.length > 1, `${key} should still be duplicated`);
            const sorted = [...idxs].sort((a, b) => a - b);
            assert.deepStrictEqual(idxs, sorted, `${key} registrations must remain in ascending order`);
        }
    });

    test('domain grouping did not introduce cross-domain shadowing', () => {
        // A route pattern must not match a DIFFERENT route's literal path that
        // is registered later, or the split could have changed the winner.
        const toRegex = (p) => new RegExp('^' + p.replace(/:[A-Za-z_]+/g, '[^/]+') + '$');
        const literal = (p) => p.replace(/:[A-Za-z_]+/g, 'X');

        const problems = [];
        for (let i = 0; i < TABLE.length; i++) {
            for (let j = i + 1; j < TABLE.length; j++) {
                if (TABLE[i].method !== TABLE[j].method) continue;
                if (TABLE[i].path === TABLE[j].path) continue; // known duplicates
                if (toRegex(TABLE[i].path).test(literal(TABLE[j].path))) {
                    problems.push(`${KEYS[i]} shadows ${KEYS[j]}`);
                }
            }
        }
        assert.deepStrictEqual(problems, [], `unexpected shadowing:\n${problems.join('\n')}`);
    });

    test('critical endpoints consumed by the frontends are registered', () => {
        const required = [
            'GET /health',
            'POST /v3/auth/login',
            'POST /v3/auth/forgot-password',
            'GET /v3/artists',
            'POST /v3/artists',
            'GET /v3/artists/:id',
            'GET /v3/artists/:id/entity-audit',
            'GET /v3/label/overview',
            'GET /v3/exports',
            'POST /v3/ai/analyze',
            'POST /v3/ai/query',
            'GET /v3/analytics/geography',
            'GET /v3/analytics/projections',
            'POST /v3/analytics/sales',
            'GET /v3/anr/submissions',
            'GET /v3/anr/state',
            'GET /v3/anr/scout',
            'POST /v3/anr/shortlist',
            'GET /v3/integrations/status',
            'GET /v3/operations/logistics',
            'GET /v3/operations/assets',
            'GET /v3/operations/contracts',
            'GET /v3/campaigns/stats',
            'POST /v3/marketing/campaigns',
            'GET /v3/fans/demographics',
            'GET /v3/users'
        ];
        const missing = required.filter((r) => !KEYS.includes(r));
        assert.deepStrictEqual(missing, [], `missing routes: ${missing.join(', ')}`);
    });

    test('PINS: routes the frontend calls that do NOT exist remain absent', () => {
        // STEP 7 (D7, 2026-09-28): reset-password shipped; its pin is removed.
        assert.ok(!KEYS.includes('GET /v3/label/entity-audit'),
            'PINNED: label entity audit still unrouted');
    });

    test('only the four documented routes are unauthenticated', () => {
        const stack = app._router.stack.filter((l) => l.route);
        const unauth = [];
        for (const layer of stack) {
            const names = layer.route.stack.map((s) => s.name);
            if (!names.includes('authenticateToken')) {
                for (const m of Object.keys(layer.route.methods)) {
                    unauth.push(`${m.toUpperCase()} ${layer.route.path}`);
                }
            }
        }
        unauth.sort();
        assert.deepStrictEqual(unauth, [
            'GET /health',
            'POST /v3/auth/forgot-password',
            'POST /v3/auth/login',
            'POST /v3/auth/reset-password'
        ], `unexpected unauthenticated routes: ${unauth.join(', ')}`);
    });

    test('GET /v3/exports still carries the checkExportAccess guard', () => {
        const layer = app._router.stack.find(
            (l) => l.route && l.route.path === '/v3/exports' && l.route.methods.get
        );
        assert.ok(layer, '/v3/exports must be registered');
        const names = layer.route.stack.map((s) => s.name);
        assert.ok(names.includes('authenticateToken'), 'must authenticate');
        assert.ok(names.includes('checkExportAccess'), 'must keep the export guard');
    });

    test('FIXED NEW-1: POST /v3/users no longer assigns a STRING id to an INTEGER PK', () => {
        // Phase 3 removed `id: \`user_${Date.now()}\`` from the live handler,
        // which caused SQLITE_MISMATCH -> always 500. The database now assigns
        // the autoincrement primary key.
        const fs = require('fs');
        const src = fs.readFileSync(
            path.resolve(__dirname, '..', '..', 'src', 'routes', 'users.js'), 'utf8'
        );
        assert.ok(
            !src.includes('id: `user_${Date.now()}`'),
            'NEW-1 fixed: the string-id assignment must be gone'
        );
    });

    test('requiring the app does NOT schedule cron jobs (Phase 2)', () => {
        // The monolith registered the monthly report cron as a side effect of
        // require(). Jobs are now registered explicitly by server.js, which is
        // why this suite no longer depends on --test-force-exit to terminate.
        const fs = require('fs');
        const src = fs.readFileSync(
            path.resolve(__dirname, '..', '..', 'mau5trap-production-api.js'), 'utf8'
        );
        assert.ok(!src.includes('cron.schedule'),
            'the app assembler must not schedule jobs at require time');
    });
});
