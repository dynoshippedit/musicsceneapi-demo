/**
 * src/repositories/artistRepository.js
 *
 * All artist data access. This is the layer the audit called out as missing:
 * handlers previously reached into `labelData` (39 sites), the Sequelize
 * `Artist` model, and `integrations/` interchangeably — sometimes inside a
 * single handler.
 *
 * ============================================================================
 * PRESERVED DEFECTS — do not "fix" without an explicit decision
 * ============================================================================
 *
 * 1. HYBRID UNION (audit §3): findAll() reads the DB and then appends every
 *    mock artist whose id is absent from the DB. That is what the original
 *    GET /v3/artists did (Phase 1 L458-470). It means an artist created via
 *    POST /v3/artists survives in the DB but its mock twin reappears after a
 *    restart, so list and detail views can diverge. Preserved verbatim.
 *
 * 2. MOCK IS MUTABLE SHARED STATE: `labelData === require('mock/artistData')`,
 *    the same object graph the whole process shares. archive/restore/image
 *    mutate it in place and POST /v3/artists pushes onto it. Preserved.
 *
 * 3. IN-PLACE SORT (audit R3): the ranking helpers at the bottom of this file
 *    sort the SHARED mock array in place, exactly as the original handlers did.
 *    See the long comment above those helpers for why copy-first is NOT
 *    equivalent here and for the measurement proving the mutation is not
 *    observable through any endpoint.
 *
 * 4. NO FK between Stats.artistId and Artist.id. Preserved.
 */

'use strict';

const mockLabelData = require('../../mock/artistData');
const { fetchArtistData } = require('../../integrations');
const { Artist } = require('../models');
const cache = require('../services/cacheService');
const config = require('../config');

/**
 * The shared mock object graph. Exposed because several code paths still
 * legitimately need the whole label object (labelTotals, etc.).
 * Callers MUST NOT sort or splice this array in place.
 */
const labelData = mockLabelData;

/** Read-only list of mock artists. */
function getMockArtists() {
    return mockLabelData.artists;
}

/** Label-level aggregate block from the mock data. */
function getLabelTotals() {
    return mockLabelData.labelTotals;
}

/**
 * Find one artist in the mock roster. Synchronous — this is the lookup the
 * majority of handlers performed via `labelData.artists.find(...)`.
 * @returns {object|undefined}
 */
function findMockById(artistId) {
    return mockLabelData.artists.find((a) => a.id === artistId);
}

/**
 * Hybrid artist fetch with cache + optional live integration merge.
 * Extracted verbatim from getArtistData() (Phase 1 L75-110).
 *
 * Order of operations is load-bearing:
 *   1. mock lookup first — a miss returns null WITHOUT touching cache or network
 *   2. cache probe (unless forceRefresh)
 *   3. if USE_REAL_DATA is false, return the mock object directly (NOT cached)
 *   4. otherwise fetch + merge, cache for 24h, and fall back to mock on error
 *
 * @param {string} artistId
 * @param {boolean} [forceRefresh]
 * @returns {Promise<object|null>}
 */
async function getArtistData(artistId, forceRefresh = false) {
    const mockArtist = findMockById(artistId);

    if (!mockArtist) {
        return null; // Artist not found
    }

    const cacheKey = cache.keys.artistData(artistId);
    if (!forceRefresh) {
        const cachedData = cache.get(cacheKey);
        if (cachedData) return cachedData;
    }

    if (!config.useRealData) {
        return mockArtist; // Use mock data
    }

    try {
        const artistData = await fetchArtistData(artistId, mockArtist);
        cache.set(cacheKey, artistData, cache.TTL.ARTIST_DATA);
        return artistData;
    } catch (error) {
        console.warn(`Failed to fetch real data for ${artistId}, using mock:`, error.message);
        return mockArtist;
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
        return mockLabelData.artists;
    }

    const artistPromises = mockLabelData.artists.map(async (mockArtist) => {
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
 * DB + mock union used by GET /v3/artists.
 * Extracted verbatim from Phase 1 L458-470 (originally L733-740).
 *
 * @returns {Promise<object[]>} DB artists (flattened) followed by mock-only ones
 */
async function findAllHybrid() {
    const dbArtists = await Artist.findAll();
    let fullList = dbArtists.map((a) => ({ ...a.data, id: a.id, name: a.name }));

    // HYBRID MERGE: add memory-only artists (see PRESERVED DEFECT 1)
    const dbIds = new Set(fullList.map((a) => a.id));
    const memoryArtists = mockLabelData.artists.filter((a) => !dbIds.has(a.id));
    return [...fullList, ...memoryArtists];
}

/** Persist a new artist row. Mirrors the original POST /v3/artists DB write. */
async function createInDb({ id, name, data }) {
    return Artist.create({ id, name, data });
}

/**
 * Append to the shared mock roster, matching the original handler which did
 * `labelData.artists.push(newArtist)`.
 */
function pushMockArtist(artist) {
    mockLabelData.artists.push(artist);
    return artist;
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
function topByRoi(artists = mockLabelData.artists) {
    return artists.sort((a, b) => b.roi - a.roi)[0];
}

/** Highest touring revenue. Mutates the shared array, as the original did. */
function topByTouringRevenue(artists = mockLabelData.artists) {
    return artists.sort((a, b) => (b.revenue.touring) - (a.revenue.touring))[0];
}

/** Highest growth rate. Mutates the shared array, as the original did. */
function topByGrowthRate(artists = mockLabelData.artists) {
    return artists.sort((a, b) => b.growthRate - a.growthRate)[0];
}

/** Highest monthly listeners. Mutates the shared array, as the original did. */
function topByMonthlyListeners(artists = mockLabelData.artists) {
    return artists.sort((a, b) => b.monthlyListeners - a.monthlyListeners)[0];
}

module.exports = {
    labelData,
    getMockArtists,
    getLabelTotals,
    findMockById,
    getArtistData,
    getAllArtists,
    findAllHybrid,
    createInDb,
    pushMockArtist,
    topByRoi,
    topByTouringRevenue,
    topByGrowthRate,
    topByMonthlyListeners
};
