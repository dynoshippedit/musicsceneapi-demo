/**
 * src/finance/kpi.js
 *
 * Dashboard headline KPIs, derived from the SAME reviewed income pipeline
 * as the reconciliation (2026-09-28, fix 2). There is no second money
 * source: monthlyRevenue / quarterlyProjection / annualProjection all
 * come from counted (reported + reconciled + approved) income, bucketed by
 * month, in integer cents. Disputed and estimated amounts are excluded
 * from the KPIs and reported separately. Counted money never touches a
 * float: it is BigInt cents from the database to the response.
 *
 * Projections are a deterministic linear trend over the monthly series
 * (src/services/salesService.forecast) — labeled as such, never
 * presented as a guarantee, and never computed by AI. The regression
 * itself runs on numbers (a statistical estimate, not a settlement
 * amount); every projected month is rounded to an integer cent at the
 * boundary (Math.round — round-half-up for non-negative values, and
 * forecasts are floored at zero), so the API never returns fractional
 * cents.
 */

'use strict';

const { fetchIncomeData, aggregateIncome, centsToNumber } = require('./income');

function monthIndex(month) {
    const [y, m] = month.split('-').map(Number);
    return y * 12 + (m - 1);
}

/**
 * Build label-level KPIs.
 *
 * @param {object} models   Sequelize models
 * @param {object} sales    salesService (forecast)
 * @param {object} opts     { artistIds: null | string[] }
 */
async function buildLabelKpis(models, sales, { artistIds = null } = {}) {
    const data = await fetchIncomeData(models, { artistIds, period: null });
    const agg = aggregateIncome(data, null);

    // Monthly series per currency, counted income only.
    const months = [...agg.byMonth.keys()].sort();
    const currencies = new Set();
    for (const m of months) for (const c of agg.byMonth.get(m).keys()) currencies.add(c);

    const series = {};
    for (const c of [...currencies].sort()) {
        series[c] = months.map((month) => ({
            month,
            revenueCents: centsToNumber(agg.byMonth.get(month).get(c) || 0n)
        }));
    }

    const monthlyRevenueCents = {};
    const quarterlyProjectionCents = {};
    const annualProjectionCents = {};
    const projectionNotes = {};
    let latestMonth = null;

    for (const [currency, rows] of Object.entries(series)) {
        const nonEmpty = rows.filter((r) => r.revenueCents !== 0);
        latestMonth = rows.length ? rows[rows.length - 1].month : latestMonth;
        const current = rows.length ? rows[rows.length - 1].revenueCents : 0;
        monthlyRevenueCents[currency] = current;

        const forecastRows = rows.map((r) => ({ month: r.month, revenue: r.revenueCents }));
        if (forecastRows.length >= 3) {
            const q = sales.forecast(forecastRows, 3);
            const a = sales.forecast(forecastRows, 12);
            quarterlyProjectionCents[currency] = q.future.reduce((s, r) => s + r.revenue, 0);
            annualProjectionCents[currency] = a.future.reduce((s, r) => s + r.revenue, 0);
            projectionNotes[currency] = 'Linear trend projection over counted monthly income. Missing months are gaps, not zero income. Not a guarantee.';
        } else {
            quarterlyProjectionCents[currency] = null;
            annualProjectionCents[currency] = null;
            projectionNotes[currency] = 'Record at least three months of counted income to calculate a projection.';
        }
        void nonEmpty;
    }

    const reviewTotals = {};
    for (const [currency, b] of agg.totals) {
        reviewTotals[currency] = {
            countedCents: centsToNumber(b.countedCents),
            disputedCents: centsToNumber(b.disputedCents),
            estimatedCents: centsToNumber(b.estimatedCents)
        };
    }

    const primaryCurrency = agg.totals.has('USD') ? 'USD' : [...agg.totals.keys()].sort()[0] || 'USD';

    return {
        source: 'reconciliation',
        basis: 'Counted review states only (reported, reconciled, approved). Disputed and estimated amounts are excluded from headline KPIs and reported separately in reviewTotals.',
        month: latestMonth,
        primaryCurrency,
        monthlyRevenueCents,
        quarterlyProjectionCents,
        annualProjectionCents,
        projectionNotes,
        reviewTotals,
        coverage: agg.coverage,
        seriesMonths: months,
        generatedAt: new Date().toISOString()
    };
}

module.exports = { buildLabelKpis, monthIndex };
