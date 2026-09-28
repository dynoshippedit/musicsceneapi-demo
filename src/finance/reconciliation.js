/**
 * src/finance/reconciliation.js
 *
 * The monthly-close reconciliation (2026-09-28, fixes 2 + 3, research
 * update 8): income from the reviewed records, cash evidence alongside
 * it, and evidence gaps — never a P&L, never a credit rating.
 *
 * Structure of the response:
 *   income     — per artist, per currency: trusted totals (reported +
 *                reconciled + approved) with disputed and estimated as
 *                SEPARATE lines, never summed into the trusted total.
 *   cash       — matched payout/deposit pairs (with links), unmatched
 *                payouts, unmatched deposits, and per-(period,currency)
 *                gaps (reported income vs matched cash received), each
 *                gap carrying owner + next action. Cash is EVIDENCE of the
 *                same income, never additional income: matched cash is
 *                never added to income totals (no double counting), and
 *                unmatched deposits are unresolved items, never silently
 *                added to income.
 *   evidenceGaps — missing expected reports, column layouts awaiting
 *                re-review, and unexplained variances. Shown, never
 *                auto-filled.
 *   coverage   — honest per-category period filtering.
 *
 * All money math here is integer cents or exact decimals; no floats.
 * Nothing here auto-approves: matching and gap annotations are human
 * actions recorded with identity.
 */

'use strict';

const { fetchIncomeData, aggregateIncome, bucketJson, centsToNumber } = require('./income');

const iso = (d) => (d ? new Date(d).toISOString() : null);

/**
 * Build the full reconciliation.
 *
 * @param {object} models  Sequelize models (RoyaltyLine, MerchSettlement,
 *                         DirectSale, ManualAdjustment, Payout,
 *                         BankDeposit, CashGapAnnotation, ExpectedReport,
 *                         SourceMapping, RoyaltyStatement)
 * @param {object} opts   { artistIds: null | string[], period: null | 'YYYY-MM' }
 */
async function buildReconciliation(models, { artistIds = null, period = null } = {}) {
    const data = await fetchIncomeData(models, { artistIds, period });
    const agg = aggregateIncome(data, period);

    const artists = [...agg.byArtist.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([artistId, currencies]) => {
            const totals = Object.fromEntries(
                [...currencies.entries()]
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .map(([currency, b]) => [currency, bucketJson(b)])
            );
            // Per-currency, per-source breakdown (trusted/counted income only).
            // Kept for API compatibility and so the monthly close can explain
            // every difference by income source; `totals` above carries the
            // review-state buckets the finance UI uses.
            const currenciesArr = [...currencies.entries()]
                .sort(([a], [b]) => (a < b ? -1 : 1))
                .map(([currency, b]) => {
                    const j = bucketJson(b);
                    const totalCents = j.royaltiesCents + j.merchSettlementsCents +
                        j.directSalesCents + j.manualAdjustmentsCents;
                    if (!Number.isSafeInteger(totalCents)) throw new Error('Total exceeds safe integer range');
                    return {
                        currency,
                        royaltiesCents: j.royaltiesCents,
                        royaltiesExact: j.royaltiesExact,
                        merchSettlementsCents: j.merchSettlementsCents,
                        directSalesCents: j.directSalesCents,
                        manualAdjustmentsCents: j.manualAdjustmentsCents,
                        totalCents,
                        disputedCount: j.disputedCount,
                        estimatedCount: j.estimatedCount
                    };
                });
            return { artistId, totals, currencies: currenciesArr };
        });

    const totals = Object.fromEntries(
        [...agg.totals.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([currency, b]) => [currency, bucketJson(b)])
    );

    const cash = await buildCashSection(models, agg, { period });
    const evidenceGaps = await buildEvidenceGaps(models, agg, { period });

    return {
        period: period || 'all',
        generatedAt: new Date().toISOString(),
        coverage: {
            ...agg.coverage,
            cash: {
                note: 'Payouts and deposits are bank-level cash evidence, not income. ' +
                    'They are not filtered by income period; gaps are computed per (period, currency) ' +
                    'between reported income and matched cash received.'
            }
        },
        artists,
        totals,
        cash,
        evidenceGaps,
        disclaimers: [
            'This is an income and cash reconciliation, not a profit-and-loss statement: costs, expenses, liabilities, and taxes are out of scope.',
            'Not a credit rating. No funder acceptance is implied.',
            'Trusted totals count reported, reconciled, and approved records only. Disputed and estimated amounts are shown separately and never summed into trusted totals. Superseded records are excluded everywhere.',
            'Matched payouts/deposits are cash evidence of the same income, not additional income — they are never added to income totals. Unmatched deposits are unresolved items, never silently added to income.',
            'All amounts are integer cents (royalty decimals summed exactly, then rounded half-up once per aggregate). No floating-point money.',
            'Deterministic calculations only; human reviewers control final amounts. No AI approval anywhere in this pipeline.'
        ]
    };
}

