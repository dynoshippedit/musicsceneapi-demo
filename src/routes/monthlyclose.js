/**
 * src/routes/monthlyclose.js
 *
 * Monthly-close workflow endpoints (2026-09-28, ChatGPT review fixes +
 * research update 8). Everything here is evidence-preserving: amounts are
 * entered by a human and recorded with provenance; nothing is auto-filled,
 * nothing is AI-calculated.
 *
 * Cash:
 *   GET    /v3/financials/payouts              (auth) list persisted payouts
 *   POST   /v3/financials/deposits             (admin) record a bank deposit
 *   GET    /v3/financials/deposits             (auth) list bank deposits
 *   POST   /v3/financials/matches              (admin) link payout <-> deposit
 *   DELETE /v3/financials/matches              (admin) unlink payout <-> deposit
 *   POST   /v3/financials/gaps/:id/annotate    (admin) owner + next action
 *
 * Manual adjustments:
 *   POST   /v3/financials/adjustments          (admin) create
 *   PATCH  /v3/financials/adjustments/:id/review (admin) review transition
 *
 * Commission:
 *   POST   /v3/financials/commissions/contracts   (admin) upsert contract
 *   GET    /v3/financials/commissions/contracts   (auth) list
 *   GET    /v3/financials/commissions/worksheet   (auth) draft worksheet
 *
 * Expected-report calendar:
 *   POST   /v3/financials/expected-reports        (admin) upsert
 *   GET    /v3/financials/expected-reports        (auth) list + missing flags
 *
 * Mapping history:
 *   GET    /v3/financials/mappings                (auth) history
 *   POST   /v3/financials/mappings/:id/approve    (admin) approve
 *
 * Statements:
 *   GET    /v3/financials/statements              (auth) statement list/provenance
 */

'use strict';

const { Op } = require('sequelize');
const { normalizeArtistAccess } = require('../auth');

