/**
 * src/services/cacheService.js
 *
 * Single owner of the NodeCache instance that was created at the top of
 * production-api.js (Phase 1 L42, originally L25).
 *
 * WHY THIS EXISTS: the cache was a module-scope singleton reached directly from
 * 12 call sites across artist lookup, entity audit, AI query and report
 * generation. Those call sites each invented their own key format inline, so
 * there was no way to see the key namespace or to clear one domain's entries.
 *
 * Behavior preserved exactly:
 *   - same NodeCache options (stdTTL 3600, checkperiod 600)
 *   - same per-call TTL overrides (24h artist data, 2 weeks audit, 0 = never
 *     expire for Genius, default for AI query)
 *   - key STRINGS are byte-identical to the originals, so a warm cache from the
 *     pre-refactor process is still readable
 *
 * Tests inject a fake via createCacheService() rather than mutating a global.
 */

'use strict';

const NodeCache = require('node-cache');
const config = require('../config');

/** Key builders. Strings must stay identical to the pre-refactor inline keys. */
const keys = {
    // was: `artist_data_${artistId}`            (original L296)
    artistData: (artistId) => `artist_data_${artistId}`,
    // was: `entity_audit_${artistId}`           (original L1043)
    entityAudit: (artistId) => `entity_audit_${artistId}`,
    // was: `audit_genius_${artistId}`           (original L1058)
    auditGenius: (artistId) => `audit_genius_${artistId}`,
    // was: `${userPrompt.trim()}_${artistId || 'label'}`  (original L1232)
    aiQuery: (prompt, artistId) => `${String(prompt).trim()}_${artistId || 'label'}`,
    // was: `report_${artist.id}_${month}`ish    (report generation)
    report: (artistId, month) => `report_${artistId}_${month}`,
    // was: `google_kg_${artistName}`            (integrations/google-kg route)
    googleKg: (artistName) => `google_kg_${artistName}`
};

/** TTLs in seconds. 0 means "never expire" in NodeCache. */
const TTL = {
    DEFAULT: config.cache.stdTTL, // 3600
    ARTIST_DATA: 86400,          // 24h  (original L311)
    ENTITY_AUDIT: 1209600,       // 2wk  (original L1135)
    NEVER_EXPIRE: 0              // Genius (original L1069)
};

function createCacheService(instance) {
    const store = instance || new NodeCache({
        stdTTL: config.cache.stdTTL,
        checkperiod: config.cache.checkperiod
    });

    return {
        keys,
        TTL,
        get: (key) => store.get(key),
        /** @param {number} [ttl] seconds; omit to use stdTTL, 0 = never expire */
        set: (key, value, ttl) => (ttl === undefined ? store.set(key, value) : store.set(key, value, ttl)),
        del: (key) => store.del(key),
        flush: () => store.flushAll(),
        stats: () => store.getStats(),
        /** Escape hatch for code still holding the raw instance. */
        raw: store
    };
}

// Default singleton — the same shared cache the monolith used.
module.exports = createCacheService();
module.exports.createCacheService = createCacheService;
module.exports.keys = keys;
module.exports.TTL = TTL;
