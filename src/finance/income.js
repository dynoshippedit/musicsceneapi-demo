/**
 * src/finance/income.js
 *
 * ONE source of truth for income aggregation across the monthly close
 * (2026-09-28, fix 2). The dashboard KPIs, the reconciliation, the
 * analytics forecast, and the commission worksheet all aggregate through
 * this module — there is exactly one pipeline from the reviewed records
 * to the numbers, so the dashboard and the reconciliation can never tell
 * unrelated stories again.
 *
 * Rules (all enforced here, in one place):
 * - No floating-point money anywhere. Royalty lines carry exact decimals;
 *   they are summed exactly and rounded ONCE at the boundary
 *   (round-half-up) per aggregate. Every other category is integer cents
 *   natively. Integer cents that leave this module are safe integers.
 * - The trusted total counts ONLY reported + reconciled + approved.
 *   `disputed` and `estimated` are aggregated as separate, visible lines
 *   and are never summed into the trusted total. `superseded` is excluded
 *   everywhere.
 * - Period filtering is per-category and honest:
 *     royalties          -> statement/line period (exact match)
 *     merch settlements  -> showDate month (YYYY-MM-DD -> YYYY-MM)
 *     direct sales       -> occurredAt month
 *     manual adjustments -> declared month
 *   Records that cannot be placed in a month (e.g. a direct sale with no
 *   occurredAt) are EXCLUDED from period-filtered views and reported in
 *   `coverage.<category>.excludedUnperioded` — never silently dropped from
 *   all-time views, never silently claimed as in-period.
 * - Cash (payouts, deposits) is NOT income and never enters these
 *   aggregates. Cash evidence lives in src/finance/reconciliation.js and
 *   is reported alongside income, never summed with it (no double
 *   counting — research update 8).
 */

'use strict';

const { sumDecimals, parseDecimal, decimalToCents, formatDecimal } = require('./decimal');
const { isCounted, isDisputed, isEstimated } = require('./reviewState');

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function monthOfRoyalty(line) {
    const p = String(line.period || '');
    return MONTH_RE.test(p) ? p : null;
}

function monthOfMerch(s) {
    const d = String(s.showDate || '');
    return DAY_RE.test(d) ? d.slice(0, 7) : null;
}

function monthOfSale(s) {
    if (!s.occurredAt) return null;
    const d = new Date(s.occurredAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 7);
}

function monthOfAdjustment(a) {
    const m = String(a.month || '');
    return MONTH_RE.test(m) ? m : null;
}

/** Per (artist, currency) bucket. All money is BigInt cents internally. */
function newBucket() {
    return {
        countedCents: 0n,
        approvedCents: 0n, // subset of countedCents already in `approved` state
        disputedCents: 0n,
        estimatedCents: 0n,
        countedCount: 0,
        disputedCount: 0,
        estimatedCount: 0,
        // Counted-only per-category breakdown (BigInt cents), so the
        // reconciliation can explain every difference by income source.
        // Royalties land here boundary-rounded (once per group); the exact
        // decimal sum is kept alongside in royaltiesExact.
        royaltiesCents: 0n,
        royaltiesExact: null,
        merchCents: 0n,
        salesCents: 0n,
        adjustmentsCents: 0n
    };
}

function bucketAdd(map, currency, reviewState, cents, category = null) {
    const b = getBucket(map, currency);
    const c = BigInt(cents);
    if (isCounted(reviewState)) {
        b.countedCents += c;
        b.countedCount++;
        if ((reviewState || 'reported') === 'approved') b.approvedCents += c;
        if (category === 'merch') b.merchCents += c;
        else if (category === 'sales') b.salesCents += c;
        else if (category === 'adjustments') b.adjustmentsCents += c;
    } else if (isDisputed(reviewState)) {
        b.disputedCents += c;
        b.disputedCount++;
    } else if (isEstimated(reviewState)) {
        b.estimatedCents += c;
        b.estimatedCount++;
    }
    // superseded: excluded everywhere — not even tracked here.
    return b;
}

/** Get (creating) the per-currency bucket in a Map without touching counts. */
function getBucket(map, currency) {
    const cur = String(currency || 'USD').toUpperCase();
    if (!map.has(cur)) map.set(cur, newBucket());
    return map.get(cur);
}

/** Royalty exact decimals grouped for one boundary rounding. */
function royaltyCentsFor(lines) {
    if (!lines.length) return 0n;
    const sum = sumDecimals(lines.map((l) => parseDecimal(l.amountDecimal)));
    return decimalToCents(sum);
}

