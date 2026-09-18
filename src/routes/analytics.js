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
        generateMonthlyReport, profile, SalesEntry
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

    // Endpoint: Log Real Sales Data
    // PHASE 4CF: sales entries are now DURABLE DB state (SalesEntry table).
    // They were a process-memory object — customer-entered revenue silently
    // reverted to synthetic random history on every restart. Also adds the
    // ghost-artistId guard (F-7): a sale must reference an existing artist.
    app.post('/v3/analytics/sales', authenticateToken, async (req, res) => {
        try {
            const { artistId, month, revenue } = req.body || {};
            if (typeof artistId !== 'string' || typeof month !== 'string' || !artistId.trim() || !month.trim() || revenue === undefined || revenue === null || revenue === '') {
                return res.status(400).json({ error: 'Missing fields' });
            }

            // NaN/boundless inputs would violate SalesEntry.revenue NOT NULL and
            // crash the handler → keep the client-format error a 400 (this was
            // accepted into memory pre-phase; the durable store is stricter).
            if (!require('../services/salesService').validMonth(month)) return res.status(400).json({ error: 'Month must be YYYY-MM' });
            if (!hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });
            const parsedRevenue = (typeof revenue === 'number' || typeof revenue === 'string' && revenue.trim() !== '') ? Number(revenue) : NaN;
            if (!Number.isFinite(parsedRevenue) || parsedRevenue < 0) return res.status(400).json({ error: 'Revenue must be a number' });

            // Canonical artist resolution (DB-first).
            const artist = await artistRepo.findById(artistId);
            if (!artist) return res.status(404).json({ error: 'Artist not found' });

            // Upsert by (artistId, month): same-month entries replace, matching
            // the original memory semantics.
            await SalesEntry.upsert({ artistId, month, revenue: parsedRevenue });

            const count = await SalesEntry.count({ where: { artistId } });
            res.json({ success: true, count });
        } catch (err) {
            logger.error('Sales persist failed:', err);
            if (!res.headersSent) return res.status(500).json({ error: 'Failed to persist sale' });
        }
    });

    app.get('/v3/analytics/projections', authenticateToken, async (req, res) => {
        const { artistId, months = '6' } = req.query;
        const horizon = Number(months);
        if (!Number.isInteger(horizon) || horizon < 1 || horizon > 24) return res.status(400).json({ error: 'months must be between 1 and 24' });
        if (artistId && !hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });
        try {
            const sales = require('../services/salesService');
            const artist = artistId ? await artistRepo.findById(artistId) : null;
            if (artistId && !artist) return res.status(404).json({ error: 'Artist not found' });
            const roster = artist ? [artist] : (await artistRepo.findAllHybrid()).filter(a => hasArtistAccess(req.user, a.id));
            const rows = await sales.history(roster.map(a => a.id));
            const result = sales.forecast(rows, horizon);
            const future = result.future;
            const byMonth = new Map(rows.map(r => [r.month, r.revenue]));
            const first = rows.length ? sales.monthIndex(rows[0].month) : 0;
            const last = rows.length ? sales.monthIndex(rows.at(-1).month) : -1;
            const labels = Array.from({ length: last - first + 1 }, (_, i) => sales.monthLabel(first + i));
            const historyValues = labels.map(month => byMonth.get(month) ?? null);
            const n = labels.length;
            res.json({ entity: artist?.name || 'Accessible artists', source: 'recorded_sales',
                note: rows.length < 3 ? 'Record at least three months to calculate a forecast.' : 'Forecast based on recorded sales. Missing months are gaps, not zero sales.',
                stats: { slope: result.slope, intercept: result.intercept },
                chartData: { labels: [...labels, ...future.map(r => r.month)], datasets: [
                    { label: 'Recorded sales', data: [...historyValues, ...future.map(() => null)], fill: true, tension: 0, spanGaps: false },
                    { label: 'Forecast (linear)', data: future.length ? [...Array(Math.max(0, n - 1)).fill(null), historyValues.at(-1), ...future.map(r => r.revenue)] : Array(n).fill(null), borderDash: [5, 5], fill: false, tension: 0 }
                ] } });
        } catch (err) {
            logger.error('Projection error:', err);
            res.status(500).json({ error: 'Projection failed' });
        }
    });
}
module.exports = { register };
