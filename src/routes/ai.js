/**
 * src/routes/ai.js
 *
 * AI endpoints. LIABILITY POSTURE (see FINANCIAL_DATA_POLICY.md):
 * - Every endpoint here is explicitly USER-TRIGGERED (an authenticated POST
 *   with a prompt). No scheduled job, sync, or report generator calls the
 *   AI on its own — the monthly report job's AI block is disabled by
 *   default and requires a per-request opt-in.
 * - Successful AI responses carry a "not financial advice" disclaimer with
 *   user responsibility stated in the response itself.
 * - POST /v3/ai/financial-analysis is the ONLY finance-dedicated AI
 *   endpoint. It requires an explicit acknowledgeNotAdvice opt-in; without
 *   it the request is rejected. AI never initiates financial analysis.
 */

'use strict';

const { AI_FINANCIAL_DISCLAIMER, AI_FINANCIAL_USER_RESPONSIBILITY } = require('../ai/disclaimer');

function register(app, { authenticateToken, validateBody, aiService, config, logger }) {
    app.get('/v3/ai/providers', authenticateToken, (req, res) => {
        const configured = Boolean(config.groqApiKey?.trim());
        res.json({ selectable: false, defaultProvider: 'groq', defaultModel: config.groqModel,
            status: configured ? 'configured' : 'unconfigured',
            providers: [{ id: 'groq', model: config.groqModel, status: configured ? 'configured' : 'unconfigured' }] });
    });

    const query = async (req, res) => {
        try {
            const { prompt, query, artistId, forceRefresh } = req.validatedBody;
            if (!(prompt || query)?.trim()) return res.status(400).json({ error: 'Prompt required' });
            const result = await aiService.query({ prompt: prompt || query, artistId, forceRefresh, user: req.user });
            if (result.kind === 'forbidden') return res.status(403).json({ error: 'Access denied for this artist' });
            if (result.kind === 'not_found') return res.status(404).json({ error: 'Artist not found' });
            if (result.kind === 'ok' || result.kind === 'cached') {
                // Disclaimer is ADDITIVE on the success path only — the
                // error shapes below are pinned by the snapshot suite.
                return res.json({ success: true, answer: result.answer, insights: result.answer,
                    source: result.kind === 'cached' ? 'cache' : 'groq', provider: 'groq', model: result.model || config.groqModel,
                    disclaimer: AI_FINANCIAL_DISCLAIMER });
            }
            logger.error('AI query failed:', result.message);
            return res.status(result.timeout ? 504 : 503).json({ error: 'AI is unavailable. Check the server provider configuration or try again later.' });
        } catch (err) {
            logger.error('AI query failed:', err);
            return res.status(503).json({ error: 'AI is unavailable. Please try again later.' });
        }
    };
    app.post('/v3/ai/query', authenticateToken, validateBody('aiQuery'), query);
    app.post('/v3/ai/analyze', authenticateToken, validateBody('aiQuery'), query);

    // Finance-dedicated AI analysis: STRICTLY user-initiated and opt-in.
    // Requires acknowledgeNotAdvice === true in the body — an explicit,
    // per-request acknowledgment that this is not financial advice and the
    // user is responsible for their own decisions. There is no default-on,
    // ambient, or inferred-consent path to this endpoint.
    app.post('/v3/ai/financial-analysis', authenticateToken, async (req, res) => {
        try {
            const { prompt, query, artistId, acknowledgeNotAdvice } = req.body || {};
            if (!(prompt || query)?.trim()) return res.status(400).json({ error: 'Prompt required' });
            if (acknowledgeNotAdvice !== true) {
                return res.status(400).json({
                    error: 'Explicit opt-in required: resubmit with acknowledgeNotAdvice: true to confirm ' +
                        'you understand this AI analysis is not financial advice and you are responsible ' +
                        'for your own financial decisions.'
                });
            }
            // Framing marks the request as user-initiated at the model layer.
            // (buildQueryMessages truncates the user prompt at 500 chars, so
            // the framing is kept short.)
            const framed = `[User-requested financial analysis — explicitly opted in]\n${prompt || query}`;
            const result = await aiService.query({ prompt: framed, artistId, user: req.user });
            if (result.kind === 'forbidden') return res.status(403).json({ error: 'Access denied for this artist' });
            if (result.kind === 'not_found') return res.status(404).json({ error: 'Artist not found' });
            if (result.kind === 'ok' || result.kind === 'cached') {
                return res.json({
                    success: true,
                    answer: result.answer,
                    insights: result.answer,
                    source: result.kind === 'cached' ? 'cache' : 'groq',
                    provider: 'groq',
                    model: result.model || config.groqModel,
                    disclaimer: AI_FINANCIAL_DISCLAIMER,
                    userResponsibility: AI_FINANCIAL_USER_RESPONSIBILITY
                });
            }
            logger.error('AI financial analysis failed:', result.message);
            return res.status(result.timeout ? 504 : 503).json({ error: 'AI is unavailable. Check the server provider configuration or try again later.' });
        } catch (err) {
            logger.error('AI financial analysis failed:', err);
            return res.status(503).json({ error: 'AI is unavailable. Please try again later.' });
        }
    });
}
module.exports = { register };
