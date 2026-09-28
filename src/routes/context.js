/**
 * src/routes/context.js
 *
 * Shared dependency bundle handed to every route module.
 *
 * WHY THIS SHAPE: the route handler bodies were extracted verbatim from the
 * monolith, where they referenced ~25 module-scope identifiers directly
 * (labelData, cache, User, aiService, ...). Rather than rewriting 63 handler
 * bodies — which is exactly the "mechanical split" that breaks behavior — each
 * route module receives this context and destructures the names it needs, so
 * the handler code inside is unchanged.
 *
 * This is deliberately a transitional seam. It makes the real dependencies of
 * each domain explicit and greppable; a later phase can narrow each module's
 * imports to only what it actually uses.
 */

'use strict';

const config = require('../config');
const logger = require('../config/logger');
const models = require('../models');
const auth = require('../auth');
const profile = require('../profile');
const dataShape = require('../utils/dataShape');
const charts = require('../utils/charts');
const cache = require('../services/cacheService');
const emailService = require('../services/emailService');
const entityAuditService = require('../services/entityAuditService');
const usageService = require('../services/usageService');
const auditService = require('../services/auditService');
const artistRepo = require('../repositories/artistRepository');
const stores = require('../repositories/inMemoryStores');
const operationsRepo = require('../repositories/operationsRepository');
const aiService = require('../ai/aiService');
const regression = require('../analytics/regression');
const integrationFacade = require('../integrations');
const { SERVICES, limiters } = require('../integrations/rateLimiter');
const { generateMonthlyReport } = require('../reports/monthlyReport');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

/**
 * PHASE 4CF — composite authenticateToken (Objective 2).
 *
 * Layer 1 (auth.authenticateToken, unchanged and still pinned by unit tests)
 * performs pure JWT verification. Layer 2 revalidates the token's subject
 * against the database on EVERY protected request:
 *
 *   - row missing (user deleted)       → 401, previously issued tokens die;
 *   - row present                       → role/artistAccess/integrationCount/
 *     email are re-sourced from the row, so permission changes take effect
 *     immediately instead of living 24h in the token.
 *
 * A token needs a persisted user ID. Database lookup failures return 503;
 * stale claims never authorize access during an outage.
 */
function authenticateToken(req, res, next) {
    auth.authenticateToken(req, res, async () => {
        try {
            if (!req.user || req.user.id == null) return res.status(401).json({ error: 'Please sign in again' });
            if (req.user.id != null) {
                const user = await models.User.findByPk(req.user.id);
                if (!user) {
                    return res.status(401).json({ error: 'User not found' });
                }
                // STEP 7 (D7): deactivation and password changes take effect
                // immediately. Tokens minted before this change carry no
                // sessionVersion claim and read as 0, matching the column
                // default for pre-existing rows.
                if (!user.active) {
                    return res.status(401).json({ error: 'Account deactivated' });
                }
                const tokenSession = req.user.sessionVersion == null ? 0 : req.user.sessionVersion;
                if (tokenSession !== (user.sessionVersion || 0)) {
                    return res.status(401).json({ error: 'Session revoked' });
                }
                req.user.role = user.role;
                req.user.artistAccess = user.artistAccess;
                req.user.integrationCount = user.integrationCount;
                req.user.email = user.email;
                req.user.id = user.id;
            }
            next();
        } catch (err) {
            logger.error('Auth revalidation failed:', err);
            return res.status(503).json({ error: 'Unable to verify access. Please retry.' });
        }
    });
}

/** @returns {object} the dependency bundle */
function buildContext() {
    return {
        // infrastructure
        config,
        logger,
        profile,
        JWT_SECRET: config.jwtSecret,
        bcrypt,
        jwt,
        fs,
        path,

        // models
        sequelize: models.sequelize,
        User: models.User,
        Artist: models.Artist,
        Stats: models.Stats,
        // PHASE 4CF: durable product-state models (persist-or-demo contract).
        AnrSubmission: models.AnrSubmission,
        SalesEntry: models.SalesEntry,
        Campaign: models.Campaign,
        // Stripe billing (2026-09-28): per-label subscription state.
        Subscription: models.Subscription,
        // Phase 2 (2026-09-28): OAuth, catalog, royalties.
        ArtistOAuth: models.ArtistOAuth,
        Recording: models.Recording,
        Release: models.Release,
        Work: models.Work,
        WorkRecording: models.WorkRecording,
        RoyaltyLine: models.RoyaltyLine,

        // auth
        authenticateToken,
        hasArtistAccess: auth.hasArtistAccess,
        filterDataByAccess: auth.filterDataByAccess,
        checkExportAccess: auth.checkExportAccess,
        generateToken: auth.generateToken,

        // PHASE 4CF: ownership root + audit/usage seams
        usageService,
        auditService,

        // utils
        calculateTotalRevenue: dataShape.calculateTotalRevenue,
        flattenData: dataShape.flattenData,
        filterMetrics: dataShape.filterMetrics,
        generatePieChart: charts.generatePieChart,
        generateBarChart: charts.generateBarChart,
        generateLineChart: charts.generateLineChart,
        generateDonutChart: charts.generateDonutChart,

        // services / repositories
        cache,
        emailService,
        sendEmail: emailService.sendEmail,
        entityAuditService,
        artistRepo,
        labelData: artistRepo.labelData,
        getArtistData: artistRepo.getArtistData,
        getAllArtists: artistRepo.getAllArtists,
        operationsRepo,
        operationsData: operationsRepo.operationsData,

        // in-memory stores (see inMemoryStores.js for why these persist nothing)
        prospects: stores.prospects,
        anrSubmissions: stores.anrSubmissions,
        anrState: stores.anrState,
        userIntegrations: stores.userIntegrations,
        salesData: stores.salesData,
        apiCache: stores.apiCache,

        // ai / analytics
        aiService,
        performLinearRegression: regression.performLinearRegression,
        generateSyntheticHistory: regression.generateSyntheticHistory,

        // validation (Phase 3)
        validateBody: require('../validation').validateBody,

        // integrations
        integrationFacade,
        fetchArtistData: integrationFacade.fetchArtistData,
        getIntegrationStatus: integrationFacade.getIntegrationStatus,
        SERVICES,
        limiters,

        // reports
        generateMonthlyReport
    };
}

module.exports = { buildContext };
