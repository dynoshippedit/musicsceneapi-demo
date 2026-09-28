/**
 * tests/regression/provenance.test.js
 *
 * Phase 1B — data honesty. No fabricated numbers: every metric served by the
 * API carries provenance { source, observedAt, basis, note? }.
 */
'use strict';

const { describe, it, before, after } = require('node:test');
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
            const data = await instagram.getAccountData('testuser');
            assert.equal(data.social.instagram, 5000);
            assert.equal(data.provenance.source, 'instagram_api');
            assert.equal(data.provenance.basis, 'measured');
            assert.ok(data.provenance.note.includes('derived'), 'note discloses the derived field');
            assert.equal(data.meta.instagramAttribution, 'verified');
        } finally {
            axios.get = origGet;
        }
    });

    it('instagram refuses attribution when the live account mismatches the mapped handle', async () => {
        const instagram = require('../../integrations/instagram');
        instagram.accessToken = 'test-token';
        instagram.businessAccountId = 'test-acct';
        axios.get = async () => ({ data: { followers_count: 5000, media_count: 100, username: 'someoneelse' } });
        try {
            const data = await instagram.getAccountData('testuser');
            assert.strictEqual(data, null, 'mismatched account must not be attributed');
        } finally {
            axios.get = origGet;
        }
    });

    it('instagram refuses attribution when no handle is mapped', async () => {
        const instagram = require('../../integrations/instagram');
        instagram.accessToken = 'test-token';
        instagram.businessAccountId = 'test-acct';
        let called = false;
        axios.get = async () => { called = true; return { data: {} }; };
        try {
            const data = await instagram.getAccountData(undefined);
            assert.strictEqual(data, null, 'unmapped handle must not be attributed');
            assert.strictEqual(called, false, 'no API call needed without a handle');
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
                bio_description: 'b', display_name: 'Test', username: 'testuser'
            } } }
        });
        try {
            const data = await tiktok.getUserData('testuser');
            assert.equal(data.social.tiktok, 10000);
            assert.equal(data.provenance.source, 'tiktok_api');
            assert.equal(data.provenance.basis, 'measured');
            assert.ok(data.provenance.note.includes('derived'), 'note discloses the derived field');
            assert.equal(data.meta.tiktokAttribution, 'verified');
            assert.equal(data.meta.tiktokUsername, 'testuser');
        } finally {
            axios.get = origGet;
        }
    });

    it('tiktok refuses attribution when the token owner mismatches the mapped handle', async () => {
        const tiktok = require('../../integrations/tiktok');
        tiktok.clientKey = 'k';
        tiktok.clientSecret = 's';
        tiktok.accessToken = 't';
        axios.get = async () => ({
            data: { data: { user: {
                follower_count: 10000, video_count: 50, likes_count: 200000,
                bio_description: 'b', display_name: 'Test', username: 'someoneelse'
            } } }
        });
        try {
            const data = await tiktok.getUserData('testuser');
            assert.strictEqual(data, null, 'token owner metrics must not wear another artist handle');
        } finally {
            axios.get = origGet;
        }
    });
});

