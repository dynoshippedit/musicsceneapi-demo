/**
 * tests/regression/authz.test.js
 *
 * PHASE 1A authorization regression gate.
 *
 * Policy under test:
 *   - role=admin: everything.
 *   - role=artist (artistAccess = own artist id): ONLY their own artist's
 *     data. Label-wide operational endpoints are admin-only (403 for artist):
 *       /v3/operations/assets, /v3/operations/logistics,
 *       /v3/anr/* (submissions + room), /v3/integrations/test-limit/*.
 *   - GET /v3/artists as artist returns ONLY their own artist record.
 *   - Properly scoped endpoints (own artist detail, label overview, monthly
 *     report) keep working for the artist role.
 *
 * Boots the canonical entrypoint against a disposable scratch database,
 * exactly like tests/regression/snapshot.test.js.
 */

'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = process.env.TEST_PORT || '3996';
const BASE = `http://127.0.0.1:${PORT}`;

let child;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mau5-authz-'));

const ENV = {
    ...process.env,
    PORT,
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-0123456789-min16chars',
    USE_REAL_DATA: 'false',
    DB_DIALECT: 'sqlite',
    DB_STORAGE: path.join(scratch, 'test.sqlite'),
    DATABASE_URL: '',
    ADMIN_EMAIL: '', ADMIN_PASS: '',
    GROQ_API_KEY: '',
    AUTO_PRINT: 'false',
    SCHEDULE_JOBS: 'false'
};

async function waitForHealth(timeoutMs = 40000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${BASE}/health`);
            if (res.ok) return true;
        } catch (_) { /* retry */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

before(async () => {
    child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: scratch, env: ENV, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.resume();
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    const up = await waitForHealth();
    if (!up) {
        child.kill('SIGKILL');
        throw new Error('server.js never became healthy.\n' + err.slice(0, 3000));
    }
});

after(async () => {
    if (child) child.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(scratch, { recursive: true, force: true });
});

async function api(method, p, token, body) {
    const res = await fetch(BASE + p, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    let json = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        try { json = await res.json(); } catch (_) { /* ignore */ }
    }
    return { status: res.status, json };
}

async function login(email, password) {
    const { status, json } = await api('POST', '/v3/auth/login', null, { email, password });
    assert.strictEqual(status, 200, `login failed for ${email}`);
    assert.ok(json.token, `no token for ${email}`);
    return json.token;
}

let adminToken, artistToken;

describe('PHASE 1A authorization policy', () => {
    test('fixture logins work', async () => {
        adminToken = await login('admin@mau5trap.com', 'admin123');
        artistToken = await login('tours@rezz.com', 'rezz123');
    });

    // ---- label-wide operational endpoints: admin-only ----
    const adminOnly = [
        ['GET', '/v3/operations/logistics'],
        ['GET', '/v3/operations/assets'],
        ['GET', '/v3/anr/submissions'],
        ['POST', '/v3/anr/submissions', { artist: 'X', track: 'Y', url: 'https://example.com/z' }],
        ['POST', '/v3/anr/submissions/sub_1/vote', { direction: 'up' }],
        ['POST', '/v3/anr/evaluate', { artistName: 'Probe', genre: 'Techno' }],
        ['GET', '/v3/anr/scout'],
        ['POST', '/v3/anr/shortlist', { artistName: 'Probe', spotifyId: 'x' }],
        ['GET', '/v3/anr/state'],
        ['POST', '/v3/anr/whiteboard', { message: 'hi' }],
        ['POST', '/v3/anr/listening', { url: 'https://example.com/demo' }],
        ['POST', '/v3/anr/demos', { title: 'T', artist: 'A', url: 'https://example.com/d' }],
        ['POST', '/v3/anr/vote/demo1', { action: 'add' }],
        ['GET', '/v3/anr/stats/demo1'],
        ['GET', '/v3/anr/demos/demo1/rating'],
        ['GET', '/v3/integrations/test-limit/spotify'],
    ];

    for (const [method, p, body] of adminOnly) {
        test(`artist gets 403 on ${method} ${p}`, async () => {
            const { status, json } = await api(method, p, artistToken, body);
            assert.strictEqual(status, 403, `${method} ${p} leaked to artist (status ${status})`);
            assert.strictEqual(json.error, 'Admin access required');
        });
    }

    test('admin still reaches the locked endpoints', async () => {
        const okPaths = [
            ['GET', '/v3/operations/logistics', 200],
            ['GET', '/v3/operations/assets', 200],
            ['GET', '/v3/anr/submissions', 200],
            ['GET', '/v3/anr/state', 200],
            ['GET', '/v3/integrations/test-limit/spotify', 200],
        ];
        for (const [method, p, want] of okPaths) {
            const { status } = await api(method, p, adminToken);
            assert.strictEqual(status, want, `admin ${method} ${p} -> ${status}, want ${want}`);
        }
    });

    // ---- artist roster list: own record only ----
    test('artist sees only their own record in GET /v3/artists', async () => {
        const { status, json } = await api('GET', '/v3/artists?limit=50', artistToken);
        assert.strictEqual(status, 200);
        assert.ok(Array.isArray(json.artists));
        assert.ok(json.artists.length >= 1, 'artist should see at least their own record');
        for (const a of json.artists) {
            assert.strictEqual(a.id, 'art_rezz', `artist saw another artist's record: ${a.id}`);
        }
        const admin = await api('GET', '/v3/artists?limit=50', adminToken);
        assert.strictEqual(admin.status, 200);
        assert.ok(admin.json.artists.length > 1, 'admin should see the full roster');
    });

    test('artist cannot read another artist detail', async () => {
        const { status } = await api('GET', '/v3/artists/art_deadmau5', artistToken);
        assert.strictEqual(status, 403);
        const own = await api('GET', '/v3/artists/art_rezz', artistToken);
        assert.strictEqual(own.status, 200);
    });

    // ---- properly scoped endpoints keep working for the artist role ----
    test('artist keeps own-scoped access (no over-blocking)', async () => {
        const overview = await api('GET', '/v3/label/overview', artistToken);
        assert.strictEqual(overview.status, 200);
        assert.strictEqual(overview.json.activeArtists, 1);

        const report = await api('GET', '/v3/reports/monthly/art_rezz/2026-01', artistToken);
        assert.strictEqual(report.status, 200);

        const deniedReport = await api('GET', '/v3/reports/monthly/art_deadmau5/2026-01', artistToken);
        assert.strictEqual(deniedReport.status, 403);

        const me = await api('GET', '/v3/auth/me', artistToken);
        assert.strictEqual(me.status, 200);
    });

    test('unauthenticated requests are still rejected', async () => {
        const { status } = await api('GET', '/v3/operations/assets', null);
        assert.ok([401, 403].includes(status), `want 401/403, got ${status}`);
    });
});
