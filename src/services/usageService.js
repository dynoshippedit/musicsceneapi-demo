/**
 * src/services/usageService.js
 *
 * PHASE 4CF: minimal usage-attribution seam (Objective 7).
 *
 * NOT metering, NOT billing. One stable hook — recordUsage(kind, quantity,
 * meta) — that future cost accounting can consume without touching call
 * sites. Today it logs a structured line and keeps a bounded in-memory ring
 * so tests can assert the seam works.
 *
 * Wired at the two known spend points:
 *   - src/ai/aiService.js (Groq token usage)
 *   - src/services/entityAuditService.js (external provider calls)
 */

'use strict';

const logger = require('../config/logger');

const MAX_RECORDS = 100;

function createUsageService({ log = logger, store = [] } = {}) {
    /**
     * @param {string} kind      e.g. 'ai_tokens' | 'provider_call' | 'report_generated'
     * @param {number} quantity  numeric size of the event (tokens, calls, bytes)
     * @param {object} [meta]    attribution context (userId, artistId, provider, model, requestId)
     * @returns {object} the recorded entry (also appended to the ring buffer)
     */
    function recordUsage(kind, quantity, meta = {}) {
        const entry = {
            kind,
            quantity,
            ...meta,
            recordedAt: new Date().toISOString()
        };
        store.push(entry);
        if (store.length > MAX_RECORDS) store.splice(0, store.length - MAX_RECORDS);
        log.info('usage', entry);
        return entry;
    }

    return { recordUsage, records: store };
}

module.exports = createUsageService();
module.exports.createUsageService = createUsageService;
