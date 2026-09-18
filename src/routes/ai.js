/**
 * src/routes/ai.js
 *
 * AI endpoints. POST /v3/ai/analyze performs NO model call (keyword matching with
 * a hardcoded confidence of 0.98); POST /v3/ai/query is the real Groq path.
 * A second POST /v3/ai/analyze registration is SHADOWED and unreachable.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (3):
 *   POST   /v3/ai/analyze
 *   POST   /v3/ai/query
 *   POST   /v3/ai/analyze
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
        generateMonthlyReport, validateBody, profile
    } = ctx;

    // AI Analysis Endpoint (Grok Mock)
    // PHASE 2: keyword logic moved to src/ai/aiService.analyzeByKeyword().
    // NOT AI — substring matching with a hardcoded confidence of 0.98.
    // Response shape (query/response/timestamp/confidence) is unchanged.
    app.post('/v3/ai/analyze', authenticateToken, (req, res) => {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query required' });

        const { response } = aiService.analyzeByKeyword(query);

        res.json({
            query,
            response,
            timestamp: new Date().toISOString(),
            confidence: 0.98
        });
    });

    // Analyze with Groq (Real LPU) + Optimization
    app.post('/v3/ai/query', authenticateToken, validateBody('aiQuery'), async (req, res) => {
        try {
            const { prompt, artistId, query, forceRefresh } = req.validatedBody || req.body;
            const userPrompt = prompt || query;

            if (!userPrompt) return res.status(400).json({ error: 'Prompt required' });

            // Optimization: Check Cache
            // PHASE 2: cache probe, context building, model invocation, caching and
            // the dev-fallback all moved to src/ai/aiService.query(). The service
            // returns a discriminated result; this handler maps it to the SAME
            // response bodies and status codes as before.
            const outcome = await aiService.query({
                prompt: userPrompt,
                artistId,
                forceRefresh,
                user: req.user
            });

            if (outcome.kind === 'cached') {
                return res.json({
                    success: true,
                    answer: outcome.answer,
                    insights: outcome.answer,
                    source: 'cache'
                });
            }

            if (outcome.kind === 'ok') {
                return res.json({
                    success: true,
                    answer: outcome.answer,
                    insights: outcome.answer,
                    model: outcome.model
                });
            }

            if (outcome.kind === 'fallback') {
                return res.json({
                    success: true,
                    answer: outcome.answer,
                    source: 'fallback'
                });
            }

            // MEDIUM-9 FIX: log the detail server-side, return a generic body
            // so Groq SDK internals (request metadata, key status) cannot leak.
            logger.error('AI query failed:', outcome.message);
            return res.status(500).json({ error: 'AI query failed' });

        } catch (err) {
            console.error('Groq API Error:', err);

            if (process.env.NODE_ENV === 'development') {
                return res.json({
                    success: true,
                    // PHASE 4CF: single profile source (deduped from aiService).
                    answer: profile.ai.devFallback,
                    source: 'fallback'
                });
            }

            // MEDIUM-9 FIX: don't leak err.message to the client.
            res.status(500).json({ error: 'AI query failed' });
        }
    });

    // Alias old endpoint to new one for compatibility
    app.post('/v3/ai/analyze', authenticateToken, (req, res) => {
        // Redirect logic handled by reusing the handler if express supports it, or just 307 redirect
        // easier to just copy logic or call internal function, but for now let's just expose Query above and update frontend?
        // Actually, let's make this endpoint strictly call the new logic.
        res.redirect(307, '/v3/ai/query');
    });
}

module.exports = { register };
