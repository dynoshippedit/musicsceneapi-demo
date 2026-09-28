/**
 * src/routes/royalties.js
 *
 * Royalty accounting: CSV import keyed by ISRC/UPC, integer cents + currency.
 *
 *   POST /v3/royalties/import   (admin)  multipart CSV upload (field "file")
 *   GET  /v3/royalties/summary  (auth)   per-artist totals, integer cents
 *
 * CSV format (header row required):
 *   isrc_or_upc,amount_cents,currency,period,source
 *
 * Rules:
 *   - amount_cents is an INTEGER (cents). Decimals ("19.99", "199.0") and
 *     non-numeric values are rejected per row — money is never parsed as
 *     float anywhere in this module.
 *   - currency is a 3-letter ISO code, stored uppercase.
 *   - isrc_or_upc must match an existing Recording (ISRC) or Release (UPC);
 *     unmatched rows are reported in the import report, never silently
 *     dropped.
 *   - The summary groups by currency and sums in integer arithmetic. No
 *     cross-currency conversion is performed — per-currency totals only.
 *   - NO DDEX: CSV is the interchange format until a customer supplies
 *     DDEX files.
 *   - IDEMPOTENCY: a royalty statement is uniquely identified by
 *     (catalogKey, period, source). Re-importing the same CSV — or repeating
 *     a row inside one CSV — reports each repeated row as a "duplicate"
 *     rejection; totals never double-count. A DB-level unique constraint
 *     backstops concurrent imports.
 */

'use strict';

const multer = require('multer');

