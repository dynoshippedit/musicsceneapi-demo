/**
 * tests/regression/phase2.test.js
 *
 * Phase 2 regression gate: per-artist OAuth, catalog entities (ISRC/UPC),
 * and royalty CSV import (integer cents + currency).
 *
 * Two server fixtures (same pattern as billing.test.js):
 *   A. no OAuth env at all        -> oauth routes answer 503, app boots fine
 *   B. OAUTH_STUB=true + test key -> full OAuth/catalog/royalty lifecycle
 *
 * The stubbed token exchange never touches real provider endpoints and no
 * credentials live in the repo or the tests.
 */

'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');

// Fixed TEST key (64 hex chars = 32 bytes). Test fixture only.
const TEST_OAUTH_KEY = crypto.randomBytes(32).toString('hex');

function baseEnv(port, scratch, oauthEnv) {
    return {
        ...process.env,
        PORT: port,
        NODE_ENV: 'test',
        JWT_SECRET: 'phase2-test-secret',
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(scratch, 'test.sqlite'),
        DATABASE_URL: '',
        ADMIN_EMAIL: '', ADMIN_PASS: '',
        GROQ_API_KEY: '',
        AUTO_PRINT: 'false',
        SCHEDULE_JOBS: 'false',
        ...oauthEnv
    };
}

async function waitForHealth(base, timeoutMs = 40000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${base}/health`);
            if (res.ok) return true;
        } catch (_) { /* retry */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

function makeApi(base) {
    return async function api(method, p, token, body, extraHeaders) {
        const headers = { ...(extraHeaders || {}) };
        const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
        if (!isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(base + p, {
            method,
            headers,
            ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {})
        });
        let json = null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try { json = await res.json(); } catch (_) { /* ignore */ }
        }
        return { status: res.status, json };
    };
}

async function spawnServer(port, oauthEnv) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-'));
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: scratch, env: baseEnv(port, scratch, oauthEnv), stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.resume();
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    const base = `http://127.0.0.1:${port}`;
    const up = await waitForHealth(base);
    if (!up) {
        child.kill('SIGKILL');
        throw new Error(`server.js (port ${port}) never became healthy.\n` + err.slice(0, 3000));
    }
    return { child, api: makeApi(base), scratch };
}

async function login(api, email, password) {
    const { status, json } = await api('POST', '/v3/auth/login', null, { email, password });
    assert.strictEqual(status, 200, `login failed for ${email}: ${JSON.stringify(json)}`);
    assert.ok(json.token, `no token for ${email}`);
    return json.token;
}

function csvFile(csv) {
    const fd = new FormData();
    fd.append('file', new Blob([csv], { type: 'text/csv' }), 'royalties.csv');
    return fd;
}

describe('Phase 2 — OAuth unconfigured', () => {
    let srv;
    before(async () => { srv = await spawnServer(32181, {}); });
    after(() => { srv.child.kill('SIGKILL'); });

    test('authorize answers 503 naming the missing key', async () => {
        const admin = await login(srv.api, 'admin@pulsegrid.fm', 'admin123');
        const { status, json } = await srv.api(
            'GET', '/v3/oauth/spotify/authorize?artistId=art_novakin', admin);
        assert.strictEqual(status, 503);
        assert.match(json.error, /OAUTH_TOKEN_KEY/);
    });

    test('callback answers 503 when unconfigured', async () => {
        const { status } = await srv.api('GET', '/v3/oauth/spotify/callback?code=x&state=y');
        assert.strictEqual(status, 503);
    });
});

describe('Phase 2 — token crypto unit', () => {
    test('encrypt/decrypt round-trip', async () => {
        process.env.OAUTH_TOKEN_KEY = TEST_OAUTH_KEY;
        const { encryptToken, decryptToken } = require('../../src/oauth/tokenCrypto');
        const enc = encryptToken('secret-access-token');
        assert.notStrictEqual(enc, 'secret-access-token');
        assert.strictEqual(decryptToken(enc), 'secret-access-token');
    });

    test('tampered ciphertext fails to decrypt', async () => {
        process.env.OAUTH_TOKEN_KEY = TEST_OAUTH_KEY;
        const { encryptToken, decryptToken } = require('../../src/oauth/tokenCrypto');
        const parts = encryptToken('abc').split(':');
        parts[2] = Buffer.from('tampered').toString('base64');
        assert.throws(() => decryptToken(parts.join(':')));
    });
});

