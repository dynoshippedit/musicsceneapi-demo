'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');

function baseEnv(port, scratch) {
    return {
        ...process.env,
        PORT: port,
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret-atvenu',
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(scratch, 'test.sqlite'),
        DATABASE_URL: '',
        ADMIN_EMAIL: '', ADMIN_PASS: '',
        GROQ_API_KEY: '',
        AUTO_PRINT: 'false',
        SCHEDULE_JOBS: 'false'
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

async function spawnServer(port) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atvenu-'));
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: scratch, env: baseEnv(port, scratch), stdio: ['ignore', 'pipe', 'pipe']
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
    return json.token;
}

function csvFile(csv) {
    const fd = new FormData();
    fd.append('file', new Blob([csv], { type: 'text/csv' }), 'settlements.csv');
    return fd;
}

const HEADER = 'show_date,venue,artist,gross_cents,fees_cents,taxes_cents,net_cents,currency,attendance';

describe('atVenu settlement CSV import (integer cents)', () => {
    let srv, admin, artist;
    before(async () => {
        srv = await spawnServer(32191);
        admin = await login(srv.api, 'admin@pulsegrid.fm', 'admin123');
        artist = await login(srv.api, 'tours@novakin.band', 'novakin123');
    });
    after(() => { srv.child.kill('SIGKILL'); });

    test('non-admin cannot import', async () => {
        const { status } = await srv.api('POST', '/v3/royalties/import/atvenu', artist,
            csvFile(`${HEADER}\n2026-09-15,The Danforth,NOVAKIN,500000,25000,65000,410000,USD,800\n`));
        assert.strictEqual(status, 403);
    });

    test('missing file -> 400', async () => {
        const { status } = await srv.api('POST', '/v3/royalties/import/atvenu', admin, {});
        assert.strictEqual(status, 400);
    });

    test('bad header -> 400', async () => {
        const { status, json } = await srv.api('POST', '/v3/royalties/import/atvenu', admin,
            csvFile('date,venue\n2026-09-15,X\n'));
        assert.strictEqual(status, 400);
        assert.match(json.error, /missing required columns/);
    });

    test('import report: good rows in, bad rows reported, money stays integer', async () => {
        const csv = [
            HEADER,
            '2026-09-15,The Danforth,novakin,500000,25000,65000,410000,USD,800',
            '2026-09-16,History Toronto,NOVAKIN,19.99,0,0,19,USD,100',
            '2026-09-17,The Opera House,NOBODY,100000,0,0,100000,USD,200',
            '2026-09-18,The Garrison,NOVAKIN,750000,30000,80000,640000,US,300'
        ].join('\n');
        const { status, json } = await srv.api('POST', '/v3/royalties/import/atvenu', admin, csvFile(csv));
        assert.strictEqual(status, 201);
        assert.strictEqual(json.received, 4);
        assert.strictEqual(json.imported, 1);
        assert.strictEqual(json.rejected.length, 3);
        const reasons = json.rejected.map((r) => r.reason).join(' | ');
        assert.match(reasons, /must be an integer number of cents/);
        assert.match(reasons, /does not match any roster artist/);
        assert.match(reasons, /must be a 3-letter ISO code/);
    });

    test('re-import is idempotent (duplicates reported, not double-counted)', async () => {
        const csv = `${HEADER}\n2026-09-20,The Danforth,NOVAKIN,500000,25000,65000,410000,USD,800\n`;
        const first = await srv.api('POST', '/v3/royalties/import/atvenu', admin, csvFile(csv));
        assert.strictEqual(first.json.imported, 1);
        const second = await srv.api('POST', '/v3/royalties/import/atvenu', admin, csvFile(csv));
        assert.strictEqual(second.json.imported, 0);
        assert.strictEqual(second.json.rejected.length, 1);
        assert.match(second.json.rejected[0].reason, /duplicate settlement/);
    });

    test('merch-settlements list returns integer cents', async () => {
        const { status, json } = await srv.api('GET', '/v3/royalties/merch-settlements?artistId=art_novakin', admin);
        assert.strictEqual(status, 200);
        assert.ok(Array.isArray(json.settlements));
        assert.ok(json.settlements.length >= 2);
        for (const st of json.settlements) {
            assert.ok(Number.isInteger(st.grossCents), 'grossCents is an integer');
            assert.ok(Number.isInteger(st.netCents), 'netCents is an integer');
            assert.match(st.currency, /^[A-Z]{3}$/);
        }
    });
});