function serializePayout(p) {
    return {
        id: p.id,
        provider: p.provider,
        providerPayoutId: p.providerPayoutId,
        amountCents: p.amountCents,
        currency: p.currency,
        arrivalAt: iso(p.arrivalAt),
        status: p.status,
        syncedAt: iso(p.syncedAt),
        syncedBy: p.syncedBy || null,
        matchedDepositId: p.matchedDepositId || null,
        matchedAt: iso(p.matchedAt),
        matchedBy: p.matchedBy || null,
        matchNote: p.matchNote || null
    };
}

function serializeDeposit(d) {
    return {
        id: d.id,
        amountCents: d.amountCents,
        currency: d.currency,
        bankRef: d.bankRef,
        description: d.description || null,
        depositAt: iso(d.depositAt),
        enteredBy: d.enteredBy || null,
        matchedPayoutId: d.matchedPayoutId || null,
        matchedAt: iso(d.matchedAt),
        matchedBy: d.matchedBy || null,
        matchNote: d.matchNote || null
    };
}

async function buildCashSection(models, agg, { period }) {
    const { Payout, BankDeposit, CashGapAnnotation } = models;
    const [payouts, deposits, annotations] = await Promise.all([
        Payout.findAll({ order: [['id', 'ASC']] }),
        BankDeposit.findAll({ order: [['id', 'ASC']] }),
        CashGapAnnotation.findAll()
    ]);
    const annotationByKey = new Map(annotations.map((a) => [a.gapKey, a]));
    const depositById = new Map(deposits.map((d) => [d.id, d]));

    const matched = [];
    const unmatchedPayouts = [];
    for (const p of payouts) {
        const d = p.matchedDepositId ? depositById.get(p.matchedDepositId) : null;
        if (d) {
            matched.push({
                payoutId: p.id,
                depositId: d.id,
                provider: p.provider,
                providerPayoutId: p.providerPayoutId,
                payoutCents: p.amountCents,
                depositCents: d.amountCents,
                currency: p.currency,
                // The deposit (bank receipt) is ground truth; any payout/
                // deposit difference is itself a visible difference.
                differenceCents: d.amountCents - p.amountCents,
                arrivalAt: iso(p.arrivalAt),
                depositAt: iso(d.depositAt),
                bankRef: d.bankRef,
                matchedBy: p.matchedBy || null,
                matchNote: p.matchNote || null
            });
        } else {
            unmatchedPayouts.push(serializePayout(p));
        }
    }
    const matchedDepositIds = new Set(matched.map((m) => m.depositId));
    const unmatchedDeposits = deposits
        .filter((d) => !matchedDepositIds.has(d.id))
        .map(serializeDeposit);

    // Gaps: reported (trusted) income vs matched cash received, per
    // (period, currency). Cash received = matched deposit amounts whose
    // depositDate falls in the period.
    const gapPeriods = period ? [period] : [...agg.byMonth.keys()].sort();
    const receivedByKey = new Map(); // `${period}|${currency}` -> BigInt
    for (const m of matched) {
        const dd = m.depositAt ? String(m.depositAt).slice(0, 10) : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dd)) continue;
        const mp = dd.slice(0, 7);
        const key = `${mp}|${String(m.currency).toUpperCase()}`;
        receivedByKey.set(key, (receivedByKey.get(key) || 0n) + BigInt(m.depositCents));
    }
    // Reported income per (period, currency) comes from the shared
    // monthly aggregation the KPIs use — no refetch, so the artist scope
    // matches the rest of the reconciliation.
    const gaps = [];
    for (const gp of gapPeriods) {
        const monthMap = agg.byMonth.get(gp);
        if (!monthMap) continue;
        for (const [currency, reported] of [...monthMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
            const key = `${gp}|${currency}`;
            const received = receivedByKey.get(key) || 0n;
            const ann = annotationByKey.get(key);
            // Ensure an annotatable row exists for this computed gap.
            const [annRow] = await CashGapAnnotation.findOrCreate({
                where: { gapKey: key },
                defaults: { gapKey: key, period: gp, currency, status: 'open' }
            });
            const ann2 = annRow;
            gaps.push({
                key,
                period: gp,
                currency,
                annotationId: ann2.id,
                reportedCents: centsToNumber(reported),
                receivedCents: centsToNumber(received),
                differenceCents: centsToNumber(reported - received),
                gapCents: centsToNumber(reported - received),
                owner: ann2.owner || null,
                nextAction: ann2.nextAction || null,
                status: ann2.status || 'open'
            });
        }
    }

    return {
        matched,
        unmatchedPayouts,
        unmatchedDeposits,
        gaps,
        note: 'Matched payouts/deposits are cash evidence of the same income, never additional income. ' +
            'Unmatched deposits are unresolved items — they are NOT added to income. ' +
            'Each gap carries an owner and next action; set them via POST /v3/financials/gaps/:id/annotate.'
    };
}

