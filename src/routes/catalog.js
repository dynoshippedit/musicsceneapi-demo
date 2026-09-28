/**
 * src/routes/catalog.js
 *
 * Label catalog: recordings (ISRC), releases (UPC), works (compositions).
 *
 *   GET    /v3/catalog/recordings            list
 *   POST   /v3/catalog/recordings            create
 *   GET    /v3/catalog/recordings/:id        read
 *   PUT    /v3/catalog/recordings/:id        update
 *   DELETE /v3/catalog/recordings/:id        delete
 *   ... same shape for /releases and /works
 *   GET    /v3/catalog/integrity            profile-integrity check (admin)
 *
 * Access: admin sees everything; artist role is scoped to their own artistId
 * via hasArtistAccess (same pattern as the rest of the API).
 *
 * Identifier rules:
 *   ISRC: 12 chars — 2 alpha country + 3 alnum registrant + 7 digits
 *         (2-digit year + 5-digit designation). Stored uppercase. Unique.
 *   UPC:  12 digits. Unique.
 * Demo ISRCs use the unassigned "ZZ" country code so they cannot collide
 * with real-world assignments.
 */

'use strict';

const { Op } = require('sequelize');
const integrityService = require('../services/catalogIntegrityService');
const { normalizeArtistAccess } = require('../auth');

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;
const UPC_RE = /^[0-9]{12}$/;
const RELEASE_TYPES = ['single', 'ep', 'album'];

function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    next();
}

function validateRecording(data) {
    if (!data.title || !String(data.title).trim()) return 'title is required';
    const isrc = String(data.isrc || '').trim().toUpperCase();
    if (!ISRC_RE.test(isrc)) return 'isrc must be 12 chars: 2 letters + 3 alphanumerics + 7 digits (e.g. ZZABC2600001)';
    if (data.durationMs !== undefined && data.durationMs !== null &&
        (!Number.isInteger(data.durationMs) || data.durationMs < 0)) {
        return 'durationMs must be a non-negative integer';
    }
    return null;
}

function validateRelease(data) {
    if (!data.title || !String(data.title).trim()) return 'title is required';
    const upc = String(data.upc || '').trim();
    if (!UPC_RE.test(upc)) return 'upc must be exactly 12 digits';
    if (data.type !== undefined && data.type !== null && !RELEASE_TYPES.includes(data.type)) {
        return `type must be one of: ${RELEASE_TYPES.join(', ')}`;
    }
    return null;
}

function validateWork(data) {
    if (!data.title || !String(data.title).trim()) return 'title is required';
    if (data.recordingIds !== undefined && data.recordingIds !== null &&
        (!Array.isArray(data.recordingIds) || !data.recordingIds.every(Number.isInteger))) {
        return 'recordingIds must be an array of integer recording ids';
    }
    if (data.credits !== undefined && data.credits !== null && !Array.isArray(data.credits)) {
        return 'credits must be an array of { name, role } entries';
    }
    return null;
}

function serializeRecording(r) {
    return {
        id: r.id, artistId: r.artistId, title: r.title, isrc: r.isrc,
        durationMs: r.durationMs, releaseDate: r.releaseDate
    };
}

function serializeRelease(r) {
    return {
        id: r.id, artistId: r.artistId, title: r.title, upc: r.upc,
        releaseDate: r.releaseDate, type: r.type
    };
}

function serializeWork(w, recordingIds) {
    return {
        id: w.id, artistId: w.artistId, title: w.title,
        credits: w.credits || [], recordingIds: recordingIds || []
    };
}

/** Replace a work's recording links wholesale (validates existence + ownership). */
async function linkRecordings(work, recordingIds, ctx) {
    const { Recording, WorkRecording } = ctx;
    const ids = [...new Set(recordingIds)];
    for (const id of ids) {
        const rec = await Recording.findByPk(id);
        if (!rec) {
            const err = new Error(`Recording ${id} does not exist`);
            err.status = 400;
            throw err;
        }
        if (rec.artistId !== work.artistId) {
            const err = new Error(`Recording ${id} belongs to a different artist`);
            err.status = 400;
            throw err;
        }
    }
    await WorkRecording.destroy({ where: { workId: work.id } });
    for (const recordingId of ids) {
        await WorkRecording.create({ workId: work.id, recordingId });
    }
}

