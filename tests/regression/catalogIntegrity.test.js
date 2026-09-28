'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createCatalogIntegrityService, normalizeUpc } = require('../../src/services/catalogIntegrityService');

function makeDeps(overrides = {}) {
    const releases = overrides.releases ?? [
        { id: 1, artistId: 'a1', title: 'Midnight Sun', upc: '888880000001', releaseDate: '2026-01-15' },
        { id: 2, artistId: 'a1', title: 'Neon Dreams', upc: '888880000002', releaseDate: '2026-03-20' }
    ];
    const albums = overrides.albums ?? [
        { spotifyAlbumId: 's1', name: 'Midnight Sun', releaseDate: '2026-01-15', spotifyUrl: 'https://open.spotify.com/album/s1' },
        { spotifyAlbumId: 's2', name: 'Unknown Bootleg', releaseDate: '2026-05-01', spotifyUrl: 'https://open.spotify.com/album/s2' },
        { spotifyAlbumId: 's3', name: 'Mystery White Label', releaseDate: '2026-06-01', spotifyUrl: 'https://open.spotify.com/album/s3' }
    ];
    // UPCs as the batch endpoint would return them: s1 matches delivered
    // release 1, s2 has a UPC matching nothing delivered, s3 exposes no UPC.
    const upcs = overrides.upcs ?? { s1: '888880000001', s2: '999990000001', s3: null };
    return {
        repo: {
            findById: async (id) => id === 'a1' ? { id: 'a1', name: 'Test Artist' } : null,
            getAllArtists: async () => [{ id: 'a1', name: 'Test Artist' }]
        },
        spotifyIntegration: {
            getArtistAlbums: overrides.spotifyThrows
                ? async () => { throw new Error('boom'); }
                : async () => ({ albums, provenance: { source: 'spotify_api', observedAt: '2026-09-28T00:00:00.000Z', basis: 'measured', note: 'n' } }),
            getAlbumUpcs: overrides.spotifyThrows
                ? async () => { throw new Error('boom'); }
                : async () => ({ upcs, provenance: { source: 'spotify_api', observedAt: '2026-09-28T00:00:01.000Z', basis: 'measured', note: 'n' } })
        },
        releaseModel: {
            findAll: async () => releases
        },
        mappings: overrides.mappings ?? { a1: { spotifyId: 'spotify123' } }
    };
}

describe('catalog integrity (spotify albums vs delivered UPCs)', () => {
    it('normalizeUpc strips non-digits and leading zeros (UPC vs EAN-13 equivalence)', () => {
        assert.equal(normalizeUpc('888880000001'), normalizeUpc('0888880000001'),
            '12-digit UPC and 13-digit EAN are the same product');
        assert.equal(normalizeUpc(' 88888-0000001 '), '888880000001');
        assert.equal(normalizeUpc(null), '');
    });

    it('matches by UPC, alerts on unknown, reports unverifiable separately', async () => {
        const svc = createCatalogIntegrityService(makeDeps());
        const r = await svc.checkArtist('a1');
        assert.equal(r.status, 'checked');
        assert.equal(r.matchMethod, 'upc');
        assert.equal(r.matchedCount, 1);
        assert.equal(r.matched[0].deliveredRelease.upc, '888880000001');
        assert.equal(r.matched[0].spotifyAlbum.upc, '888880000001');
        assert.equal(r.unknownCount, 1);
        assert.equal(r.unknown[0].spotifyAlbum.name, 'Unknown Bootleg');
        assert.ok(r.unknown[0].alert.includes('UNKNOWN'));
        assert.equal(r.unverifiableCount, 1);
        assert.equal(r.unverifiable[0].spotifyAlbum.name, 'Mystery White Label');
        assert.ok(r.unverifiable[0].note.includes('no UPC'));
        assert.equal(r.undeliveredCount, 1);
        assert.equal(r.undelivered[0].upc, '888880000002');
        assert.equal(r.source, 'spotify_api');
        assert.ok(r.observedAt, 'carries observedAt');
    });

    it('a title match with a different UPC is NOT a match', async () => {
        // "Midnight Sun" on Spotify but with a different barcode than delivered:
        // barcode comparison must not be fooled by the title.
        const svc = createCatalogIntegrityService(makeDeps({
            upcs: { s1: '777770000001', s2: '999990000001', s3: null }
        }));
        const r = await svc.checkArtist('a1');
        assert.equal(r.matchedCount, 0);
        assert.equal(r.unknownCount, 2, 's1 (wrong UPC) and s2 are both unknown');
    });

    it('skips artists with no Spotify mapping (explicit reason, not silent)', async () => {
        const svc = createCatalogIntegrityService(makeDeps({ mappings: {} }));
        const r = await svc.checkArtist('a1');
        assert.equal(r.status, 'skipped');
        assert.equal(r.reason, 'no_spotify_mapping');
    });

    it('skips artists with no delivered releases (explicit reason, not silent)', async () => {
        const svc = createCatalogIntegrityService(makeDeps({ releases: [] }));
        const r = await svc.checkArtist('a1');
        assert.equal(r.status, 'skipped');
        assert.equal(r.reason, 'no_delivered_releases');
    });

    it('reports Spotify failures as error, never clean', async () => {
        const svc = createCatalogIntegrityService(makeDeps({ spotifyThrows: true }));
        const r = await svc.checkArtist('a1');
        assert.equal(r.status, 'error');
        assert.ok(r.error.includes('Spotify album fetch failed'));
        assert.ok(r.note.includes('UNKNOWN'), 'never calls a failed fetch clean');
    });

    it('returns not_found for unknown artists', async () => {
        const svc = createCatalogIntegrityService(makeDeps());
        const r = await svc.checkArtist('nope');
        assert.equal(r.status, 'not_found');
    });
});
