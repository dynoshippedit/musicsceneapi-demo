/**
 * tests/regression/integrity.test.js
 *
 * Pre-D0 failure-first coverage for the disposable integrity probes:
 *   B1  malformed royalties must 4xx without killing the API
 *   B2  rejected artist writes must not 200 / emit success audits
 *   B3  concurrent distinct-user votes must both persist
 *   FE-01 sales contract is {artistId, month, revenue}; old keys stay 400
 *
 * Own ephemeral port + temp SQLite. Never touches the operator database.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');

const ROOT = path.resolve(__dirname, '..', '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsegrid-integrity-'));
const dbFile = path.join(scratch, 'probe.sqlite');

let child = null;
let output = '';
let base = '';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
    const s = net.createServer();
    s.listen(0, '127.0.0.1');
    await once(s, 'listening');
    const p = s.address().port;
    await new Promise((r) => s.close(r));
    return p;
}

async function boot() {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    output = '';
    const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'test',
        PORT: String(port),
        DB_DIALECT: 'sqlite',
        DB_STORAGE: dbFile,
        DATABASE_URL: '',
        LABEL_SLUG: 'pulsegrid',
        ACTIVE_LABEL: '',
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        ADMIN_EMAIL: '',
        ADMIN_PASS: '',
        USE_REAL_DATA: 'false',
        SCHEDULE_JOBS: 'false',
        GROQ_API_KEY: '',
        AUTO_PRINT: 'false',
        SMTP_HOST: '',
        SMTP_PASS: '',
        SENDGRID_API_KEY: ''
    };
    child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: scratch,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    const until = Date.now() + 30000;
    while (!output.includes(`Server: http://localhost:${port}`)) {
        if (child.exitCode !== null || Date.now() > until) {
            throw new Error('integrity child did not announce its own listener\n' + output.slice(-2000));
        }
        await delay(50);
    }
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
}

async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        child = null;
        return;
    }
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, delay(5000)]);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    child = null;
}

async function api(method, pathname, token, body) {
    try {
        const res = await fetch(base + pathname, {
            method,
            signal: AbortSignal.timeout(8000),
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        let payload = null;
        try { payload = await res.json(); } catch (_) { /* non-JSON */ }
        return { status: res.status, body: payload };
    } catch (e) {
        return { transportError: `${e.name}: ${e.message}` };
    }
}

async function login(email = 'admin@pulsegrid.fm', password = 'admin123') {
    const r = await api('POST', '/v3/auth/login', null, { email, password });
    assert.equal(r.status, 200, `login ${email} failed`);
    return r.body.token;
}

async function sql(statement) {
    const db = await new Promise((resolve, reject) => {
        const d = new sqlite3.Database(dbFile, (e) => (e ? reject(e) : resolve(d)));
    });
    try {
        return await new Promise((resolve, reject) => {
            db.all(statement, (e, rows) => (e ? reject(e) : resolve(rows)));
        });
    } finally {
        await new Promise((resolve, reject) => db.close((e) => (e ? reject(e) : resolve())));
    }
}

after(async () => {
    await stop();
    fs.rmSync(scratch, { recursive: true, force: true });
});

