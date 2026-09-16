/**
 * src/routes/finance.js
 *
 * Royalty calculation and rights/contracts.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (2):
 *   POST   /v3/royalties/calculate
 *   GET    /v3/rights/contracts
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

    // Calculate Royalties
    app.post('/v3/royalties/calculate', authenticateToken, (req, res) => {
        const { artistId, revenueSources, splits } = req.body;

        // Default logic if not provided
        const targetSplits = splits || { artist: 0.7, label: 0.3 };
        const targetSources = revenueSources || ['streaming', 'merch', 'touring'];

        const artist = labelData.artists.find(a => a.id === artistId);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });

        let totalRevenue = 0;
        const breakdown = {};

        targetSources.forEach(source => {
            let amount = 0;
            if (source === 'streaming') amount = artist.revenue.streaming;
            if (source === 'merch') amount = artist.revenue.merch;
            if (source === 'touring') amount = artist.revenue.touring;

            breakdown[source] = amount;
            totalRevenue += amount;
        });

        res.json({
            artistName: artist.name,
            totalRevenue,
            payout: {
                artist: totalRevenue * targetSplits.artist,
                label: totalRevenue * targetSplits.label
            },
            breakdown,
            splits: targetSplits
        });
    });

    // Generate Contract (PDF Mock)
    app.get('/v3/rights/contracts', authenticateToken, (req, res) => {
        const { artistId } = req.query;
        const artist = labelData.artists.find(a => a.id === artistId);

        // In production, use PDFKit to generate real file
        res.json({
            success: true,
            message: `Contract generated for ${artist ? artist.name : 'Unknown Artist'}`,
            downloadUrl: `/v3/reports/contracts/${artistId || 'template'}.pdf`,
            status: 'draft',
            terms: {
                term: '3 Years',
                territory: 'World',
                royaltyRate: '70% Net Receipts'
            }
        });
    });
}

module.exports = { register };
