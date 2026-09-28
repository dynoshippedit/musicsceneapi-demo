/**
 * src/routes/royalties.js
 *
 * Royalty accounting: CSV import keyed by ISRC/UPC, source-precision
 * decimals + currency.
 *
 *   POST /v3/royalties/import           (admin)  multipart CSV upload (field "file")
 *   POST /v3/royalties/import/atvenu     (admin)  atVenu settlement CSV (field "file")
 *   GET  /v3/royalties/summary            (auth)   per-artist totals, exact decimals
 *   GET  /v3/royalties/merch-settlements  (auth)   imported merch settlements
 *   PATCH /v3/royalties/lines/:id/review       (admin) review-state transition
 *   PATCH /v3/royalties/settlements/:id/review (admin) review-state transition
 *   GET   /v3/royalties/lines                  (auth)  list lines (filters: artistId,
 *                                                     period, currency, source, reviewState)
 *   GET   /v3/royalties/settlements            (auth)  list settlements (filters: artistId,
 *                                                     currency, source, reviewState)
 *
 * CSV format (header row required):
 *   isrc_or_upc,amount,currency,period,source
 *
 * The `amount` column is an EXACT DECIMAL string ("125.00", "0.003") —
 * never a float. Source precision is preserved on the record
 * (amountDecimal + amountScale + sourceAmount); integer cents appear only
 * at the settlement/payment boundary via round-half-up (see
 * src/finance/decimal.js). The legacy `amount_cents` column (integer) is
 * still accepted and treated as scale-2.
 *
 * Rules:
 *   - currency is a 3-letter ISO code, stored uppercase.
 *   - isrc_or_upc must match an existing Recording (ISRC) or Release (UPC);
 *     unmatched rows are reported in the import report, never silently
 *     dropped.
 *   - The summary groups by currency and sums the EXACT decimals, rounding
 *     once at the boundary. No cross-currency conversion — per-currency
 *     totals only.
 *   - NO DDEX: CSV is the interchange format until a customer supplies
 *     DDEX files.
 *   - IDEMPOTENCY + SUPERSEDE (statement identity, 2026-09-28 fix 1): the
 *     import unit is the STATEMENT — one source file for one (source,
 *     period), recorded in RoyaltyStatement with its SHA-256 file hash,
 *     import version, importer, and timestamp. Every line carries
 *     statementId; the statement links to the statement it replaced via
 *     supersedesId. Re-uploading the SAME file (same SHA-256) reports each
 *     row as an "already imported" duplicate; totals never double-count.
 *     Uploading a REVISED file (same source + period, different hash)
 *     SUPERSEDES the prior statement AS A UNIT: every active line in it is
 *     marked superseded (excluded from totals, retained for audit).
 *   - DUPLICATE DETECTION is on the full row-content hash (catalog key,
 *     exact amount, currency, period, source). Only content-identical rows
 *     within one file are rejected as duplicates — a second legitimate
 *     line for the same recording/period/source (territory, rights-type,
 *     or rate-tier split) imports normally. The old
 *     (catalogKey, period, source) dedup key was the defect and is gone.
 *   - FIELD MAPPING (research update 8): logical columns resolve through
 *     header aliases; the detected mapping is persisted per (source,
 *     column signature) with a version, and a reviewer approves it with
 *     evidence. A changed layout never silently inherits an old mapping —
 *     the import is flagged for re-review.
 *   - REVIEW STATE: every imported line starts as `reported`. Transitions
 *     (reported -> reconciled -> approved, plus disputed / estimated) carry
 *     reviewer identity + evidence via the review endpoints.
 *
 * atVenu settlement CSV format (header row required) — modeled on atVenu's
 * nightly settlement fields (show date, venue, gross, fees, taxes, net,
 * currency, attendance). atVenu does not publish a fixed settlement CSV
 * schema, so this is OUR documented import contract, not a claim about
 * atVenu's export layout:
 *   show_date,venue,artist,gross_cents,fees_cents,taxes_cents,net_cents,currency,attendance
 *   - show_date: YYYY-MM-DD. venue: non-empty. artist: matched by name
 *     (case-insensitive) against the roster; unmatched rows are rejected.
 *   - gross_cents / net_cents required; fees_cents / taxes_cents default 0;
 *     attendance optional. All money is integer cents, never float.
 *   - IDEMPOTENCY + SUPERSEDE: (artistId, showDate, venue, source, file
 *     hash), same semantics as royalty lines.
 */

'use strict';

const crypto = require('crypto');
const multer = require('multer');

