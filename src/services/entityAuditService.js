/**
 * src/services/entityAuditService.js
 *
 * Orchestrates the entity-health audit: 5 external providers + 1 LLM call +
 * two-tier caching. Extracted from the GET /v3/artists/:id/entity-audit route
 * handler (Phase 1 L766-870), which was the single worst offender for mixing
 * concerns — HTTP, caching, 5 network calls, AI invocation, JSON parsing and
 * response shaping in one function.
 *
 * Behavior preserved exactly:
 *   - composite result cached 2 weeks; `?refresh=true` bypasses it
 *   - Genius cached with TTL 0 (never expires) and is NOT re-fetched on
 *     refresh if already cached (the original's deliberate cost choice)
 *   - the other four providers run concurrently via Promise.all
 *   - auditResults.schemaValid = googleKG.schemaValid || false
 *   - auditResults.linksAccurate = true (hardcoded)
 *   - issues[] mapping and its `|| 'Review entity data'` defaults
 *   - cached responses get `cached: true`, fresh ones `cached: false`
 *
 * COST NOTE (audit HIGH-7): `?refresh=true` triggers 5 external calls plus a
 * Groq completion with NO per-user quota — only the global 1000/hr/IP limiter.
 * Unchanged here; documented in BACKEND_ARCHITECTURE.md.
 */

'use strict';

const cache = require('./cacheService');
const integrations = require('../integrations');
const aiService = require('../ai/aiService');
const artistRepo = require('../repositories/artistRepository');
const usage = require('./usageService');

function createEntityAuditService({
    cacheService = cache,
    integrationFacade = integrations,
    ai = aiService,
    repo = artistRepo,
    usageService = usage
} = {}) {
    /**
     * @param {string} artistId
     * @param {boolean} forceRefresh
     * @param {object|null} [actor] the requesting principal (req.user) — PHASE 4CF
     * @returns {Promise<{kind:'ok', result:object} | {kind:'not_found'}>}
     */
    async function audit(artistId, forceRefresh, actor = null) {
        const cacheKey = cacheService.keys.entityAudit(artistId);
        const cached = cacheService.get(cacheKey);

        if (cached && !forceRefresh) {
            return { kind: 'ok', result: { ...cached, cached: true } };
        }

        const artist = await repo.getArtistData(artistId, forceRefresh);
        if (!artist) {
            return { kind: 'not_found' };
        }

        // --- GENIUS CACHING (indefinite; preferred even on refresh) ---
        const geniusCacheKey = cacheService.keys.auditGenius(artistId);
        let geniusResult = cacheService.get(geniusCacheKey);
        if (!geniusResult) {
            geniusResult = await integrationFacade.auditGenius(artist.name);
            cacheService.set(geniusCacheKey, geniusResult, cacheService.TTL.NEVER_EXPIRE);
        }

        // --- Remaining providers, concurrently ---
        const [googleKG, wikipedia, discogs, fandom] = await Promise.all([
            integrationFacade.auditGoogleKG(artist.name),
            integrationFacade.auditWikipedia(artist.name),
            integrationFacade.auditDiscogs(artist.name),
            integrationFacade.auditFandom(artist.name)
        ]);

        // PHASE 4CF: usage-attribution seam at the external-provider spend
        // point (Objective 7). One record per fresh audit pass; cached
        // responses return above and cost nothing.
        usageService.recordUsage('provider_call', 4, {
            artistId,
            userId: actor?.id ?? null,
            providers: ['googleKG', 'wikipedia', 'discogs', 'fandom']
        });

        const genius = geniusResult;

        const auditResults = {
            googleKG,
            wikipedia,
            discogs,
            genius,
            fandom,
            schemaValid: googleKG.schemaValid || false,
            linksAccurate: true
        };

        const healthScore = integrationFacade.calculateHealthScore(auditResults);
        const inconsistencies = integrationFacade.detectInconsistencies(auditResults, artist);
        const schemaLD = integrationFacade.generateSchemaLD(artist, auditResults);

        // --- AI analysis (never throws; returns the original fallback shape) ---
        const aiAnalysis = await ai.analyzeEntityHealth({
            artistName: artist.name,
            googleKgStatus: googleKG.status,
            wikipediaStatus: wikipedia.status,
            healthScore
        });

        // PHASE 4CF: the LLM call above is a paid-provider spend point.
        usageService.recordUsage('ai_call', 1, {
            artistId,
            userId: actor?.id ?? null,
            provider: 'groq',
            purpose: 'entity_audit_analysis'
        });

        const issues = inconsistencies.map((inc) => ({
            severity: inc.severity || 'medium',
            platform: inc.platform || 'multiple',
            issue: inc.type,
            recommendation: inc.impact || 'Review entity data'
        }));

        const result = {
            artistId,
            artistName: artist.name,
            auditDate: new Date().toISOString(),
            healthScore,
            platforms: { googleKG, wikipedia, discogs, genius, fandom },
            schemaLD,
            issues,
            aiAnalysis,
            cached: false
        };

        cacheService.set(cacheKey, result, cacheService.TTL.ENTITY_AUDIT);
        return { kind: 'ok', result };
    }

    return { audit };
}

module.exports = createEntityAuditService();
module.exports.createEntityAuditService = createEntityAuditService;
