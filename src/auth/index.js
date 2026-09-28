/**
 * src/auth/index.js
 *
 * Authentication and authorization primitives extracted verbatim from
 * production-api.js L411-470 and L2536-2554.
 *
 * ALL BEHAVIOR PRESERVED EXACTLY, including two audit findings that are
 * deliberately NOT fixed in Phase 1 (each is pinned by a regression test so a
 * Phase 2 fix must consciously update the test):
 *
 *   HIGH-4  hasArtistAccess() checks Array.isArray(user.artistAccess), but the
 *           User model stores artistAccess as a STRING (models L151) and the
 *           seeded artist gets the scalar 'art_novakin' (models L189). A string is
 *           never an array, so the function falls through to `return false` and
 *           the seeded artist cannot read its own record. FAIL-CLOSED — safe to
 *           leave, dangerous to "fix" carelessly.
 *
 *   —       generateToken() is dead code in the original (declared L414, never
 *           called; both login branches inline their own jwt.sign with a
 *           DIFFERENT payload that omits `id`). It is preserved here verbatim,
 *           still unused by the routes, so that `req.user.id === undefined`
 *           behavior is unchanged. Wiring it up would silently repair
 *           /v3/auth/me, GDPR delete and change-password — a Phase 2 decision.
 */

'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * api L414-425 — PRESERVED BUT INTENTIONALLY UNUSED.
 * Included for completeness; the live login handlers sign their own payloads.
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            artistAccess: user.artistAccess
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
    );
}

/**
 * api L428-444 — JWT verification middleware.
 * Response bodies and status codes preserved byte-for-byte.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, config.jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

/**
 * HIGH-4 FIX (Phase 3).
 *
 * The User model stores artistAccess as a STRING (models L151) and the seeded
 * artist receives the scalar 'art_novakin' (models seed). The previous version
 * only handled 'all' or an ARRAY, so a scalar string fell through to
 * `return false` and artists were denied their own data.
 *
 * Normalization: a scalar string is now treated as a single allowed artist id,
 * equivalent to a one-element array. This is fail-CLOSED: an artist whose
 * artistAccess is 'art_novakin' can access 'art_novakin' and nothing else.
 */
function normalizeArtistAccess(artistAccess) {
    if (artistAccess === null || artistAccess === undefined) return [];
    if (Array.isArray(artistAccess)) return artistAccess;
    if (typeof artistAccess === 'string') {
        // A stored stringified JSON array (e.g. "[\"art_a\",\"art_b\"]") is
        // parsed; a bare scalar ("art_novakin") is wrapped. Empty/whitespace
        // yields nothing.
        const trimmed = artistAccess.trim();
        if (trimmed === '' || trimmed === 'none') return [];
        if (trimmed === 'all') return ['all'];
        if (trimmed.startsWith('[')) {
            try { return JSON.parse(trimmed); } catch (_) { return [trimmed]; }
        }
        return [trimmed];
    }
    return [];
}

function hasArtistAccess(user, artistId) {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const access = normalizeArtistAccess(user.artistAccess);
    return access.includes('all') || access.includes(artistId);
}

/**
 * api L457-470 — updated for HIGH-4. Filters the artists array to those the
 * user may access, using the same normalization as hasArtistAccess.
 */
function filterDataByAccess(data, user) {
    if (!user) return data;
    if (user.role === 'admin') return data;

    const access = normalizeArtistAccess(user.artistAccess);
    if (access.includes('all')) return data;

    if (Array.isArray(data.artists)) {
        return {
            ...data,
            artists: data.artists.filter((a) => hasArtistAccess(user, a.id))
        };
    }

    return data;
}

/**
 * api L2536-2554 — export permission middleware.
 * Error strings preserved exactly ('Only admins can export label-wide data',
 * 'Access denied for this artist').
 */
const checkExportAccess = (req, res, next) => {
    const user = req.user;
    const { artistId } = req.query;

    if (user.role === 'admin') return next();

    if (!artistId) {
        return res.status(403).json({ error: 'Only admins can export label-wide data' });
    }

    if (hasArtistAccess(user, artistId)) {
        next();
    } else {
        res.status(403).json({ error: 'Access denied for this artist' });
    }
};

module.exports = {
    generateToken,
    authenticateToken,
    hasArtistAccess,
    filterDataByAccess,
    checkExportAccess,
    normalizeArtistAccess
};
