/**
 * src/utils/dataShape.js
 *
 * Pure data-shaping helpers extracted verbatim from
 * production-api.js L2067-2070, L2556-2576.
 *
 * These are side-effect-free and independently testable, which is why they are
 * extracted first — they are the safest possible starting point for the split.
 */

'use strict';

/**
 * api L2067-2070 — sums all numeric values on artist.revenue.
 * Non-numeric values are ignored. Missing revenue yields 0.
 */
function calculateTotalRevenue(artist) {
    if (!artist.revenue) return 0;
    return Object.values(artist.revenue)
        .reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
}

/**
 * api L2557-2567 — flattens nested objects to dotted keys for CSV export.
 * Arrays are JSON-stringified rather than recursed into.
 */
function flattenData(data, prefix = '') {
    let flat = {};
    for (let key in data) {
        if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])) {
            Object.assign(flat, flattenData(data[key], `${prefix}${key}.`));
        } else {
            flat[`${prefix}${key}`] = Array.isArray(data[key]) ? JSON.stringify(data[key]) : data[key];
        }
    }
    return flat;
}

/**
 * api L2570-2576 — picks only the named metrics that are defined on data.
 */
function filterMetrics(data, selectedMetrics) {
    const filtered = {};
    selectedMetrics.forEach((metric) => {
        if (data[metric] !== undefined) filtered[metric] = data[metric];
    });
    return filtered;
}

module.exports = { calculateTotalRevenue, flattenData, filterMetrics };
