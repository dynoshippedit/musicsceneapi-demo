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
            if (!hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });

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
            if (![targetSplits.artist, targetSplits.label].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) || Math.abs(targetSplits.artist + targetSplits.label - 1) > 0.000001) return res.status(400).json({ error: 'Royalty splits must sum to 1' });
            const targetSources = revenueSources || ['streaming', 'merch', 'touring'];

            // PHASE 4CF: canonical DB-first artist read.
            const artist = await artistRepo.findById(artistId);
            if (!artist) return res.status(404).json({ error: 'Artist not found' });

            let totalRevenue = 0;
            const breakdown = {};
            const revenue = artist.revenue || {};

            for (const source of targetSources) {
                let amount = 0;
                if (source === 'streaming') amount = revenue.streaming || 0;
                if (source === 'merch') amount = revenue.merch || 0;
                if (source === 'touring') amount = revenue.touring || 0;

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

    // Contract generation is not implemented; never advertise a nonexistent PDF.
    app.get('/v3/rights/contracts', authenticateToken, async (req, res) => {
        try {
            const { artistId } = req.query;
            if (!hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });
            const artist = await artistRepo.findById(artistId);
            if (!artist) return res.status(404).json({ error: 'Artist not found' });
            return res.status(501).json({ error: 'Contract generation is not available. No contract has been created.' });
        } catch (err) {
            logger.error('Contract lookup failed:', err);
            return res.status(503).json({ error: 'Contract service is unavailable' });
        }
    });
}
module.exports = { register };
