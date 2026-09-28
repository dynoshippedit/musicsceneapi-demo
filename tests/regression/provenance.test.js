/**
 * tests/regression/provenance.test.js
 *
 * Phase 1B — data honesty. No fabricated numbers: every metric served by the
 * API carries provenance { source, observedAt, basis, note? }.
 */
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { withProvenance, MEASURED, ESTIMATED } = require('../../src/services/provenance');

describe('provenance helper', () => {
    it('attaches source/observedAt/basis and preserves payload fields', () => {
        const out = withProvenance({ followers: 42 }, { source: 'spotify_api', basis: MEASURED });
        assert.equal(out.followers, 42);
        assert.equal(out.provenance.source, 'spotify_api');
        assert.equal(out.provenance.basis, 'measured');
        assert.ok(Date.parse(out.provenance.observedAt), 'observedAt is a timestamp');
    });

    it('accepts an explicit observedAt and note', () => {
        const out = withProvenance({}, {
            source: 'manual_import', observedAt: '2026-01-01T00:00:00.000Z',
            basis: ESTIMATED, note: 'formula: x * 2'
        });
        assert.equal(out.provenance.observedAt, '2026-01-01T00:00:00.000Z');
        assert.equal(out.provenance.note, 'formula: x * 2');
    });

    it('does not mutate the input object', () => {
        const input = { a: 1 };
        withProvenance(input, { source: 's', basis: MEASURED });
        assert.ok(!('provenance' in input));
    });

    it('rejects a missing source', () => {
        assert.throws(() => withProvenance({}, { basis: MEASURED }), /source/);
    });

    it('rejects an invalid basis', () => {
        assert.throws(() => withProvenance({}, { source: 's', basis: 'guessed' }), /basis/);
    });

    it('rejects estimated metrics without a disclosed formula', () => {
        assert.throws(() => withProvenance({}, { source: 's', basis: ESTIMATED }), /note/);
    });
});

describe('spotify integration (no fabricated numbers)', () => {
    let spotify;
    before(() => {
        spotify = require('../../integrations/spotify');
        // Skip the token refresh; stub the API client.
        spotify.tokenExpiresAt = Date.now() + 60000;
        spotify.spotifyApi = {
            getArtist: async () => ({
                body: {
                    followers: { total: 1234567 },
                    popularity: 78,
                    id: 'artist123',
                    external_urls: { spotify: 'https://open.spotify.com/artist/artist123' }
                }
            })
        };
    });

    it('reports followers and popularity verbatim — never monthlyListeners or streams', async () => {
        const data = await spotify.getArtistData('artist123');
        assert.equal(data.followers, 1234567);
        assert.equal(data.popularity, 78);
        assert.equal(data.social.spotify, 1234567);
        assert.ok(!('monthlyListeners' in data), 'monthlyListeners must not exist');
        assert.ok(!('totalStreams' in data), 'totalStreams must not exist');
        assert.ok(!('growthRate' in data), 'growthRate must not exist');
    });

    it('carries measured provenance with an honest note', async () => {
        const data = await spotify.getArtistData('artist123');
        assert.equal(data.provenance.source, 'spotify_api');
        assert.equal(data.provenance.basis, 'measured');
        assert.ok(data.provenance.note.includes('not exposed'), 'note discloses what is not reported');
    });
});

describe('instagram/tiktok provenance tagging', () => {
    let axios, origGet;
    before(() => {
        axios = require('axios');
        origGet = axios.get;
    });

    it('instagram tags followers as measured and discloses the engagement formula', async () => {
        const instagram = require('../../integrations/instagram');
        instagram.accessToken = 'test-token';
        instagram.businessAccountId = 'test-acct';
        axios.get = async (url) => {
            if (url === 'https://graph.instagram.com/test-acct') {
                return { data: { followers_count: 5000, media_count: 100, username: 'testuser' } };
            }
            return { data: { data: [{ like_count: 100, comments_count: 10, timestamp: '2026-01-01' }] } };
        };
        try {
            const data = await instagram.getAccountData();
            assert.equal(data.social.instagram, 5000);
            assert.equal(data.provenance.source, 'instagram_api');
            assert.equal(data.provenance.basis, 'measured');
            assert.ok(data.provenance.note.includes('derived'), 'note discloses the derived field');
        } finally {
            axios.get = origGet;
        }
    });

    it('tiktok tags counts as measured and discloses the engagement formula', async () => {
        const tiktok = require('../../integrations/tiktok');
        tiktok.clientKey = 'k';
        tiktok.clientSecret = 's';
        tiktok.accessToken = 't';
        axios.get = async () => ({
            data: { data: { user: {
                follower_count: 10000, video_count: 50, likes_count: 200000,
                bio_description: 'b', display_name: 'Test'
            } } }
        });
        try {
            const data = await tiktok.getUserData('testuser');
            assert.equal(data.social.tiktok, 10000);
            assert.equal(data.provenance.source, 'tiktok_api');
            assert.equal(data.provenance.basis, 'measured');
            assert.ok(data.provenance.note.includes('derived'), 'note discloses the derived field');
        } finally {
            axios.get = origGet;
        }
    });
});

describe('entity audit (no free link-accuracy points)', () => {
    it('awards no points for unverified name-derived links', () => {
        const { calculateHealthScore } = require('../../modules/entityAudit');
        const withBonus = calculateHealthScore({
            googleKG: {}, wikipedia: {}, discogs: {}, genius: {},
            schemaValid: false, linksAccurate: true
        });
        const withoutBonus = calculateHealthScore({
            googleKG: {}, wikipedia: {}, discogs: {}, genius: {},
            schemaValid: false, linksAccurate: false
        });
        assert.equal(withBonus, withoutBonus, 'linksAccurate must not change the score');
    });

    it('flags unverified social links as an inconsistency', () => {
        const { detectInconsistencies } = require('../../modules/entityAudit');
        const found = detectInconsistencies(
            {
                googleKG: { exists: true, schemaValid: true, name: 'lumenveil' },
                wikipedia: { exists: true, title: 'lumenveil' },
                discogs: { name: 'lumenveil' },
                genius: { name: 'lumenveil' },
                linksVerified: false
            }, {}
        );
        assert.ok(found.some((i) => i.type === 'unverified_social_links'));
    });
});
