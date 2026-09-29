'use strict';

/**
 * tests/regression/demoMode.test.js
 *
 * Audit gap 2 — customer/demo mode separation.
 *
 * A server booted WITHOUT DEMO_MODE on a fresh database must come up with
 * ZERO fictional records and no known demo logins:
 *   - POST /v3/auth/login as admin@pulsegrid.fm / admin123 -> 401
 *   - GET /v3/artists -> [] (no fictional Pulsegrid roster)
 *   - GET /v3/royalties/lines -> [] (no seeded demo catalog/royalty lines)
 * The operator's first admin is bootstrapped via ADMIN_EMAIL/ADMIN_PASS
 * (created on first login), and a restart on the same database must not
 * backfill fictional data either.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 32201;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = 'owner@example.com';
const ADMIN_PASS = 'correct horse battery staple 1';

function childEnv(scratch) {
    const env = {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret-' + crypto.randomBytes(8).toString('hex'),
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(scratch, 'customer.sqlite'),
        DATABASE_URL: '',
        ADMIN_EMAIL,
        ADMIN_PASS,
        GROQ_API_KEY: '',
        AUTO_PRINT: 'false',
        SCHEDULE_JOBS: 'false',
        OAUTH_TOKEN_KEY: crypto.randomBytes(32).toString('hex')
    };
    // The point of this test: DEMO_MODE must be OFF. Strip it even if the
    // outer environment sets it.
    delete env.DEMO_MODE;
    return env;
}

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

async function api(method, p, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + p, {
        method, headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    let json = null;
    try { json = await res.json(); } catch (_) { /* ignore */ }
    return { status: res.status, json };
}

async function spawnServer(scratch) {
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: scratch, env: childEnv(scratch), stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.resume();
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    const up = await waitForHealth();
    if (!up) {
        child.kill('SIGKILL');
        throw new Error(`server.js (customer mode) never became healthy.\n` + err.slice(0, 3000));
    }
    return child;
}

describe('customer boot: no DEMO_MODE, fresh database', () => {
    let scratch;
    let child;

    before(async () => {
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-boot-'));
        child = await spawnServer(scratch);
    });

    after(async () => {
        if (child && child.exitCode === null) child.kill('SIGKILL');
        fs.rmSync(scratch, { recursive: true, force: true });
    });

    test('known demo logins do not exist', async () => {
        const r = await api('POST', '/v3/auth/login', null,
            { email: 'admin@pulsegrid.fm', password: 'admin123' });
        assert.strictEqual(r.status, 401, 'demo admin login must fail on a customer boot');
        const r2 = await api('POST', '/v3/auth/login', null,
            { email: 'tours@novakin.band', password: 'novakin123' });
        assert.strictEqual(r2.status, 401, 'demo artist login must fail on a customer boot');
    });

    test('operator bootstraps the first admin via ADMIN_EMAIL/ADMIN_PASS', async () => {
        const r = await api('POST', '/v3/auth/login', null,
            { email: ADMIN_EMAIL, password: ADMIN_PASS });
        assert.strictEqual(r.status, 200, 'bootstrap admin login must succeed');
        assert.strictEqual(r.json.user.role, 'admin');
        assert.strictEqual(r.json.user.email, ADMIN_EMAIL);
    });

    test('no fictional artists, catalog, or royalty lines are seeded', async () => {
        const login = await api('POST', '/v3/auth/login', null,
            { email: ADMIN_EMAIL, password: ADMIN_PASS });
        const token = login.json.token;
        const artists = await api('GET', '/v3/artists', token);
        assert.strictEqual(artists.status, 200);
        assert.deepStrictEqual(artists.json.artists ?? artists.json, [],
            'artist roster must be empty on a customer boot');
        const lines = await api('GET', '/v3/royalties/lines', token);
        assert.strictEqual(lines.status, 200);
        const arr = lines.json.lines ?? lines.json;
        assert.deepStrictEqual(arr, [], 'no seeded royalty lines on a customer boot');
    });

    test('restart does not backfill fictional data', async () => {
        child.kill('SIGKILL');
        await new Promise((r) => setTimeout(r, 1000));
        child = await spawnServer(scratch);
        const login = await api('POST', '/v3/auth/login', null,
            { email: ADMIN_EMAIL, password: ADMIN_PASS });
        assert.strictEqual(login.status, 200, 'bootstrap admin still works after restart');
        const artists = await api('GET', '/v3/artists', login.json.token);
        const arr = artists.json.artists ?? artists.json;
        assert.deepStrictEqual(arr, [], 'restart must not seed fictional artists');
    });
});
