// Scoped analytics and durable sales. Forecasts use recorded calendar months.
'use strict';

/**
 * @param {object} app Express application
 * @param {object} ctx dependency bundle from src/routes/context.js
 */
function register(app, ctx) {
    const {
        config, logger, JWT_SECRET, bcrypt, jwt, fs, path,
        sequelize, User, Artist, Stats,
        authenticateToken, hasArtistAccess, filterDataByAccess, checkExportAccess, generateToken,
        calculateTotalRevenue, flattenData, filterMetrics,
        generatePieChart, generateBarChart, generateLineChart, generateDonutChart,
        cache, emailService, sendEmail, entityAuditService,
        artistRepo, labelData, getArtistData, getAllArtists,
        operationsRepo, operationsData,
        prospects, anrSubmissions, anrState, userIntegrations, salesData, apiCache,
        aiService, performLinearRegression, generateSyntheticHistory,
        integrationFacade, fetchArtistData, getIntegrationStatus, SERVICES, limiters,
        generateMonthlyReport, profile, SalesEntry, auditService,
        // Monthly close (2026-09-28): reviewed-income pipeline models.
        RoyaltyLine, MerchSettlement, DirectSale, ManualAdjustment
    } = ctx;

    // Endpoint: Get Geographic Analysis
    app.get('/v3/analytics/geography', authenticateToken, async (req, res) => {
        try {
            const geography = {};

            const roster = (await artistRepo.findAllHybrid()).filter(artist => hasArtistAccess(req.user, artist.id));
            roster.forEach(artist => {
                if (artist.revenue && artist.revenue.streamingBreakdown && artist.revenue.streamingBreakdown.byLocation) {
                    artist.revenue.streamingBreakdown.byLocation.forEach(loc => {
                        if (!geography[loc.region]) {
                            geography[loc.region] = { value: 0, percent: 0, count: 0 };
                        }
                        geography[loc.region].value += loc.value;
                        geography[loc.region].count++;
                    });
                }
            });

            // Normalize percentages (just relative to total tracked value)
            const totalValue = Object.values(geography).reduce((acc, curr) => acc + curr.value, 0);
            Object.keys(geography).forEach(key => {
                geography[key].percent = parseFloat((totalValue ? (geography[key].value / totalValue) * 100 : 0).toFixed(1));
            });

            res.json({
                source: config.useRealData ? 'roster' : 'fixture',
                regions: Object.entries(geography).map(([region, data]) => ({
                    region,
                    value: data.value,
                    percent: data.percent
                }))
            });

        } catch (err) {
            logger.error('Geography error:', err);
            res.status(500).json({ error: 'Geography analysis failed' });
        }
    });

    // Endpoint: Log a manual income adjustment (monthly close).
    //
    // 2026-09-28, fix 2: the old float SalesEntry rows were the second
    // money source that made the dashboard KPIs disagree with the
    // reconciliation. This endpoint now records a labeled ManualAdjustment
    // with provenance (who entered it, what it corrects) inside the
    // reviewed income pipeline. Amounts are integer cents -- parsed from a
    // decimal string, never through a float.
    //
    // Body: { artistId, month (YYYY-MM), amount (decimal string dollars) or
    //   amountCents (integer), note, reviewState? }
    app.post('/v3/analytics/sales', authenticateToken, async (req, res) => {
        try {
            const { artistId, month, amount, amountCents, note, reviewState } = req.body || {};
            if (typeof artistId !== 'string' || typeof month !== 'string' || !artistId.trim() || !month.trim()) {
                return res.status(400).json({ error: 'Missing fields: artistId, month' });
            }
            if (!require('../services/salesService').validMonth(month)) return res.status(400).json({ error: 'Month must be YYYY-MM' });
            if (!hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });
            const artist = await artistRepo.findById(artistId);
            if (!artist) return res.status(404).json({ error: 'Artist not found' });

            let cents;
            if (amountCents !== undefined && amountCents !== null && amountCents !== '') {
                if (!/^\d+$/.test(String(amountCents))) return res.status(400).json({ error: 'amountCents must be a non-negative integer' });
                cents = Number(String(amountCents));
                if (!Number.isSafeInteger(cents)) return res.status(400).json({ error: 'amountCents out of range' });
            } else if (amount !== undefined && amount !== null && amount !== '') {
                const { parseDecimal, decimalToCents } = require('../finance/decimal');
                try {
                    cents = Number(decimalToCents(parseDecimal(String(amount))));
                } catch {
                    return res.status(400).json({ error: 'amount must be a decimal number' });
                }
                if (!Number.isSafeInteger(cents) || cents < 0) return res.status(400).json({ error: 'amount out of range' });
            } else {
                return res.status(400).json({ error: 'Missing amount: provide amount (decimal dollars) or amountCents (integer)' });
            }
            const { isReviewState } = require('../finance/reviewState');
            const state = reviewState ? String(reviewState) : 'reported';
            if (!isReviewState(state) || state === 'superseded') return res.status(400).json({ error: 'reviewState must be one of: reported, reconciled, approved, disputed, estimated' });
            // Upsert by (artistId, month) for this entry source: logging the same
            // month again replaces the amount, matching the old SalesEntry
            // semantics. (General ledger adjustments via /v3/financials/* may
            // legitimately share a month; only manual_entry_api rows upsert.)
            let adj = await ManualAdjustment.findOne({
                where: { artistId, month, source: 'manual_entry_api' }
            });
            if (adj) {
                await adj.update({
                    amountCents: cents,
                    note: note ? String(note) : adj.note,
                    enteredBy: req.user.email || null,
                    enteredAt: new Date()
                });
            } else {
                adj = await ManualAdjustment.create({
                    artistId, month, currency: 'USD', amountCents: cents,
                    source: 'manual_entry_api',
                    note: note ? String(note) : 'Logged via /v3/analytics/sales (manual entry, not source evidence)',
                    reviewState: state,
                    reviewedBy: req.user.email || null,
                    enteredBy: req.user.email || null,
                    enteredAt: new Date()
                });
            }
            if (auditService && typeof auditService.emitAudit === 'function') {
                auditService.emitAudit({
                    action: 'finance.manual-sale', resourceType: 'ManualAdjustment',
                    resourceId: String(adj.id),
                    metadata: { artistId, month, amountCents: cents },
                    req
                });
            }
            const count = await ManualAdjustment.count({ where: { artistId } });
            res.json({ success: true, id: adj.id, count });
        } catch (err) {
            logger.error('Sales persist failed:', err);
            if (!res.headersSent) return res.status(500).json({ error: 'Failed to persist adjustment' });
        }
    });

    // Projections from the reviewed income pipeline (2026-09-28, fix 2):
    // the forecast basis is counted (reported/reconciled/approved) income,
    // never the old float SalesEntry history.
    app.get('/v3/analytics/projections', authenticateToken, async (req, res) => {
        const { artistId, months = '6' } = req.query;
        const horizon = Number(months);
        if (!Number.isInteger(horizon) || horizon < 1 || horizon > 24) return res.status(400).json({ error: 'months must be between 1 and 24' });
        if (artistId && !hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });
        try {
            const sales = require('../services/salesService');
            const { fetchIncomeData, aggregateIncome, centsToNumber } = require('../finance/income');
            const artist = artistId ? await artistRepo.findById(artistId) : null;
            if (artistId && !artist) return res.status(404).json({ error: 'Artist not found' });
            const roster = artist ? [artist] : (await artistRepo.findAllHybrid()).filter(a => hasArtistAccess(req.user, a.id));
            const data = await fetchIncomeData({ RoyaltyLine, MerchSettlement, DirectSale, ManualAdjustment }, { artistIds: roster.map(a => a.id), period: null });
            const agg = aggregateIncome(data, null);
            const monthsSorted = [...agg.byMonth.keys()].sort();
            const currency = agg.totals.has('USD') ? 'USD' : [...agg.totals.keys()].sort()[0] || 'USD';
            const rows = monthsSorted.map((month) => ({
                month,
                revenue: centsToNumber(agg.byMonth.get(month).get(currency) || 0n)
            }));
            const result = sales.forecast(rows, horizon);
            const future = result.future;
            const byMonth = new Map(rows.map(r => [r.month, r.revenue]));
            const first = rows.length ? sales.monthIndex(rows[0].month) : 0;
            const last = rows.length ? sales.monthIndex(rows.at(-1).month) : -1;
            const labels = Array.from({ length: last - first + 1 }, (_, i) => sales.monthLabel(first + i));
            const historyValues = labels.map(month => byMonth.get(month) ?? null);
            const n = labels.length;
            res.json({ entity: artist?.name || 'Accessible artists', source: 'reconciliation',
                note: rows.length < 3 ? 'Record at least three months to calculate a forecast.' : 'Forecast based on counted, reviewed income (reported, reconciled, approved). Missing months are gaps, not zero sales. Disputed and estimated amounts are excluded.',
                basis: 'counted_reviewed_income',
                stats: { slope: result.slope, intercept: result.intercept },
                chartData: { labels: [...labels, ...future.map(r => r.month)], datasets: [
                    { label: 'Recorded income (counted)', data: [...historyValues, ...future.map(() => null)], fill: true, tension: 0, spanGaps: false },
                    { label: 'Forecast (linear)', data: future.length ? [...Array(Math.max(0, n - 1)).fill(null), historyValues.at(-1), ...future.map(r => r.revenue)] : Array(n).fill(null), borderDash: [5, 5], fill: false, tension: 0 }
                ] } });
        } catch (err) {
            logger.error('Projection error:', err);
            res.status(500).json({ error: 'Projection failed' });
        }
    });
}

module.exports = { register };
