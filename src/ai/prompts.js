/**
 * src/ai/prompts.js
 *
 * Prompt construction. Every prompt string in the system is built here so the
 * wording is reviewable and testable without invoking a model.
 *
 * All templates are reproduced BYTE-FOR-BYTE from the monolith. Changing a
 * single character changes model output, which would break snapshot parity, so
 * these are effectively frozen strings.
 */

'use strict';

const { calculateTotalRevenue } = require('../utils/dataShape');

/**
 * Compressed artist context for the AI query endpoint.
 * Original: production-api.js (Phase 1 L~980-990).
 * The comment in the original read "Compressed context to save tokens".
 */
function buildArtistContext(artist) {
    return {
        name: artist.name,
        stats: `Listeners: ${artist.monthlyListeners}, Streams: ${artist.totalStreams}, Growth: ${artist.growthRate}%`,
        revenue: `Total: $${calculateTotalRevenue(artist)} (Top: ${Object.entries(artist.revenue || {}).sort((a, b) => b[1] - a[1])[0]?.[0]})`
    };
}

/**
 * Messages for POST /v3/ai/query.
 * System prompt and the 500-character truncation are verbatim from the original.
 */
function buildQueryMessages({ userPrompt, contextData }) {
    return [
        {
            role: 'system',
            // PHASE 4CF: system prompt from the Label Intelligence Profile
            // (pinned byte-for-byte by services.test.js for pulsegrid).
            content: require('../profile').ai.systemContext
        },
        {
            role: 'user',
            content: `${String(userPrompt).slice(0, 500)}\nData: ${JSON.stringify(contextData)}`
        }
    ];
}

/**
 * Prompt for the entity-audit AI analysis.
 * Verbatim from the original (Phase 1 L~835).
 *
 * KNOWN WEAKNESS (documented, not changed): this asks for JSON in prose
 * ("Format as JSON") with no response_format constraint and no schema. An 8B
 * model frequently answers with a prose preamble or a fenced code block, which
 * makes JSON.parse throw. See src/ai/responseParser.js for how that is handled.
 */
function buildEntityAuditPrompt({ artistName, googleKgStatus, wikipediaStatus, healthScore }) {
    return `Analyze entity health for ${artistName}: Google=${googleKgStatus}, Wiki=${wikipediaStatus}, Score=${healthScore}/100. Provide: summary, top 3 actions, streaming correlation insight. Format as JSON.`;
}

/**
 * Prompt for the AI STRATEGIC INSIGHTS block of the monthly PDF report.
 * Verbatim from generateMonthlyReport() (Phase 1 report section).
 * Free text, not JSON — no parsing is applied to the result.
 */
function buildReportInsightPrompt({ artistName, monthlyListeners, growthRate, totalRevenue }) {
    return `Analyze these music artist metrics: Name: ${artistName}, Monthly Listeners: ${monthlyListeners}, Growth Rate: ${growthRate}%, Revenue: $${totalRevenue}. Provide 2 sentences: 1) projected growth, 2) one strategic key decision. No preamble.`;
}

module.exports = {
    buildArtistContext,
    buildQueryMessages,
    buildEntityAuditPrompt,
    buildReportInsightPrompt
};
