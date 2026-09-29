/**
 * src/routes/finance.js
 *
 * Royalty calculation and rights/contracts.
 *
 * Handler bodies were moved VERBATIM from production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (2):
 *   POST   /v3/royalties/calculate
 *   GET    /v3/rights/contracts
 */

'use strict';

// MUS-001: integer-cents royalty math — the canonical decimal path plus the
// single basis-point rounding implementation shared with the commission
// worksheet. No float ever enters the money math.
const { parseDecimal, decimalToCents } = require('../finance/decimal');
const { commissionCents } = require('../finance/commission');

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

    // Calculate Royalties
    // MUS-001: integer-cents math from the start. Splits are integer basis
    // points summing to 10000. The label leg is rounded half-up from integer
    // math; the artist takes the remainder (same rule as the Decentralflix
    // splitter) so the legs always sum exactly to the total. Only USD streams
    // are summed; non-USD streams are flagged, never mixed in.
    app.post('/v3/royalties/calculate', authenticateToken, async (req, res) => {
        try {
            const { artistId, revenueSources, splits } = req.body || {};
            if (!hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });

            if (revenueSources !== undefined && !Array.isArray(revenueSources)) {
                return res.status(400).json({ error: 'revenueSources must be an array of source names' });
            }
            const splitsBps = splits || { artist: 7000, label: 3000 };
            const bpsLegs = [splitsBps.artist, splitsBps.label];
            if (typeof splitsBps !== 'object' || splitsBps === null || Array.isArray(splitsBps) ||
                !bpsLegs.every((v) => Number.isInteger(v) && v >= 0 && v <= 10000) ||
                bpsLegs[0] + bpsLegs[1] !== 10000) {
                return res.status(400).json({ error: 'splits must be integer basis points summing to 10000, e.g. { artist: 7000, label: 3000 }' });
            }
            if (Array.isArray(revenueSources) && revenueSources.some((source) => typeof source !== 'string')) {
                return res.status(400).json({ error: 'revenueSources must be an array of source names' });
            }

            // PHASE 4CF: canonical DB-first artist read. Do NOT serve this from any in-memory cache.
            const artist = await artistRepo.findById(artistId);
            if (!artist) return res.status(404).json({ error: 'Artist not found' });

            const targetSources = revenueSources || ['streaming', 'merch', 'touring'];
            const revenue = artist.revenue || {};
            let totalCents = 0n;
            const breakdownCents = {};
            const flaggedStreams = [];
            for (const source of targetSources) {
                const raw = revenue[source];
                // Stream may be a bare dollar number (legacy, assumed USD) or
                // an { amount, currency } object.
                let amount = 0;
                let currency = 'USD';
                if (typeof raw === 'number') {
                    amount = raw;
                } else if (raw && typeof raw === 'object') {
                    // SI-01 extension: nullish coalescing, NOT ||. A missing amount
                    // (null/undefined) legitimately stays 0; NaN must NOT be
                    // coerced to 0 — it must flow into the finite check below
                    // and be rejected with 400.
                    amount = raw.amount ?? 0;
                    currency = String(raw.currency || 'USD').toUpperCase();
                } else if (raw !== undefined && raw !== null) {
                    // SI-01: a bare value that is neither a dollar number nor
                    // an { amount, currency } object must be rejected, never
                    // silently coerced to 0.
                    return res.status(400).json({ error: `revenue stream "${source}" has an invalid amount` });
                }
                if (currency !== 'USD') {
                    flaggedStreams.push({ source, currency, amount });
                    continue;
                }
                if (!Number.isFinite(amount) || amount < 0) {
                    return res.status(400).json({ error: `revenue stream "${source}" has an invalid amount` });
                }
                // One conversion, canonical path: string round-trip so the
                // binary float never enters the money math.
                const cents = decimalToCents(parseDecimal(String(amount)));
                breakdownCents[source] = Number(cents);
                totalCents += cents;
            }

            const labelCents = commissionCents(totalCents, splitsBps.label);
            const artistCents = totalCents - labelCents;

            res.json({
                artistName: artist.name,
                currency: 'USD',
                totalRevenueCents: Number(totalCents),
                payoutCents: {
                    artist: Number(artistCents),
                    label: Number(labelCents)
                },
                breakdownCents,
                splitsBps,
                ...(flaggedStreams.length ? { flaggedStreams } : {})
            });
        } catch (err) {
            logger.error('Royalty calculation failed:', err);
            if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Contract generation is not implemented; never advertise a nonexistent PDF.
    app.get('/v3/rights/contracts', authenticateToken, async (req, res) => {
        try {
            const { artistId } = req.query;
            if (!hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });
            const artist = await artistRepo.findById(artistId);
            if (!artist) return res.status(404).json({ error: 'Artist not found' });
            return res.status(501).json({ error: 'Contract generation is not available. No contract has been created.' });
        } catch (err) {
            logger.error('Contract lookup failed:', err);
            return res.status(503).json({ error: 'Contract service is unavailable' });
        }
    });
}
module.exports = { register };