describe('Phase 2 — OAuth lifecycle (stubbed)', () => {
    let srv, admin, artist;
    before(async () => {
        srv = await spawnServer(32182, { OAUTH_STUB: 'true', OAUTH_TOKEN_KEY: TEST_OAUTH_KEY });
        admin = await login(srv.api, 'admin@pulsegrid.fm', 'admin123');
        artist = await login(srv.api, 'tours@novakin.band', 'novakin123');
    });
    after(() => { srv.child.kill('SIGKILL'); });

    test('unknown provider is rejected', async () => {
        const { status } = await srv.api('GET', '/v3/oauth/myspace/authorize?artistId=art_novakin', admin);
        assert.strictEqual(status, 400);
    });

    test('admin authorize requires artistId', async () => {
        const { status, json } = await srv.api('GET', '/v3/oauth/spotify/authorize', admin);
        assert.strictEqual(status, 400);
        assert.match(json.error, /artistId/);
    });

    test('artist authorize returns a provider URL + state', async () => {
        const { status, json } = await srv.api('GET', '/v3/oauth/spotify/authorize', artist);
        assert.strictEqual(status, 200);
        assert.ok(json.authorizeUrl.includes('accounts.spotify.com'), 'spotify auth URL');
        assert.ok(json.state, 'state token present');
        assert.strictEqual(json.provider, 'spotify');
    });

    test('callback with bad state is rejected (public route, no token)', async () => {
        const { status, json } = await srv.api('GET', '/v3/oauth/spotify/callback?code=x&state=bogus');
        assert.strictEqual(status, 400);
        assert.match(json.error, /state/);
    });

    test('full connect -> status -> disconnect cycle', async () => {
        // authorize as the artist
        const auth = await srv.api('GET', '/v3/oauth/tiktok/authorize', artist);
        assert.strictEqual(auth.status, 200);

        // provider redirects here (public); state binds the user
        const cb = await srv.api(
            'GET', `/v3/oauth/tiktok/callback?code=testcode&state=${auth.json.state}`);
        assert.strictEqual(cb.status, 200);
        assert.strictEqual(cb.json.connected, true);
        assert.strictEqual(cb.json.artistId, 'art_novakin');

        // state is single-use
        const replay = await srv.api(
            'GET', `/v3/oauth/tiktok/callback?code=testcode&state=${auth.json.state}`);
        assert.strictEqual(replay.status, 400);

        // status shows the connection with metadata only
        const st = await srv.api('GET', '/v3/oauth/status', artist);
        assert.strictEqual(st.status, 200);
        const conn = st.json.connections.find((c) => c.provider === 'tiktok');
        assert.ok(conn, 'tiktok connected');
        assert.ok(!('accessToken' in conn) && !('accessTokenEnc' in conn), 'no token values leaked');

        // disconnect
        const del = await srv.api('DELETE', '/v3/oauth/tiktok', artist);
        assert.strictEqual(del.status, 200);
        assert.strictEqual(del.json.disconnected, true);
        const st2 = await srv.api('GET', '/v3/oauth/status', artist);
        assert.strictEqual(st2.json.connections.length, 0);
    });

    test('admin can connect for any artist via artistId', async () => {
        const auth = await srv.api('GET', '/v3/oauth/youtube/authorize?artistId=art_lumenveil', admin);
        assert.strictEqual(auth.status, 200);
        const cb = await srv.api(
            'GET', `/v3/oauth/youtube/callback?code=testcode&state=${auth.json.state}`);
        assert.strictEqual(cb.json.artistId, 'art_lumenveil');
        const st = await srv.api('GET', '/v3/oauth/status?artistId=art_lumenveil', admin);
        assert.ok(st.json.connections.some((c) => c.provider === 'youtube'));
        await srv.api('DELETE', '/v3/oauth/youtube?artistId=art_lumenveil', admin);
    });

    test('artist cannot act for another artist', async () => {
        // artist role has no ?artistId= path; the status route uses their own grant
        const st = await srv.api('GET', '/v3/oauth/status', artist);
        assert.strictEqual(st.json.artistId, 'art_novakin');
    });
});

