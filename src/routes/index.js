/**
 * src/routes/index.js
 *
 * Mounts every route module onto the Express app.
 *
 * ============================================================================
 * REGISTRATION ORDER IS PART OF THE CONTRACT
 * ============================================================================
 * Express binds the FIRST handler whose method and path pattern match. This
 * application contains five duplicate registrations that are shadowed and
 * unreachable (POST /v3/users x3, PUT and DELETE /v3/users/:id x2,
 * POST /v3/ai/analyze x2). Reordering could change which implementation wins
 * and therefore change behavior.
 *
 * Two properties make the domain grouping below safe, both verified against
 * the pre-split source:
 *
 *   1. Every duplicate pair lives within a SINGLE domain, so intra-domain
 *      order — which each route module preserves verbatim — decides the winner.
 *      Verified: "duplicate routes spanning MULTIPLE domains: NONE".
 *
 *   2. No route pattern in one domain shadows a literal path in another (e.g.
 *      there is no `/v3/:something` catch-all). Verified by pattern-matching
 *      every registered path against every other.
 *
 * DOMAIN_ORDER therefore follows the first-appearance order of each domain in
 * the original file. Do not reorder it without re-running
 * tests/regression/routes.test.js and the 91-case snapshot.
 */

'use strict';

const { buildContext } = require('./context');

/** First-appearance order of each domain in the pre-split monolith. */
const DOMAIN_ORDER = [
    'auth',
    'users',
    'artists',
    'label',
    'ai',
    'integrations',
    'finance',
    'anr',
    'marketing',
    'reports',
    'operations',
    'analytics',
    'system',
    'billing',
    'oauth',
    'catalog',
    'royalties'
];

/**
 * @param {object} app Express application
 * @param {object} [ctx] optional dependency bundle (tests may inject)
 */
function registerRoutes(app, ctx = buildContext()) {
    for (const domain of DOMAIN_ORDER) {
        // eslint-disable-next-line global-require
        const mod = require(`./${domain}`);
        mod.register(app, ctx);
    }
    return app;
}

module.exports = { registerRoutes, DOMAIN_ORDER };
