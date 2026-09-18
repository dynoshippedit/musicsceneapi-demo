/**
 * src/repositories/artistRepository.js
 *
 * All artist data access. This is the layer the audit called out as missing:
 * handlers previously reached into `labelData` (39 sites), the Sequelize
 * `Artist` model, and `integrations/` interchangeably — sometimes inside a
 * single handler.
 *
 * PHASE 4CF — CANONICAL SOURCE OF TRUTH (Objective 3):
 * The database is now the single authoritative store for artist product
 * state. `labelData` (the active profile's roster dataset — see
 * src/profile/labels/mau5trap.js) is demoted to reference/seed data plus an
 * in-process mirror that is kept consistent with the DB while the process
 * lives. Every read resolves DB-first with a memory fallback, so:
 *
 *   - API-created artists survive restarts on EVERY route (detail/archive/
 *     restore/image/entity-audit included) — previously they 404'd after a
 *     restart because those routes read memory only;
 *   - archive/restore/image state can no longer disagree between list and
 *     detail views after a restart (the split-brain reproduced in the
 *     commercial recheck).
 *
 * ============================================================================
 * PRESERVED DEFECTS — do not "fix" without an explicit decision
 * ============================================================================
 *
 * 1. HYBRID UNION: findAllHybrid() reads the DB and appends every roster
 *    artist whose id is absent from the DB (i.e. mock artists not yet seeded
 *    into a fresh table). Behavior preserved from the original GET /v3/artists.
 *
 * 2. MOCK IS MUTABLE SHARED STATE: `labelData` is the same object graph the
 *    whole process shares. archive/restore/image mutate the in-memory twin in
 *    place (mirroring the DB write); POST /v3/artists pushes onto it.
 *
 * 3. IN-PLACE SORT (audit R3): the ranking helpers sort the SHARED array in
 *    place, exactly as the original handlers did. Pinned by
 *    tests/regression/services.test.js and the ai_analyze_tour snapshot —
 *    copy-first is NOT equivalent (see long comment below).
 *
 * 4. NO FK between Stats.artistId and Artist.id. Preserved.
 *
 * RESIDUAL (documented, later phase): aggregate/cron paths that still read
 * memory only — the AI keyword path (pinned roster-order semantics), the
 * monthly report cron, campaign CRM stats and the label-wide export overview.
 */

'use strict';

const profile = require('../profile');
const { fetchArtistData } = require('../../integrations');
const { Artist } = require('../models');
const cache = require('../services/cacheService');
const config = require('../config');

/**
 * The active label's roster dataset (profile-owned reference data). Exposed
 * because several code paths still legitimately need the whole label object
 * (labelTotals, AI keyword path, report aggregates).
 * Callers MUST NOT sort or splice this array in place.
 */
const labelData = profile.datasets.roster;

/** Read-only list of mock artists. */
function getMockArtists() {
    return labelData.artists;
}

/** Label-level aggregate block from the mock data. */
function getLabelTotals() {
    return labelData.labelTotals;
}

/**
 * Find one artist in the in-memory roster. Synchronous — the lookup the
 * AI keyword path and tests use.
 * @returns {object|undefined}
 */
function findMockById(artistId) {
    return labelData.artists.find((a) => a.id === artistId);
}

/**
 * PHASE 4CF — canonical artist read. Database first, memory fallback.
 * Returns the same flattened shape the list route has always served:
 * `{ ...data, id, name }`.
 * @param {string} artistId
 * @returns {Promise<object|null>}
 */
async function findById(artistId) {
    try {
        const row = await Artist.findByPk(artistId);
        if (row) return { ...row.data, id: row.id, name: row.name };
    } catch (err) {
        console.error('Artist DB read failed, falling back to memory:', err.message);
    }
    return findMockById(artistId) || null;
}

/**
 * Hybrid artist fetch with cache + optional live integration merge.
 * Extracted verbatim from getArtistData() (Phase 1 L75-110), with ONE
 * PHASE 4CF change: the mock lookup is replaced by the canonical DB-first
 * read, so entity audits work for API-created artists too.
 *
 * Order of operations remains load-bearing:
 *   1. canonical lookup first — a miss returns null WITHOUT touching cache/network
 *   2. cache probe (unless forceRefresh)
 *   3. if USE_REAL_DATA is false, return the base object directly (NOT cached)
 *   4. otherwise fetch + merge, cache for 24h, and fall back to base on error
 *
 * @param {string} artistId
 * @param {boolean} [forceRefresh]
 * @returns {Promise<object|null>}
 */
