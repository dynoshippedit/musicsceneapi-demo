/**
 * src/services/catalogIntegrityService.js
 *
 * Profile-integrity check (strategy doc 2026-09-28): compare each artist's
 * Spotify albums against the UPCs the label delivered (Release catalog),
 * and alert on anything unknown.
 *
 * MATCHING (verified 2026-09-28 against Spotify's official API reference):
 * the simplified album objects from /artists/{id}/albums do NOT carry
 * external_ids, but the FULL album object (GET /v1/albums/{id} and the batch
 * GET /v1/albums?ids=) exposes external_ids.upc. The check hydrates UPCs via
 * the batch endpoint (20 per call) and compares barcodes, not titles.
 * A Spotify album with no exposed UPC is reported as `unverifiable`
 * (cannot check), never as unknown and never as matched.
 *
 * HONESTY RULES:
 * - A Spotify fetch failure is reported as `status: 'error'`, never "clean".
 * - An artist with no Spotify mapping or no delivered releases is `skipped`
 *   with an explicit reason, never silently omitted.
 * - Every figure carries source + observedAt.
 */

'use strict';

const profile = require('../profile');
const artistRepo = require('../repositories/artistRepository');
const spotify = require('../../integrations/spotify');
const { Release } = require('../models');

/**
 * Normalize a barcode for comparison: strip non-digits and leading zeros.
 * A 12-digit UPC and its 13-digit EAN form (same digits, zero-padded) refer
 * to the same product and must compare equal.
 */
function normalizeUpc(upc) {
    const digits = String(upc || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
    return digits;
}

function createCatalogIntegrityService(deps = {}) {
    const {
        repo = artistRepo,
        spotifyIntegration = spotify,
        releaseModel = Release,
        mappings = profile.socialMappings || {}
    } = deps;

    /**
     * Run the integrity check for one artist.
     * @param {string} artistId
     * @returns {Object} check result (never throws for data problems; throws only on programmer error)
     */
    async function checkArtist(artistId) {
        const artist = await repo.findById(artistId);
        if (!artist) {
            return { artistId, status: 'not_found' };
        }

        const mapping = mappings[artistId];
        const spotifyId = mapping && mapping.spotifyId;
        if (!spotifyId) {
            return {
                artistId,
                artistName: artist.name,
                status: 'skipped',
                reason: 'no_spotify_mapping',
                note: 'Artist has no Spotify ID in the label social mappings; nothing to compare.'
            };
        }

        const releases = await releaseModel.findAll({ where: { artistId } });
        if (!releases.length) {
            return {
                artistId,
                artistName: artist.name,
                status: 'skipped',
                reason: 'no_delivered_releases',
                note: 'Artist has no delivered releases (UPCs) in the catalog; nothing to compare.'
            };
        }

        // Fail closed: a Spotify outage is an error, not a clean bill of health.
        let albums, albumProvenance, upcs, upcProvenance;
        try {
            const listResult = await spotifyIntegration.getArtistAlbums(spotifyId);
            albums = listResult.albums;
            albumProvenance = listResult.provenance;
            const upcResult = await spotifyIntegration.getAlbumUpcs(albums.map((a) => a.spotifyAlbumId));
            upcs = upcResult.upcs;
            upcProvenance = upcResult.provenance;
        } catch (error) {
            return {
                artistId,
                artistName: artist.name,
                status: 'error',
                error: `Spotify album fetch failed: ${error.message}`,
                note: 'Could not read the artist Spotify catalog; integrity is UNKNOWN, not clean.'
            };
        }

        const observedAt = upcProvenance.observedAt;

        const deliveredByUpc = new Map();
        for (const r of releases) {
            const key = normalizeUpc(r.upc);
            if (key) deliveredByUpc.set(key, r);
        }

        const matched = [];
        const unknown = [];
        const unverifiable = [];
        const seenDelivered = new Set();

        for (const album of albums) {
            const upc = upcs[album.spotifyAlbumId] || null;
            const key = normalizeUpc(upc);
            const spotifyAlbum = {
                name: album.name,
                spotifyAlbumId: album.spotifyAlbumId,
                upc,
                releaseDate: album.releaseDate,
                spotifyUrl: album.spotifyUrl
            };
            if (!key) {
                unverifiable.push({
                    spotifyAlbum,
                    note: 'Spotify exposed no UPC for this album; cannot verify against delivered releases. Not counted as unknown.'
                });
                continue;
            }
            const release = deliveredByUpc.get(key);
            if (release) {
                seenDelivered.add(release.id);
                matched.push({
                    spotifyAlbum,
                    deliveredRelease: { title: release.title, upc: release.upc, releaseDate: release.releaseDate }
                });
            } else {
                unknown.push({
                    spotifyAlbum,
                    alert: 'UNKNOWN: on Spotify with a UPC that matches no delivered release in the catalog. Verify whether this release was delivered under a different UPC or is missing from the catalog.'
                });
            }
        }

        const undelivered = releases
            .filter((r) => !seenDelivered.has(r.id))
            .map((r) => ({
                title: r.title,
                upc: r.upc,
                releaseDate: r.releaseDate,
                note: 'Delivered (UPC on file) but that UPC was not found among the artist Spotify albums.'
            }));

        return {
            artistId,
            artistName: artist.name,
            status: 'checked',
            checkedAt: new Date().toISOString(),
            source: 'spotify_api',
            observedAt,
            spotifyAlbumCount: albums.length,
            deliveredReleaseCount: releases.length,
            matchedCount: matched.length,
            unknownCount: unknown.length,
            unverifiableCount: unverifiable.length,
            undeliveredCount: undelivered.length,
            matched,
            unknown,
            unverifiable,
            undelivered,
            matchMethod: 'upc',
            matchMethodProvenance: {
                albumList: albumProvenance,
                upcHydration: upcProvenance
            },
            note: 'UPCs compared barcode-to-barcode (normalized: digits only, leading zeros stripped). Spotify albums with no exposed UPC are unverifiable, not unknown.'
        };
    }

    /**
     * Run the integrity check across every artist in the roster.
     * @returns {Object} { checkedAt, results: [...] }
     */
    async function checkAll() {
        const artists = await repo.getAllArtists();
        const results = [];
        for (const artist of artists) {
            const id = artist.id || artist.artistId;
            if (!id) continue;
            results.push(await checkArtist(id));
        }
        return { checkedAt: new Date().toISOString(), results };
    }

    return { checkArtist, checkAll, normalizeUpc };
}

module.exports = createCatalogIntegrityService();
module.exports.createCatalogIntegrityService = createCatalogIntegrityService;
module.exports.normalizeUpc = normalizeUpc;
