/**
 * src/finance/decimal.js
 *
 * Exact-decimal arithmetic for money (2026-09-28, research correction).
 *
 * Rationale: royalty statements (notably DDEX DSR) carry decimal amounts.
 * Rounding every line to integer cents at import would destroy real money:
 * 1,000,000 lines × $0.003 = $3,000 — line-level cent rounding zeroes it.
 *
 * Policy (see FINANCIAL_DATA_POLICY.md):
 * - The SOURCE precision is preserved exactly on every imported royalty
 *   line: original amount string + explicit scale, stored as a scaled
 *   integer (BigInt mantissa + scale). No float math, ever.
 * - Integer cents appear ONLY at documented settlement/payment boundaries,
 *   via a single reproducible rounding rule: round-half-up to 2 decimals.
 * - Aggregation sums the exact decimals first, then rounds once at the
 *   boundary. Line-level rounding is never applied before summation.
 */

'use strict';

const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;

/**
 * Parse an exact decimal string into { mantissa: BigInt, scale: number }.
 * "0.003" -> { mantissa: 3n, scale: 3 }
 * "125.00" -> { mantissa: 12500n, scale: 2 }
 * "125" -> { mantissa: 125n, scale: 0 }
 * Throws on anything that is not a plain decimal string.
 */
function parseDecimal(str) {
    const s = String(str).trim();
    if (!DECIMAL_RE.test(s)) {
        throw new Error(`not an exact decimal: "${str}"`);
    }
    let neg = false;
    let t = s;
    if (t[0] === '+' || t[0] === '-') {
        neg = t[0] === '-';
        t = t.slice(1);
    }
    const dot = t.indexOf('.');
    let scale = 0;
    let digits;
    if (dot === -1) {
        digits = t;
    } else {
        scale = t.length - dot - 1;
        digits = t.slice(0, dot) + t.slice(dot + 1);
    }
    // Strip leading zeros but keep at least one digit.
    digits = digits.replace(/^0+(?=\d)/, '');
    if (digits === '') digits = '0';
    let mantissa = BigInt(digits);
    if (neg) mantissa = -mantissa;
    return { mantissa, scale };
}

/** Scale of a decimal string: digits after the point ("0.003" -> 3). */
function decimalScale(str) {
    const s = String(str).trim();
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * Add two exact decimals. Returns { mantissa, scale } at the max scale.
 */
function addDecimals(a, b) {
    const scale = Math.max(a.scale, b.scale);
    const ma = a.mantissa * 10n ** BigInt(scale - a.scale);
    const mb = b.mantissa * 10n ** BigInt(scale - b.scale);
    return { mantissa: ma + mb, scale };
}

/** Sum an array of { mantissa, scale }. Empty -> zero. */
function sumDecimals(list) {
    let acc = { mantissa: 0n, scale: 0 };
    for (const d of list) acc = addDecimals(acc, d);
    return acc;
}

/**
 * Reproducible boundary rounding: round-half-up to 2 decimal places,
 * returned as integer cents (BigInt). This is the ONLY place a decimal
 * becomes cents, and it happens once per aggregate, never per line.
 */
function decimalToCents(d) {
    const { mantissa, scale } = d;
    if (scale <= 2) {
        return mantissa * 10n ** BigInt(2 - scale);
    }
    const divisor = 10n ** BigInt(scale - 2);
    const q = mantissa / divisor;
    const r = mantissa % divisor;
    // Round half up on the absolute value, then restore the sign.
    const absR = r < 0n ? -r : r;
    const absD = divisor < 0n ? -divisor : divisor;
    const roundUp = absR * 2n >= absD;
    if (!roundUp) return q;
    return mantissa >= 0n ? q + 1n : q - 1n;
}

/**
 * Format { mantissa, scale } as a plain decimal string ("3.000", "125.00").
 * Never uses float formatting.
 */
function formatDecimal(d) {
    const neg = d.mantissa < 0n;
    let digits = (neg ? -d.mantissa : d.mantissa).toString();
    if (d.scale === 0) return (neg ? '-' : '') + digits;
    while (digits.length <= d.scale) digits = '0' + digits;
    const intPart = digits.slice(0, digits.length - d.scale) || '0';
    const fracPart = digits.slice(digits.length - d.scale);
    return (neg ? '-' : '') + intPart + '.' + fracPart;
}

/**
 * Build the stored precision triple from a source amount string:
 * { sourceAmount, amountDecimal, amountScale, amountCents }.
 * amountCents is the boundary value (round-half-up); amountDecimal/Scale
 * preserve the source exactly.
 */
function precisionFromSource(sourceAmount) {
    const d = parseDecimal(sourceAmount);
    const cents = decimalToCents(d);
    if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new Error('amount out of safe integer range');
    }
    return {
        sourceAmount: String(sourceAmount).trim(),
        amountDecimal: formatDecimal(d),
        amountScale: d.scale,
        amountCents: Number(cents)
    };
}

/**
 * Precision triple for a legacy integer-cent amount (e.g. from the old
 * amount_cents CSV column or a provider that natively reports cents).
 */
function precisionFromCents(cents) {
    if (!Number.isSafeInteger(cents)) throw new Error('amount out of safe integer range');
    const d = { mantissa: BigInt(cents), scale: 2 };
    return {
        sourceAmount: String(cents),
        amountDecimal: formatDecimal(d),
        amountScale: 2,
        amountCents: cents
    };
}

module.exports = {
    parseDecimal,
    decimalScale,
    addDecimals,
    sumDecimals,
    decimalToCents,
    formatDecimal,
    precisionFromSource,
    precisionFromCents
};
