/**
 * src/routes/directsales.js
 *
 * Label-owned direct-sales visibility + the comprehensive financial-handoff
 * lifecycle (2026-09-28).
 *
 * PART 1 — LABEL STRIPE CONNECT (their account, not the platform's):
 * The platform's own subscription billing (src/billing/stripeClient.js)
 * charges the LABEL for using this software. THESE routes do the opposite:
 * the label connects its OWN Stripe account via OAuth (test mode) so the
 * label can see its direct sales and the API attributes what sold per
 * managed artist, feeding the cross-artist P&L.
 *
 *   POST   /v3/direct-sales/connect/authorize  (admin)  OAuth URL + state
 *   GET    /v3/direct-sales/connect/callback    (public) state-bound code exchange
 *   GET    /v3/direct-sales/connect/status      (auth)   connection state (no secrets)
 *   DELETE /v3/direct-sales/connect            (admin)  disconnect (destroys tokens)
 *   POST   /v3/direct-sales/sync               (admin)  pull charges/refunds/payouts
 *
 * PART 2 — ARTIST ATTRIBUTION MAPPINGS (label-managed):
 *   GET    /v3/direct-sales/mappings           (auth)
 *   POST   /v3/direct-sales/mappings           (admin)
 *   DELETE /v3/direct-sales/mappings/:id       (admin)
 *
 * PART 3 — DIRECT-SALES READS (artist-scoped, integer cents):
 *   GET    /v3/direct-sales                    (auth)   sale rows
 *   GET    /v3/direct-sales/summary            (auth)   per-currency totals
 *
 * PART 4 — COMPREHENSIVE FINANCIAL HANDOFF (import -> normalize -> reconciliation -> export):
 *   GET    /v3/financials/reconciliation       (auth)   income and cash reconciliation + coverage
 *   GET    /v3/financials/export               (auth + export access) full CSV export
 *   PATCH  /v3/direct-sales/:id/review         (admin)  review-state transition
 *
 * NAMING (research correction 2026-09-28): the first output is an "income
 * and cash reconciliation" with a coverage statement — NOT a P&L. It is
 * only a P&L when cost inputs and an accountant-approved policy exist.
 * It is never a credit rating and never implies funder acceptance.
 *
 * POSTURE (see FINANCIAL_DATA_POLICY.md):
 * - Source files remain the USER's records. The API is a lens, never a custodian.
 * - Money is integer cents + ISO currency everywhere; no float math, no
 *   cross-currency conversion (per-currency totals only).
 * - Imports are idempotent: (provider, providerSaleId) can never double-count;
 *   refunds update the original sale row in place.
 * - No AI is invoked anywhere in this module. Financial analysis by AI is
 *   strictly user-initiated and opt-in (POST /v3/ai/financial-analysis).
 *
 * Without keys (LABEL_STRIPE_CLIENT_ID / LABEL_STRIPE_CLIENT_SECRET /
 * OAUTH_TOKEN_KEY, or PAYMENTS_STUB=true for tests) the connect/sync routes
 * answer 503 naming the missing variables; everything else serves normally.
 */

'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');

const { normalizeArtistAccess } = require('../auth');
const { getProvider } = require('../payments');
const { oauthCryptoEnabled, encryptToken, decryptToken, MISSING_KEY_MESSAGE } = require('../oauth/tokenCrypto');

/** Single-use OAuth state tokens: state -> { userId, provider, createdAt }. */
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function mintState(binding) {
    const state = crypto.randomBytes(24).toString('hex');
    pendingStates.set(state, { ...binding, createdAt: Date.now() });
    return state;
}

function consumeState(state) {
    const binding = pendingStates.get(state);
    if (binding) pendingStates.delete(state);
    if (!binding) return null;
    if (Date.now() - binding.createdAt > STATE_TTL_MS) return null;
    return binding;
}

setInterval(() => {
    const now = Date.now();
    for (const [state, binding] of pendingStates) {
        if (now - binding.createdAt > STATE_TTL_MS) pendingStates.delete(state);
    }
}, STATE_TTL_MS).unref();

const MATCH_TYPES = ['charge_metadata', 'price_id', 'product_id'];

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