describe('Phase 2 — catalog CRUD + ISRC/UPC validation', () => {
    let srv, admin, artist;
    before(async () => {
        srv = await spawnServer(32183, { OAUTH_STUB: 'true', OAUTH_TOKEN_KEY: TEST_OAUTH_KEY });
        admin = await login(srv.api, 'admin@pulsegrid.fm', 'admin123');
        artist = await login(srv.api, 'tours@novakin.band', 'novakin123');
    });
    after(() => { srv.child.kill('SIGKILL'); });

    test('demo catalog was seeded', async () => {
        const { status, json } = await srv.api('GET', '/v3/catalog/recordings', admin);
        assert.strictEqual(status, 200);
        assert.ok(json.recordings.length >= 3, 'seeded recordings present');
        assert.ok(json.recordings.some((r) => r.isrc === 'ZZAAA2600001'));
        const rel = await srv.api('GET', '/v3/catalog/releases', admin);
        assert.ok(rel.json.releases.some((r) => r.upc === '888880000001'));
        const works = await srv.api('GET', '/v3/catalog/works', admin);
        assert.ok(works.json.works.length >= 1);
        const work = works.json.works[0];
        assert.ok(Array.isArray(work.recordingIds) && work.recordingIds.length >= 1);
        assert.ok(Array.isArray(work.credits) && work.credits.length >= 1);
    });

    test('create recording with valid ISRC', async () => {
        const { status, json } = await srv.api('POST', '/v3/catalog/recordings', admin, {
            artistId: 'art_novakin', title: 'Midnight Test', isrc: 'zzccc2600001', durationMs: 200000
        });
        assert.strictEqual(status, 201);
        assert.strictEqual(json.isrc, 'ZZCCC2600001', 'ISRC uppercased');
    });

    test('invalid ISRC rejected', async () => {
        for (const bad of ['ABC123', 'ZZAAA260000', 'zz aaa 2600001', '123456789012']) {
            const { status } = await srv.api('POST', '/v3/catalog/recordings', admin, {
                artistId: 'art_novakin', title: 'Bad', isrc: bad
            });
            assert.strictEqual(status, 400, `ISRC ${bad} should be rejected`);
        }
    });

    test('duplicate ISRC -> 409', async () => {
        const { status } = await srv.api('POST', '/v3/catalog/recordings', admin, {
            artistId: 'art_novakin', title: 'Dup', isrc: 'ZZAAA2600001'
        });
        assert.strictEqual(status, 409);
    });

    test('artist isolation on catalog', async () => {
        // artist creates for own artist
        const own = await srv.api('POST', '/v3/catalog/recordings', artist, {
            artistId: 'art_novakin', title: 'Artist Own', isrc: 'ZZDDD2600001'
        });
        assert.strictEqual(own.status, 201);

        // artist cannot create for another artist
        const other = await srv.api('POST', '/v3/catalog/recordings', artist, {
            artistId: 'art_lumenveil', title: 'Sneaky', isrc: 'ZZDDD2600002'
        });
        assert.strictEqual(other.status, 403);

        // artist list shows only own
        const list = await srv.api('GET', '/v3/catalog/recordings', artist);
        assert.ok(list.json.recordings.every((r) => r.artistId === 'art_novakin'));

        // artist cannot read another artist's recording
        const lumen = await srv.api('GET', '/v3/catalog/recordings?artistId=art_lumenveil', admin);
        const lumenId = lumen.json.recordings[0].id;
        const read = await srv.api('GET', `/v3/catalog/recordings/${lumenId}`, artist);
        assert.strictEqual(read.status, 403);
    });

    test('release validation', async () => {
        const badUpc = await srv.api('POST', '/v3/catalog/releases', admin, {
            artistId: 'art_novakin', title: 'Bad', upc: '123'
        });
        assert.strictEqual(badUpc.status, 400);
        const badType = await srv.api('POST', '/v3/catalog/releases', admin, {
            artistId: 'art_novakin', title: 'Bad', upc: '888880000002', type: 'mixtape'
        });
        assert.strictEqual(badType.status, 400);
        const ok = await srv.api('POST', '/v3/catalog/releases', admin, {
            artistId: 'art_novakin', title: 'Good Single', upc: '888880000002', type: 'single'
        });
        assert.strictEqual(ok.status, 201);
        const dup = await srv.api('POST', '/v3/catalog/releases', admin, {
            artistId: 'art_novakin', title: 'Dup', upc: '888880000002'
        });
        assert.strictEqual(dup.status, 409);
    });

    test('work links recordings of the same artist', async () => {
        const recs = await srv.api('GET', '/v3/catalog/recordings?artistId=art_novakin', admin);
        const recId = recs.json.recordings[0].id;
        const { status, json } = await srv.api('POST', '/v3/catalog/works', admin, {
            artistId: 'art_novakin', title: 'Linked Work',
            credits: [{ name: 'Test Writer', role: 'songwriter' }],
            recordingIds: [recId]
        });
        assert.strictEqual(status, 201);
        assert.deepStrictEqual(json.recordingIds, [recId]);

        // linking a nonexistent recording fails
        const bad = await srv.api('POST', '/v3/catalog/works', admin, {
            artistId: 'art_novakin', title: 'Bad Links', recordingIds: [999999]
        });
        assert.strictEqual(bad.status, 400);

        // linking another artist's recording fails
        const lumen = await srv.api('GET', '/v3/catalog/recordings?artistId=art_lumenveil', admin);
        const cross = await srv.api('POST', '/v3/catalog/works', admin, {
            artistId: 'art_novakin', title: 'Cross Links', recordingIds: [lumen.json.recordings[0].id]
        });
        assert.strictEqual(cross.status, 400);

        // update replaces links
        const upd = await srv.api('PUT', `/v3/catalog/works/${json.id}`, admin, { recordingIds: [] });
        assert.strictEqual(upd.status, 200);
        assert.deepStrictEqual(upd.json.recordingIds, []);

        // delete
        const del = await srv.api('DELETE', `/v3/catalog/works/${json.id}`, admin);
        assert.strictEqual(del.status, 200);
        const gone = await srv.api('GET', `/v3/catalog/works/${json.id}`, admin);
        assert.strictEqual(gone.status, 404);
    });
});

