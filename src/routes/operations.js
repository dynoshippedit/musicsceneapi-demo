/**
 * src/routes/operations.js
 *
 * Static operations fixtures (logistics, assets, contracts).
 *
 * Handler bodies were moved VERBATIM from production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (3):
 *   GET    /v3/operations/logistics
 *   GET    /v3/operations/assets
 *   GET    /v3/operations/contracts
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

    // 1. Logistics — PHASE 1A: label-internal operational data, admin only.
    app.get('/v3/operations/logistics', authenticateToken, (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        res.json({ logistics: operationsData.logistics });
    });

    // 2. Asset Vault — PHASE 1A: label-internal operational data, admin only.
    app.get('/v3/operations/assets', authenticateToken, (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        res.json({ assets: operationsData.assets });
    });

    // 3. Contracts
    app.get('/v3/operations/contracts', authenticateToken, (req, res) => {
        if (req.user.role !== 'admin' && req.user.role !== 'manager') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        res.json({ contracts: operationsData.contracts });
    });
}

module.exports = { register };