/**
 * Trusted income totals for one gap period. The main aggregation already
 * computed the requested period; for the all-time view we re-aggregate per
 * month cheaply from the same fetched data. To keep this simple and
 * honest, gaps in the all-time view reuse the period-filtered aggregation
 * per month via the fetched records.
 */
async function aggregateIncomeForGap(models, agg, gapPeriod) {
    // agg was built for the requested period already; if it matches, reuse.
    if (agg.coverage.period === gapPeriod) return agg;
    const data = await fetchIncomeData(models, { period: gapPeriod });
    return aggregateIncome(data, gapPeriod);
}

async function buildEvidenceGaps(models, agg, { period }) {
    const { ExpectedReport, SourceMapping, RoyaltyStatement } = models;
    const gaps = [];

    // 1. Missing expected reports: an expected report for the period
    //    with no active statement for (source, period). Never auto-filled.
    const expectedWhere = {};
    if (period) expectedWhere.period = period;
    const expected = await ExpectedReport.findAll({ where: expectedWhere, order: [['customer', 'ASC'], ['source', 'ASC']] });
    for (const e of expected) {
        const stmt = await RoyaltyStatement.findOne({
            where: { source: e.source, period: e.period, status: 'active' }
        });
        const overdue = e.expectedBy && e.expectedBy < new Date().toISOString().slice(0, 10);
        if (!stmt) {
            gaps.push({
                type: overdue ? 'missing_expected_report_overdue' : 'missing_expected_report',
                customer: e.customer,
                labelName: e.labelName || null,
                source: e.source,
                period: e.period,
                expectedBy: e.expectedBy,
                overdue: !!overdue,
                notes: e.notes || null,
                message: `expected report from "${e.customer}" (${e.source}) for ${e.period} has not arrived` +
                    (e.expectedBy ? ` (expected by ${e.expectedBy}${overdue ? ', overdue' : ''})` : '') +
                    ' — shown as a gap, never auto-filled'
            });
        } else if (e.expectedSchemaHash && stmt.formatHash && e.expectedSchemaHash !== stmt.formatHash) {
            // Changed schema: the statement arrived but its column layout
            // differs from what was expected — flag for re-review.
            gaps.push({
                type: 'changed_schema',
                customer: e.customer,
                source: e.source,
                period: e.period,
                statementId: stmt.id,
                message: `statement #${stmt.id} from "${e.customer}" (${e.source}) for ${e.period} arrived with a ` +
                    'changed column layout vs the expected schema — re-review required before trusting it'
            });
        }
    }

    // 2. Column layouts awaiting re-review: a 'seen' mapping for a source
    //    that already has an approved mapping for a different layout.
    const seen = await SourceMapping.findAll({ where: { status: 'seen' } });
    for (const s of seen) {
        const approved = await SourceMapping.findOne({
            where: { source: s.source, status: 'approved' }
        });
        if (approved && approved.headerHash !== s.headerHash) {
            gaps.push({
                type: 'mapping_review_required',
                source: s.source,
                message: `column layout for "${s.source}" changed since approved mapping v${approved.mappingVersion} ` +
                    `(approved by ${approved.approvedBy}); the new layout was recorded but not inherited — re-review required`,
                mappingId: s.id
            });
        }
    }

    // 3. Unexplained variance: an active statement whose trusted total
    //    moved more than the flag threshold vs the prior YYYY-MM statement
    //    for the same source. Deterministic; the reviewer explains it.
    const VARIANCE_THRESHOLD = 0.5; // 50% — documented, not tuned by AI
    if (period && /^\d{4}-\d{2}$/.test(period)) {
        const priorPeriod = prevMonth(period);
        const statements = await RoyaltyStatement.findAll({
            where: { period, status: 'active' }
        });
        for (const st of statements) {
            const prior = await RoyaltyStatement.findOne({
                where: { source: st.source, period: priorPeriod, status: 'active' }
            });
            if (!prior) continue;
            const [cur, prev] = await Promise.all([
                statementTrustedCents(models, st.id),
                statementTrustedCents(models, prior.id)
            ]);
            for (const currency of Object.keys(cur)) {
                const a = cur[currency] || 0n;
                const b = prev[currency] || 0n;
                if (b === 0n) continue;
                const change = Number(a - b) / Number(b < 0n ? -b : b);
                if (Math.abs(change) >= VARIANCE_THRESHOLD) {
                    gaps.push({
                        type: 'unexplained_variance',
                        source: st.source,
                        period,
                        currency,
                        priorPeriod,
                        changePercent: Math.round(change * 1000) / 10,
                        message: `statement from "${st.source}" for ${period} moved ` +
                            `${Math.round(change * 1000) / 10}% vs ${priorPeriod} — reviewer must explain or dispute`
                    });
                }
            }
        }
    }

    return gaps;
}

function prevMonth(period) {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
}

/** Trusted (reported/reconciled/approved) exact-decimal total per currency for one statement. */
async function statementTrustedCents(models, statementId) {
    const { RoyaltyLine } = models;
    const { isCounted } = require('./reviewState');
    const { sumDecimals, parseDecimal, decimalToCents } = require('./decimal');
    const lines = await RoyaltyLine.findAll({ where: { statementId } });
    const byCurrency = new Map();
    for (const l of lines) {
        if (!isCounted(l.reviewState)) continue;
        const cur = String(l.currency).toUpperCase();
        if (!byCurrency.has(cur)) byCurrency.set(cur, []);
        byCurrency.get(cur).push(parseDecimal(l.amountDecimal));
    }
    const out = {};
    for (const [cur, ds] of byCurrency) out[cur] = decimalToCents(sumDecimals(ds));
    return out;
}

module.exports = { buildReconciliation, buildCashSection, buildEvidenceGaps };