const { ISRC_RE, UPC_RE } = require('./catalog');
const { Op } = require('sequelize');
const { normalizeArtistAccess } = require('../auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

const REQUIRED_COLUMNS = ['isrc_or_upc', 'amount_cents', 'currency', 'period', 'source'];
const CURRENCY_RE = /^[A-Z]{3}$/;
const CENTS_RE = /^-?\d+$/;

/** Minimal CSV parser: handles quoted fields, embedded commas/quotes, CRLF. */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(field); field = '';
        } else if (c === '\n') {
            row.push(field); field = '';
            rows.push(row); row = [];
        } else if (c === '\r') {
            // skip; \n handles the line break
        } else {
            field += c;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function validateRow(raw, lineNo) {
    const key = String(raw.isrc_or_upc || '').trim().toUpperCase();
    if (!key) return { error: 'isrc_or_upc is required' };
    if (!ISRC_RE.test(key) && !UPC_RE.test(key)) {
        return { error: `isrc_or_upc "${raw.isrc_or_upc}" is neither a valid ISRC nor a 12-digit UPC` };
    }
    const centsRaw = String(raw.amount_cents || '').trim();
    if (!CENTS_RE.test(centsRaw)) {
        return { error: `amount_cents "${raw.amount_cents}" must be an integer number of cents (no decimals)` };
    }
    const amountCents = Number(centsRaw);
    if (!Number.isSafeInteger(amountCents)) {
        return { error: `amount_cents "${raw.amount_cents}" is out of safe integer range` };
    }
    const currency = String(raw.currency || '').trim().toUpperCase();
    if (!CURRENCY_RE.test(currency)) {
        return { error: `currency "${raw.currency}" must be a 3-letter ISO code` };
    }
    const period = String(raw.period || '').trim();
    if (!period) return { error: 'period is required' };
    return {
        value: {
            key,
            amountCents,
            currency,
            period,
            source: String(raw.source || '').trim() || null,
            lineNo
        }
    };
}

function register(app, ctx) {
    const { authenticateToken, hasArtistAccess, logger, Recording, Release, RoyaltyLine } = ctx;

    const requireAdmin = (req, res, next) => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    };

    // Import a royalty CSV. Returns a per-row report.
    app.post('/v3/royalties/import', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'Missing CSV file (multipart field "file")' });
        }
        let rows;
        try {
            rows = parseCsv(req.file.buffer.toString('utf8'));
        } catch (e) {
            return res.status(400).json({ error: 'Could not parse CSV' });
        }
        if (rows.length === 0) {
            return res.status(400).json({ error: 'CSV is empty' });
        }
        const header = rows[0].map((h) => String(h).trim().toLowerCase());
        const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
        if (missing.length > 0) {
            return res.status(400).json({
                error: `CSV header is missing required columns: ${missing.join(', ')}. ` +
                    `Expected: ${REQUIRED_COLUMNS.join(',')}`
            });
        }
        const idx = {};
        for (const col of REQUIRED_COLUMNS) idx[col] = header.indexOf(col);

        const report = { received: rows.length - 1, imported: 0, rejected: [] };
        const valid = [];

        for (let i = 1; i < rows.length; i++) {
            const lineNo = i + 1;
            const raw = {};
            for (const col of REQUIRED_COLUMNS) raw[col] = rows[i][idx[col]] ?? '';
            const checked = validateRow(raw, lineNo);
            if (checked.error) {
                report.rejected.push({ row: lineNo, reason: checked.error });
                continue;
            }
            valid.push(checked.value);
        }

        // Resolve ISRC/UPC keys against the catalog.
        const toInsert = [];
        for (const v of valid) {
            let recordingId = null;
            let releaseId = null;
            let artistId = null;
            if (ISRC_RE.test(v.key)) {
                const rec = await Recording.findOne({ where: { isrc: v.key } });
                if (rec) { recordingId = rec.id; artistId = rec.artistId; }
            } else {
                const rel = await Release.findOne({ where: { upc: v.key } });
                if (rel) { releaseId = rel.id; artistId = rel.artistId; }
            }
            if (!artistId) {
                report.rejected.push({ row: v.lineNo, reason: `no recording or release found for "${v.key}"` });
                continue;
            }
            toInsert.push({
                artistId,
                catalogKey: v.key,
                recordingId,
                releaseId,
                amountCents: v.amountCents,
                currency: v.currency,
                period: v.period,
                source: v.source || '',
                importedBy: req.user.email,
                lineNo: v.lineNo
            });
        }

        try {
            await ctx.sequelize.transaction(async (t) => {
                const seenInFile = new Set();
                for (const line of toInsert) {
                    const dupKey = `${line.catalogKey}|${line.period}|${line.source}`;
                    const duplicateReason = (where) =>
                        `duplicate royalty line for "${line.catalogKey}" period ${line.period}` +
                        (line.source ? ` source "${line.source}"` : ' (no source)') +
                        ` — ${where}; skipped, not double-counted`;
                    if (seenInFile.has(dupKey)) {
                        report.rejected.push({ row: line.lineNo, reason: duplicateReason('repeated inside this file') });
                        continue;
                    }
                    seenInFile.add(dupKey);
                    const existing = await RoyaltyLine.findOne({
                        where: { catalogKey: line.catalogKey, period: line.period, source: line.source },
                        transaction: t
                    });
                    if (existing) {
                        report.rejected.push({ row: line.lineNo, reason: duplicateReason('already imported') });
                        continue;
                    }
                    const { lineNo: _lineNo, ...row } = line;
                    await RoyaltyLine.create(row, { transaction: t });
                    report.imported++;
                }
            });
        } catch (err) {
            if (logger) logger.error(err);
            return res.status(500).json({ error: 'Database error during import' });
        }

        res.status(201).json(report);
    });

    // Per-artist royalty totals, summed in integer cents per currency.
    app.get('/v3/royalties/summary', authenticateToken, async (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        const where = {};
        if (req.user.role === 'admin') {
            if (req.query.artistId) where.artistId = String(req.query.artistId);
        } else {
            // Same normalization as catalog listWhere / hasArtistAccess on
            // detail routes: scalar, array, and 'all' grants behave
            // identically. Fail-closed: no grants -> 403.
            const access = normalizeArtistAccess(req.user.artistAccess);
            if (access.length === 0) {
                return res.status(403).json({ error: 'Not authorized' });
            }
            if (req.query.artistId) {
                if (!hasArtistAccess(req.user, req.query.artistId)) {
                    return res.status(403).json({ error: 'Not authorized for this artist' });
                }
                where.artistId = String(req.query.artistId);
            } else if (!access.includes('all')) {
                where.artistId = access.length === 1 ? access[0] : { [Op.in]: access };
            }
        }
        if (req.query.period) where.period = String(req.query.period);
        if (req.query.currency) where.currency = String(req.query.currency).toUpperCase();

        try {
            const lines = await RoyaltyLine.findAll({ where, order: [['id', 'ASC']] });
            // Integer accumulation only — no float math on money, ever.
            const byCurrency = new Map();
            for (const line of lines) {
                const cur = byCurrency.get(line.currency) || { currency: line.currency, totalCents: 0, lineCount: 0 };
                cur.totalCents += line.amountCents;
                cur.lineCount += 1;
                if (!Number.isSafeInteger(cur.totalCents)) {
                    return res.status(500).json({ error: 'Total exceeds safe integer range' });
                }
                byCurrency.set(line.currency, cur);
            }
            res.json({
                totals: [...byCurrency.values()],
                lines: lines.length
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

}

module.exports = { register, parseCsv, validateRow };
