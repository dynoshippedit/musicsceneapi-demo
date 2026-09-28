/**
 * src/services/provenance.js
 *
 * Data-honesty convention (Phase 1B): no fabricated numbers.
 *
 * Every metric served by the API carries provenance:
 *   - source:     where the number came from ('spotify_api', 'manual_import', ...)
 *   - observedAt: ISO timestamp of when the number was observed
 *   - basis:      'measured' | 'estimated'
 *   - note:       optional disclosure — mandatory when basis is 'estimated'
 *                 (the formula behind the estimate is disclosed, not hidden)
 *
 * Rules:
 *   - Report API fields verbatim. Never rename a field to something it is not
 *     (followers are followers, not "monthly listeners").
 *   - A derived number is 'estimated' with its formula in `note`, or it is
 *     dropped. No silent formulas.
 */

'use strict';

const MEASURED = 'measured';
const ESTIMATED = 'estimated';

/**
 * Attach a provenance block to a metric payload.
 * @param {object} data - the metric payload (not mutated; shallow-copied)
 * @param {object} opts - { source, observedAt?, basis, note? }
 * @returns {object} data with a `provenance` block
 */
function withProvenance(data, { source, observedAt, basis, note } = {}) {
    if (!source || typeof source !== 'string') {
        throw new Error("withProvenance: 'source' is required");
    }
    if (basis !== MEASURED && basis !== ESTIMATED) {
        throw new Error("withProvenance: 'basis' must be 'measured' or 'estimated'");
    }
    if (basis === ESTIMATED && !note) {
        throw new Error("withProvenance: 'note' (the formula) is required for estimated metrics");
    }
    const provenance = {
        source,
        observedAt: observedAt || new Date().toISOString(),
        basis
    };
    if (note) provenance.note = note;
    return { ...(data || {}), provenance };
}

module.exports = { withProvenance, MEASURED, ESTIMATED };
