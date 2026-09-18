/**
 * src/routes/integrations.js
 *
 * Integration status/connect/disconnect plus provider passthroughs. All external
 * calls go through the src/integrations facade. PRESERVED: connection state is
 * keyed by req.user.id, which is always undefined, so all users share one entry.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (7):
 *   GET    /v3/integrations/google-kg
 *   GET    /v3/integrations/fandom/roster
 *   GET    /v3/integrations/fandom/audit
 *   GET    /v3/integrations/status
 *   GET    /v3/integrations/auth/:service
 *   POST   /v3/integrations/disconnect
 *   GET    /v3/integrations/test-limit/:service
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

    // Google KG Proxy for Artist Entity
    // Google KG Proxy for Artist Entity
    app.get('/v3/integrations/google-kg', authenticateToken, async (req, res) => {
        try {
            const { query } = req.query;
            if (!query) return res.status(400).json({ error: 'Query required' });

            let result = await integrationFacade.auditGoogleKG(query);

            // 1. Fallback: Fandom Image
            if (result.exists && !result.image) {
                try {
                    const fandomResult = await integrationFacade.auditFandom(query);
                    if (fandomResult.exists && fandomResult.image) {
                        result.image = fandomResult.image;
                        result.sourceFallback = 'fandom';
                    }
                } catch (e) { /* ignore */ }
            }

            // 2. Fallback: Contextual Search (Google KG with label prefix)
            // PHASE 4CF: the prefix is label intelligence — profile-owned
            // (was the literal `mau5trap ${query}`).
            if (!result.image) {
                try {
                    const contextualQuery = `${profile.searchContext.artistQueryPrefix}${query}`;
                    const contextResult = await integrationFacade.auditGoogleKG(contextualQuery);
                    if (contextResult.exists && contextResult.image) {
                        // Only adopt the image if the main result failed or lacked one
                        result.image = contextResult.image;
                        if (!result.exists) {
                            // If original didn't exist, adopt the whole contextual result
                            result = contextResult;
                        }
                        result.sourceFallback = 'google_contextual';
                    }
                } catch (e) { /* ignore */ }
            }

            res.json(result);
        } catch (err) {
            logger.error('Google KG Proxy Error:', err);
            res.status(500).json({ error: 'Internal error' });
        }
    });

    // Fandom Wiki Roster (Scraped)
    app.get('/v3/integrations/fandom/roster', authenticateToken, async (req, res) => {
        try {
            const result = await integrationFacade.getFandomRoster();
            res.json(result);
        } catch (err) {
            logger.error('Fandom Roster Error:', err);
            res.status(500).json({ error: 'Internal error' });
        }
    });

    // Fandom Wiki Audit for specific artist
    app.get('/v3/integrations/fandom/audit', authenticateToken, async (req, res) => {
        try {
            const { artist } = req.query;
            if (!artist) return res.status(400).json({ error: 'Artist required' });

            const result = await integrationFacade.auditFandom(artist);
            res.json(result);
        } catch (err) {
            logger.error('Fandom Audit Error:', err);
            res.status(500).json({ error: 'Internal error' });
        }
    });

    // Get integration status
    app.get('/v3/integrations/status', authenticateToken, (req, res) => {
        const userId = req.user.id;
        const integrations = userIntegrations[userId] || {};

        // Return status for all supported services
        const status = Object.keys(SERVICES).map(key => ({
            id: key,
            name: SERVICES[key].name,
            connected: integrations[key]?.connected || false,
            lastSync: integrations[key]?.lastSync || null,
            // PHASE 4CF (persist-or-demo): quotaUsed was Math.random() per
            // call — simulated numbers presented as operational metering.
            // Now explicit null = "no metering data"; the UI renders '—'.
            quotaUsed: null
        }));

        res.json({ services: status });
    });

    // Start OAuth flow (Mock / Stub)
    app.get('/v3/integrations/auth/:service', authenticateToken, (req, res) => {
        const service = req.params.service;
        if (!SERVICES[service]) return res.status(404).json({ error: 'Service not found' });

        // In a real app, this would redirect to the provider's OAuth page
        // For now, we'll simulate the mock connection immediately

        // Initialize user store if needed
        if (!userIntegrations[req.user.id]) userIntegrations[req.user.id] = {};

        // Simulate success
        userIntegrations[req.user.id][service] = {
            connected: true,
            token: `mock_token_${Date.now()}`,
            lastSync: new Date().toISOString()
        };

        res.json({ success: true, message: `Connected to ${SERVICES[service].name} (Mock)` });
    });

    // Disconnect
    app.post('/v3/integrations/disconnect', authenticateToken, (req, res) => {
        const { service } = req.body;
        if (!userIntegrations[req.user.id]) return res.json({ success: true });

        if (userIntegrations[req.user.id][service]) {
            userIntegrations[req.user.id][service].connected = false;
            delete userIntegrations[req.user.id][service];
        }

        res.json({ success: true });
    });

    // Test Rate Limit (Debug Endpoint)
    app.get('/v3/integrations/test-limit/:service', authenticateToken, async (req, res) => {
        const service = req.params.service;
        if (!limiters[service]) return res.status(404).json({ error: 'Service not found' });

        const limiter = limiters[service];
        const startTime = Date.now();

        // Attempt to consume a token
        await limiter.throttle();

        res.json({
            service,
            waited: Date.now() - startTime,
            tokensRemaining: limiter.tokens.toFixed(2)
        });
    });
}

module.exports = { register };