async function getArtistData(artistId, forceRefresh = false) {
    const base = await findById(artistId);

    if (!base) {
        return null; // Artist not found
    }

    const cacheKey = cache.keys.artistData(artistId);
    if (!forceRefresh) {
        const cachedData = cache.get(cacheKey);
        if (cachedData) return cachedData;
    }

    if (!config.useRealData) {
        return base; // Use mock data
    }

    try {
        const artistData = await fetchArtistData(artistId, base);
        cache.set(cacheKey, artistData, cache.TTL.ARTIST_DATA);
        return artistData;
    } catch (error) {
        console.warn(`Failed to fetch real data for ${artistId}, using mock:`, error.message);
        return base;
    }
}

/**
 * All artists, optionally hydrated from live integrations.
 * Extracted verbatim from getAllArtists() (Phase 1 L112-129).
 *
 * NOTE: this function had ZERO call sites in the monolith — it was dead code.
 * Preserved (not deleted) per the "do not remove legacy yet" instruction.
 */
async function getAllArtists() {
    if (!config.useRealData) {
        return labelData.artists;
    }

    const artistPromises = labelData.artists.map(async (mockArtist) => {
        try {
            return await fetchArtistData(mockArtist.id, mockArtist);
        } catch (error) {
            console.warn(`Failed to fetch ${mockArtist.id}, using mock`);
            return mockArtist;
        }
    });

    return await Promise.all(artistPromises);
}

/**
 * DB + roster union used by GET /v3/artists.
 * PHASE 4CF: now the canonical LIST path (the route previously re-implemented
 * this union inline and never called the repository).
 *
 * @returns {Promise<object[]>} DB artists (flattened) followed by roster-only ones
 */
async function findAllHybrid() {
    let dbArtists;
    try {
        dbArtists = await Artist.findAll();
    } catch (e) {
        // A legacy/corrupt row failing the JSON getter must not take down
        // list, overview, demographics or report generation — mirror
        // findById's fail-soft fallback.
        console.error('Artist DB read failed, using memory list:', e.message);
        return [...labelData.artists];
    }
    let fullList = dbArtists.map((a) => ({ ...a.data, id: a.id, name: a.name }));

    // HYBRID MERGE: add roster artists absent from the DB (seed path).
    const dbIds = new Set(fullList.map((a) => a.id));
    const memoryArtists = labelData.artists.filter((a) => !dbIds.has(a.id));
    return [...fullList, ...memoryArtists];
}

/** Keep the in-memory mirror consistent with a DB write (idempotent). */
function syncMemoryMirror(artist) {
    const index = labelData.artists.findIndex((a) => a.id === artist.id);
    if (index === -1) {
        labelData.artists.push(artist);
    } else {
        labelData.artists[index] = artist;
    }
    return artist;
}

/**
 * PHASE 4CF — canonical artist create.
 * Builds the same object shape the route always built, persists it to the DB
 * (the single source of truth) and mirrors it into memory so every in-process
 * read path (AI context, aggregates, list union) sees it immediately.
 * Duplicate id/name → { conflict: true }; DB failure → { error } — the old
 * catch that silently pushed to memory and returned success:true with a
 * "Persisted to memory only" warning is GONE (lying-success class, F-4).
 */
async function createArtist({ name, tier }) {
    const id = `art_${name.toLowerCase().replace(/\s+/g, '')}`;
    const newArtist = {
        id, name, displayName: name, tier,
        status: 'active',
        monthlyListeners: 0,
        totalStreams: 0,
        growthRate: 0,
        revenue: { streaming: 0, touring: 0, merch: 0, sync: 0, branding: 0, youtube: 0 },
        touring: { upcomingShows: 0, avgTicketPrice: 0, avgAttendance: 0, merchPerHead: 0, shows: [] },
        social: { instagram: 0, twitter: 0, tiktok: 0, engagementRate: 0 },
        merch: { onlineSales: 0, tourSales: 0, monthlySales: [] },
        brandDeals: [],
        collaborations: [],
        meta: { dataSource: 'manual_entry', lastUpdated: new Date().toISOString() }
    };

    const existing = await Artist.findByPk(id);
    if (existing) return { conflict: true, id };

    // A roster artist that never reached the DB (degraded partial seed):
    // creating under its id would clobber the richer mock in the mirror and
    // permanently shadow it in the hybrid union (the DB row then wins).
    if (labelData.artists.some((a) => a.id === id)) return { conflict: true, id };

    try {
        await Artist.create({ id, name, data: newArtist });
    } catch (err) {
        // Concurrent same-name create lost the PK race → same outcome as a
        // detected duplicate (409), not a lying 500.
        if (err && err.name === 'SequelizeUniqueConstraintError') return { conflict: true, id };
        console.error('Artist DB create failed:', err.message);
        return { error: err };
    }

    syncMemoryMirror(newArtist);
    return { created: newArtist };
}

