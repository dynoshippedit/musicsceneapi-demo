/**
 * src/routes/label.js
 *
 * Label-level aggregates, tours and fan demographics.
 *
 * Handler bodies were moved VERBATIM from production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (3):
 *   GET    /v3/tours
 *   GET    /v3/fans/demographics
 *   GET    /v3/label/overview
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
        generateMonthlyReport, profile
    } = ctx;

    // Get global tours (consolidated)
    app.get('/v3/tours', authenticateToken, async (req, res) => {
        const { artistId } = req.query;
        try {
            const artists = await Artist.findAll();
            let relevantArtists = artists.map(a => a.data).filter(a => hasArtistAccess(req.user, a.id));

            if (artistId) {
                relevantArtists = relevantArtists.filter(a => a.id === artistId);
            }

            // ... rest of logic relies on mapping relevantArtists
            // We reuse existing logic but inserted async fetch first
            const tours = relevantArtists.flatMap(a => {
                if (!a.touring || !a.touring.shows) return [];
                return a.touring.shows.map(s => ({ ...s, artist: a.id, artistName: a.displayName }));
            });

            res.json({ tours });
        } catch (err) {
            res.status(500).json({ error: 'DB Error' });
        }
    });

    // Fan Demographics & Engagement Endpoint
    app.get('/v3/fans/demographics', authenticateToken, async (req, res) => {
        // PHASE 4CF: roster reads resolve through the canonical hybrid list so
        // API-created artists are included; the demographic fixture itself is
        // profile-owned reference data (was an inline literal).
        const roster = (await artistRepo.findAllHybrid()).filter(a => hasArtistAccess(req.user, a.id));

        // 1. Calculate Top Movers (highest growth rate)
        const validArtists = roster.filter(a => typeof a.growthRate === 'number');
        const topMovers = validArtists
            .sort((a, b) => b.growthRate - a.growthRate)
            .slice(0, 5)
            .map(a => ({
                id: a.id,
                name: a.name,
                growth: a.growthRate,
                engagement: a.social?.engagementRate || 0
            }));

        // 2. Global Demographics (Mock Aggregation)
        const demographics = profile.datasets.demographics;

        res.json({ topMovers, demographics });

    });

    app.get('/v3/label/overview', authenticateToken, async (req, res) => {
        try {
            const sales = require('../services/salesService');
            const roster = (await artistRepo.findAllHybrid()).filter(a => hasArtistAccess(req.user, a.id));
            const rows = await sales.history(roster.map(a => a.id));
            const { future } = sales.forecast(rows, 12);
            res.json({ monthlyRevenue: rows.at(-1)?.revenue ?? null, month: rows.at(-1)?.month ?? null,
                quarterlyProjection: future.length ? future.slice(0, 3).reduce((sum, r) => sum + r.revenue, 0) : null,
                annualProjection: future.length ? future.reduce((sum, r) => sum + r.revenue, 0) : null,
                activeArtists: roster.filter(a => a.status !== 'archived' && a.tier !== 'archived').length,
                topArtists: [], source: 'recorded_sales', timestamp: new Date().toISOString() });
        } catch (err) {
            logger.error('Overview failed:', err);
            res.status(503).json({ error: 'Revenue data is unavailable' });
        }
    });
}
module.exports = { register };