/**
 * Fetch the four income categories. artistIds: null = all artists, or an
 * array of ids. Returns raw record arrays (Sequelize instances).
 */
async function fetchIncomeData(models, { artistIds = null, period = null } = {}) {
    const { RoyaltyLine, MerchSettlement, DirectSale, ManualAdjustment } = models;
    const where = artistIds ? { artistId: artistIds } : {};
    const [royaltyLines, settlements, sales, adjustments] = await Promise.all([
        RoyaltyLine.findAll({ where, order: [['id', 'ASC']] }),
        MerchSettlement.findAll({ where, order: [['id', 'ASC']] }),
        DirectSale.findAll({ where: { provider: 'stripe', ...where }, order: [['id', 'ASC']] }),
        ManualAdjustment.findAll({ where, order: [['id', 'ASC']] })
    ]);
    return { royaltyLines, settlements, sales, adjustments, period };
}

/**
 * Aggregate fetched income data.
 *
 * Returns:
 *   byArtist: Map<artistId, Map<currency, bucket>>
 *   byMonth:  Map<month, Map<currency, { countedCents: BigInt }>> (counted only, for KPI series)
 *   totals:   Map<currency, bucket> (all artists)
 *   coverage: per-category filtering statement + unperioded exclusions
 *   artistIds: the artist ids present in the data
 */
