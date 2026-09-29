/**
 * tests/regression/integrity.test.js
 *
 * Pre-D0 failure-first coverage for the disposable integrity probes:
 *   B1  malformed royalties must 4xx without killing the API
 *   B2  rejected artist writes must not 200 / emit success audits
 *   B3  concurrent distinct-user votes must both persist
 *   FE-01 sales contract is {artistId, month, amount|amountCents}; old keys stay 400
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
        DEMO_MODE: 'true', // demo-seeded path (audit gap 2)
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

async function sql(statement, params = []) {
    const db = await new Promise((resolve, reject) => {
        const d = new sqlite3.Database(dbFile, (e) => (e ? reject(e) : resolve(d)));
    });
    try {
        return await new Promise((resolve, reject) => {
            db.all(statement, params, (e, rows) => (e ? reject(e) : resolve(rows)));
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

    // FE-01: mistaken client keys stay 400; the API contract is
    // artistId/month/amount|amountCents (integer cents, no float revenue).
    const oldKeys = await api('POST', '/v3/analytics/sales', token, {
        artistId: 'art_novakin', amount: 100, date: new Date().toISOString()
    });
    assert.equal(oldKeys.status, 400);
    assert.equal(oldKeys.body.error, 'Missing fields: artistId, month');

    const sale = await api('POST', '/v3/analytics/sales', token, {
        artistId: 'art_novakin', month: '2026-09', amountCents: 10000
    });
    assert.equal(sale.status, 200);
    assert.equal(sale.body.success, true);

    // $0 is a real sale (promo / write-off). A missing amount used to 400 it;
    // explicit zero must still be accepted.
    const zeroSale = await api('POST', '/v3/analytics/sales', token, {
        artistId: 'art_novakin', month: '2026-08', amountCents: 0
    });
    assert.equal(zeroSale.status, 200, `zero-amount sale rejected: ${JSON.stringify(zeroSale)}`);
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
        artistId: 'art_novakin', month: ['2026-09'], amountCents: 1
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

// MUS-001: integer-cents royalty split. Legs must always sum exactly to the
// total (no ±1c drift) across uneven splits; the NOVAKIN default figures are
// pinned; float and non-summing splits are rejected.
test('MUS-001: royalty legs sum exactly to the total across uneven splits', async () => {
    await boot();
    let token = await login();

    // Default 70/30 on art_novakin: exact pinned figures.
    const d = await api('POST', '/v3/royalties/calculate', token, { artistId: 'art_novakin' });
    assert.equal(d.status, 200, `default split status ${d.status}`);
    assert.equal(d.body.totalRevenueCents, 744251600);
    assert.equal(d.body.payoutCents.artist, 520976120);
    assert.equal(d.body.payoutCents.label, 223275480);
    assert.equal(d.body.payoutCents.artist + d.body.payoutCents.label, d.body.totalRevenueCents);

    // Uneven splits: exact sum, integer legs, echoed bps.
    for (const [a, l] of [[7001, 2999], [3333, 6667], [1, 9999], [9999, 1], [5000, 5000]]) {
        const r = await api('POST', '/v3/royalties/calculate', token, {
            artistId: 'art_novakin', splits: { artist: a, label: l }
        });
        assert.equal(r.status, 200, `split ${a}/${l} status ${r.status}`);
        assert.ok(Number.isInteger(r.body.payoutCents.artist), `artist leg not integer at ${a}/${l}`);
        assert.ok(Number.isInteger(r.body.payoutCents.label), `label leg not integer at ${a}/${l}`);
        assert.equal(r.body.payoutCents.artist + r.body.payoutCents.label, r.body.totalRevenueCents,
            `legs drift from total at split ${a}/${l}`);
        assert.deepEqual(r.body.splitsBps, { artist: a, label: l });
    }

    // Legacy float splits and non-summing bps are rejected.
    const f1 = await api('POST', '/v3/royalties/calculate', token, {
        artistId: 'art_novakin', splits: { artist: 0.7, label: 0.3 }
    });
    assert.equal(f1.status, 400, 'float splits must be rejected');
    const f2 = await api('POST', '/v3/royalties/calculate', token, {
        artistId: 'art_novakin', splits: { artist: 7000, label: 2000 }
    });
    assert.equal(f2.status, 400, 'non-summing bps must be rejected');
});

// SI-01: a bare non-number/non-object revenue value must be rejected with 400,
// never silently coerced to 0 (pre-fix it returned 200 with the stream at 0).
test('SI-01: bare invalid revenue value is rejected, not coerced to 0', async () => {
    await boot();
    const token = await login();
    const created = await api('POST', '/v3/artists', token, { name: 'Si01Invalid', tier: 'test' });
    assert.equal(created.status, 200, `create artist ${JSON.stringify(created.body)}`);
    const artistId = created.body.artist.id;
    const rows = await sql('SELECT data FROM Artists WHERE id = ?', [artistId]);
    const data = JSON.parse(rows[0].data);
    data.revenue.streaming = 'abc';
    await sql('UPDATE Artists SET data = ? WHERE id = ?', [JSON.stringify(data), artistId]);

    const r = await api('POST', '/v3/royalties/calculate', token, {
        artistId, revenueSources: ['streaming']
    });
    assert.equal(r.status, 400, `bare invalid revenue must 400, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.match(r.body.error, /invalid amount/);

    // A bare numeric string is likewise neither a dollar number nor an
    // { amount, currency } object, so it must also be rejected.
    data.revenue.streaming = '12.34';
    await sql('UPDATE Artists SET data = ? WHERE id = ?', [JSON.stringify(data), artistId]);
    const r2 = await api('POST', '/v3/royalties/calculate', token, {
        artistId, revenueSources: ['streaming']
    });
    assert.equal(r2.status, 400, `numeric-string revenue must 400, got ${r2.status}: ${JSON.stringify(r2.body)}`);
});

// SI-01: non-USD streams are flagged and excluded from the USD totals
// (flaggedStreams existed but had no regression coverage until now).
test('SI-01: non-USD revenue streams are flagged and excluded from USD totals', async () => {
    await boot();
    const token = await login();
    const created = await api('POST', '/v3/artists', token, { name: 'Si01Flagged', tier: 'test' });
    assert.equal(created.status, 200, `create artist ${JSON.stringify(created.body)}`);
    const artistId = created.body.artist.id;
    const rows = await sql('SELECT data FROM Artists WHERE id = ?', [artistId]);
    const data = JSON.parse(rows[0].data);
    data.revenue.streaming = { amount: 100, currency: 'EUR' };
    data.revenue.merch = 50;
    await sql('UPDATE Artists SET data = ? WHERE id = ?', [JSON.stringify(data), artistId]);

    const r = await api('POST', '/v3/royalties/calculate', token, {
        artistId, revenueSources: ['streaming', 'merch']
    });
    assert.equal(r.status, 200, `flagged-stream calc status ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.totalRevenueCents, 5000, 'EUR stream must be excluded from the USD total');
    assert.deepEqual(r.body.flaggedStreams, [{ source: 'streaming', currency: 'EUR', amount: 100 }]);
    assert.ok(!('streaming' in r.body.breakdownCents), 'flagged stream must not appear in breakdownCents');
    assert.equal(r.body.payoutCents.artist + r.body.payoutCents.label, r.body.totalRevenueCents);
});

// SI-01 extension: negative revenue values must be rejected with 400, never
// summed into the total.
test('SI-01: negative revenue value is rejected with 400', async () => {
    await boot();
    const token = await login();
    const created = await api('POST', '/v3/artists', token, { name: 'Si01Negative', tier: 'test' });
    assert.equal(created.status, 200, `create artist ${JSON.stringify(created.body)}`);
    const artistId = created.body.artist.id;
    const rows = await sql('SELECT data FROM Artists WHERE id = ?', [artistId]);
    const data = JSON.parse(rows[0].data);
    data.revenue.streaming = -12.34;
    await sql('UPDATE Artists SET data = ? WHERE id = ?', [JSON.stringify(data), artistId]);

    const r = await api('POST', '/v3/royalties/calculate', token, {
        artistId, revenueSources: ['streaming']
    });
    assert.equal(r.status, 400, `negative revenue must 400, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.match(r.body.error, /invalid amount/);
});

// SI-01 extension: a missing amount (null/undefined) is "no data" and
// legitimately stays 0 with a 200. (NaN/Infinity cannot round-trip through the
// JSON persistence layer, so they are covered by direct handler tests in
// tests/regression/si01-ext.test.js.)
test('SI-01: missing revenue amount stays 0 with a 200', async () => {
    await boot();
    const token = await login();
    const created = await api('POST', '/v3/artists', token, { name: 'Si01MissingAmount', tier: 'test' });
    assert.equal(created.status, 200, `create artist ${JSON.stringify(created.body)}`);
    const artistId = created.body.artist.id;
    const rows = await sql('SELECT data FROM Artists WHERE id = ?', [artistId]);
    const data = JSON.parse(rows[0].data);
    data.revenue.streaming = { currency: 'USD' };
    await sql('UPDATE Artists SET data = ? WHERE id = ?', [JSON.stringify(data), artistId]);
    const r = await api('POST', '/v3/royalties/calculate', token, {
        artistId, revenueSources: ['streaming']
    });
    assert.equal(r.status, 200, `missing amount must stay 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.breakdownCents.streaming, 0);
});
