/**
 * src/routes/sync.js — provider synchronization endpoints (2026-09-28, audit gap 5).
 *
 *   POST /v3/sync/run          (admin)  run one provider sync inline
 *   GET  /v3/sync/executions   (admin)  execution history (newest first)
 *
 * Both are admin-only: sync runs touch provider credentials and write
 * provider-derived state. The manual run executes inline and returns the
 * terminal execution record (duplicate triggers return the existing record
 * with `duplicate: true` and never re-run).
 */

'use strict';

function register(app, ctx) {
    const {
        authenticateToken, logger,
        ProviderSyncExecution, ArtistOAuth, PaymentConnection,
        artistRepo
    } = ctx;

    const requireAdmin = (req, res, next) => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    };

    const { runProviderSync, createAdapters, PROVIDERS, KINDS } = require('../jobs/providerSync');

    function toJson(exec) {
        return {
            id: exec.id,
            idempotencyKey: exec.idempotencyKey,
            provider: exec.provider,
            kind: exec.kind,
            status: exec.status,
            attempt: exec.attempt,
            maxAttempts: exec.maxAttempts,
            triggeredBy: exec.triggeredBy,
            startedAt: exec.startedAt,
            finishedAt: exec.finishedAt,
            fixture: exec.fixture,
            errorSummary: exec.errorSummary,
            attempts: exec.attempts,
            resultSummary: exec.resultSummary
        };
    }

    app.post('/v3/sync/run', authenticateToken, requireAdmin, async (req, res) => {
        const provider = String(req.body?.provider || '').trim();
        const kind = String(req.body?.kind || '').trim();
        const idempotencyKey = req.body?.idempotencyKey ? String(req.body.idempotencyKey).trim().slice(0, 160) : undefined;
        try {
            const artists = artistRepo && typeof artistRepo.findAllHybrid === 'function'
                ? await artistRepo.findAllHybrid()
                : [];
            const { execution, duplicate } = await runProviderSync({
                provider,
                kind,
                idempotencyKey,
                triggeredBy: (req.user.email || `admin:${req.user.id}`),
                models: { ProviderSyncExecution, ArtistOAuth, PaymentConnection },
                adapters: createAdapters(),
                artists: artists.map((a) => ({ id: a.id, name: a.name }))
            });
            res.json({ duplicate, execution: toJson(execution) });
        } catch (err) {
            if (/^unknown (provider|kind)/.test(err.message)) {
                return res.status(400).json({
                    error: err.message,
                    providers: PROVIDERS,
                    kinds: KINDS
                });
            }
            if (logger) logger.error('[sync] run failed:', err);
            res.status(500).json({ error: 'Sync run failed' });
        }
    });

    app.get('/v3/sync/executions', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const where = {};
            if (req.query.provider) where.provider = String(req.query.provider);
            if (req.query.status) where.status = String(req.query.status);
            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
            const rows = await ProviderSyncExecution.findAll({
                where,
                order: [['startedAt', 'DESC'], ['id', 'DESC']],
                limit
            });
            res.json({ executions: rows.map(toJson) });
        } catch (err) {
            if (logger) logger.error('[sync] history failed:', err);
            res.status(500).json({ error: 'Could not read sync history' });
        }
    });
}

module.exports = { register };