const { ISRC_RE, UPC_RE } = require('./catalog');
const { Op } = require('sequelize');
const { normalizeArtistAccess } = require('../auth');
const { precisionFromSource, precisionFromCents } = require('../finance/decimal');
const { canTransition, isReviewState } = require('../finance/reviewState');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

const REQUIRED_COLUMNS = ['isrc_or_upc', 'currency', 'period', 'source'];
const AMOUNT_COLUMNS = ['amount', 'amount_cents'];
// Field-mapping aliases (research update 8: mapping history). Logical fields
// resolve through these per-source header aliases so messy distributor
// files with variant column names map deterministically. The detected
// mapping is persisted per (source, columnSignature) with a version, and a
// reviewer approves it with evidence; a changed layout never silently
// inherits an approved mapping — it is flagged for re-review.
const LOGICAL_COLUMNS = {
    key: ['isrc_or_upc', 'isrc', 'upc', 'catalog', 'catalog_id', 'catalogue', 'recording'],
    amount: ['amount', 'total', 'amount_usd', 'gross_amount', 'royalty_amount', 'earnings', 'net_amount', 'payable'],
    amount_cents: ['amount_cents', 'cents', 'total_cents', 'amountcents'],
    currency: ['currency', 'cur', 'ccy'],
    period: ['period', 'statement_period', 'month', 'reporting_period'],
    source: ['source', 'distributor', 'provider', 'label_source', 'service']
};
const CURRENCY_RE = /^[A-Z]{3}$/;
const CENTS_RE = /^-?\d+$/;
const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;

/** SHA-256 hex of a buffer — the source-file identity for idempotency. */
function fileHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Row-content hash (2026-09-28 fix 1): SHA-256 over the FULL normalized
 * source row — every column in stable order, header/value pairs. Only
 * content-identical rows are duplicates. A second legitimate line for the
 * same recording/period/source that differs in ANY column (territory,
 * rights type, rate tier, a different amount) has a different hash and
 * imports normally. Hashing only the logical fields would silently drop
 * territory/rights splits — that was the defect.
 *
 * @param {object} fullRow normalized header -> trimmed string value
 */
function rowContentHash(fullRow) {
    const pairs = Object.keys(fullRow).sort().map((h) => [h, fullRow[h]]);
    return crypto.createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}

/** Most common value in a list (ties -> first seen). */
function modeValue(values) {
    const counts = new Map();
    let best = null;
    let bestCount = 0;
    for (const v of values) {
        const c = (counts.get(v) || 0) + 1;
        counts.set(v, c);
        if (c > bestCount) { bestCount = c; best = v; }
    }
    return best;
}

/**
 * Mapping history (research update 8). Persist the detected column layout
 * per (source, columnSignature); a repeat import with the same layout
 * reuses the stored mapping (approved or seen); a changed layout for a
 * source that already has an APPROVED mapping is recorded but NEVER
 * silently inherits the old mapping — the report flags it for re-review.
 */
