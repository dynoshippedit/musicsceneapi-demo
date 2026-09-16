/**
 * src/routes/analytics.js
 *
 * Analytics reads and the sales write. Projections regress SYNTHETIC data
 * (src/analytics/regression.js) because the Stats table is never populated.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (3):
 *   GET    /v3/analytics/geography
 *   POST   /v3/analytics/sales
 *   GET    /v3/analytics/projections
 */

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
        generateMonthlyReport
    } = ctx;

    // Endpoint: Get Geographic Analysis
    app.get('/v3/analytics/geography', authenticateToken, async (req, res) => {
        try {
            const geography = {};

            // Aggregate data
            labelData.artists.forEach(artist => {
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
                geography[key].percent = parseFloat(((geography[key].value / totalValue) * 100).toFixed(1));
            });

            res.json({
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
    app.post('/v3/analytics/sales', authenticateToken, (req, res) => {
        const { artistId, month, revenue } = req.body;
        if (!artistId || !month || !revenue) return res.status(400).json({ error: 'Missing fields' });

        if (!salesData[artistId]) salesData[artistId] = [];

        // Remove existing entry for same month if exists
        salesData[artistId] = salesData[artistId].filter(e => e.month !== month);

        salesData[artistId].push({ month, revenue: parseFloat(revenue) });
        res.json({ success: true, count: salesData[artistId].length });
    });

    // Endpoint: Get Revenue Projections
    app.get('/v3/analytics/projections', authenticateToken, async (req, res) => {
        const { artistId, months = 6 } = req.query;

        try {
            let currentRevenue = 0;
            let growthRate = 0;
            let name = "Label Wide";
            let historyValues = [];

            if (artistId) {
                const artist = labelData.artists.find(a => a.id === artistId);
                if (!artist) return res.status(404).json({ error: 'Artist not found' });

                name = artist.name;
                growthRate = artist.growthRate || 5;

                // USE REAL DATA IF AVAILABLE
                if (salesData[artistId] && salesData[artistId].length >= 3) {
                    // Sort by month (simple string sort for now, assuming ISO or 1-12)
                    const sorted = salesData[artistId].sort((a, b) => a.month.localeCompare(b.month));
                    historyValues = sorted.map(s => s.revenue);
                    currentRevenue = historyValues[historyValues.length - 1]; // Last known
                } else {
                    // Fallback to Synthetic
                    currentRevenue = (artist.revenue.streaming || 0) + (artist.revenue.touring || 0) + (artist.revenue.merch || 0);
                    historyValues = generateSyntheticHistory(currentRevenue, growthRate);
                }

            } else {
                // Check if labelData exists and has artists
                if (labelData && labelData.artists) {
                    // Calculate Sum manually to avoid dependency on getLabelOverview if undefined here
                    currentRevenue = labelData.artists.reduce((sum, a) =>
                        sum + ((a.revenue.streaming || 0) + (a.revenue.touring || 0) + (a.revenue.merch || 0)), 0);
                } else {
                    currentRevenue = 500000;
                }
                growthRate = 12; // Assumed label growth
                historyValues = generateSyntheticHistory(currentRevenue, growthRate);
            }

            // If we didn't get history from real data (or it wasn't enough points), we generated it above.
            const xHistory = Array.from({ length: historyValues.length }, (_, i) => i + 1);

            // 2. Perform Regression
            const model = performLinearRegression(xHistory, historyValues);

            // 3. Project Future (Next 'months')
            const projections = [];
            for (let i = 1; i <= parseInt(months); i++) {
                const nextMonthIndex = 12 + i;
                projections.push(Math.round(model.predict(nextMonthIndex)));
            }

            // 4. Format for Chart.js
            res.json({
                entity: name,
                stats: { slope: model.slope, intercept: model.intercept },
                chartData: {
                    labels: [...Array.from({ length: 12 }, (_, i) => `M${i + 1}`), ...Array.from({ length: parseInt(months) }, (_, i) => `Fut${i + 1}`)],
                    datasets: [
                        {
                            label: 'Historical',
                            data: [...historyValues, ...Array(parseInt(months)).fill(null)],
                            borderColor: '#666666',
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'Projection (Linear)',
                            data: [...Array(11).fill(null), historyValues[11], ...projections],
                            borderColor: '#00FF5F',
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0
                        }
                    ]
                }
            });

        } catch (err) {
            logger.error('Projection error:', err);
            res.status(500).json({ error: 'Projection failed' });
        }
    });
}

module.exports = { register };
