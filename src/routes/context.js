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
const dataShape = require('../utils/dataShape');
const charts = require('../utils/charts');
const cache = require('../services/cacheService');
const emailService = require('../services/emailService');
const entityAuditService = require('../services/entityAuditService');
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

/** @returns {object} the dependency bundle */
function buildContext() {
    return {
        // infrastructure
        config,
        logger,
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

        // auth
        authenticateToken: auth.authenticateToken,
        hasArtistAccess: auth.hasArtistAccess,
        filterDataByAccess: auth.filterDataByAccess,
        checkExportAccess: auth.checkExportAccess,
        generateToken: auth.generateToken,

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