/** Artist scoping for reads: mirrors src/routes/royalties.js (fail-closed). */
function scopeWhere(req) {
    if (req.user.role === 'admin') {
        return req.query.artistId ? { artistId: String(req.query.artistId) } : {};
    }
    const access = normalizeArtistAccess(req.user.artistAccess);
    if (access.length === 0) return { __denied: true };
    if (req.query.artistId) {
        return { artistId: String(req.query.artistId), __check: String(req.query.artistId) };
    }
    if (!access.includes('all')) {
        return { artistId: access.length === 1 ? access[0] : { [Op.in]: access } };
    }
    return {};
}

/** Minimal CSV escaping for the financial export. */
function csvCell(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function register(app, ctx) {
    const {
        authenticateToken, hasArtistAccess, checkExportAccess, logger,
        PaymentConnection, DirectSale, ArtistPaymentMapping,
        RoyaltyLine, RoyaltyStatement, MerchSettlement, ManualAdjustment,
        Payout, BankDeposit, CashGapAnnotation, ExpectedReport, SourceMapping,
        artistRepo
    } = ctx;

    const provider = () => getProvider('stripe');

    // ------------------------------------------------------------------
    // Connect: authorize
    // ------------------------------------------------------------------
    app.post('/v3/direct-sales/connect/authorize', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const p = provider();
            if (!p.isConfigured()) {
                return res.status(503).json({ error: p.notConfiguredMessage() });
            }
            const { clientId } = require('../config').payments.stripe;
            const state = mintState({ userId: req.user.id, provider: 'stripe' });
            const authorizeUrl = p.authorizeUrl({
                clientId: clientId || 'stub-client-id',
                redirectUri: p.redirectUri(),
                state
            });
            res.json({ provider: 'stripe', authorizeUrl, state, scope: 'read_only' });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Could not start Stripe Connect authorization' });
        }
    });

    // ------------------------------------------------------------------
    // Connect: OAuth callback (public; authenticity from single-use state).
    // ------------------------------------------------------------------
    app.get('/v3/direct-sales/connect/callback', async (req, res) => {
        try {
            const p = provider();
            if (!p.isConfigured()) {
                return res.status(503).json({ error: p.notConfiguredMessage() });
            }
            const { code, state } = req.query || {};
            const binding = consumeState(String(state || ''));
            if (!binding) {
                return res.status(400).json({ error: 'Invalid or expired OAuth state. Restart the connection flow.' });
            }
            if (!code) {
                return res.status(400).json({ error: 'Missing OAuth authorization code' });
            }
            if (!oauthCryptoEnabled()) {
                return res.status(503).json({ error: MISSING_KEY_MESSAGE });
            }
            const { clientId, clientSecret } = require('../config').payments.stripe;
            const creds = await p.exchangeCode({
                code: String(code),
                clientId: clientId || 'stub-client-id',
                clientSecret: clientSecret || 'stub-client-secret'
            });
            await PaymentConnection.upsert({
                provider: 'stripe',
                accountId: creds.accountId,
                displayName: `Stripe account ${creds.accountId}`,
                accessTokenEnc: encryptToken(creds.accessToken),
                refreshTokenEnc: creds.refreshToken ? encryptToken(creds.refreshToken) : null,
                livemode: false,
                status: 'connected',
                connectedBy: binding.userId || null,
                connectedAt: new Date(),
                lastSyncAt: null,
                lastSyncError: null
            });
            res.json({ connected: true, provider: 'stripe', accountId: creds.accountId, livemode: false });
        } catch (err) {
            if (logger) logger.error(err);
            const status = err.statusCode === 502 ? 502 : 500;
            res.status(status).json({ error: err.message || 'Stripe Connect callback failed' });
        }
    });

    // ------------------------------------------------------------------
    // Connect: status (never exposes secrets)
    // ------------------------------------------------------------------
    app.get('/v3/direct-sales/connect/status', authenticateToken, async (req, res) => {
        try {
            const p = provider();
            const configured = p.isConfigured();
            const conn = await PaymentConnection.findOne({ where: { provider: 'stripe' } });
            res.json({
                provider: 'stripe',
                configured,
                connected: configured && !!conn && conn.status === 'connected',
                accountId: conn ? conn.accountId : null,
                livemode: conn ? !!conn.livemode : false,
                lastSyncAt: conn && conn.lastSyncAt ? conn.lastSyncAt.toISOString() : null,
                lastSyncError: conn ? conn.lastSyncError : null,
                ...(!configured ? { reason: p.notConfiguredMessage() } : {})
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------------------------------
    // Connect: disconnect (destroys stored tokens)
    // ------------------------------------------------------------------
    app.delete('/v3/direct-sales/connect', authenticateToken, requireAdmin, async (req, res) => {
        try {
            await PaymentConnection.destroy({ where: { provider: 'stripe' } });
            res.json({ disconnected: true, provider: 'stripe' });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------------------------------
    // Sync: pull charges/refunds/payouts from the label's connected account.
    // Idempotent on (provider, providerSaleId); refunds update in place.
    // Payouts are reconciliation visibility (never per-artist revenue).
    // ------------------------------------------------------------------
    app.post('/v3/direct-sales/sync', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const p = provider();
            if (!p.isConfigured()) {
                return res.status(503).json({ error: p.notConfiguredMessage() });
            }
            const conn = await PaymentConnection.findOne({ where: { provider: 'stripe' } });
            if (!conn || conn.status !== 'connected') {
                return res.status(409).json({ error: 'No connected Stripe account. Complete the OAuth flow first.' });
            }
            // Decrypting here fails loudly if OAUTH_TOKEN_KEY was rotated out
            // from under the stored tokens, instead of syncing half-blind.
            try {
                decryptToken(conn.accessTokenEnc);
            } catch (e) {
                await conn.update({ status: 'error', lastSyncError: 'Stored credentials are undecryptable (OAUTH_TOKEN_KEY rotated?)' });
                return res.status(503).json({ error: 'Stored Stripe credentials cannot be decrypted. Reconnect the account.' });
            }
            let client;
            try {
                client = p.getConnectClient();
            } catch (e) {
                return res.status(503).json({ error: e.message });
            }
            let pulled;
            try {
                pulled = await p.pullSales({ client, accountId: conn.accountId, limit: 100 });
            } catch (e) {
                await conn.update({ lastSyncError: e.message || 'pull failed' });
                return res.status(502).json({ error: `Stripe pull failed: ${e.message || 'unknown error'}` });
            }
            // Payouts are reconciliation visibility (money the provider sent
            // to the label's bank), never per-artist revenue. Persisted
            // idempotently (provider + providerPayoutId) so the cash
            // section of the reconciliation can match them against bank
            // deposits. Best-effort: a payout-pull failure degrades to a
            // recorded error and never blocks the sales sync.
            let payoutReport;
            try {
                const pulledPayouts = await p.pullPayouts({ client, accountId: conn.accountId, limit: 100 });
                let persisted = 0;
                let alreadyStored = 0;
                for (const po of pulledPayouts.payouts) {
                    const [, created] = await Payout.findOrCreate({
                        where: { provider: 'stripe', providerPayoutId: po.providerPayoutId },
                        defaults: {
                            provider: 'stripe',
                            providerPayoutId: po.providerPayoutId,
                            amountCents: po.amountCents,
                            currency: po.currency,
                            arrivalAt: po.arrivalAt,
                            status: po.status,
                            payoutType: po.type,
                            syncedBy: req.user.email || null
                        }
                    });
                    if (created) persisted++; else alreadyStored++;
                }
                payoutReport = {
                    pulled: pulledPayouts.payouts.length,
                    skipped: pulledPayouts.skipped,
                    unsupported: !!pulledPayouts.unsupported,
                    persisted,
                    alreadyStored,
                    payouts: pulledPayouts.payouts
                };
            } catch (e) {
                payoutReport = { pulled: 0, skipped: 0, unsupported: false, persisted: 0, alreadyStored: 0, error: e.message || 'payout pull failed', payouts: [] };
            }
            const mappings = await ArtistPaymentMapping.findAll({
                where: { provider: 'stripe' }, order: [['id', 'ASC']]
            });
            const report = {
                pulled: pulled.sales.length, skipped: pulled.skipped,
                imported: 0, updated: 0, duplicates: 0,
                attributed: 0, unattributed: 0, unattributedIds: []
            };
            for (const sale of pulled.sales) {
                const artistId = p.attributeToArtist(sale, mappings);
                const row = {
                    amountCents: sale.amountCents,
                    amountRefundedCents: sale.amountRefundedCents,
                    netCents: sale.netCents,
                    currency: sale.currency,
                    status: sale.status,
                    occurredAt: sale.occurredAt,
                    artistId,
                    productIds: sale.productIds,
                    priceIds: sale.priceIds,
                    description: sale.description,
                    rawMetadata: sale.metadata,
                    importedBy: req.user.email || null
                };
                const existing = await DirectSale.findOne({
                    where: { provider: 'stripe', providerSaleId: sale.providerSaleId }
                });
                if (existing) {
                    await existing.update(row);
                    report.updated++;
                    report.duplicates++;
                } else {
                    await DirectSale.create({ provider: 'stripe', providerSaleId: sale.providerSaleId, ...row });
                    report.imported++;
                }
                if (artistId) report.attributed++;
                else { report.unattributed++; report.unattributedIds.push(sale.providerSaleId); }
            }
            await conn.update({ lastSyncAt: new Date(), lastSyncError: null, status: 'connected' });
            res.json({ provider: 'stripe', accountId: conn.accountId, ...report, payouts: payoutReport });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Direct-sales sync failed' });
        }
    });

    // ------------------------------------------------------------------
    // Attribution mappings (label-managed: product/price metadata -> artist)
    // ------------------------------------------------------------------
    app.get('/v3/direct-sales/mappings', authenticateToken, async (req, res) => {
        try {
            const rows = await ArtistPaymentMapping.findAll({
                where: { provider: 'stripe' }, order: [['id', 'ASC']]
            });
            res.json({
                mappings: rows.map((m) => ({
                    id: m.id, provider: m.provider, matchType: m.matchType,
                    matchValue: m.matchValue, artistId: m.artistId, note: m.note
                }))
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.post('/v3/direct-sales/mappings', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { matchType, matchValue, artistId, note } = req.body || {};
            if (!MATCH_TYPES.includes(matchType)) {
                return res.status(400).json({ error: `matchType must be one of: ${MATCH_TYPES.join(', ')}` });
            }
            const value = String(matchValue || '').trim();
            if (!value) return res.status(400).json({ error: 'matchValue is required' });
            if (matchType === 'charge_metadata' && !value.includes(':')) {
                return res.status(400).json({ error: 'charge_metadata matchValue must be "key:value"' });
            }
            const artist = await artistRepo.findById(String(artistId || ''));
            if (!artist) return res.status(404).json({ error: 'Artist not found' });
            const [mapping, created] = await ArtistPaymentMapping.findOrCreate({
                where: { provider: 'stripe', matchType, matchValue: value },
                defaults: { artistId: artist.id, note: note ? String(note) : null, createdBy: req.user.email || null }
            });
            if (!created) {
                await mapping.update({ artistId: artist.id, note: note ? String(note) : mapping.note });
            }
            res.status(created ? 201 : 200).json({
                id: mapping.id, provider: 'stripe', matchType: mapping.matchType,
                matchValue: mapping.matchValue, artistId: mapping.artistId, note: mapping.note,
                created
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.delete('/v3/direct-sales/mappings/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const deleted = await ArtistPaymentMapping.destroy({
                where: { id: Number(req.params.id), provider: 'stripe' }
            });
            if (!deleted) return res.status(404).json({ error: 'Mapping not found' });
            res.json({ deleted: true });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------------------------------
    // Direct-sales reads (artist-scoped)
    // ------------------------------------------------------------------
    app.get('/v3/direct-sales', authenticateToken, async (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        const where = scopeWhere(req);
        if (where.__denied) return res.status(403).json({ error: 'Not authorized' });
        if (where.__check && !hasArtistAccess(req.user, where.__check)) {
            return res.status(403).json({ error: 'Not authorized for this artist' });
        }
        delete where.__check;
        // Unattributed sales belong to no artist: non-admin roles never see them.
        if (req.user.role !== 'admin') where.artistId = where.artistId || { [Op.ne]: null };
        const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
        try {
            const rows = await DirectSale.findAll({
                where: { provider: 'stripe', ...where },
                order: [['occurredAt', 'DESC'], ['id', 'DESC']],
                limit
            });
            res.json({
                sales: rows.map((r) => ({
                    id: r.id,
                    providerSaleId: r.providerSaleId,
                    artistId: r.artistId,
                    amountCents: r.amountCents,
                    amountRefundedCents: r.amountRefundedCents,
                    netCents: r.netCents,
                    currency: r.currency,
                    status: r.status,
                    occurredAt: r.occurredAt ? new Date(r.occurredAt).toISOString() : null,
                    productIds: r.productIds || [],
                    priceIds: r.priceIds || [],
                    description: r.description
                }))
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Per-artist direct-sales totals, integer cents per currency.
    app.get('/v3/direct-sales/summary', authenticateToken, async (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        const where = scopeWhere(req);
        if (where.__denied) return res.status(403).json({ error: 'Not authorized' });
        if (where.__check && !hasArtistAccess(req.user, where.__check)) {
            return res.status(403).json({ error: 'Not authorized for this artist' });
        }
        delete where.__check;
        if (req.query.currency) where.currency = String(req.query.currency).toUpperCase();
        try {
            const rows = await DirectSale.findAll({ where: { provider: 'stripe', ...where }, order: [['id', 'ASC']] });
            const byCurrency = new Map();
            for (const r of rows) {
                const cur = byCurrency.get(r.currency) || {
                    currency: r.currency, grossCents: 0, refundedCents: 0,
                    netCents: 0, saleCount: 0, attributedCount: 0, unattributedCount: 0
                };
                cur.grossCents += r.amountCents;
                cur.refundedCents += r.amountRefundedCents;
                cur.netCents += r.netCents;
                cur.saleCount += 1;
                if (r.artistId) cur.attributedCount++; else cur.unattributedCount++;
                for (const k of ['grossCents', 'refundedCents', 'netCents']) {
                    if (!Number.isSafeInteger(cur[k])) {
                        return res.status(500).json({ error: 'Total exceeds safe integer range' });
                    }
                }
                byCurrency.set(r.currency, cur);
            }
            res.json({ totals: [...byCurrency.values()], sales: rows.length });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------------------------------
    // Income and cash reconciliation (research correction 2026-09-28):
    // royalties + merch settlements + direct sales, per artist per
    // currency, with a coverage statement. This is NOT a P&L — costs,
    // expenses, and liabilities are not inputs here, and no
    // accountant-approved policy governs it. It is not a credit rating and
    // implies no funder acceptance.
    //
    // Reconciliation (monthly close, 2026-09-28 fixes 2 + 3, research
    // update 8): income from the reviewed records, cash evidence alongside
    // it, and evidence gaps — never a P&L, never a credit rating. Built by
    // src/finance/reconciliation.js, the SAME pipeline that feeds the
    // dashboard KPIs: one source of truth, so the two can never tell
    // unrelated stories.
    //
    // Period filtering is per-category and honest:
    //   royalties -> statement/line period; merch -> showDate month;
    //   direct sales -> occurredAt month; manual adjustments -> declared
    //   month. Cash is bank-level evidence, not period-filtered income.
    // ------------------------------------------------------------------
    app.get('/v3/financials/reconciliation', authenticateToken, async (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        const where = scopeWhere(req);
        if (where.__denied) return res.status(403).json({ error: 'Not authorized' });
        if (where.__check && !hasArtistAccess(req.user, where.__check)) {
            return res.status(403).json({ error: 'Not authorized for this artist' });
        }
        delete where.__check;
        const artistFilter = req.query.artistId ? String(req.query.artistId) : null;
        const period = req.query.period ? String(req.query.period) : null;
        if (period && !/^\d{4}-\d{2}$/.test(period)) {
            return res.status(400).json({ error: 'period must be YYYY-MM' });
        }
        try {
            const { buildReconciliation } = require('../finance/reconciliation');
            const artistIds = artistFilter ? [artistFilter]
                : (await artistRepo.findAllHybrid()).filter(a => hasArtistAccess(req.user, a.id)).map(a => a.id);
            const recon = await buildReconciliation(
                { RoyaltyLine, MerchSettlement, DirectSale, ManualAdjustment, Payout, BankDeposit, CashGapAnnotation, ExpectedReport, SourceMapping, RoyaltyStatement },
                { artistIds, period }
            );
            res.json({ type: 'income_and_cash_reconciliation', ...recon });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: err.message || 'Reconciliation failed' });
        }
    });

    // Review-state transition for direct sales (admin). Same machine as
    // royalty lines/settlements: reported -> reconciled -> approved, plus
    // disputed / estimated, with reviewer identity + evidence.
    app.patch('/v3/direct-sales/:id/review', authenticateToken, async (req, res) => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { canTransition, isReviewState } = require('../finance/reviewState');
        const to = String(req.body?.reviewState || '').trim();
        if (!isReviewState(to) || to === 'superseded') {
            return res.status(400).json({ error: 'reviewState must be one of: reported, reconciled, approved, disputed, estimated' });
        }
        try {
            const sale = await DirectSale.findByPk(req.params.id);
            if (!sale) return res.status(404).json({ error: 'Not found' });
            const from = sale.reviewState || 'reported';
            if (!canTransition(from, to)) {
                return res.status(409).json({ error: `invalid review transition: ${from} -> ${to}` });
            }
            sale.reviewState = to;
            sale.reviewedBy = req.user.email;
            sale.reviewEvidence = req.body?.evidence ? String(req.body.evidence) : null;
            sale.reviewedAt = new Date();
            await sale.save();
            res.json({ id: sale.id, reviewState: sale.reviewState, reviewedBy: sale.reviewedBy, reviewedAt: sale.reviewedAt });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------------------------------
    // Full financial export: EVERY imported record + the derived income
    // and cash reconciliation, one CSV. Source files remain the user's
    // records; this export is a portable copy of what the API holds, with
    // provenance per row. Superseded records are included (marked) but
    // excluded from the reconciliation totals.
    // ------------------------------------------------------------------
    app.get('/v3/financials/export', authenticateToken, checkExportAccess, async (req, res) => {
        const format = String(req.query.format || 'csv').toLowerCase();
        if (format !== 'csv') {
            return res.status(400).json({ error: 'Invalid format. Only csv is supported for financial export' });
        }
        const artistFilter = req.query.artistId ? String(req.query.artistId) : null;
        const where = artistFilter ? { artistId: artistFilter } : {};
        try {
            const { isCounted, isDisputed, isEstimated } = require('../finance/reviewState');
            const [royaltyLines, settlements, sales, adjustments] = await Promise.all([
                RoyaltyLine.findAll({ where, order: [['id', 'ASC']] }),
                MerchSettlement.findAll({ where, order: [['id', 'ASC']] }),
                DirectSale.findAll({ where: { provider: 'stripe', ...where }, order: [['id', 'ASC']] }),
                ManualAdjustment.findAll({ where, order: [['id', 'ASC']] })
            ]);
            const exportedAt = new Date().toISOString();
            const exportedBy = (req.user && req.user.email) || '';
            const header = [
                'record_type', 'artist_id', 'currency', 'gross_cents', 'refunded_cents',
                'net_cents', 'amount_cents', 'amount_decimal', 'amount_scale', 'source_amount',
                'period', 'occurred_at', 'source', 'source_file_hash', 'row_ref', 'import_version',
                'review_state', 'reviewed_by', 'review_evidence',
                'provider', 'provider_sale_id', 'product_ids', 'price_ids',
                'description', 'imported_by', 'imported_at', 'exported_at', 'exported_by'
            ];
            const lines = [header.map(csvCell).join(',')];
            const row = (cells) => lines.push(cells.map(csvCell).join(','));
            const iso = (d) => (d ? new Date(d).toISOString() : '');
            // Coverage statement: the export's derived reconciliation is an
            // income and cash reconciliation, not a P&L, not a credit rating.
            row(['coverage', '', '', '', '', '', '', '', '', '',
                '', '', 'derived', '', '', '',
                '', '', '',
                '', '', '', '',
                'type=income_and_cash_reconciliation;excludes=costs,expenses,liabilities;' +
                'superseded_excluded_from_totals=true;not_a_credit_rating=true;' +
                'trusted_states=reported,reconciled,approved;disputed_and_estimated_reported_separately_never_in_trusted_total=true;' +
                'cash_is_evidence_not_income=true;no_double_counting=true',
                '', '', exportedAt, exportedBy]);
            for (const l of royaltyLines) {
                row(['royalty_line', l.artistId, l.currency, '', '', '', l.amountCents,
                    l.amountDecimal || '', l.amountScale ?? '', l.sourceAmount || '',
                    l.period, '', l.source || '', l.sourceFileHash || '', l.rowRef || '', l.importVersion || '',
                    l.reviewState || 'reported', l.reviewedBy || '', l.reviewEvidence || '',
                    '', '', '', '',
                    `catalogKey=${l.catalogKey} statement=${l.statementId ?? ''}${l.supersedesId ? ` supersedes=${l.supersedesId}` : ''}`,
                    l.importedBy || '', iso(l.createdAt), exportedAt, exportedBy]);
            }
            for (const s of settlements) {
                row(['merch_settlement', s.artistId, s.currency, s.grossCents, '',
                    s.netCents, '', '', '', '',
                    '', iso(s.showDate), s.source || '', s.sourceFileHash || '', s.rowRef || '', s.importVersion || '',
                    s.reviewState || 'reported', s.reviewedBy || '', s.reviewEvidence || '',
                    '', '', '', '',
                    `${s.venue} fees=${s.feesCents} taxes=${s.taxesCents} attendance=${s.attendance ?? ''}${s.supersedesId ? ` supersedes=${s.supersedesId}` : ''}`,
                    s.importedBy || '', iso(s.createdAt), exportedAt, exportedBy]);
            }
            const pnl = new Map(); // artistId -> currency -> {r,m,d,a,disputed,estimated}
            const pnlGet = (artistId, currency) => {
                const key = `${artistId}|${currency}`;
                if (!pnl.has(key)) pnl.set(key, { r: 0, m: 0, d: 0, a: 0, disputed: 0, estimated: 0 });
                return pnl.get(key);
            };
            for (const s of sales) {
                row(['direct_sale', s.artistId || '', s.currency, s.amountCents,
                    s.amountRefundedCents, s.netCents, '', '', '', '',
                    '', iso(s.occurredAt),
                    s.status, '', '', '',
                    s.reviewState || 'reported', s.reviewedBy || '', s.reviewEvidence || '',
                    'stripe', s.providerSaleId,
                    (s.productIds || []).join('|'), (s.priceIds || []).join('|'),
                    s.description || '', s.importedBy || '', iso(s.createdAt),
                    exportedAt, exportedBy]);
                const b = pnlGet(s.artistId || 'unattributed', s.currency);
                if (isCounted(s.reviewState)) b.d += s.netCents;
                else if (isDisputed(s.reviewState)) b.disputed += s.netCents;
                else if (isEstimated(s.reviewState)) b.estimated += s.netCents;
            }
            for (const l of royaltyLines) {
                const b = pnlGet(l.artistId, l.currency);
                if (isCounted(l.reviewState)) b.r += l.amountCents;
                else if (isDisputed(l.reviewState)) b.disputed += l.amountCents;
                else if (isEstimated(l.reviewState)) b.estimated += l.amountCents;
            }
            for (const s of settlements) {
                if (!s.artistId) continue;
                const b = pnlGet(s.artistId, s.currency);
                if (isCounted(s.reviewState)) b.m += s.netCents;
                else if (isDisputed(s.reviewState)) b.disputed += s.netCents;
                else if (isEstimated(s.reviewState)) b.estimated += s.netCents;
            }
            for (const a of adjustments) {
                row(['manual_adjustment', a.artistId, a.currency, '', '', a.amountCents, a.amountCents, '', '', '',
                    a.month, '', a.source || 'manual', '', '', '',
                    a.reviewState || 'reported', a.reviewedBy || '', a.reviewEvidence || '',
                    '', '', '', '',
                    `note=${a.note || ''} enteredBy=${a.enteredBy || ''} enteredAt=${iso(a.enteredAt)}`,
                    a.enteredBy || '', iso(a.createdAt), exportedAt, exportedBy]);
                const b = pnlGet(a.artistId, a.currency);
                if (isCounted(a.reviewState)) b.a += a.amountCents;
                else if (isDisputed(a.reviewState)) b.disputed += a.amountCents;
                else if (isEstimated(a.reviewState)) b.estimated += a.amountCents;
            }
            for (const [key, b] of [...pnl.entries()].sort()) {
                const [artistId, currency] = key.split('|');
                const trusted = b.r + b.m + b.d + b.a;
                row(['reconciliation_summary', artistId, currency, '', '', trusted, trusted, '', '', '',
                    '', '', 'derived', '', '', '',
                    '', '', '',
                    '', '', '', '',
                    `royalties=${b.r} merch_settlements=${b.m} direct_sales=${b.d} manual_adjustments=${b.a} ` +
                    `trusted_total=${trusted} disputed_separate=${b.disputed} estimated_separate=${b.estimated} ` +
                    `(income and cash reconciliation; not a P&L; not a credit rating; disputed/estimated never in trusted total)`,
                    '', '', exportedAt, exportedBy]);
            }
            const stamp = exportedAt.replace(/[:.]/g, '').slice(0, 15);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="financials_export_${stamp}.csv"`);
            res.send(lines.join('\r\n') + '\r\n');
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Financial export failed' });
        }
    });
}

module.exports = { register, MATCH_TYPES, scopeWhere };