describe('Phase 2 — royalty CSV import (integer cents)', () => {
    let srv, admin, artist;
    before(async () => {
        srv = await spawnServer(32184, { OAUTH_STUB: 'true', OAUTH_TOKEN_KEY: TEST_OAUTH_KEY });
        admin = await login(srv.api, 'admin@pulsegrid.fm', 'admin123');
        artist = await login(srv.api, 'tours@novakin.band', 'novakin123');
    });
    after(() => { srv.child.kill('SIGKILL'); });

    test('non-admin cannot import', async () => {
        const { status } = await srv.api('POST', '/v3/royalties/import', artist,
            csvFile('isrc_or_upc,amount_cents,currency,period,source\nZZAAA2600001,100,USD,2026-09,x\n'));
        assert.strictEqual(status, 403);
    });

    test('missing file -> 400', async () => {
        const { status } = await srv.api('POST', '/v3/royalties/import', admin, {});
        assert.strictEqual(status, 400);
    });

    test('bad header -> 400', async () => {
        const { status, json } = await srv.api('POST', '/v3/royalties/import', admin,
            csvFile('isrc,amount\nZZAAA2600001,100\n'));
        assert.strictEqual(status, 400);
        assert.match(json.error, /missing required columns/);
    });

    test('import report: good rows in, bad rows reported', async () => {
        const csv = [
            'isrc_or_upc,amount_cents,currency,period,source',
            'ZZAAA2600001,199,USD,2026-09,spotify',      // good
            'ZZAAA2600001,201,USD,2026-09,apple',        // good (199+201=400 checks int math)
            '888880000001,5000,EUR,2026-09,distributor', // good (UPC key)
            'ZZAAA2600001,19.99,USD,2026-09,spotify',    // bad: decimal cents
            'ZZAAA2600001,abc,USD,2026-09,spotify',      // bad: non-numeric
            'ZZAAA2600001,100,US,2026-09,spotify',       // bad: currency
            'ZZZZZ9999999,100,USD,2026-09,spotify',      // bad: unknown ISRC
            'ZZAAA2600001,100,USD,,spotify',             // bad: missing period
        ].join('\n');
        const { status, json } = await srv.api('POST', '/v3/royalties/import', admin, csvFile(csv));
        assert.strictEqual(status, 201);
        assert.strictEqual(json.received, 8);
        assert.strictEqual(json.imported, 3);
        assert.strictEqual(json.rejected.length, 5);
        const reasons = json.rejected.map((r) => r.reason).join(' | ');
        assert.match(reasons, /integer number of cents/);
        assert.match(reasons, /3-letter ISO/);
        assert.match(reasons, /no recording or release found/);
        assert.match(reasons, /period is required/);
    });

    test('summary totals in integer cents per currency', async () => {
        const { status, json } = await srv.api(
            'GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-09', admin);
        assert.strictEqual(status, 200);
        const usd = json.totals.find((t) => t.currency === 'USD');
        const eur = json.totals.find((t) => t.currency === 'EUR');
        assert.ok(usd && eur, 'per-currency totals');
        assert.strictEqual(usd.totalCents, 400, '199 + 201 = 400 exactly (no float)');
        assert.strictEqual(eur.totalCents, 5000);
        assert.ok(Number.isInteger(usd.totalCents), 'integer math');
    });

    test('artist summary is scoped to own artist', async () => {
        const { status, json } = await srv.api('GET', '/v3/royalties/summary', artist);
        assert.strictEqual(status, 200);
        assert.ok(json.lines >= 1);
        const other = await srv.api('GET', '/v3/royalties/summary?artistId=art_lumenveil', artist);
        assert.strictEqual(other.status, 403);
    });

    test('quoted CSV fields parse correctly', async () => {
        const csv = [
            'isrc_or_upc,amount_cents,currency,period,source',
            '"ZZAAA2600001",150,USD,2026-09,"source, with comma"',
        ].join('\n');
        const { status, json } = await srv.api('POST', '/v3/royalties/import', admin, csvFile(csv));
        assert.strictEqual(status, 201);
        assert.strictEqual(json.imported, 1);
    });

    test('re-importing the same CSV reports all rows as duplicates; totals unchanged', async () => {
        const csv = [
            'isrc_or_upc,amount_cents,currency,period,source',
            'ZZAAA2600001,1000,USD,2026-10,distributor',
            '888880000001,2000,EUR,2026-10,distributor',
        ].join('\n');
        const first = await srv.api('POST', '/v3/royalties/import', admin, csvFile(csv));
        assert.strictEqual(first.status, 201);
        assert.strictEqual(first.json.imported, 2);
        assert.strictEqual(first.json.rejected.length, 0);

        const before = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-10', admin);
        assert.strictEqual(before.status, 200);
        assert.strictEqual(before.json.totals.find((t) => t.currency === 'USD').totalCents, 1000);
        assert.strictEqual(before.json.totals.find((t) => t.currency === 'EUR').totalCents, 2000);

        // Same file again: nothing new is counted, every row is reported.
        const second = await srv.api('POST', '/v3/royalties/import', admin, csvFile(csv));
        assert.strictEqual(second.status, 201);
        assert.strictEqual(second.json.received, 2);
        assert.strictEqual(second.json.imported, 0);
        assert.strictEqual(second.json.rejected.length, 2);
        assert.ok(second.json.rejected.every((r) => /duplicate/i.test(r.reason)),
            `expected duplicate reasons, got: ${JSON.stringify(second.json.rejected)}`);

        const after = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-10', admin);
        assert.strictEqual(after.status, 200);
        assert.deepStrictEqual(after.json.totals, before.json.totals, 'totals unchanged after re-import');
    });

    test('duplicate rows inside one CSV are rejected, not double-counted', async () => {
        const csv = [
            'isrc_or_upc,amount_cents,currency,period,source',
            'ZZAAA2600001,500,USD,2026-11,distributor',
            'ZZAAA2600001,500,USD,2026-11,distributor',
        ].join('\n');
        const { status, json } = await srv.api('POST', '/v3/royalties/import', admin, csvFile(csv));
        assert.strictEqual(status, 201);
        assert.strictEqual(json.received, 2);
        assert.strictEqual(json.imported, 1);
        assert.strictEqual(json.rejected.length, 1);
        assert.match(json.rejected[0].reason, /duplicate/i);

        const { json: sum } = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-11', admin);
        assert.strictEqual(sum.totals.find((t) => t.currency === 'USD').totalCents, 500,
            'repeated row counted exactly once');
    });

    test('same key and period from a different source is not a duplicate', async () => {
        const csv = [
            'isrc_or_upc,amount_cents,currency,period,source',
            'ZZAAA2600001,700,USD,2026-11,spotify',
        ].join('\n');
        const { status, json } = await srv.api('POST', '/v3/royalties/import', admin, csvFile(csv));
        assert.strictEqual(status, 201);
        assert.strictEqual(json.imported, 1, 'different source = different statement');
        assert.strictEqual(json.rejected.length, 0);

        const { json: sum } = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-11', admin);
        assert.strictEqual(sum.totals.find((t) => t.currency === 'USD').totalCents, 1200,
            '500 (distributor) + 700 (spotify)');
    });
});
