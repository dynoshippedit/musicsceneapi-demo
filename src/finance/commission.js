/**
 * src/finance/commission.js
 *
 * Contract-specific commission worksheet (research update 8).
 *
 * The contract basis is stored as DATA on the artist/team
 * (CommissionContract: rate in integer basis points, base definition,
 * effective dates, exclusions, source description) — never inferred. The
 * worksheet shows the chosen basis and its source (contract id + who stored
 * it + where the terms came from), then computes the draft commission
 * DETERMINISTICALLY:
 *
 *     commissionCents = roundHalfUp(baseCents * rateBps / 10000)
 *
 * No AI anywhere in this calculation. The worksheet is a draft: it is
 * computed only from the trusted review states, it reports how much of
 * the basis is already `approved` (vs merely reported/reconciled), and it
 * refuses to present itself as a payment instruction.
 *
 * Bases:
 *   counted_net_income   — royalties (counted, exact) + merch net
 *                          (counted) + direct-sales net (counted) +
 *                          manual adjustments (counted), for the period.
 *   counted_gross_income — as above but direct-sales gross and merch
 *                          gross instead of net.
 *   cash_receipts        — matched bank deposits for the period (cash
 *                          evidence tied to a provider payout by a human
 *                          match). Unmatched deposits are NOT included.
 *
 * Exclusions (CommissionContract.exclusions, JSON object):
 *   { categories: ['royalties'|'merch'|'direct_sales'|'manual'],
 *     royaltySources: ['spotify', ...] }  — drop a category, or drop
 *     royalty lines whose source matches (case-insensitive).
 */

'use strict';

const { fetchIncomeData, aggregateIncome, centsToNumber } = require('./income');
const { sumDecimals, parseDecimal, decimalToCents } = require('./decimal');
const { isCounted, isApproved } = require('./reviewState');

const BASES = {
    counted_net_income: {
        label: 'Counted net income',
        description: 'Royalties (exact, counted) + merch net + direct-sales net + manual adjustments, trusted states only, for the period. Refunds already deducted via net figures.'
    },
    counted_gross_income: {
        label: 'Counted gross income',
        description: 'As counted net income, but direct-sales gross and merch gross instead of net.'
    },
    cash_receipts: {
        label: 'Cash receipts',
        description: 'Matched bank deposits for the period — cash evidence tied to a provider payout by a human match. Unmatched deposits are never included.'
    }
};

const VALID_CATEGORIES = ['royalties', 'merch', 'direct_sales', 'manual'];

function validateExclusions(excl) {
    const problems = [];
    if (!excl || typeof excl !== 'object' || Array.isArray(excl)) {
        problems.push('exclusions must be an object { categories: [...], royaltySources: [...] }');
        return problems;
    }
    for (const key of ['categories', 'royaltySources']) {
        if (excl[key] === undefined) continue;
        if (!Array.isArray(excl[key]) || !excl[key].every((x) => typeof x === 'string')) {
            problems.push(`exclusions.${key} must be an array of strings`);
        }
    }
    for (const c of (excl.categories || [])) {
        if (!VALID_CATEGORIES.includes(String(c).toLowerCase())) {
            problems.push(`unknown exclusion category "${c}" (valid: ${VALID_CATEGORIES.join(', ')})`);
        }
    }
    return problems;
}

function parseExclusions(contract) {
    const raw = contract.exclusions;
    if (!raw) return { categories: [], royaltySources: [] };
    let obj = raw;
    if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch { return { categories: [], royaltySources: [] }; }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { categories: [], royaltySources: [] };
    if (validateExclusions(obj).length) return { categories: [], royaltySources: [] };
    return {
        categories: (obj.categories || []).map((c) => String(c).toLowerCase()),
        royaltySources: (obj.royaltySources || []).map((s) => String(s).toLowerCase())
    };
}

