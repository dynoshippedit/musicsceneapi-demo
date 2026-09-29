// AI queries enforce access before cache/provider work; provider failure never fabricates an answer.
'use strict';

const config = require('../config');
const cache = require('../services/cacheService');
const groqClient = require('./groqClient');
const prompts = require('./prompts');
const { validateEntityAudit } = require('./responseParser');
const artistRepo = require('../repositories/artistRepository');
const { calculateTotalRevenue } = require('../utils/dataShape');
const { hasArtistAccess } = require('../auth');
const profile = require('../profile');
const usage = require('../services/usageService');

/**
 * Exact dev-fallback sentence from the original. Do not reword.
 * PHASE 4CF: value now lives in the Label Intelligence Profile (single
 * source shared with src/routes/ai.js); pulsegrid value is byte-identical.
 */
const DEV_FALLBACK_ANSWER = profile.ai.devFallback;

function createAiService({ client = groqClient, cacheService = cache, repo = artistRepo, usageService = usage } = {}) {
    /**
     * POST /v3/ai/query — cached, context-aware, real LLM call.
     *
     * Returns a DISCRIMINATED RESULT rather than writing to res, so the
     * controller owns status codes and the service stays HTTP-agnostic.
     *
     * @returns {Promise<
     *   {kind:'cached',  answer:string} |
     *   {kind:'ok',      answer:string, model:string, usage?:object} |
     *   {kind:'error',   message:string}
     * >}
     */
    async function query({ prompt, artistId, forceRefresh, user }) {
        const userPrompt = prompt;
        if (artistId && !hasArtistAccess(user, artistId)) return { kind: 'forbidden' };
        let contextData = {};
        if (artistId) {
            const artist = typeof repo.findById === 'function' ? await repo.findById(artistId) : repo.findMockById(artistId);
            if (!artist) return { kind: 'not_found' };
            contextData = prompts.buildArtistContext(artist);
        } else if (typeof repo.findAllHybrid === 'function') {
            const roster = (await repo.findAllHybrid()).filter(artist => hasArtistAccess(user, artist.id));
            contextData = { artists: roster.map(prompts.buildArtistContext) };
        }
        const scope = require('node:crypto').createHash('sha256')
            .update(JSON.stringify([user?.id, user?.role, user?.artistAccess, contextData])).digest('hex');
        const cacheKey = `${cacheService.keys.aiQuery(userPrompt, artistId)}:${scope}`;
        if (typeof client.isConfigured === 'function' && !client.isConfigured()) {
            return { kind: 'error', message: 'AI provider is not configured' };
        }
        if (!forceRefresh) {
            const cached = cacheService.get(cacheKey);
            if (cached) return { kind: 'cached', answer: cached };
        }

        try {
            const { content, usage, model } = await client.complete({
                messages: prompts.buildQueryMessages({ userPrompt, contextData }),
                model: config.groqModel,
                temperature: 0.7,
                maxTokens: 300
            });

            if (!content?.trim()) throw new Error('Provider returned an empty response');
            const insights = content;
            cacheService.set(cacheKey, insights);

            // Original logged token usage to stdout; retained.
            console.log(`[Groq Usage] Tokens: ${usage?.total_tokens || 'N/A'}`);

            // PHASE 4CF: usage-attribution seam at the paid-provider spend
            // point (Objective 7). Logs a structured record future metering
            // can consume; no quotas or billing are built here.
            usageService.recordUsage('ai_tokens', usage?.total_tokens ?? 0, {
                model,
                artistId: artistId ?? null,
                userId: user?.id ?? null,
                provider: 'groq',
                requestId: null
            });

            return { kind: 'ok', answer: insights, model, usage };
        } catch (err) {
            console.error('Groq API Error:', err);

            return { kind: 'error', message: err.message, timeout: err.name === 'AiTimeoutError' };
        }
    }

    /**
    /**
     * Entity-audit AI analysis. NEVER throws. FAILS CLOSED (2026-09-28,
     * audit gap 6):
     *   - provider not configured -> { status: 'not_configured', ... }
     *   - provider call fails     -> { status: 'unavailable', ... }
     *   - provider succeeds       -> { status: 'ok', ...validated fields }
     *
     * There are no canned roster claims and no fake analysis: without a
     * successful provider call the UI receives an explicit status, never
     * mock insights. entityAuditService records AI usage ONLY on
     * status 'ok' (a failed or unconfigured provider call is not a
     * billable AI event).
     */
    async function analyzeEntityHealth({ artistName, googleKgStatus, wikipediaStatus, healthScore }) {
        if (typeof client.isConfigured === 'function' && !client.isConfigured()) {
            return {
                status: 'not_configured',
                summary: 'AI analysis not configured',
                criticalActions: [],
                correlationInsight: 'Configure an AI provider to enable entity analysis.'
            };
        }
        try {
            const promptText = prompts.buildEntityAuditPrompt({
                artistName, googleKgStatus, wikipediaStatus, healthScore
            });
            const { content } = await client.complete({
                messages: [{ role: 'user', content: promptText }],
                model: config.groqModel,
                temperature: 0.7,
                maxTokens: 400
            });
            const validated = validateEntityAudit(content);
            if (validated && validated._meta && validated._meta.ok) {
                return { status: 'ok', ...validated };
            }
            // Provider answered but the output was unusable: the call still
            // happened (usage counts), but no analysis is presented.
            return {
                status: 'unavailable',
                summary: 'AI analysis unavailable',
                criticalActions: [],
                correlationInsight: 'Manual review needed'
            };
        } catch (err) {
            return {
                status: 'unavailable',
                summary: 'AI analysis unavailable',
                criticalActions: [],
                correlationInsight: 'Manual review needed'
            };
        }
    }

    /**
     * AI STRATEGIC INSIGHTS text for the monthly PDF report.
     *
     * Caching preserved verbatim: keyed `report_ai_<artistId>_<month>` with
     * TTL 0 (never expires), because the original comment said "Cache
     * indefinitely for this month's report".
     *
     * Returns the literal string "AI analysis unavailable." on empty content
     * and THROWS on transport failure, because the original let the error reach
     * the PDF builder's own catch which writes
     * "AI Insights unavailable at this time (Service Offline)." into the doc.
     *
     * Fail-closed (2026-09-28, audit gap 6): THROWS 'AI provider is not
     * configured' when the provider is absent, so no report is ever
     * assembled with fabricated AI insights.
     *
     * @returns {Promise<string>}
     */
    async function reportInsight({ artist, month, totalRevenue }) {
        if (typeof client.isConfigured === 'function' && !client.isConfigured()) {
            throw new Error('AI provider is not configured');
        }
        const reportCacheKey = `report_ai_${artist.id}_${month}`;
        const cached = cacheService.get(reportCacheKey);
        if (cached) return cached;

        const { content } = await client.complete({
            messages: [{
                role: 'user',
                content: prompts.buildReportInsightPrompt({
                    artistName: artist.name,
                    monthlyListeners: artist.monthlyListeners,
                    growthRate: artist.growthRate,
                    totalRevenue
                })
            }],
            model: config.groqModel,
            maxTokens: 100
        });

        const insightText = content || 'AI analysis unavailable.';
        cacheService.set(reportCacheKey, insightText, cacheService.TTL.NEVER_EXPIRE);
        return insightText;
    }

    return { query, analyzeEntityHealth, reportInsight };
}

module.exports = createAiService();
module.exports.createAiService = createAiService;
module.exports.DEV_FALLBACK_ANSWER = DEV_FALLBACK_ANSWER;
