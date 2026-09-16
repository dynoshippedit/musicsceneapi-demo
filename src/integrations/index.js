/**
 * src/integrations/index.js
 *
 * Facade over ALL external data sources. Controllers import this module and
 * never reach into ../../integrations/* or ../../modules/entityAudit directly.
 *
 * Why a facade instead of moving the provider files: integrations/ and
 * modules/entityAudit.js are already clean module boundaries with their own
 * credential handling, timeouts and isConfigured() guards. Moving them would be
 * churn with regression risk and no benefit. The legacy paths stay where they
 * are; this layer gives the application ONE seam to mock in tests.
 *
 * Mockability: createIntegrationFacade({ ... }) accepts replacements for every
 * downstream provider, so tests can exercise controllers with no network.
 */

'use strict';

const legacyIntegrations = require('../../integrations');
const entityAudit = require('../../modules/entityAudit');
const scoutService = require('./scoutService');
const { SERVICES, limiters } = require('./rateLimiter');

function createIntegrationFacade({
    integrations = legacyIntegrations,
    audit = entityAudit,
    scout = scoutService
} = {}) {
    return {
        // ---- social / streaming aggregation (integrations/index.js) ----
        /** Merge live provider data over a mock base. Falls back silently. */
        fetchArtistData: (artistId, mockData) => integrations.fetchArtistData(artistId, mockData),
        /** Which providers have usable credentials. */
        getIntegrationStatus: () => integrations.getIntegrationStatus(),
        /** Internal id -> external ids. Covers only art_deadmau5 and art_rezz. */
        artistMappings: integrations.ARTIST_MAPPINGS,

        // ---- entity / metadata audit (modules/entityAudit.js) ----
        auditGoogleKG: (name) => audit.auditGoogleKG(name),
        auditWikipedia: (name) => audit.auditWikipedia(name),
        auditDiscogs: (name) => audit.auditDiscogs(name),
        auditGenius: (name) => audit.auditGenius(name),
        auditFandom: (name) => audit.auditFandom(name),
        getFandomRoster: () => audit.getFandomRoster(),
        /**
         * Label-wide audit. NOTE: exported by the module and reachable here,
         * but NO ROUTE exposes it — the workstation calls
         * GET /v3/label/entity-audit, which 404s. Left unrouted in Phase 2
         * because adding a route would change the API surface.
         */
        auditLabel: () => audit.auditLabel(),
        calculateHealthScore: (results) => audit.calculateHealthScore(results),
        detectInconsistencies: (results, artist) => audit.detectInconsistencies(results, artist),
        generateSchemaLD: (artist, results) => audit.generateSchemaLD(artist, results),

        // ---- A&R scouting ----
        searchScouts: (query, opts) => scout.search(query, opts),

        // ---- rate limiting registry (diagnostic only; see rateLimiter.js) ----
        SERVICES,
        limiters
    };
}

module.exports = createIntegrationFacade();
module.exports.createIntegrationFacade = createIntegrationFacade;
