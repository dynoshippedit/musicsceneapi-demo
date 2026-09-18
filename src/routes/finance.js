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
        generateMonthlyReport, profile
    } = ctx;

    // Calculate Royalties
    app.post('/v3/royalties/calculate', authenticateToken, async (req, res) => {
        try {
            const { artistId, revenueSources, splits } = req.body || {};

            if (revenueSources !== undefined && !Array.isArray(revenueSources)) {
                return res.status(400).json({ error: 'revenueSources must be an array of source names' });
            }
            if (splits !== undefined && (typeof splits !== 'object' || splits === null || Array.isArray(splits))) {
                return res.status(400).json({ error: 'splits must be an object' });
            }
            if (Array.isArray(revenueSources) && revenueSources.some((source) => typeof source !== 'string')) {
                return res.status(400).json({ error: 'revenueSources must be an array of source names' });
            }

            // Default logic if not provided
            const targetSplits = splits || { artist: 0.7, label: 0.3 };
            const targetSources = revenueSources || ['streaming', 'merch', 'touring'];

            // PHASE 4CF: canonical DB-first artist read.
            const artist = await artistRepo.findById(artistId);
            if (!artist) return res.status(404).json({ error: 'Artist not found' });

            let totalRevenue = 0;
            const breakdown = {};
            const revenue = artist.revenue || {};

            for (const source of targetSources) {
                let amount = 0;
                if (source === 'streaming') amount = revenue.streaming;
                if (source === 'merch') amount = revenue.merch;
                if (source === 'touring') amount = revenue.touring;

                breakdown[source] = amount;
                totalRevenue += amount;
            }

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
        } catch (err) {
            logger.error('Royalty calculation failed:', err);
            if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Generate Contract (PDF Mock)
    app.get('/v3/rights/contracts', authenticateToken, async (req, res) => {
        const { artistId } = req.query;
        // PHASE 4CF: canonical DB-first artist read.
        const artist = await artistRepo.findById(artistId);

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