async function resolveColumnMapping(SourceMapping, source, columnSignature, detectedMapping, t, importedBy) {
    const existing = await SourceMapping.findOne({
        where: { source, headerHash: columnSignature }, transaction: t
    });
    if (existing) {
        // Approved mappings are reused silently for identical formats.
        // Anything else (a layout seen before but never approved — e.g. a
        // changed schema still awaiting re-review) stays visibly
        // review-required on every repeat: the changed format is never
        // trusted just because it was seen twice.
        const isApproved = existing.status === 'approved';
        return {
            reused: true,
            status: existing.status,
            version: existing.mappingVersion,
            approvedBy: existing.approvedBy || null,
            reviewRequired: !isApproved,
            message: isApproved
                ? `reusing approved mapping v${existing.mappingVersion} (approved by ${existing.approvedBy})`
                : `column layout v${existing.mappingVersion} was recorded before but is NOT approved — re-review required before trusting it`
        };
    }
    const approved = await SourceMapping.findOne({
        where: { source, status: 'approved' },
        order: [['mappingVersion', 'DESC']],
        transaction: t
    });
    const maxVersion = await SourceMapping.max('mappingVersion', { where: { source }, transaction: t });
    const record = await SourceMapping.create({
        source,
        mappingVersion: (maxVersion || 0) + 1,
        formatHash: columnSignature,
        headerHash: columnSignature,
        columnMapping: detectedMapping,
        status: 'seen',
        importedBy: importedBy || null
    }, { transaction: t });
    if (approved) {
        return {
            reused: false,
            status: 'seen',
            version: record.mappingVersion,
            reviewRequired: true,
            message: `column layout changed since approved mapping v${approved.mappingVersion} (approved by ${approved.approvedBy}); ` +
                'the new layout was recorded but NOT silently inherited — re-review required before trusting it'
        };
    }
    return {
        reused: false,
        status: 'seen',
        version: record.mappingVersion,
        reviewRequired: false,
        message: 'first sighting of this column layout for this source; recorded for review'
    };
}

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
    // Amount: prefer the exact-decimal `amount` column; fall back to the
    // legacy integer `amount_cents`. Either way the source precision is
    // preserved (decimal) and cents are derived once at the boundary.
    let precision;
    const amountRaw = String(raw.amount ?? '').trim();
    const centsRaw = String(raw.amount_cents ?? '').trim();
    try {
        if (amountRaw !== '') {
            if (!DECIMAL_RE.test(amountRaw)) {
                return { error: `amount "${raw.amount}" must be an exact decimal string (e.g. "125.00"), never a float` };
            }
            precision = precisionFromSource(amountRaw);
        } else if (centsRaw !== '') {
            if (!CENTS_RE.test(centsRaw)) {
                return { error: `amount_cents "${raw.amount_cents}" must be an integer number of cents` };
            }
            const cents = Number(centsRaw);
            if (!Number.isSafeInteger(cents)) {
                return { error: `amount_cents "${raw.amount_cents}" is out of safe integer range` };
            }
            precision = precisionFromCents(cents);
        } else {
            return { error: 'amount is required (exact decimal, e.g. "125.00"); amount_cents accepted as legacy integer' };
        }
    } catch (e) {
        return { error: `amount "${amountRaw || centsRaw}" is out of safe integer range` };
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
            ...precision,
            currency,
            period,
            source: String(raw.source || '').trim() || null,
            lineNo
        }
    };
}