function aggregateIncome(data, period = null) {
    const { royaltyLines, settlements, sales, adjustments } = data;
    const inPeriod = (month) => !period || month === period;

    const byArtist = new Map();
    const byMonth = new Map();
    const totals = new Map();
    const artistIds = new Set();

    const artistBucket = (artistId, currency) => {
        if (!byArtist.has(artistId)) byArtist.set(artistId, new Map());
        return byArtist.get(artistId);
    };
    const addMonth = (month, currency, cents) => {
        if (!month) return;
        if (!byMonth.has(month)) byMonth.set(month, new Map());
        const m = byMonth.get(month);
        const cur = String(currency || 'USD').toUpperCase();
        m.set(cur, (m.get(cur) || 0n) + BigInt(cents));
    };

    const coverage = {
        period: period || 'all',
        royalties: { filteredBy: 'statement/line period', value: period || 'all periods', records: 0 },
        merchSettlements: { filteredBy: 'showDate month', value: period || 'all months', records: 0, excludedUnperioded: 0 },
        directSales: { filteredBy: 'occurredAt month', value: period || 'all months', records: 0, excludedUnperioded: 0 },
        manualAdjustments: { filteredBy: 'declared month', value: period || 'all months', records: 0, excludedUnperioded: 0 },
        trustedStates: ['reported', 'reconciled', 'approved'],
        separatedStates: ['disputed', 'estimated'],
        note: 'Disputed and estimated amounts are reported as separate lines and are never summed into trusted totals. Superseded records are excluded everywhere.'
    };

    // --- Royalties: exact-decimal sums, one boundary rounding per
    // (artist, currency, state-class, month-view) aggregate.
    {
        // group key: artist|currency|class
        const groups = new Map();
        for (const l of royaltyLines) {
            const st = l.reviewState || 'reported';
            if (st === 'superseded') continue;
            if (period && String(l.period) !== period) continue;
            const cls = isCounted(st) ? 'counted' : (isDisputed(st) ? 'disputed' : (isEstimated(st) ? 'estimated' : null));
            if (!cls) continue;
            const key = `${l.artistId}|${String(l.currency).toUpperCase()}|${cls}`;
            if (!groups.has(key)) groups.set(key, { artistId: l.artistId, currency: l.currency, cls, st, lines: [], approvedLines: [] });
            const g = groups.get(key);
            g.lines.push(l);
            if (st === 'approved') g.approvedLines.push(l);
            coverage.royalties.records++;
        }
        for (const g of groups.values()) {
            const cents = royaltyCentsFor(g.lines);
            const approvedCents = royaltyCentsFor(g.approvedLines);
            for (const map of [artistBucket(g.artistId), totals]) {
                const b = getBucket(map, g.currency);
                if (g.cls === 'counted') {
                    b.countedCents += cents;
                    b.countedCount += g.lines.length;
                    b.approvedCents += approvedCents;
                    b.royaltiesCents += cents;
                    const exact = sumDecimals(g.lines.map((l) => parseDecimal(l.amountDecimal)));
                    b.royaltiesExact = b.royaltiesExact ? sumDecimals([b.royaltiesExact, exact]) : exact;
                } else if (g.cls === 'disputed') {
                    b.disputedCents += cents;
                    b.disputedCount += g.lines.length;
                } else {
                    b.estimatedCents += cents;
                    b.estimatedCount += g.lines.length;
                }
            }
            if (g.cls === 'counted') {
                // Monthly KPI series: bucket by the line's month when it is a real YYYY-MM.
                const perMonth = new Map();
                for (const l of g.lines) {
                    const m = monthOfRoyalty(l);
                    if (!perMonth.has(m)) perMonth.set(m, []);
                    perMonth.get(m).push(l);
                }
                for (const [m, ls] of perMonth) addMonth(m, g.currency, royaltyCentsFor(ls));
            }
            artistIds.add(g.artistId);
        }
    }

    // --- Merch settlements: integer net cents.
    for (const s of settlements) {
        const st = s.reviewState || 'reported';
        if (st === 'superseded') continue;
        const m = monthOfMerch(s);
        if (!m) { coverage.merchSettlements.excludedUnperioded++; continue; }
        if (!inPeriod(m)) continue;
        coverage.merchSettlements.records++;
        const ab = artistBucket(s.artistId);
        bucketAdd(ab, s.currency, st, s.netCents, 'merch');
        bucketAdd(totals, s.currency, st, s.netCents, 'merch');
        if (isCounted(st)) addMonth(m, s.currency, s.netCents);
        artistIds.add(s.artistId);
    }

    // --- Direct sales: integer net cents (gross minus refunds).
    for (const s of sales) {
        const st = s.reviewState || 'reported';
        if (st === 'superseded') continue;
        const m = monthOfSale(s);
        if (!m) { coverage.directSales.excludedUnperioded++; if (period) continue; }
        else if (!inPeriod(m)) continue;
        coverage.directSales.records++;
        const artistId = s.artistId || 'unattributed';
        const ab = artistBucket(artistId);
        bucketAdd(ab, s.currency, st, s.netCents, 'sales');
        bucketAdd(totals, s.currency, st, s.netCents, 'sales');
        if (isCounted(st)) addMonth(m, s.currency, s.netCents);
        artistIds.add(artistId);
    }

    // --- Manual adjustments: integer cents, labeled, with provenance.
    for (const a of adjustments) {
        const st = a.reviewState || 'reported';
        if (st === 'superseded') continue;
        const m = monthOfAdjustment(a);
        if (!m) { coverage.manualAdjustments.excludedUnperioded++; continue; }
        if (!inPeriod(m)) continue;
        coverage.manualAdjustments.records++;
        const ab = artistBucket(a.artistId);
        bucketAdd(ab, a.currency, st, a.amountCents, 'adjustments');
        bucketAdd(totals, a.currency, st, a.amountCents, 'adjustments');
        if (isCounted(st)) addMonth(m, a.currency, a.amountCents);
        artistIds.add(a.artistId);
    }

    return { byArtist, byMonth, totals, coverage, artistIds: [...artistIds] };
}

/** BigInt cents -> safe-integer Number. Throws if out of range (never silently float). */
function centsToNumber(cents) {
    const n = BigInt(cents);
    if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new Error('cents value out of safe integer range');
    }
    return Number(n);
}

/** Serialize a bucket (BigInt -> Number) for JSON responses. */
function bucketJson(b) {
    return {
        countedCents: centsToNumber(b.countedCents),
        approvedCents: centsToNumber(b.approvedCents),
        disputedCents: centsToNumber(b.disputedCents),
        estimatedCents: centsToNumber(b.estimatedCents),
        countedCount: b.countedCount,
        disputedCount: b.disputedCount,
        estimatedCount: b.estimatedCount,
        royaltiesCents: centsToNumber(b.royaltiesCents),
        royaltiesExact: b.royaltiesExact ? formatDecimal(b.royaltiesExact) : '0',
        merchSettlementsCents: centsToNumber(b.merchCents),
        directSalesCents: centsToNumber(b.salesCents),
        manualAdjustmentsCents: centsToNumber(b.adjustmentsCents)
    };
}

module.exports = {
    fetchIncomeData,
    aggregateIncome,
    bucketJson,
    centsToNumber,
    monthOfRoyalty,
    monthOfMerch,
    monthOfSale,
    monthOfAdjustment
};