/** Round half up: BigInt cents * integer bps / 10000 -> BigInt cents. */
function commissionCents(baseCents, rateBps) {
    const product = BigInt(baseCents) * BigInt(rateBps);
    const q = product / 10000n;
    const r = product % 10000n;
    const absR = r < 0n ? -r : r;
    if (absR * 2n < 10000n) return q;
    return product >= 0n ? q + 1n : q - 1n;
}

/** Exact display of integer basis points: 1500 -> "15.00". No float. */
function ratePercentString(rateBps) {
    return `${Math.floor(rateBps / 100)}.${String(rateBps % 100).padStart(2, '0')}`;
}

function contractCoversPeriod(contract, period) {
    // period is YYYY-MM; contract dates are YYYY-MM-DD.
    const start = `${period}-01`;
    if (String(contract.effectiveFrom) > start) return false;
    if (contract.effectiveTo && String(contract.effectiveTo) < start) return false;
    return true;
}

/**
 * Compute the draft commission worksheet.
 *
 * @param {object} models  Sequelize models
 * @param {object} opts    { artistId, period ('YYYY-MM'), contract (plain object) }
 */
async function buildWorksheet(models, { artistId, period, contract }) {
    const { RoyaltyLine, MerchSettlement, DirectSale, ManualAdjustment, BankDeposit } = models;
    if (!artistId) throw Object.assign(new Error('artistId is required'), { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(String(period || ''))) {
        throw Object.assign(new Error('period must be YYYY-MM'), { status: 400 });
    }
    if (!contract) throw Object.assign(new Error('contract is required'), { status: 400 });

    const base = BASES[contract.basis];
    if (!base) {
        throw Object.assign(new Error(`unknown commission base "${contract.basis}"`), { status: 400 });
    }
    const rateBps = Number(contract.rateBps);
    if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) {
        throw Object.assign(new Error('contract rateBps must be an integer 0..10000'), { status: 400 });
    }
    const coversPeriod = contractCoversPeriod(contract, period);
    const exclusions = parseExclusions(contract);
    const dropSource = new Set(exclusions.royaltySources);
    const dropCategory = (name) => exclusions.categories.includes(name);

    const breakdown = {}; // currency -> { royalties, merch, directSales, manual, cash }
    const newCat = () => ({ royalties: 0n, merch: 0n, directSales: 0n, manual: 0n, cash: 0n });
    const cur = (c) => {
        const k = String(c || 'USD').toUpperCase();
        if (!breakdown[k]) breakdown[k] = newCat();
        return breakdown[k];
    };

    if (contract.basis === 'cash_receipts') {
        // Matched deposits for the period. Deposits are label-level; the
        // worksheet attributes matched cash to the artist's close by
        // period — a documented product limitation, not a guess. Per-artist
        // cash attribution requires a real allocation rule before it can
        // be claimed as artist-level.
        const deposits = await BankDeposit.findAll();
        for (const d of deposits) {
            if (!d.matchedPayoutId) continue; // unmatched deposits never included
            const dd = d.depositAt ? new Date(d.depositAt).toISOString().slice(0, 10) : '';
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dd) || dd.slice(0, 7) !== period) continue;
            cur(d.currency).cash += BigInt(d.amountCents);
        }
    } else {
        const gross = contract.basis === 'counted_gross_income';
        const data = await fetchIncomeData(models, { artistIds: [artistId], period });
        // Royalties (exact decimals, trusted only, source exclusions applied)
        {
            const byCurrency = new Map();
            for (const l of data.royaltyLines) {
                if (!isCounted(l.reviewState)) continue;
                if (String(l.period) !== period) continue;
                if (dropSource.has(String(l.source || '').toLowerCase())) continue;
                if (dropCategory('royalties')) continue;
                const k = String(l.currency).toUpperCase();
                if (!byCurrency.has(k)) byCurrency.set(k, []);
                byCurrency.get(k).push(parseDecimal(l.amountDecimal));
            }
            for (const [k, decs] of byCurrency) {
                cur(k).royalties += decimalToCents(sumDecimals(decs));
            }
        }
        // Merch settlements
        if (!dropCategory('merch')) {
            for (const s of data.settlements) {
                if (!isCounted(s.reviewState)) continue;
                const m = String(s.showDate || '').slice(0, 7);
                if (m !== period) continue;
                cur(s.currency).merch += BigInt(gross ? s.grossCents : s.netCents);
            }
        }
        // Direct sales
        if (!dropCategory('direct_sales')) {
            for (const s of data.sales) {
                if (!isCounted(s.reviewState)) continue;
                if (!s.artistId || s.artistId !== artistId) continue;
                if (!s.occurredAt) continue;
                if (new Date(s.occurredAt).toISOString().slice(0, 7) !== period) continue;
                cur(s.currency).directSales += BigInt(gross ? s.amountCents : s.netCents);
            }
        }
        // Manual adjustments
        if (!dropCategory('manual')) {
            for (const a of data.adjustments) {
                if (!isCounted(a.reviewState)) continue;
                if (String(a.month) !== period) continue;
                cur(a.currency).manual += BigInt(a.amountCents);
            }
        }
    }

    // Approval depth: how much of the trusted base is already `approved`
    // (vs merely reported/reconciled). Same aggregation the reconciliation
    // uses, so the numbers agree.
    const agg = aggregateIncome(await fetchIncomeData(models, { artistIds: [artistId], period }), period);
    const approval = {};
    for (const [currency, b] of agg.totals) {
        const counted = b.countedCents;
        approval[currency] = {
            approvedCents: centsToNumber(b.approvedCents),
            countedCents: centsToNumber(counted),
            // Display-only ratio; money math stays in BigInt.
            approvedShare: counted === 0n ? 1 : Number(b.approvedCents) / Number(counted)
        };
    }

    const bases = {};
    for (const [currency, cats] of Object.entries(breakdown)) {
        const baseCents = contract.basis === 'cash_receipts'
            ? cats.cash
            : cats.royalties + cats.merch + cats.directSales + cats.manual;
        const comm = commissionCents(baseCents, rateBps);
        bases[currency] = {
            royaltiesCents: centsToNumber(cats.royalties),
            merchCents: centsToNumber(cats.merch),
            directSalesCents: centsToNumber(cats.directSales),
            manualCents: centsToNumber(cats.manual),
            cashReceiptsCents: centsToNumber(cats.cash),
            baseCents: centsToNumber(baseCents),
            commissionCents: centsToNumber(comm),
            exclusionsApplied: exclusions
        };
    }

    const allApproved = Object.values(approval).every((a) => a.approvedShare >= 1);

    return {
        artistId,
        period,
        status: coversPeriod
            ? (allApproved ? 'draft_basis_approved' : 'draft_basis_not_fully_approved')
            : 'draft_contract_not_effective_for_period',
        contract: {
            id: contract.id,
            name: contract.name || null,
            source: `CommissionContract #${contract.id} (stored by ${contract.enteredBy || 'unknown'})` +
                (contract.sourceDescription ? ` — terms from: ${contract.sourceDescription}` : ''),
            rateBps,
            ratePercent: `${ratePercentString(rateBps)}%`,
            basis: contract.basis,
            baseLabel: base.label,
            baseDescription: base.description,
            effectiveFrom: contract.effectiveFrom,
            effectiveTo: contract.effectiveTo || null,
            coversPeriod,
            exclusions
        },
        bases,
        underlyingApproval: {
            allApproved,
            byCurrency: approval,
            note: allApproved
                ? 'The entire commission basis is in approved state.'
                : 'Part of the commission basis is not yet approved — this worksheet is a DRAFT. Approve the underlying lines before relying on it.'
        },
        computedBy: 'deterministic calculation — no AI involved',
        disclaimers: [
            'Draft worksheet only — not a payment instruction and not legal or tax advice.',
            'Computed deterministically from the stored contract and the trusted review states. No AI was involved in the calculation.',
            'Cash-receipts base: deposits are label-level; attribution of matched cash to one artist close is by period, documented here rather than guessed.'
        ]
    };
}

module.exports = { buildWorksheet, BASES, commissionCents, validateExclusions, ratePercentString };