function register(app, ctx) {
    const { authenticateToken, hasArtistAccess, logger, Recording, Release, RoyaltyLine, RoyaltyStatement, SourceMapping, MerchSettlement, DirectSale } = ctx;

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
        // Field mapping: resolve logical fields through column aliases.
        // The detected mapping (logical -> actual header) is persisted per
        // (source, columnSignature) for mapping history (research update 8).
        const detectedMapping = {};
        const missing = [];
        for (const logical of Object.keys(LOGICAL_COLUMNS)) {
            const found = LOGICAL_COLUMNS[logical].find((a) => header.includes(a));
            if (found) {
                detectedMapping[logical] = found;
            } else if (logical !== 'amount' && logical !== 'amount_cents') {
                missing.push(logical);
            }
        }
        const hasAmount = Boolean(detectedMapping.amount || detectedMapping.amount_cents);
        if (!hasAmount) missing.push('amount|amount_cents');
        if (missing.length > 0) {
            return res.status(400).json({
                error: `CSV header is missing required columns: ${missing.join(', ')}. ` +
                    `Expected logical columns: key (isrc_or_upc, or aliases: isrc, upc, catalog), ` +
                    `amount (aliases: total, royalty_amount, earnings), amount_cents (legacy integer), ` +
                    `currency, period, source`
            });
        }
        const idx = {};
        for (const [logical, actual] of Object.entries(detectedMapping)) idx[logical] = header.indexOf(actual);
        // Column signature: SHA-256 over the normalized header — the mapping
        // identity. A changed signature for a source with an approved mapping
        // is flagged for re-review, never silently inherited.
        const columnSignature = fileHash(Buffer.from(header.join('|'), 'utf8'));

        const report = { received: rows.length - 1, imported: 0, superseded: 0, rejected: [], statements: [], mapping: null };
        const valid = [];

        for (let i = 1; i < rows.length; i++) {
            const lineNo = i + 1;
            // Full normalized source row: every column, header -> trimmed
            // string value. This is the dedup identity AND the provenance
            // that shows why two rows for the same recording differ
            // (territory, rights type, rate tier, ...).
            const fullRow = {};
            for (let c = 0; c < header.length; c++) {
                fullRow[header[c]] = String(rows[i][c] ?? '').trim();
            }
            const raw = {
                isrc_or_upc: idx.key >= 0 ? (rows[i][idx.key] ?? '') : '',
                amount: detectedMapping.amount && idx.amount >= 0 ? (rows[i][idx.amount] ?? '') : '',
                amount_cents: detectedMapping.amount_cents && idx.amount_cents >= 0 ? (rows[i][idx.amount_cents] ?? '') : '',
                currency: idx.currency >= 0 ? (rows[i][idx.currency] ?? '') : '',
                period: idx.period >= 0 ? (rows[i][idx.period] ?? '') : '',
                source: idx.source >= 0 ? (rows[i][idx.source] ?? '') : ''
            };
            const checked = validateRow(raw, lineNo);
            if (checked.error) {
                report.rejected.push({ row: lineNo, reason: checked.error });
                continue;
            }
            valid.push({ ...checked.value, fullRow });
        }

        // Statement identity (2026-09-28 fix 1): the import unit is the
        // STATEMENT (source file for one source + period), not the row.
        const hash = fileHash(req.file.buffer);
        const importVersion = `royalty-${Date.now()}-${hash.slice(0, 12)}`;

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
                report.rejected.push({ row: v.lineNo, code: 'unmatched_catalog', reason: `no recording or release found for "${v.key}"` });
                continue;
            }
            toInsert.push({
                artistId,
                catalogKey: v.key,
                recordingId,
                releaseId,
                amountDecimal: v.amountDecimal,
                amountScale: v.amountScale,
                sourceAmount: v.sourceAmount,
                amountCents: v.amountCents,
                currency: v.currency,
                period: v.period,
                source: v.source || '',
                importedBy: req.user.email,
                sourceFileHash: hash,
                rowRef: `line ${v.lineNo}`,
                importVersion,
                reviewState: 'reported',
                lineNo: v.lineNo,
                // Row-content hash: SHA-256 over the FULL normalized
                // source row. Only content-identical rows are duplicates —
                // a second legitimate line for the same recording/period/
                // source that differs in any column (territory, rights
                // type, rate tier, amount) imports normally.
                rowHash: rowContentHash(v.fullRow)
            });
        }

        // File-level source for mapping history: explicit form field wins,
        // otherwise the most common row source.
        const fileSource = String(req.body.source || '').trim() ||
            modeValue(toInsert.map((l) => l.source)) || '';

        try {
            await ctx.sequelize.transaction(async (t) => {
                // --- Mapping history (research update 8). Persist the
                // detected column layout per (source, columnSignature). A
                // repeat import with the same layout reuses the approved
                // mapping; a changed layout never silently inherits it —
                // the import is flagged for re-review.
                report.mapping = await resolveColumnMapping(
                    SourceMapping, fileSource, columnSignature, detectedMapping, t, req.user.email);

                // --- Group rows into statements by (source, period). One
                // file may carry several statements; each is handled as a
                // unit below.
                const groups = new Map();
                for (const line of toInsert) {
                    const gk = `${line.source}|||${line.period}`;
                    if (!groups.has(gk)) groups.set(gk, { source: line.source, period: line.period, lines: [] });
                    groups.get(gk).lines.push(line);
                }
                const ordered = [...groups.values()].sort((a, b) =>
                    a.source === b.source ? (a.period < b.period ? -1 : 1) : (a.source < b.source ? -1 : 1));

                for (const group of ordered) {
                    const { source, period, lines } = group;
                    // Within-file duplicates: full row-content hash only.
                    const seenHashes = new Set();
                    const fresh = [];
                    for (const line of lines) {
                        if (seenHashes.has(line.rowHash)) {
                            report.rejected.push({
                                row: line.lineNo,
                                code: 'exact_duplicate_row',
                                reason: `exact duplicate row within this file (identical content) for "${line.catalogKey}" period ${line.period}` +
                                    (line.source ? ` source "${line.source}"` : '') +
                                    '; skipped, not double-counted'
                            });
                            continue;
                        }
                        seenHashes.add(line.rowHash);
                        fresh.push(line);
                    }

                    // Same file (same SHA-256) already imported: reject every
                    // row as an already-imported duplicate. Totals unchanged.
                    const sameFile = await RoyaltyStatement.findOne({
                        where: { source, period, sourceFileHash: hash }, transaction: t
                    });
                    if (sameFile) {
                        for (const line of fresh) {
                            report.rejected.push({
                                row: line.lineNo,
                                code: 'already_imported',
                                reason: `duplicate — this file was already imported as statement #${sameFile.id} ` +
                                    `(SHA-256 ${hash.slice(0, 12)}…); skipped, not double-counted`
                            });
                        }
                        report.statements.push({
                            id: sameFile.id, source, period,
                            status: 'duplicate_file', imported: 0, superseded: 0
                        });
                        report.alreadyImported = true;
                        report.duplicateOfStatementId = sameFile.id;
                        continue;
                    }

                    // Revised file for the same (source, period): supersede
                    // the prior statement AS A UNIT — every active line in it,
                    // plus any legacy lines that predate statement identity.
                    let supersedesStatementId = null;
                    const supersededLineIds = [];
                    const prior = await RoyaltyStatement.findOne({
                        where: { source, period, status: 'active' }, transaction: t
                    });
                    const supersedeLine = async (pl, why) => {
                        await pl.update({
                            reviewState: 'superseded',
                            reviewedBy: req.user.email,
                            reviewEvidence: `superseded by revised statement import ${importVersion} (${why})`,
                            reviewedAt: new Date()
                        }, { transaction: t });
                        supersededLineIds.push(pl.id);
                        report.superseded++;
                    };
                    if (prior) {
                        supersedesStatementId = prior.id;
                        const priorLines = await RoyaltyLine.findAll({
                            where: { statementId: prior.id, reviewState: { [Op.ne]: 'superseded' } },
                            transaction: t
                        });
                        for (const pl of priorLines) await supersedeLine(pl, `statement #${prior.id} replaced as a unit`);
                        await prior.update({ status: 'superseded' }, { transaction: t });
                    }
                    // Legacy lines imported before statement identity existed
                    // carry no statementId; they belong to this (source,
                    // period) and are superseded with the revision.
                    const legacyLines = await RoyaltyLine.findAll({
                        where: {
                            statementId: null, source, period,
                            reviewState: { [Op.ne]: 'superseded' }
                        },
                        transaction: t
                    });
                    for (const pl of legacyLines) await supersedeLine(pl, 'legacy line superseded by statement revision');

                    const statement = await RoyaltyStatement.create({
                        source,
                        period,
                        sourceFileHash: hash,
                        originalFilename: req.file.originalname || null,
                        formatHash: columnSignature,
                        rowCount: fresh.length,
                        mappingVersion: report.mapping ? report.mapping.version : null,
                        importVersion,
                        importedBy: req.user.email,
                        status: 'active',
                        supersedesId: supersedesStatementId
                    }, { transaction: t });

                    for (const line of fresh) {
                        const { lineNo: _lineNo, fullRow: _fullRow, ...row } = line;
                        await RoyaltyLine.create({ ...row, statementId: statement.id }, { transaction: t });
                        report.imported++;
                    }
                    report.statements.push({
                        id: statement.id, source, period, status: 'active',
                        imported: fresh.length,
                        superseded: supersededLineIds.length,
                        supersedesStatementId,
                        supersededLineIds
                    });
                }
            });
        } catch (err) {
            if (logger) logger.error(err);
            return res.status(500).json({ error: 'Database error during import' });
        }
        if (report.alreadyImported) {
            return res.status(200).json(report);
        }

        res.status(201).json(report);
    });

    // atVenu settlement import (strategy doc 2026-09-28, admin-only).
    // See the module header for the documented CSV contract.
    const ATVENU_REQUIRED = ['show_date', 'venue', 'artist', 'gross_cents', 'net_cents', 'currency'];
    const ATVENU_OPTIONAL = ['fees_cents', 'taxes_cents', 'attendance'];
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    function validateSettlementRow(raw, lineNo, rosterByName) {
        const showDate = String(raw.show_date || '').trim();
        if (!DATE_RE.test(showDate)) {
            return { error: `show_date "${raw.show_date}" must be YYYY-MM-DD` };
        }
        const venue = String(raw.venue || '').trim();
        if (!venue) return { error: 'venue is required' };
        const artistName = String(raw.artist || '').trim().toLowerCase();
        if (!artistName) return { error: 'artist is required' };
        const matches = rosterByName.get(artistName) || [];
        if (matches.length === 0) {
            return { error: `artist "${raw.artist}" does not match any roster artist` };
        }
        if (matches.length > 1) {
            return { error: `artist "${raw.artist}" is ambiguous (${matches.length} roster matches)` };
        }
        const cents = {};
        for (const col of ['gross_cents', 'fees_cents', 'taxes_cents', 'net_cents']) {
            const rawVal = String(raw[col] ?? (col === 'gross_cents' || col === 'net_cents' ? '' : '0')).trim();
            if (!CENTS_RE.test(rawVal)) {
                return { error: `${col} "${raw[col]}" must be an integer number of cents (no decimals)` };
            }
            const n = Number(rawVal);
            if (!Number.isSafeInteger(n)) {
                return { error: `${col} "${raw[col]}" is out of safe integer range` };
            }
            cents[col] = n;
        }
        const currency = String(raw.currency || '').trim().toUpperCase();
        if (!CURRENCY_RE.test(currency)) {
            return { error: `currency "${raw.currency}" must be a 3-letter ISO code` };
        }
        let attendance = null;
        const attRaw = String(raw.attendance ?? '').trim();
        if (attRaw !== '') {
            if (!/^\d+$/.test(attRaw)) {
                return { error: `attendance "${raw.attendance}" must be a non-negative integer` };
            }
            attendance = Number(attRaw);
            if (!Number.isSafeInteger(attendance)) {
                return { error: `attendance "${raw.attendance}" is out of safe integer range` };
            }
        }
        return {
            value: {
                artistId: matches[0].id,
                showDate,
                venue,
                grossCents: cents.gross_cents,
                feesCents: cents.fees_cents,
                taxesCents: cents.taxes_cents,
                netCents: cents.net_cents,
                currency,
                attendance,
                lineNo
            }
        };
    }

    app.post('/v3/royalties/import/atvenu', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
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
        const missing = ATVENU_REQUIRED.filter((c) => !header.includes(c));
        if (missing.length > 0) {
            return res.status(400).json({
                error: `CSV header is missing required columns: ${missing.join(', ')}. ` +
                    `Expected: ${[...ATVENU_REQUIRED, ...ATVENU_OPTIONAL].join(',')}`
            });
        }
        const cols = [...ATVENU_REQUIRED, ...ATVENU_OPTIONAL];
        const idx = {};
        for (const col of cols) idx[col] = header.indexOf(col);

        // Build the roster name index for artist resolution.
        const artistRepo = require('../repositories/artistRepository');
        const roster = await artistRepo.getAllArtists();
        const rosterByName = new Map();
        for (const a of roster) {
            const key = String(a.name || '').trim().toLowerCase();
            if (!key) continue;
            if (!rosterByName.has(key)) rosterByName.set(key, []);
            rosterByName.get(key).push(a);
        }

        const report = { received: rows.length - 1, imported: 0, superseded: 0, rejected: [] };
        const valid = [];

        for (let i = 1; i < rows.length; i++) {
            const lineNo = i + 1;
            const raw = {};
            for (const col of cols) raw[col] = idx[col] >= 0 ? (rows[i][idx[col]] ?? '') : '';
            const checked = validateSettlementRow(raw, lineNo, rosterByName);
            if (checked.error) {
                report.rejected.push({ row: lineNo, reason: checked.error });
                continue;
            }
            valid.push(checked.value);
        }

        const hash = fileHash(req.file.buffer);
        const importVersion = `atvenu-${Date.now()}-${hash.slice(0, 12)}`;

        try {
            await ctx.sequelize.transaction(async (t) => {
                const seenInFile = new Set();
                for (const line of valid) {
                    const dupKey = `${line.artistId}|${line.showDate}|${line.venue}|atvenu`;
                    const dupReason = (where) =>
                        `duplicate settlement for artist ${line.artistId} on ${line.showDate} at "${line.venue}" — ${where}; skipped, not double-counted`;
                    if (seenInFile.has(dupKey)) {
                        report.rejected.push({ row: line.lineNo, reason: dupReason('repeated inside this file') });
                        continue;
                    }
                    seenInFile.add(dupKey);
                    const existing = await MerchSettlement.findOne({
                        where: {
                            artistId: line.artistId, showDate: line.showDate, venue: line.venue, source: 'atvenu',
                            reviewState: { [Op.ne]: 'superseded' }
                        },
                        transaction: t
                    });
                    if (existing) {
                        if (existing.sourceFileHash === hash) {
                            report.rejected.push({ row: line.lineNo, reason: dupReason('already imported (same file)') });
                            continue;
                        }
                        await existing.update({
                            reviewState: 'superseded',
                            reviewedBy: req.user.email,
                            reviewEvidence: `superseded by import ${importVersion} (revised file ${hash.slice(0, 12)})`,
                            reviewedAt: new Date()
                        }, { transaction: t });
                        const { lineNo: _lineNo, ...row } = line;
                        await MerchSettlement.create(
                            {
                                ...row, source: 'atvenu', importedBy: req.user.email,
                                sourceFileHash: hash, rowRef: `line ${line.lineNo}`,
                                importVersion, reviewState: 'reported',
                                supersedesId: existing.id
                            },
                            { transaction: t }
                        );
                        report.imported++;
                        report.superseded++;
                        continue;
                    }
                    const { lineNo: _lineNo, ...row } = line;
                    await MerchSettlement.create(
                        {
                            ...row, source: 'atvenu', importedBy: req.user.email,
                            sourceFileHash: hash, rowRef: `line ${line.lineNo}`,
                            importVersion, reviewState: 'reported'
                        },
                        { transaction: t }
                    );
                    report.imported++;
                }
            });
        } catch (err) {
            if (logger) logger.error(err);
            return res.status(500).json({ error: 'Database error during import' });
        }

        res.status(201).json(report);
    });

    // List imported merch settlements (auth; artist role scoped to own grants).
    app.get('/v3/royalties/merch-settlements', authenticateToken, async (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        const where = {};
        if (req.user.role === 'admin') {
            if (req.query.artistId) where.artistId = String(req.query.artistId);
        } else {
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
        try {
            const rows = await MerchSettlement.findAll({ where, order: [['showDate', 'ASC'], ['id', 'ASC']] });
            res.json({
                settlements: rows.map((r) => ({
                    id: r.id,
                    artistId: r.artistId,
                    showDate: r.showDate,
                    venue: r.venue,
                    grossCents: r.grossCents,
                    feesCents: r.feesCents,
                    taxesCents: r.taxesCents,
                    netCents: r.netCents,
                    currency: r.currency,
                    attendance: r.attendance,
                    source: r.source
                }))
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Per-artist royalty totals. Exact-decimal summation (research
    // correction 2026-09-28): lines are summed at source precision, then
    // rounded ONCE at the boundary (round-half-up). Superseded lines are
    // excluded — revised statements replace, never duplicate.
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
            const lines = await RoyaltyLine.findAll({
                where: { ...where, reviewState: { [Op.ne]: 'superseded' } },
                order: [['id', 'ASC']]
            });
            // Exact-decimal accumulation: sum at source precision, round
            // once at the boundary. Falls back to amountCents for legacy
            // rows that predate precision preservation.
            //
            // 2026-09-28 fix 2: the headline total counts ONLY the trusted
            // states (reported, reconciled, approved). Disputed and
            // estimated lines are summed as separate, visible lines and
            // never enter the trusted total.
            const { sumDecimals, decimalToCents, formatDecimal, parseDecimal } = require('../finance/decimal');
            const { isCounted, isDisputed, isEstimated } = require('../finance/reviewState');
            const byCurrency = new Map();
            for (const line of lines) {
                let d;
                try {
                    d = line.amountDecimal
                        ? parseDecimal(line.amountDecimal)
                        : { mantissa: BigInt(line.amountCents), scale: 2 };
                } catch {
                    return res.status(500).json({ error: 'Corrupt decimal on royalty line' });
                }
                const st = line.reviewState || 'reported';
                const cur = byCurrency.get(line.currency) || {
                    currency: line.currency,
                    exact: { mantissa: 0n, scale: 0 },
                    disputedExact: { mantissa: 0n, scale: 0 },
                    estimatedExact: { mantissa: 0n, scale: 0 },
                    lineCount: 0, disputedCount: 0, estimatedCount: 0
                };
                cur.lineCount += 1;
                if (isCounted(st)) cur.exact = sumDecimals([cur.exact, d]);
                else if (isDisputed(st)) { cur.disputedExact = sumDecimals([cur.disputedExact, d]); cur.disputedCount += 1; }
                else if (isEstimated(st)) { cur.estimatedExact = sumDecimals([cur.estimatedExact, d]); cur.estimatedCount += 1; }
                byCurrency.set(line.currency, cur);
            }
            const totals = [];
            for (const cur of byCurrency.values()) {
                const cents = decimalToCents(cur.exact);
                const disputedCents = decimalToCents(cur.disputedExact);
                const estimatedCents = decimalToCents(cur.estimatedExact);
                for (const v of [cents, disputedCents, estimatedCents]) {
                    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
                        return res.status(500).json({ error: 'Total exceeds safe integer range' });
                    }
                }
                totals.push({
                    currency: cur.currency,
                    totalCents: Number(cents),
                    totalExact: formatDecimal(cur.exact),
                    lineCount: cur.lineCount,
                    disputedCount: cur.disputedCount,
                    estimatedCount: cur.estimatedCount,
                    disputedExact: formatDecimal(cur.disputedExact),
                    disputedCents: Number(disputedCents),
                    estimatedExact: formatDecimal(cur.estimatedExact),
                    estimatedCents: Number(estimatedCents),
                    precision: 'exact-decimal sum, round-half-up at the reporting boundary',
                    trustedStates: 'reported, reconciled, approved (disputed/estimated reported separately, never in the total)'
                });
            }
            // Direct-sales totals per artist (2026-09-28): the label's own
            // Stripe sales attributed to the scoped artist(s), surfaced inside
            // the existing P&L view. ADDITIVE — the `totals`/`lines` shape
            // above is unchanged. Only attributed sales count here.
            const directSales = [];
            if (DirectSale) {
                const saleWhere = {};
                if (where.artistId) saleWhere.artistId = where.artistId;
                if (where.currency) saleWhere.currency = where.currency;
                const sales = await DirectSale.findAll({
                    where: { provider: 'stripe', ...saleWhere, artistId: saleWhere.artistId || { [Op.ne]: null } },
                    order: [['id', 'ASC']]
                });
                const byCur = new Map();
                for (const s of sales) {
                    if (!s.artistId) continue;
                    // Trusted states only (2026-09-28 fix 2): disputed and
                    // estimated sales are reported separately, never in the
                    // headline figure.
                    if (!isCounted(s.reviewState)) continue;
                    const cur = byCur.get(s.currency) || { currency: s.currency, netCents: 0, saleCount: 0 };
                    cur.netCents += s.netCents;
                    cur.saleCount += 1;
                    if (!Number.isSafeInteger(cur.netCents)) {
                        return res.status(500).json({ error: 'Total exceeds safe integer range' });
                    }
                    byCur.set(s.currency, cur);
                }
                directSales.push(...byCur.values());
            }
            res.json({
                totals,
                lines: lines.length,
                directSales
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Review-state transitions (research correction 2026-09-28).
    // reported -> reconciled -> approved, plus disputed / estimated.
    // Every transition records reviewer identity + evidence. 'superseded'
    // is never set here — only the import supersede path sets it.
    //
    // Read endpoints: reviewers need to see lines/settlements (with their
    // review state) before they can transition them.
    const listRecords = (Model, filters) => async (req, res) => {
        try {
            const where = {};
            for (const f of filters) {
                if (req.query[f]) where[f] = String(req.query[f]);
            }
            // Per-artist enforcement (2026-09-28 fix): non-admin callers
            // must hold artist grants; an explicit artistId must be within
            // their grants; without one the list is scoped to their grants.
            // Fail-closed: no grants -> 403.
            if (req.user.role !== 'admin') {
                const { normalizeArtistAccess, hasArtistAccess } = require('../auth');
                const access = normalizeArtistAccess(req.user.artistAccess);
                if (access.length === 0) {
                    return res.status(403).json({ error: 'Not authorized' });
                }
                if (where.artistId) {
                    if (!hasArtistAccess(req.user, where.artistId)) {
                        return res.status(403).json({ error: 'Not authorized for this artist' });
                    }
                } else if (!access.includes('all')) {
                    where.artistId = access.length === 1 ? access[0] : { [Op.in]: access };
                }
            }
            if (req.query.reviewState) {
                if (!isReviewState(req.query.reviewState)) {
                    return res.status(400).json({ error: 'Invalid reviewState filter' });
                }
                where.reviewState = req.query.reviewState;
            }
            const rows = await Model.findAll({ where, order: [['id', 'ASC']], limit: 500 });
            res.json(rows.map((r) => r.toJSON()));
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    };

    app.get('/v3/royalties/lines', authenticateToken, listRecords(RoyaltyLine, ['artistId', 'period', 'currency', 'source']));
    app.get('/v3/royalties/settlements', authenticateToken, listRecords(MerchSettlement, ['artistId', 'currency', 'source']));
    const reviewTransition = (Model, param) => async (req, res) => {
        const to = String(req.body?.reviewState || '').trim();
        const evidence = req.body?.evidence;
        if (!isReviewState(to) || to === 'superseded') {
            return res.status(400).json({ error: 'reviewState must be one of: reported, reconciled, approved, disputed, estimated' });
        }
        try {
            const record = await Model.findByPk(req.params.id);
            if (!record) return res.status(404).json({ error: 'Not found' });
            const from = record.reviewState || 'reported';
            if (!canTransition(from, to)) {
                return res.status(409).json({ error: `invalid review transition: ${from} -> ${to}` });
            }
            record.reviewState = to;
            record.reviewedBy = req.user.email;
            record.reviewEvidence = evidence ? String(evidence) : null;
            record.reviewedAt = new Date();
            await record.save();
            res.json({
                id: record.id, reviewState: record.reviewState,
                reviewedBy: record.reviewedBy, reviewedAt: record.reviewedAt
            });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    };

    app.patch('/v3/royalties/lines/:id/review', authenticateToken, requireAdmin, reviewTransition(RoyaltyLine));
    app.patch('/v3/royalties/settlements/:id/review', authenticateToken, requireAdmin, reviewTransition(MerchSettlement));

}

module.exports = { register, parseCsv, validateRow };