describe('entity audit (musicbrainz + wikidata)', () => {
    let axios, origGet;
    before(() => {
        axios = require('axios');
        origGet = axios.get;
    });
    after(() => { axios.get = origGet; });

    it('musicbrainz returns the MBID and canonical URL', async () => {
        const { auditMusicBrainz } = require('../../modules/entityAudit');
        axios.get = async () => ({
            data: { artists: [{ id: 'mbid-123', name: 'Test Artist', score: 100, country: 'CA', tags: [{ name: 'electronic' }] }] }
        });
        const r = await auditMusicBrainz('Test Artist');
        assert.equal(r.status, 'verified');
        assert.equal(r.exists, true);
        assert.equal(r.nameMatch, true);
        assert.equal(r.mbid, 'mbid-123');
        assert.equal(r.url, 'https://musicbrainz.org/artist/mbid-123');
    });

    it('musicbrainz marks a name mismatch as candidate, not verified', async () => {
        const { auditMusicBrainz } = require('../../modules/entityAudit');
        axios.get = async () => ({
            data: { artists: [{ id: 'mbid-999', name: 'Test Artist Tribute Band', score: 80, country: 'US', tags: [] }] }
        });
        const r = await auditMusicBrainz('Test Artist');
        assert.equal(r.status, 'candidate');
        assert.equal(r.exists, true);
        assert.equal(r.nameMatch, false);
        assert.ok(r.matchNote.includes('identity uncertain'));
    });

    it('musicbrainz reports not_found when the API has no entry', async () => {
        const { auditMusicBrainz } = require('../../modules/entityAudit');
        axios.get = async () => ({ data: { artists: [] } });
        const r = await auditMusicBrainz('Nobody Ever');
        assert.equal(r.status, 'not_found');
        assert.equal(r.exists, false);
    });

    it('wikidata returns the QID and canonical URL', async () => {
        const { auditWikidata } = require('../../modules/entityAudit');
        axios.get = async () => ({
            data: { search: [{ id: 'Q123', label: 'Test Artist', description: 'musician', url: 'https://www.wikidata.org/wiki/Q123' }] }
        });
        const r = await auditWikidata('Test Artist');
        assert.equal(r.status, 'verified');
        assert.equal(r.exists, true);
        assert.equal(r.nameMatch, true);
        assert.equal(r.qid, 'Q123');
        assert.equal(r.url, 'https://www.wikidata.org/wiki/Q123');
    });

    it('wikidata marks a name mismatch as candidate, not verified', async () => {
        const { auditWikidata } = require('../../modules/entityAudit');
        axios.get = async () => ({
            data: { search: [{ id: 'Q999', label: 'Test Artist (album)', description: 'album', url: 'https://www.wikidata.org/wiki/Q999' }] }
        });
        const r = await auditWikidata('Test Artist');
        assert.equal(r.status, 'candidate');
        assert.equal(r.exists, true);
        assert.equal(r.nameMatch, false);
        assert.ok(r.matchNote.includes('identity uncertain'));
    });

    it('wikidata reports not_found when the API has no entity', async () => {
        const { auditWikidata } = require('../../modules/entityAudit');
        axios.get = async () => ({ data: { search: [] } });
        const r = await auditWikidata('Nobody Ever');
        assert.equal(r.status, 'not_found');
        assert.equal(r.exists, false);
    });

    it('health score sums to 100 across all seven providers', () => {
        const { calculateHealthScore } = require('../../modules/entityAudit');
        const full = {
            googleKG: { exists: true, schemaValid: true, description: 'd', image: 'i' },
            wikipedia: { exists: true, musicRelated: true, hasInfobox: true, externalLinks: 10 },
            musicbrainz: { exists: true, status: 'verified', mbid: 'x' },
            wikidata: { exists: true, status: 'verified', description: 'd' },
            discogs: { exists: true, thumbnail: 't' },
            genius: { exists: true, verified: true },
            schemaValid: true
        };
        assert.equal(calculateHealthScore(full), 100);
        const none = { googleKG: {}, wikipedia: {}, discogs: {}, genius: {}, musicbrainz: {}, wikidata: {}, schemaValid: false };
        assert.equal(calculateHealthScore(none), 0);
        // musicbrainz/wikidata contribute independently
        const onlyNew = { googleKG: {}, wikipedia: {}, discogs: {}, genius: {}, musicbrainz: { exists: true, status: 'verified', mbid: 'x' }, wikidata: { exists: true, status: 'verified', description: 'd' }, schemaValid: false };
        assert.equal(calculateHealthScore(onlyNew), 30);
        // candidates (identity uncertain) score roughly half
        const onlyCandidates = { googleKG: {}, wikipedia: {}, discogs: {}, genius: {}, musicbrainz: { exists: true, status: 'candidate', mbid: 'x' }, wikidata: { exists: true, status: 'candidate', description: 'd' }, schemaValid: false };
        assert.equal(calculateHealthScore(onlyCandidates), 14);
    });

    it('schemaLD never fabricates URLs from the artist name', () => {
        const { generateSchemaLD } = require('../../modules/entityAudit');
        const schema = generateSchemaLD(
            { name: 'Test Artist', social: { instagram: 5000, twitter: 3000 } },
            { wikipedia: { url: 'https://en.wikipedia.org/wiki/X' } }
        );
        assert.ok(!('url' in schema), 'no guessed website URL without artist.website');
        assert.ok(schema.sameAs.every((u) => !u.includes('test artist')), 'no name-derived links');
        assert.ok(schema.sameAs.includes('https://en.wikipedia.org/wiki/X'), 'verified URLs kept');
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