async function serializeWorkWithLinks(work, ctx) {
    const links = await ctx.WorkRecording.findAll({ where: { workId: work.id } });
    return serializeWork(work, links.map((l) => l.recordingId));
}

function registerCrud(app, ctx, opts) {
    const { authenticateToken, hasArtistAccess, logger } = ctx;
    const { path, Model, validate, uniqueField } = opts;
    const base = `/v3/catalog/${path}`;

    /** List scope: admin may filter by ?artistId=; artist role sees own grants only. */
    const listWhere = (req) => {
        if (req.user.role === 'admin') {
            return req.query.artistId ? { artistId: String(req.query.artistId) } : {};
        }
        // Same normalization as hasArtistAccess on detail routes: a scalar
        // grant, an array of grants, and 'all' all behave identically here.
        // Fail-closed: no grants -> null -> 403, exactly like before.
        const access = normalizeArtistAccess(req.user.artistAccess);
        if (access.includes('all')) return {};
        if (access.length === 1) return { artistId: access[0] };
        if (access.length > 1) return { artistId: { [Op.in]: access } };
        return null;
    };

    const checkScope = (req, res, artistId) => {
        if (!artistId) {
            res.status(400).json({ error: 'artistId is required' });
            return false;
        }
        if (!hasArtistAccess(req.user, artistId)) {
            res.status(403).json({ error: 'Not authorized for this artist' });
            return false;
        }
        return true;
    };

    const uniqueError = (res, e) => {
        if (e && e.name === 'SequelizeUniqueConstraintError') {
            res.status(409).json({ error: `${uniqueField} already exists` });
            return true;
        }
        return false;
    };

    const linkError = (res, e) => {
        if (e && e.status === 400) {
            res.status(400).json({ error: e.message });
            return true;
        }
        return false;
    };

    // List
    app.get(base, authenticateToken, requireAuth, async (req, res) => {
        const where = listWhere(req);
        if (!where) return res.status(403).json({ error: 'Not authorized' });
        try {
            const rows = await Model.findAll({ where, order: [['id', 'ASC']] });
            if (path === 'works') {
                res.json({ works: await Promise.all(rows.map((w) => serializeWorkWithLinks(w, ctx))) });
            } else {
                res.json({ [path]: rows.map(opts.serialize) });
            }
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Create
    app.post(base, authenticateToken, requireAuth, async (req, res) => {
        const body = req.body || {};
        if (!checkScope(req, res, body.artistId)) return;
        const err = validate(body);
        if (err) return res.status(400).json({ error: err });
        try {
            const row = await Model.create(opts.buildCreate(body));
            if (path === 'works' && body.recordingIds) {
                await linkRecordings(row, body.recordingIds, ctx);
            }
            const out = path === 'works'
                ? await serializeWorkWithLinks(row, ctx)
                : opts.serialize(row);
            res.status(201).json(out);
        } catch (e) {
            if (uniqueError(res, e) || linkError(res, e)) return;
            if (logger) logger.error(e);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Read
    app.get(`${base}/:id`, authenticateToken, requireAuth, async (req, res) => {
        try {
            const row = await Model.findByPk(req.params.id);
            if (!row) return res.status(404).json({ error: 'Not found' });
            if (!hasArtistAccess(req.user, row.artistId)) {
                return res.status(403).json({ error: 'Not authorized for this artist' });
            }
            const out = path === 'works'
                ? await serializeWorkWithLinks(row, ctx)
                : opts.serialize(row);
            res.json(out);
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Update
    app.put(`${base}/:id`, authenticateToken, requireAuth, async (req, res) => {
        const body = req.body || {};
        try {
            const row = await Model.findByPk(req.params.id);
            if (!row) return res.status(404).json({ error: 'Not found' });
            if (!hasArtistAccess(req.user, row.artistId)) {
                return res.status(403).json({ error: 'Not authorized for this artist' });
            }
            const err = validate({ ...row.toJSON(), ...body });
            if (err) return res.status(400).json({ error: err });
            await row.update(opts.buildUpdate(body));
            if (path === 'works' && body.recordingIds !== undefined) {
                await linkRecordings(row, body.recordingIds, ctx);
            }
            const fresh = await Model.findByPk(row.id);
            const out = path === 'works'
                ? await serializeWorkWithLinks(fresh, ctx)
                : opts.serialize(fresh);
            res.json(out);
        } catch (e) {
            if (uniqueError(res, e) || linkError(res, e)) return;
            if (logger) logger.error(e);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Delete
    app.delete(`${base}/:id`, authenticateToken, requireAuth, async (req, res) => {
        try {
            const row = await Model.findByPk(req.params.id);
            if (!row) return res.status(404).json({ error: 'Not found' });
            if (!hasArtistAccess(req.user, row.artistId)) {
                return res.status(403).json({ error: 'Not authorized for this artist' });
            }
            await row.destroy();
            res.json({ deleted: true, id: row.id });
        } catch (err) {
            if (logger) logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });
}

function register(app, ctx) {
    const { authenticateToken } = ctx;

    /**
     * GET /v3/catalog/integrity -- profile-integrity check (strategy doc
     * 2026-09-28, admin-only). Compares each artist's Spotify albums against
     * the delivered releases (UPCs) in the catalog and alerts on anything
     * unknown. Optional ?artistId= scopes to one artist.
     */
    app.get('/v3/catalog/integrity', authenticateToken, requireAuth, async (req, res) => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        try {
            if (req.query.artistId) {
                const result = await integrityService.checkArtist(req.query.artistId);
                if (result.status === 'not_found') {
                    return res.status(404).json({ error: 'Artist not found' });
                }
                return res.json(result);
            }
            const report = await integrityService.checkAll();
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: 'Integrity check failed', detail: error.message });
        }
    });

    registerCrud(app, ctx, {
        path: 'recordings',
        Model: ctx.Recording,
        validate: validateRecording,
        serialize: serializeRecording,
        uniqueField: 'isrc',
        buildCreate: (b) => ({
            artistId: b.artistId,
            title: String(b.title).trim(),
            isrc: String(b.isrc).trim().toUpperCase(),
            durationMs: b.durationMs ?? null,
            releaseDate: b.releaseDate || null
        }),
        buildUpdate: (b) => {
            const p = {};
            if (b.title !== undefined) p.title = String(b.title).trim();
            if (b.isrc !== undefined) p.isrc = String(b.isrc).trim().toUpperCase();
            if (b.durationMs !== undefined) p.durationMs = b.durationMs;
            if (b.releaseDate !== undefined) p.releaseDate = b.releaseDate;
            return p;
        }
    });

    registerCrud(app, ctx, {
        path: 'releases',
        Model: ctx.Release,
        validate: validateRelease,
        serialize: serializeRelease,
        uniqueField: 'upc',
        buildCreate: (b) => ({
            artistId: b.artistId,
            title: String(b.title).trim(),
            upc: String(b.upc).trim(),
            releaseDate: b.releaseDate || null,
            type: b.type || 'single'
        }),
        buildUpdate: (b) => {
            const p = {};
            if (b.title !== undefined) p.title = String(b.title).trim();
            if (b.upc !== undefined) p.upc = String(b.upc).trim();
            if (b.releaseDate !== undefined) p.releaseDate = b.releaseDate;
            if (b.type !== undefined) p.type = b.type;
            return p;
        }
    });

    registerCrud(app, ctx, {
        path: 'works',
        Model: ctx.Work,
        validate: validateWork,
        serialize: (w) => serializeWork(w, []),
        uniqueField: 'title',
        buildCreate: (b) => ({
            artistId: b.artistId,
            title: String(b.title).trim(),
            credits: b.credits || null
        }),
        buildUpdate: (b) => {
            const p = {};
            if (b.title !== undefined) p.title = String(b.title).trim();
            if (b.credits !== undefined) p.credits = b.credits;
            return p;
        }
    });
}

module.exports = { register, ISRC_RE, UPC_RE };
