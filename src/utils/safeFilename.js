/**
 * src/utils/safeFilename.js
 *
 * Filename sanitization for client-controllable names (artist names, etc.).
 *
 * Background (audit HIGH-6, 2026-09-28): artist.name is client-controllable
 * via POST /v3/artists and was interpolated into report filenames with only
 * Windows-reserved characters stripped. That left:
 *   - path traversal (`../`, absolute paths) at writeFileSync time,
 *   - command injection at the old exec() printer shell-out,
 *   - response-header injection via newlines in Content-Disposition.
 *
 * The rule is a strict whitelist: only [A-Za-z0-9._-] survive; everything
 * else becomes `_`. Leading dots/dashes are stripped (no `..`, no hidden
 * files, no option injection for lp/lpr). Length is capped.
 */

'use strict';

const MAX_PART = 80;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Reduce an arbitrary string to a safe single path segment.
 * Never returns a string containing `/`, `\`, `..`, or leading `-`/`.`.
 * May return '' for adversarial input — callers must handle that.
 */
function sanitizeFilenamePart(raw) {
    let s = String(raw ?? '');
    s = s.replace(/[^A-Za-z0-9._-]+/g, '_');
    s = s.replace(/^[.-]+/, '');
    s = s.replace(/_+/g, '_');
    s = s.replace(/\.+/g, '.'); // collapse dot runs: `..` can never appear
    if (s.length > MAX_PART) s = s.slice(0, MAX_PART);
    s = s.replace(/[._]+$/, '');
    return s;
}

/** Throw unless month is a real YYYY-MM. */
function assertValidMonth(month) {
    if (!MONTH_RE.test(String(month || ''))) {
        throw new Error(`invalid month "${month}": expected YYYY-MM`);
    }
}

/**
 * Build the monthly-report filename for an artist.
 * Format is unchanged: <sanitized-name>_<YYYY-MM>_report.pdf.
 * Falls back to the sanitized artist id when the name sanitizes to ''.
 */
function reportFilename(artist, month) {
    assertValidMonth(month);
    let stem = sanitizeFilenamePart(artist && artist.name);
    if (!stem) {
        stem = sanitizeFilenamePart(artist && artist.id) || 'artist';
    }
    return `${stem}_${month}_report.pdf`;
}

module.exports = { sanitizeFilenamePart, assertValidMonth, reportFilename, MAX_PART };