/**
 * PHASE 4CF — canonical archive/restore/image writes.
 * DB-first resolution (404 only when the artist exists in NEITHER store).
 * Persist first, then mirror. A rejected or zero-row write returns { error }
 * and leaves memory untouched — never a lying success.
 */
async function persistArtistMutation(artistId, mutate) {
    const artist = await findById(artistId);
    if (!artist) return null;

    const next = mutate({ ...artist });
    try {
        const dbArtist = await Artist.findByPk(artistId);
        if (!dbArtist) {
            console.error(`[artistRepo] ${artistId}: no DB row — refusing memory-only write`);
            return { error: new Error(`no DB row for ${artistId}`) };
        }
        dbArtist.data = next;
        if (next.status !== undefined) dbArtist.status = next.status;
        await dbArtist.save();
    } catch (e) {
        console.error('DB Update failed', e.message);
        return { error: e };
    }
    syncMemoryMirror(next);
    return { artist: next };
}

async function archiveArtist(artistId) {
    return persistArtistMutation(artistId, (artist) => {
        artist.tier = 'archived';
        artist.status = 'archived';
        return artist;
    });
}

async function restoreArtist(artistId) {
    return persistArtistMutation(artistId, (artist) => {
        artist.tier = 'developing'; // Default back to developing
        artist.status = 'active';
        return artist;
    });
}

async function setArtistImage(artistId, imageUrl) {
    return persistArtistMutation(artistId, (artist) => {
        artist.manualImage = imageUrl;
        return artist;
    });
}

// ---------------------------------------------------------------------------
// Ranking helpers
//
// ============================================================================
// DELIBERATE FIDELITY DECISION — these sort IN PLACE, like the original
// ============================================================================
// The originals ran `labelData.artists.sort(...)` directly on the shared mock
// array (audit R3), permanently reordering the roster process-wide.
//
// It is tempting to copy first (`[...artists].sort()`). I verified that would
// NOT be equivalent: the `/v3/ai/analyze` "tour" branch reads
// `artists[1].name` AFTER sorting, so its meaning depends on the mutation
// having happened. With copy-first, a second request following a different
// sort would name a different artist. Snapshot parity would break on call
// ordering rather than on the first call.
//
// I also verified the mutation is NOT observable through GET /v3/artists:
// after seeding, all 29 mock artists exist as DB rows, so the `memoryArtists`
// union in findAllHybrid() is empty and mock array order never reaches a
// response. Measured on unmodified git HEAD with
// tests/support/sort_side_effect_check.js -> "OBSERVABLE THROUGH API? NO".
//
// Therefore: keep the in-place sort for exact behavioral parity, and record it
// as technical debt for a later phase that also fixes the artists[1] read.
// ---------------------------------------------------------------------------

/** Highest ROI artist. Mutates the shared array, as the original did. */
function topByRoi(artists = labelData.artists) {
    return artists.sort((a, b) => b.roi - a.roi)[0];
}

/** Highest touring revenue. Mutates the shared array, as the original did. */
function topByTouringRevenue(artists = labelData.artists) {
    return artists.sort((a, b) => (b.revenue.touring) - (a.revenue.touring))[0];
}

/** Highest growth rate. Mutates the shared array, as the original did. */
function topByGrowthRate(artists = labelData.artists) {
    return artists.sort((a, b) => b.growthRate - a.growthRate)[0];
}

/** Highest monthly listeners. Mutates the shared array, as the original did. */
function topByMonthlyListeners(artists = labelData.artists) {
    return artists.sort((a, b) => b.monthlyListeners - a.monthlyListeners)[0];
}

module.exports = {
    labelData,
    getMockArtists,
    getLabelTotals,
    findMockById,
    findById,
    getArtistData,
    getAllArtists,
    findAllHybrid,
    createArtist,
    archiveArtist,
    restoreArtist,
    setArtistImage,
    syncMemoryMirror,
    topByRoi,
    topByTouringRevenue,
    topByGrowthRate,
    topByMonthlyListeners
};