test('rejected writes, concurrent votes, royalties and sales contract hold on disposable state', async () => {
    await boot();
    let token = await login();

    // FE-01: mistaken client keys stay 400; the API contract is artistId/month/revenue.
    const oldKeys = await api('POST', '/v3/analytics/sales', token, {
        artistId: 'art_novakin', amount: 100, date: new Date().toISOString()
    });
    assert.equal(oldKeys.status, 400);
    assert.equal(oldKeys.body.error, 'Missing fields');

    const sale = await api('POST', '/v3/analytics/sales', token, {
        artistId: 'art_novakin', month: '2026-09', revenue: 100
    });
    assert.equal(sale.status, 200);
    assert.equal(sale.body.success, true);

    // $0 is a real sale (promo / write-off). `!revenue` used to 400 it.
    const zeroSale = await api('POST', '/v3/analytics/sales', token, {
        artistId: 'art_novakin', month: '2026-08', revenue: 0
    });
    assert.equal(zeroSale.status, 200, `zero-revenue sale rejected: ${JSON.stringify(zeroSale)}`);
    assert.equal(zeroSale.body.success, true);

    // Omitted vote direction used to ++votes with userVote null.
    const noDir = await api('POST', '/v3/anr/submissions/sub_1/vote', token, {});
    assert.equal(noDir.status, 400, `omitted direction must 400, got ${JSON.stringify(noDir)}`);
    const healthAfterVote = await api('GET', '/health');
    assert.equal(healthAfterVote.status, 200, `API died after omitted vote direction: ${JSON.stringify(healthAfterVote)}`);

    // Array month on generate-all used to TypeError path.join and kill the process.
    const genAll = await api('POST', '/v3/reports/generate-all', token, { month: ['2026-09'] });
    assert.ok(genAll.status >= 400 && genAll.status < 500, `generate-all status ${genAll.status}`);
    const healthAfterGen = await api('GET', '/health');
    assert.equal(healthAfterGen.status, 200, `API died after generate-all array month: ${JSON.stringify(healthAfterGen)}`);
    assert.equal(child.exitCode, null);

    // Same class as B1: non-string month used to unhandled-reject and shut the API down.
    const badMonth = await api('POST', '/v3/analytics/sales', token, {
        artistId: 'art_novakin', month: ['2026-09'], revenue: 1
    });
    assert.ok(badMonth.status >= 400 && badMonth.status < 500, `bad month status ${badMonth.status}`);
    const healthAfterSale = await api('GET', '/health');
    assert.equal(healthAfterSale.status, 200, `API died after non-string month: ${JSON.stringify(healthAfterSale)}`);
    assert.equal(child.exitCode, null);

    // B2: SQLite trigger rejects UPDATE; responses must not claim success.
    const before = (await api('GET', '/v3/artists/art_novakin', token)).body;
    await sql("CREATE TRIGGER d0_reject_artist_update BEFORE UPDATE ON Artists WHEN NEW.id='art_novakin' BEGIN SELECT RAISE(ABORT, 'D0 disposable write rejection'); END");
    const archive = await api('POST', '/v3/artists/art_novakin/archive', token);
    const image = await api('PUT', '/v3/artists/art_novakin/image', token, {
        imageUrl: 'https://example.test/d0-image.png'
    });
    const after = (await api('GET', '/v3/artists/art_novakin', token)).body;
    const audits = await sql("SELECT action, resourceId FROM AuditEvents WHERE resourceId='art_novakin' ORDER BY id");
    assert.ok(archive.status >= 400, `archive acknowledged a rejected write: ${archive.status}`);
    assert.ok(image.status >= 400, `image acknowledged a rejected write: ${image.status}`);
    assert.equal(after.tier, before.tier);
    assert.equal(after.manualImage ?? null, before.manualImage ?? null);
    assert.equal(audits.length, 0, `success audits written for rejected writes: ${JSON.stringify(audits)}`);

    await stop();
    await boot();
    token = await login();
    const restart = (await api('GET', '/v3/artists/art_novakin', token)).body;
    assert.equal(restart.tier, before.tier);
    assert.equal(restart.manualImage ?? null, before.manualImage ?? null);

    // B3: two distinct users voting at once both persist.
    const voters = [];
    for (let i = 0; i < 2; i++) {
        const email = `integrity-voter-${i}@example.test`;
        const created = await api('POST', '/v3/users', token, {
            email, password: 'integrity-voter-password', name: `Voter ${i}`,
            role: 'admin', artistAccess: 'none', pageAccess: ['overview']
        });
        assert.equal(created.status, 200);
        voters.push(await login(email, 'integrity-voter-password'));
    }
    for (let i = 0; i < 4; i++) {
        const create = await api('POST', '/v3/anr/submissions', token, {
            artist: 'Integrity Race', track: `Trial ${i}`, url: 'https://example.test/track'
        });
        assert.equal(create.status, 200);
        const id = create.body.submission.id;
        const replies = await Promise.all(voters.map((t) => api('POST', `/v3/anr/submissions/${id}/vote`, t, { direction: 'up' })));
        for (const reply of replies) {
            assert.equal(reply.status, 200, `vote response ${JSON.stringify(reply)}`);
        }
        const listed = await api('GET', '/v3/anr/submissions', token);
        const stored = listed.body.submissions.find((s) => s.id === id);
        assert.equal(stored.votes, 2, `lost concurrent vote on trial ${i}: ${stored.votes}`);
    }

    // B1 last: object revenueSources used to unhandled-reject and shut the process down.
    const royalty = await api('POST', '/v3/royalties/calculate', token, {
        artistId: 'art_novakin', revenueSources: { streaming: true }
    });
    assert.ok(royalty.status >= 400 && royalty.status < 500, `royalty status ${royalty.status}`);
    await delay(100);
    const health = await api('GET', '/health');
    assert.equal(health.status, 200, `API died after malformed royalties: ${JSON.stringify(health)}`);
    assert.equal(child.exitCode, null);
    assert.equal(output.includes('[unhandledRejection]'), false);
});
