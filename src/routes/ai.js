'use strict';

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
                return res.json({ success: true, answer: result.answer, insights: result.answer,
                    source: result.kind === 'cached' ? 'cache' : 'groq', provider: 'groq', model: result.model || config.groqModel });
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
}
module.exports = { register };
