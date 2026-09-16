/**
 * src/ai/responseParser.js
 *
 * Response parsing and schema validation for LLM output.
 *
 * ============================================================================
 * THE PROBLEM THIS ISOLATES (audit AI finding #1)
 * ============================================================================
 * The monolith did, inside a route handler:
 *
 *     aiAnalysis = JSON.parse(groqResponse.choices[0]?.message?.content || '{}');
 *
 * against a prompt whose only instruction was the prose "Format as JSON".
 * A llama-3.1-8b-instant response very often looks like:
 *
 *     Here is the analysis:
 *     ```json
 *     { "summary": "..." }
 *     ```
 *
 * which makes JSON.parse throw. The surrounding catch then replaced the result
 * with a static stub, so the failure was invisible to the caller AND
 * indistinguishable from a real answer.
 *
 * ============================================================================
 * WHAT THIS MODULE DOES
 * ============================================================================
 * parseJsonLoose() adds tolerant extraction (fenced blocks, prose preambles)
 * BEFORE giving up. This can only turn a previous failure into a success — the
 * strict path is tried first and unchanged.
 *
 * validateEntityAudit() applies a zod schema (zod is already a dependency,
 * used by modules/SafeStatsSchema.js) and, on failure, returns the EXACT stub
 * object the original catch block produced, so the response contract is byte
 * identical:
 *
 *     { summary: 'AI analysis unavailable', criticalActions: [],
 *       correlationInsight: 'Manual review needed' }
 *
 * The `_meta` field is attached NON-ENUMERABLY so it is available to logs and
 * tests but never appears in JSON.stringify output — i.e. it cannot leak into
 * an HTTP response body and change the contract.
 */

'use strict';

const { z } = require('zod');

/** Exact fallback from the original catch block. Do not alter these strings. */
const ENTITY_AUDIT_FALLBACK = Object.freeze({
    summary: 'AI analysis unavailable',
    criticalActions: [],
    correlationInsight: 'Manual review needed'
});

/**
 * Permissive schema: the original code imposed NO shape at all, so rejecting
 * extra or differently-named keys here would be a behavior regression. We only
 * require that the payload is an object.
 */
const EntityAuditSchema = z.object({}).passthrough();

/**
 * Attach diagnostic metadata without making it serializable.
 * @template T
 * @param {T} obj
 * @param {object} meta
 * @returns {T}
 */
function withMeta(obj, meta) {
    if (obj === null || typeof obj !== 'object') return obj;
    Object.defineProperty(obj, '_meta', {
        value: Object.freeze(meta),
        enumerable: false,   // invisible to JSON.stringify -> cannot alter responses
        writable: false,
        configurable: true
    });
    return obj;
}

/**
 * Strip markdown code fences and any prose around the first JSON object/array.
 * @param {string} text
 * @returns {string|null}
 */
function extractJsonCandidate(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    // 1. fenced block: ```json ... ``` or ``` ... ```
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1].trim()) return fenced[1].trim();

    // 2. first balanced-looking object or array in the text
    const firstObj = trimmed.indexOf('{');
    const firstArr = trimmed.indexOf('[');
    const start = (firstObj === -1) ? firstArr
        : (firstArr === -1) ? firstObj
            : Math.min(firstObj, firstArr);
    if (start === -1) return null;

    const open = trimmed[start];
    const close = open === '{' ? '}' : ']';
    const end = trimmed.lastIndexOf(close);
    if (end > start) return trimmed.slice(start, end + 1);

    return null;
}

/**
 * Tolerant JSON parse.
 * @param {string} text raw model content
 * @returns {{ok: true, value: any, strategy: string} | {ok: false, error: string}}
 */
function parseJsonLoose(text) {
    const raw = typeof text === 'string' ? text : '';

    // Strategy 1: exactly what the original did.
    try {
        return { ok: true, value: JSON.parse(raw || '{}'), strategy: 'strict' };
    } catch (_) { /* fall through */ }

    // Strategy 2: extract from fences / surrounding prose.
    const candidate = extractJsonCandidate(raw);
    if (candidate) {
        try {
            return { ok: true, value: JSON.parse(candidate), strategy: 'extracted' };
        } catch (err) {
            return { ok: false, error: `unparseable after extraction: ${err.message}` };
        }
    }

    return { ok: false, error: 'no JSON found in model output' };
}

/**
 * Parse + validate entity-audit AI output.
 * ALWAYS resolves to a usable object; never throws.
 *
 * @param {string} content raw model text
 * @returns {object} parsed payload, or the verbatim original fallback
 */
function validateEntityAudit(content) {
    const parsed = parseJsonLoose(content);

    if (!parsed.ok) {
        return withMeta({ ...ENTITY_AUDIT_FALLBACK }, {
            ok: false, reason: parsed.error, stage: 'parse'
        });
    }

    const result = EntityAuditSchema.safeParse(parsed.value);
    if (!result.success) {
        return withMeta({ ...ENTITY_AUDIT_FALLBACK }, {
            ok: false, reason: result.error.message, stage: 'validate'
        });
    }

    return withMeta(result.data, { ok: true, strategy: parsed.strategy, stage: 'ok' });
}

module.exports = {
    parseJsonLoose,
    extractJsonCandidate,
    validateEntityAudit,
    withMeta,
    ENTITY_AUDIT_FALLBACK,
    EntityAuditSchema
};
