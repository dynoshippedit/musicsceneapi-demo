/**
 * tests/regression/snapshot.test.js
 *
 * Behavioral equivalence gate for the refactor.
 *
 * Compares a live probe of the canonical entrypoint against
 * tests/snapshots/phase2_baseline.json — 91 request cases captured from the
 * working application BEFORE the Phase 2 decomposition (and itself proven
 * equivalent to unmodified git HEAD during Phase 1).
 *
 * 77 of the 91 cases are byte-compared. The remaining 14 are nondeterministic
 * in the ORIGINAL code (Math.random(), Date.now()-derived ids, timing) and are
 * listed in tests/support/cases.js; for those only the STATUS CODE and
 * top-level shape are asserted.
 *
 * Run: npm test
 */

'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CASES, NONDETERMINISTIC } = require('../support/cases');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = process.env.TEST_PORT || '3998';
const BASE = `http://127.0.0.1:${PORT}`;
const BASELINE = path.join(ROOT, 'tests', 'snapshots', 'phase2_baseline.json');

let child;
let dbBackup = null;

const ENV = {
    ...process.env,
    PORT,
    NODE_ENV: 'test',
    JWT_SECRET: 'probe-fixed-secret-for-snapshot-determinism',
    USE_REAL_DATA: 'false',
    DB_DIALECT: 'sqlite',
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
    const dbFile = path.join(ROOT, 'mau5trap_v5.sqlite');
    if (fs.existsSync(dbFile)) {
        dbBackup = `${dbFile}.test-backup`;
        fs.renameSync(dbFile, dbBackup);
    }

    child = spawn(process.execPath, ['server.js'], {
        cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe']
    });
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
    const dbFile = path.join(ROOT, 'mau5trap_v5.sqlite');
    try { if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile); } catch (_) {}
    if (dbBackup) { try { fs.renameSync(dbBackup, dbFile); } catch (_) {} }
});

async function login(email, password) {
    const res = await fetch(`${BASE}/v3/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (!res.ok) return null;
    return (await res.json()).token || null;
}

describe('behavioral equivalence with the pre-refactor baseline', () => {
    test('baseline snapshot exists and covers the full case catalogue', () => {
        assert.ok(fs.existsSync(BASELINE), 'tests/snapshots/phase2_baseline.json must exist');
        const snap = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
        assert.strictEqual(snap.__meta.caseCount, CASES.length,
            'baseline was captured with a different number of cases — recapture it');
    });

    test('live probe matches the baseline for every deterministic case', async () => {
        const probe = path.join(ROOT, 'tests', 'support', 'probe.js');
        const out = path.join(ROOT, 'tests', 'snapshots', '.live.json');

        await new Promise((resolve, reject) => {
            const p = spawn(process.execPath, [probe, 'server.js', out], {
                cwd: ROOT,
                env: { ...ENV, PROBE_PORT: '3997' },
                stdio: 'inherit'
            });
            p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`probe exited ${code}`))));
        });

        const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
        const live = JSON.parse(fs.readFileSync(out, 'utf8'));

        const mismatches = [];
        for (const key of Object.keys(baseline)) {
            if (key === '__meta' || NONDETERMINISTIC.has(key)) continue;
            if (JSON.stringify(baseline[key]) !== JSON.stringify(live[key])) {
                mismatches.push({ key, baseline: baseline[key], live: live[key] });
            }
        }

        assert.deepStrictEqual(
            mismatches.map((m) => m.key), [],
            'Response drift vs pre-refactor baseline:\n' + JSON.stringify(mismatches, null, 2).slice(0, 6000)
        );
    });

    test('status codes match the baseline on ALL cases, including nondeterministic ones', () => {
        const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
        const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'snapshots', '.live.json'), 'utf8'));
        const bad = Object.keys(baseline)
            .filter((k) => k !== '__meta')
            .filter((k) => baseline[k].status !== live[k].status)
            .map((k) => `${k}: ${baseline[k].status} -> ${live[k].status}`);
        assert.deepStrictEqual(bad, [], `status drift:\n${bad.join('\n')}`);
    });

    test('nondeterministic endpoints still return the right status and shape', async () => {
        const token = await login('admin@mau5trap.com', 'admin123');
        assert.ok(token, 'admin login must succeed');

        const proj = await fetch(`${BASE}/v3/analytics/projections`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.strictEqual(proj.status, 200);
        assert.ok('chartData' in await proj.json(), 'projections must return chartData');

        const integ = await fetch(`${BASE}/v3/integrations/status`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.strictEqual(integ.status, 200);
        assert.ok(Array.isArray((await integ.json()).services), 'integrations must return services[]');
    });
});

describe('canonical entrypoint', () => {
    test('GET /health responds with the documented contract', async () => {
        const res = await fetch(`${BASE}/health`);
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.status, 'operational');
        assert.strictEqual(body.version, '3.0-production');
        assert.ok(body.timestamp, 'timestamp present');
    });

    test('unknown routes return the 404 contract unchanged', async () => {
        const res = await fetch(`${BASE}/v3/no-such-endpoint`);
        assert.strictEqual(res.status, 404);
        assert.deepStrictEqual(await res.json(), {
            error: 'Endpoint not found',
            path: '/v3/no-such-endpoint'
        });
    });

    test('seeded logins work deterministically after boot (cold-start race fixed)', async () => {
        const admin = await login('admin@mau5trap.com', 'admin123');
        const artist = await login('tours@rezz.com', 'rezz123');
        assert.ok(admin, 'seeded admin must be able to log in');
        assert.ok(artist, 'seeded artist must be able to log in');
    });

    test('database reads work through the repository layer', async () => {
        const token = await login('admin@mau5trap.com', 'admin123');
        const res = await fetch(`${BASE}/v3/artists?limit=5`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.total, 29, 'all 29 artists resolve via DB + mock union');
        assert.strictEqual(body.artists.length, 5, 'limit is honoured');
    });

    test('CSV export works end to end (exercises flattenData/filterMetrics)', async () => {
        const token = await login('admin@mau5trap.com', 'admin123');
        const res = await fetch(`${BASE}/v3/exports?format=csv&artistId=art_deadmau5`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.strictEqual(res.status, 200);
        assert.match(res.headers.get('content-type'), /text\/csv/);
        assert.ok((await res.text()).length > 100, 'CSV payload is non-trivial');
    });
});