function validMonth(v) {
    return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

function register(app, ctx) {
    const {
        authenticateToken, hasArtistAccess, logger, auditService,
        RoyaltyLine, RoyaltyStatement, ManualAdjustment, MerchSettlement,
        DirectSale, Payout, BankDeposit, CashGapAnnotation,
        CommissionContract, ExpectedReport, SourceMapping,
        artistRepo
    } = ctx;

    const requireAdmin = (req, res, next) => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    };

    // Label-wide operational reads (payouts, deposits, statements,
    // mappings, expected reports): fail closed for users with no artist
    // grants at all. Users with grants see the operational close view;
    // artist-scoped data is additionally filtered by hasArtistAccess.
    const requireGrants = (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        if (req.user.role === 'admin') return next();
        const access = normalizeArtistAccess(req.user.artistAccess);
        if (access.length === 0) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        next();
    };

    const checkArtist = (req, res, artistId) => {
        if (!artistId) return true;
        if (!hasArtistAccess(req.user, artistId)) {
            res.status(403).json({ error: 'Access denied for this artist' });
            return false;
        }
        return true;
    };

    const iso = (d) => (d ? new Date(d).toISOString() : null);

    // ------------------------------------------------ payouts / deposits
    app.get('/v3/financials/payouts', authenticateToken, requireGrants, async (req, res) => {
        try {
            const where = {};
            if (req.query.currency) where.currency = String(req.query.currency).toUpperCase();
            if (req.query.matched === 'true') where.matchedDepositId = { [Op.ne]: null };
            if (req.query.matched === 'false') where.matchedDepositId = null;
            const rows = await Payout.findAll({ where, order: [['arrivalAt', 'DESC'], ['id', 'DESC']], limit: 200 });
            res.json({
                payouts: rows.map(p => ({
                    id: p.id, provider: p.provider, providerPayoutId: p.providerPayoutId,
                    amountCents: p.amountCents, currency: p.currency,
                    arrivalAt: iso(p.arrivalAt), status: p.status, payoutType: p.payoutType,
                    matchedDepositId: p.matchedDepositId, matchedAt: iso(p.matchedAt),
                    matchedBy: p.matchedBy, matchNote: p.matchNote,
                    syncedBy: p.syncedBy, syncedAt: iso(p.syncedAt)
                })),
                note: 'Payouts are cash evidence (money the provider sent to the bank). They are never counted as additional income; matched payouts mark statement income as received.'
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.post('/v3/financials/deposits', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { amountCents, currency, bankRef, description, depositAt } = req.body || {};
            if (!/^\d+$/.test(String(amountCents))) return res.status(400).json({ error: 'amountCents must be a non-negative integer' });
            const cents = Number(String(amountCents));
            if (!Number.isSafeInteger(cents)) return res.status(400).json({ error: 'amountCents out of range' });
            const cur = String(currency || 'USD').toUpperCase();
            if (!/^[A-Z]{3}$/.test(cur)) return res.status(400).json({ error: 'currency must be a 3-letter code' });
            if (!bankRef || !String(bankRef).trim()) return res.status(400).json({ error: 'bankRef is required (bank statement reference)' });
            const existing = await BankDeposit.findOne({ where: { bankRef: String(bankRef).trim() } });
            if (existing) return res.status(409).json({ error: 'duplicate bank reference: this deposit was already recorded', depositId: existing.id });
            const dep = await BankDeposit.create({
                amountCents: cents,
                currency: cur,
                bankRef: String(bankRef).trim(),
                description: description ? String(description) : null,
                depositAt: depositAt ? new Date(depositAt) : new Date(),
                enteredBy: req.user.email || null
            });
            if (auditService && typeof auditService.emitAudit === 'function') {
                auditService.emitAudit({
                    action: 'cash.deposit', resourceType: 'BankDeposit', resourceId: String(dep.id),
                    metadata: { bankRef: dep.bankRef, amountCents: dep.amountCents, currency: dep.currency }, req
                });
            }
            res.status(201).json({
                deposit: {
                    id: dep.id, bankRef: dep.bankRef, amountCents: dep.amountCents,
                    currency: dep.currency, description: dep.description,
                    depositAt: iso(dep.depositAt),
                    recordedBy: dep.enteredBy || req.user.email || null,
                    recordedAt: iso(dep.createdAt),
                    matched: false, matchedPayoutId: null
                }
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.get('/v3/financials/deposits', authenticateToken, requireGrants, async (req, res) => {
        try {
            const where = {};
            if (req.query.matched === 'true') where.matchedPayoutId = { [Op.ne]: null };
            if (req.query.matched === 'false') where.matchedPayoutId = null;
            const rows = await BankDeposit.findAll({ where, order: [['depositAt', 'DESC'], ['id', 'DESC']], limit: 200 });
            res.json({
                deposits: rows.map(d => ({
                    id: d.id, amountCents: d.amountCents, currency: d.currency,
                    bankRef: d.bankRef, description: d.description, depositAt: iso(d.depositAt),
                    matchedPayoutId: d.matchedPayoutId, matchedAt: iso(d.matchedAt),
                    matchedBy: d.matchedBy, matchNote: d.matchNote,
                    enteredBy: d.enteredBy
                })),
                note: 'Unmatched deposits are visible here and in the reconciliation, and never silently enter income.'
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Match a payout to a bank deposit (admin, recorded human decision).
    app.post('/v3/financials/matches', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { payoutId, depositId, note } = req.body || {};
            // Validate IDs before touching the database: non-integer or
            // missing IDs are a 400, not a 500 (NaN findByPk threw).
            const pid = Number(payoutId);
            const did = Number(depositId);
            if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(did) || did <= 0) {
                return res.status(400).json({ error: 'payoutId and depositId must be positive integer IDs' });
            }
            const payout = await Payout.findByPk(pid);
            const deposit = await BankDeposit.findByPk(did);
            if (!payout || !deposit) return res.status(404).json({ error: 'Payout or deposit not found' });
            if (payout.matchedDepositId) return res.status(409).json({ error: 'Payout is already matched' });
            if (deposit.matchedPayoutId) return res.status(409).json({ error: 'Deposit is already matched' });
            if (payout.currency !== deposit.currency) {
                return res.status(409).json({ error: `Currency mismatch: payout ${payout.currency}, deposit ${deposit.currency}` });
            }
            const amountDiffCents = Math.abs(payout.amountCents - deposit.amountCents);
            const now = new Date();
            const who = req.user.email || null;
            payout.matchedDepositId = deposit.id;
            payout.matchedAt = now;
            payout.matchedBy = who;
            payout.matchNote = note ? String(note) : (amountDiffCents === 0 ? 'Amounts agree exactly' : `Amount differs by ${amountDiffCents} cents (fees/fx?)`);
            await payout.save();
            deposit.matchedPayoutId = payout.id;
            deposit.matchedAt = now;
            deposit.matchedBy = who;
            deposit.matchNote = payout.matchNote;
            await deposit.save();
            if (auditService && typeof auditService.emitAudit === 'function') {
                auditService.emitAudit({
                    action: 'cash.match', resourceType: 'CashMatch', resourceId: String(deposit.id),
                    metadata: { payoutId: payout.id, depositId: deposit.id, amountDiffCents }, req
                });
            }
            res.status(201).json({
                match: {
                    payoutId: payout.id, depositId: deposit.id,
                    amountDiffCents,
                    matchedAt: iso(now), matchedBy: who,
                    note: amountDiffCents === 0
                        ? 'Amounts agree exactly.'
                        : `Amount differs by ${amountDiffCents} cents. This is flagged, not auto-resolved — the difference needs an owner and a next action.`
                }
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.delete('/v3/financials/matches', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { payoutId, depositId } = req.body || {};
            const payout = await Payout.findByPk(Number(payoutId));
            const deposit = await BankDeposit.findByPk(Number(depositId));
            if (!payout || !deposit) return res.status(404).json({ error: 'Payout or deposit not found' });
            if (payout.matchedDepositId !== deposit.id || deposit.matchedPayoutId !== payout.id) {
                return res.status(409).json({ error: 'This payout and deposit are not matched to each other' });
            }
            payout.matchedDepositId = null; payout.matchedAt = null; payout.matchedBy = null; payout.matchNote = null;
            await payout.save();
            deposit.matchedPayoutId = null; deposit.matchedAt = null; deposit.matchedBy = null; deposit.matchNote = null;
            await deposit.save();
            res.json({ unmatched: true, payoutId: payout.id, depositId: deposit.id });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Annotate a cash gap with owner + next action (admin).
    app.post('/v3/financials/gaps/:id/annotate', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const gap = await CashGapAnnotation.findByPk(req.params.id);
            if (!gap) return res.status(404).json({ error: 'Not found' });
            const { owner, nextAction } = req.body || {};
            if (owner !== undefined) gap.owner = String(owner || '').slice(0, 255);
            if (nextAction !== undefined) gap.nextAction = String(nextAction || '').slice(0, 2000);
            await gap.save();
            res.json({ annotation: { id: gap.id, owner: gap.owner, nextAction: gap.nextAction } });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------- manual adjustments
    app.post('/v3/financials/adjustments', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { artistId, month, amountCents, currency, source, note, reviewState } = req.body || {};
            if (!artistId || !checkArtist(req, res, String(artistId))) return;
            if (!validMonth(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
            if (!/^-?\d+$/.test(String(amountCents))) return res.status(400).json({ error: 'amountCents must be an integer (negative allowed for corrections)' });
            const cents = Number(String(amountCents));
            if (!Number.isSafeInteger(cents)) return res.status(400).json({ error: 'amountCents out of range' });
            const { isReviewState } = require('../finance/reviewState');
            const state = reviewState ? String(reviewState) : 'reported';
            if (!isReviewState(state) || state === 'superseded') return res.status(400).json({ error: 'reviewState must be one of: reported, reconciled, approved, disputed, estimated' });
            const adj = await ManualAdjustment.create({
                artistId: String(artistId),
                month,
                currency: String(currency || 'USD').toUpperCase(),
                amountCents: cents,
                source: source ? String(source) : 'manual',
                note: note ? String(note) : null,
                reviewState: state,
                reviewedBy: req.user.email || null,
                enteredBy: req.user.email || null,
                enteredAt: new Date()
            });
            if (auditService && typeof auditService.emitAudit === 'function') {
                auditService.emitAudit({
                    action: 'finance.adjustment', resourceType: 'ManualAdjustment', resourceId: String(adj.id),
                    metadata: { artistId: adj.artistId, month: adj.month, amountCents: adj.amountCents, currency: adj.currency }, req
                });
            }
            res.status(201).json({ id: adj.id, artistId: adj.artistId, month: adj.month, amountCents: adj.amountCents });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.patch('/v3/financials/adjustments/:id/review', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { canTransition, isReviewState } = require('../finance/reviewState');
            const to = String(req.body?.reviewState || '').trim();
            if (!isReviewState(to) || to === 'superseded') {
                return res.status(400).json({ error: 'reviewState must be one of: reported, reconciled, approved, disputed, estimated' });
            }
            const adj = await ManualAdjustment.findByPk(req.params.id);
            if (!adj) return res.status(404).json({ error: 'Not found' });
            if (!checkArtist(req, res, adj.artistId)) return;
            const from = adj.reviewState || 'reported';
            if (!canTransition(from, to)) return res.status(409).json({ error: `invalid review transition: ${from} -> ${to}` });
            adj.reviewState = to;
            adj.reviewedBy = req.user.email || null;
            adj.reviewEvidence = req.body?.evidence ? String(req.body.evidence) : null;
            adj.reviewedAt = new Date();
            await adj.save();
            if (auditService && typeof auditService.emitAudit === 'function') {
                auditService.emitAudit({
                    action: 'finance.adjustment.review', resourceType: 'ManualAdjustment', resourceId: String(adj.id),
                    metadata: { from, to }, req
                });
            }
            res.json({ id: adj.id, reviewState: adj.reviewState, reviewedBy: adj.reviewedBy, reviewedAt: adj.reviewedAt });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------------- commission
    app.post('/v3/financials/commissions/contracts', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { artistId, name, rateBps, basis, effectiveFrom, effectiveTo, exclusions, excludedCategories, sourceDescription } = req.body || {};
            if (!artistId || !checkArtist(req, res, String(artistId))) return;
            const rate = Number(rateBps);
            if (!Number.isInteger(rate) || rate < 0 || rate > 10000) {
                return res.status(400).json({ error: 'rateBps must be an integer 0..10000 (basis points: 1500 = 15%)' });
            }
            if (!['counted_net_income', 'counted_gross_income', 'cash_receipts'].includes(basis)) {
                return res.status(400).json({ error: 'basis must be one of: counted_net_income, counted_gross_income, cash_receipts' });
            }
            if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
                return res.status(400).json({ error: 'effectiveFrom must be YYYY-MM-DD' });
            }
            if (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
                return res.status(400).json({ error: 'effectiveTo must be YYYY-MM-DD' });
            }
            const { validateExclusions } = require('../finance/commission');
            let excl = {};
            if (exclusions !== undefined && exclusions !== null && exclusions !== '') {
                try { excl = typeof exclusions === 'string' ? JSON.parse(exclusions) : exclusions; }
                catch { return res.status(400).json({ error: 'exclusions must be JSON' }); }
            } else if (Array.isArray(excludedCategories)) {
                // Map model-style names to API categories: merch_settlements -> merch
                excl = { categories: excludedCategories.map((c) => {
                    const s = String(c).toLowerCase();
                    if (s === 'merch_settlements') return 'merch';
                    if (s === 'direct_sales') return 'direct_sales';
                    return s;
                }) };
            }
            const problems = validateExclusions(excl);
            if (problems.length) return res.status(400).json({ error: 'invalid exclusions', problems });
            const contract = await CommissionContract.create({
                artistId: String(artistId),
                name: name ? String(name).slice(0, 255) : 'Commission contract',
                rateBps: rate,
                basis,
                effectiveFrom,
                effectiveTo: effectiveTo || null,
                exclusions: excl,
                sourceDescription: sourceDescription ? String(sourceDescription) : null,
                enteredBy: req.user.email || null
            });
            if (auditService && typeof auditService.emitAudit === 'function') {
                auditService.emitAudit({
                    action: 'finance.commission', resourceType: 'CommissionContract', resourceId: String(contract.id),
                    metadata: { artistId: contract.artistId, rateBps: contract.rateBps, basis: contract.basis }, req
                });
            }
            res.status(201).json({ contract: { id: contract.id, artistId: contract.artistId, rateBps: contract.rateBps, basis: contract.basis } });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.get('/v3/financials/commissions/contracts', authenticateToken, requireGrants, async (req, res) => {
        try {
            const where = {};
            if (req.query.artistId) {
                if (!checkArtist(req, res, String(req.query.artistId))) return;
                where.artistId = String(req.query.artistId);
            } else {
                const roster = (await artistRepo.findAllHybrid()).filter(a => hasArtistAccess(req.user, a.id));
                where.artistId = { [Op.in]: roster.map(a => a.id) };
            }
            const rows = await CommissionContract.findAll({ where, order: [['effectiveFrom', 'DESC'], ['id', 'DESC']] });
            res.json({ contracts: rows.map(c => ({
                id: c.id, artistId: c.artistId, name: c.name,
                rateBps: c.rateBps, ratePercent: `${Math.floor(c.rateBps / 100)}.${String(c.rateBps % 100).padStart(2, '0')}%`,
                basis: c.basis, effectiveFrom: c.effectiveFrom, effectiveTo: c.effectiveTo,
                exclusions: c.exclusions, sourceDescription: c.sourceDescription, enteredBy: c.enteredBy
            })) });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Deterministic draft worksheet (admin+reviewer; not AI-calculated).
    app.get('/v3/financials/commissions/worksheet', authenticateToken, async (req, res) => {
        try {
            const artistId = String(req.query.artistId || '');
            const period = String(req.query.period || '');
            if (!artistId) return res.status(400).json({ error: 'artistId is required' });
            if (!validMonth(period)) return res.status(400).json({ error: 'period must be YYYY-MM' });
            if (!checkArtist(req, res, artistId)) return;
            const contractId = req.query.contractId ? Number(req.query.contractId) : null;
            const where = { artistId };
            if (contractId) where.id = contractId;
            const contracts = await CommissionContract.findAll({ where, order: [['effectiveFrom', 'DESC'], ['id', 'DESC']] });
            if (!contracts.length) return res.status(404).json({ error: 'No commission contract for this artist' });
            const { buildWorksheet } = require('../finance/commission');
            const sheet = await buildWorksheet(
                { RoyaltyLine, MerchSettlement, DirectSale, ManualAdjustment, BankDeposit },
                { artistId, period, contract: contracts[0].get({ plain: true }) }
            );
            // Flatten the primary-currency (USD) base for the common single-currency case.
            const usd = (sheet.bases && sheet.bases.USD) || {};
            res.json(Object.assign({ artistId, period }, sheet, {
                basisCents: usd.baseCents,
                commissionCents: usd.commissionCents,
                rateBps: sheet.contract ? sheet.contract.rateBps : undefined,
                draftOnly: true,
                underlyingReview: sheet.underlyingApproval || null
            }));
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // --------------------------------------- expected-report calendar
    app.post('/v3/financials/expected-reports', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { customer, labelName, period, expectedBy, source, expectedSchemaHash, notes } = req.body || {};
            if (!customer || !String(customer).trim()) return res.status(400).json({ error: 'customer is required' });
            if (!validMonth(period)) return res.status(400).json({ error: 'period must be YYYY-MM' });
            if (!expectedBy || !/^\d{4}-\d{2}-\d{2}$/.test(expectedBy)) return res.status(400).json({ error: 'expectedBy must be YYYY-MM-DD' });
            const rec = await ExpectedReport.upsert({
                customer: String(customer).trim(),
                labelName: labelName ? String(labelName).trim() : null,
                period,
                expectedBy,
                source: source ? String(source).trim() : 'royalty',
                expectedSchemaHash: expectedSchemaHash ? String(expectedSchemaHash).trim() : null,
                notes: notes ? String(notes) : null,
                enteredBy: req.user.email || null
            });
            res.status(201).json({ id: rec[0].id, customer: rec[0].customer, period: rec[0].period });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.get('/v3/financials/expected-reports', authenticateToken, requireGrants, async (req, res) => {
        try {
            const { buildEvidenceGaps } = require('../finance/reconciliation');
            // Evidence gaps are computed from the expected-report calendar,
            // active statements, and mapping history — independent of the
            // income aggregation, so pass a minimal agg stub.
            const gaps = await buildEvidenceGaps(
                { ExpectedReport, RoyaltyStatement, SourceMapping },
                { byMonth: new Map(), coverage: { period: 'all' } },
                { period: null }
            );
            const rows = await ExpectedReport.findAll({ order: [['expectedBy', 'ASC'], ['id', 'ASC']] });
            res.json({
                expectedReports: rows.map(e => ({
                    id: e.id, customer: e.customer, labelName: e.labelName, period: e.period,
                    expectedBy: e.expectedBy, source: e.source,
                    expectedSchemaHash: e.expectedSchemaHash, notes: e.notes, enteredBy: e.enteredBy
                })),
                evidenceGaps: gaps,
                now: new Date().toISOString()
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------------- mapping history
    app.get('/v3/financials/mappings', authenticateToken, requireGrants, async (req, res) => {
        try {
            const where = {};
            if (req.query.source) where.source = String(req.query.source);
            const rows = await SourceMapping.findAll({ where, order: [['id', 'DESC']], limit: 200 });
            res.json({
                mappings: rows.map(m => ({
                    id: m.id, source: m.source, mappingVersion: m.mappingVersion,
                    formatHash: m.formatHash, headerHash: m.headerHash,
                    columnMapping: m.columnMapping, status: m.status,
                    approvedBy: m.approvedBy, approvedAt: iso(m.approvedAt),
                    evidence: m.evidence, supersededBy: m.supersededBy, importedBy: m.importedBy
                })),
                note: 'Approved mappings are reused only for identical formats (same header hash). A changed format never silently inherits an old mapping.'
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    app.post('/v3/financials/mappings/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const m = await SourceMapping.findByPk(req.params.id);
            if (!m) return res.status(404).json({ error: 'Not found' });
            m.status = 'approved';
            m.approvedBy = req.user.email || null;
            m.approvedAt = new Date();
            if (req.body?.evidence) m.evidence = String(req.body.evidence);
            await m.save();
            res.json({ id: m.id, status: m.status, approvedBy: m.approvedBy, approvedAt: iso(m.approvedAt) });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ------------------------------------------------- statements
    app.get('/v3/financials/statements', authenticateToken, requireGrants, async (req, res) => {
        try {
            const where = {};
            if (req.query.source) where.source = String(req.query.source);
            if (req.query.period) {
                if (!validMonth(String(req.query.period))) return res.status(400).json({ error: 'period must be YYYY-MM' });
                where.period = String(req.query.period);
            }
            const rows = await RoyaltyStatement.findAll({ where, order: [['importedAt', 'DESC'], ['id', 'DESC']], limit: 200 });
            res.json({
                statements: rows.map(s => ({
                    id: s.id, source: s.source, period: s.period,
                    sourceFileHash: s.sourceFileHash, originalFilename: s.originalFilename,
                    rowCount: s.rowCount, importVersion: s.importVersion,
                    status: s.status, supersedesId: s.supersedesId,
                    importedBy: s.importedBy, importedAt: iso(s.importedAt),
                    mappingVersion: s.mappingVersion
                })),
                note: 'A statement is the import unit. A revised file supersedes the prior statement and its lines as one unit; superseded statements are retained for audit and excluded from totals.'
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });
}

module.exports = { register };
