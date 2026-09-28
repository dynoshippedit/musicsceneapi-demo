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
// Explicit repairs override only reviewed contracts; preserve the historical baseline.
const expectedSnapshot = () => ({ ...JSON.parse(fs.readFileSync(BASELINE, 'utf8')), ...JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/snapshots/repaired_contracts.json'), 'utf8')) });

let child;
const scratch = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mau5-snapshot-'));

const ENV = {
    ...process.env,
    PORT,
    NODE_ENV: 'test',
    JWT_SECRET: 'probe-fixed-secret-for-snapshot-determinism',
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

        const baseline = expectedSnapshot();
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
        const baseline = expectedSnapshot();
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

    test('malformed JSON body returns 400 with the exact error contract', async () => {
        const res = await fetch(`${BASE}/v3/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"email":'
        });
        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(await res.json(), { error: 'Malformed JSON body' });
        assert.ok(res.headers.get('x-request-id'), 'parser failures still carry X-Request-Id');
    });

    test('seeded logins work deterministically after boot (cold-start race fixed)', async () => {
        const admin = await login('admin@mau5trap.com', 'admin123');
        const artist = await login('tours@rezz.com', 'rezz123');
        assert.ok(admin, 'seeded admin must be able to log in');
        assert.ok(artist, 'seeded artist must be able to log in');
    });

    // Pre-Phase-4C Decision 1: pageAccess (frontend nav visibility, stored as
    // stringified JSON on User — models L50) is an ADDITIVE field on the DB
    // login response and on GET /v3/auth/me. Seeded values: admin ["all"],
    // artist ["overview","roster"] (models seed). Backend authorization does
    // not consult it; this pins only the response contract.
    async function loginBody(email, password) {
        const res = await fetch(`${BASE}/v3/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        assert.strictEqual(res.status, 200, `login ${email} must be 200`);
        return res.json();
    }

    test('POST /v3/auth/login returns pageAccess as the seeded array (Decision 1)', async () => {
        const admin = await loginBody('admin@mau5trap.com', 'admin123');
        assert.ok(Array.isArray(admin.user.pageAccess), 'admin login user.pageAccess must be an array');
        assert.deepStrictEqual(admin.user.pageAccess, ['all']);

        const artist = await loginBody('tours@rezz.com', 'rezz123');
        assert.ok(Array.isArray(artist.user.pageAccess), 'artist login user.pageAccess must be an array');
        assert.deepStrictEqual(artist.user.pageAccess, ['overview', 'roster']);

        // Additive: every pre-existing key is still present.
        for (const body of [admin, artist]) {
            assert.ok(body.token, 'token still issued');
            for (const k of ['id', 'name', 'email', 'role', 'artistAccess']) {
                assert.ok(k in body.user, `login user.${k} still present`);
            }
        }
    });

    test('GET /v3/auth/me returns pageAccess as the seeded array (Decision 1)', async () => {
        const cases = [
            ['admin@mau5trap.com', 'admin123', ['all']],
            ['tours@rezz.com', 'rezz123', ['overview', 'roster']]
        ];
        for (const [email, password, expected] of cases) {
            const token = await login(email, password);
            assert.ok(token, `${email} login must succeed`);
            const res = await fetch(`${BASE}/v3/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            assert.strictEqual(res.status, 200);
            const me = await res.json();
            assert.ok(Array.isArray(me.pageAccess), `/me pageAccess must be an array for ${email}`);
            assert.deepStrictEqual(me.pageAccess, expected);
            for (const k of ['id', 'email', 'name', 'role', 'artistAccess']) {
                assert.ok(k in me, `/me ${k} still present`);
            }
            // login and /me must agree on the same user's pageAccess.
            const loginUser = (await loginBody(email, password)).user;
            assert.deepStrictEqual(loginUser.pageAccess, me.pageAccess);
        }
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

    // Phase 4C: pageAccess WRITE path, required by the Admin permission editor.
    // Before the fix the reachable POST /v3/users (users.js L48) dropped pageAccess entirely,
    // and the reachable PUT /v3/users/:id assigned a raw array to the STRING column with no
    // try/catch — Sequelize's "string violation" escaped as an unhandled rejection and the
    // process-level handler shut the server down. These tests pin round-tripping AND, because
    // every later test in this file would fail against a dead server, liveness after the PUT.
    describe('pageAccess write path (Phase 4C admin permission editor)', () => {
        const probe = { email: 'phase4c-probe@example.test', password: 'probe-pass-123', name: 'Phase 4C Probe', role: 'viewer' };

        async function adminToken() {
            const token = await login('admin@mau5trap.com', 'admin123');
            assert.ok(token, 'admin login must succeed');
            return token;
        }

        async function listUser(token, email) {
            const res = await fetch(`${BASE}/v3/users`, { headers: { Authorization: `Bearer ${token}` } });
            assert.strictEqual(res.status, 200, 'GET /v3/users must stay 200');
            return (await res.json()).find((u) => u.email === email) || null;
        }

        test('POST /v3/users persists the supplied pageAccess instead of dropping it', async () => {
            const token = await adminToken();
            const res = await fetch(`${BASE}/v3/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...probe, artistAccess: 'none', pageAccess: ['overview', 'marketing', 'fans'] })
            });
            assert.strictEqual(res.status, 200);
            const created = await res.json();
            // The response shape is intentionally unchanged (snapshot case users_create_valid_shape):
            // the grant is verified by reading it back, not by an added response key.
            assert.ok(!('pageAccess' in created), 'POST response shape must stay byte-identical');

            const stored = await listUser(token, probe.email);
            assert.ok(stored, 'created user is listed');
            assert.deepStrictEqual(stored.pageAccess, ['overview', 'marketing', 'fans'], 'grant survives the round trip');
        });

        test('PUT /v3/users/:id stores pageAccess as an array and leaves the server alive', async () => {
            const token = await adminToken();
            const before = await listUser(token, probe.email);
            assert.ok(before, 'probe user exists from the previous test');

            const res = await fetch(`${BASE}/v3/users/${before.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ pageAccess: ['overview', 'operations'] })
            });
            assert.strictEqual(res.status, 200, 'PUT must succeed, not drop the connection');

            // Liveness: the pre-fix defect killed the process here, so /health is the assertion.
            const health = await fetch(`${BASE}/health`);
            assert.strictEqual(health.status, 200, 'server must survive a pageAccess update');

            const after = await listUser(token, probe.email);
            assert.deepStrictEqual(after.pageAccess, ['overview', 'operations'], 'updated grant is readable');
        });

        test('the edited user can still log in and /me agrees with the stored grant', async () => {
            const token = await login(probe.email, probe.password);
            assert.ok(token, 'edited user must still be able to log in');
            const res = await fetch(`${BASE}/v3/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual((await res.json()).pageAccess, ['overview', 'operations']);
        });

        test('a malformed pageAccess value is a 400, never a process exit', async () => {
            const token = await adminToken();
            const user = await listUser(token, probe.email);
            const res = await fetch(`${BASE}/v3/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ pageAccess: { not: 'an array' } })
            });
            assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
            const health = await fetch(`${BASE}/health`);
            assert.strictEqual(health.status, 200, 'server survives a malformed grant');
            const after = await listUser(token, probe.email);
            assert.deepStrictEqual(after.pageAccess, ['overview', 'operations'], 'corrupt grant must not overwrite stored array');
        });
    });
});

// ===========================================================================
// Phase 4CF — commercial foundation (CRUD truth, user lifecycle, seams)
// ===========================================================================
// These tests pin the fixes from the commercial audits: artistAccess no
// longer silently dropped on edit; the reachable DELETE has real guards; a
// deleted user's token dies at the auth middleware; every response carries a
// request id. They run against the same fresh-DB live server as the 4C suite.
describe('Phase 4CF — user CRUD truth and session safety', () => {
    const probe = { email: 'phase4cf-probe@example.test', password: 'probe-pass-456', name: 'Phase 4CF Probe', role: 'viewer' };

    async function adminToken() {
        const token = await login('admin@mau5trap.com', 'admin123');
        assert.ok(token, 'admin login must succeed');
        return token;
    }

    async function listUser(token, email) {
        const res = await fetch(`${BASE}/v3/users`, { headers: { Authorization: `Bearer ${token}` } });
        assert.strictEqual(res.status, 200, 'GET /v3/users must stay 200');
        return (await res.json()).find((u) => u.email === email) || null;
    }

    async function api(token, method, path, body) {
        const res = await fetch(`${BASE}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return res;
    }

    test('PUT /v3/users/:id persists artistAccess (F-1)', async () => {
        const token = await adminToken();

        const create = await api(token, 'POST', '/v3/users', { ...probe, artistAccess: 'none', pageAccess: ['overview'] });
        assert.strictEqual(create.status, 200, 'probe user creation must succeed');
        assert.ok(!('pageAccess' in await create.json()), 'create response shape unchanged');

        const created = await listUser(token, probe.email);
        assert.ok(created, 'probe user listed');
        assert.strictEqual(created.artistAccess, 'none');

        const update = await api(token, 'PUT', `/v3/users/${created.id}`, { name: probe.name, role: 'artist', artistAccess: 'art_rezz' });
        assert.strictEqual(update.status, 200, 'PUT must succeed');

        const health = await fetch(`${BASE}/health`);
        assert.strictEqual(health.status, 200, 'server alive after artistAccess edit');

        const stored = await listUser(token, probe.email);
        assert.strictEqual(stored.artistAccess, 'art_rezz', 'artistAccess grant survives the round trip');
        assert.strictEqual(stored.role, 'artist');
    });

    test('edited artistAccess agrees across login and /me', async () => {
        const token = await login(probe.email, probe.password);
        assert.ok(token, 'probe user logs in after edit');
        const meRes = await fetch(`${BASE}/v3/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        assert.strictEqual(meRes.status, 200);
        assert.strictEqual((await meRes.json()).artistAccess, 'art_rezz');
    });

    test('DELETE /v3/users/:id has real guards (F-2)', async () => {
        const token = await adminToken();

        // Nonexistent → 404 (matches PUT and the shadowed duplicate).
        const missing = await api(token, 'DELETE', '/v3/users/999999');
        assert.strictEqual(missing.status, 404);
        assert.deepStrictEqual(await missing.json(), { error: 'User not found' });

        // Root admin → 403.
        const users = await (await api(token, 'GET', '/v3/users')).json();
        const root = users.find((u) => u.email === 'admin@mau5trap.com');
        assert.ok(root, 'root admin present in list');
        const rootDel = await api(token, 'DELETE', `/v3/users/${root.id}`);
        assert.strictEqual(rootDel.status, 403, 'root admin cannot be deleted via the admin route');

        // Self-delete → 400 (tested with a NON-root admin: for the root
        // account the absolute root guard above wins with 403).
        const admin2 = { email: 'phase4cf-admin2@example.test', password: 'admin2-pass-789', name: 'Admin Two', role: 'admin' };
        const create2 = await api(token, 'POST', '/v3/users', { ...admin2, artistAccess: 'all', pageAccess: ['all'] });
        assert.strictEqual(create2.status, 200, 'second admin created');
        const admin2Token = await login(admin2.email, admin2.password);
        assert.ok(admin2Token, 'second admin logs in');
        const admin2Me = await (await fetch(`${BASE}/v3/auth/me`, { headers: { Authorization: `Bearer ${admin2Token}` } })).json();
        const selfDel = await api(admin2Token, 'DELETE', `/v3/users/${admin2Me.id}`);
        assert.strictEqual(selfDel.status, 400, 'admin cannot delete itself via the admin route');

        // Regular delete still works.
        const victim = await listUser(token, probe.email);
        assert.ok(victim, 'probe user exists');
        const del = await api(token, 'DELETE', `/v3/users/${victim.id}`);
        assert.strictEqual(del.status, 200);
        assert.strictEqual(await listUser(token, probe.email), null, 'deleted user gone from list');

        // Clean up the second admin so later tests' user counts stay sane.
        const admin2Row = await listUser(token, admin2.email);
        assert.ok(admin2Row, 'second admin listed');
        assert.strictEqual((await api(token, 'DELETE', `/v3/users/${admin2Row.id}`)).status, 200);
    });

    test('a deleted user\'s already-issued JWT stops authorizing (F-2 session tail)', async () => {
        const token = await adminToken();

        // Create + login a victim.
        const created = await api(token, 'POST', '/v3/users', { email: 'victim4cf@example.test', password: 'victim-pass-789', name: 'Victim', role: 'viewer', artistAccess: 'none', pageAccess: ['overview'] });
        assert.strictEqual(created.status, 200);
        const victimToken = await login('victim4cf@example.test', 'victim-pass-789');
        assert.ok(victimToken, 'victim can log in');

        // Token authorizes protected routes while the user exists.
        const before = await fetch(`${BASE}/v3/auth/me`, { headers: { Authorization: `Bearer ${victimToken}` } });
        assert.strictEqual(before.status, 200, 'victim token works pre-delete');

        // Admin deletes the victim.
        const users = await (await api(token, 'GET', '/v3/users')).json();
        const victimRow = users.find((u) => u.email === 'victim4cf@example.test');
        assert.ok(victimRow, 'victim row exists');
        const del = await api(token, 'DELETE', `/v3/users/${victimRow.id}`);
        assert.strictEqual(del.status, 200);

        // The SAME token must now be rejected at the auth middleware.
        const after = await fetch(`${BASE}/v3/auth/me`, { headers: { Authorization: `Bearer ${victimToken}` } });
        assert.strictEqual(after.status, 401, 'deleted user\'s token must stop authorizing protected routes');

        // And login is gone too.
        assert.strictEqual(await login('victim4cf@example.test', 'victim-pass-789'), null, 'deleted user cannot log in');
    });

    test('every response carries a request id (usage-attribution seam)', async () => {
        const res = await fetch(`${BASE}/health`);
        assert.strictEqual(res.status, 200);
        const requestId = res.headers.get('x-request-id');
        assert.ok(requestId, 'X-Request-Id header present');
        assert.match(requestId, /^[0-9a-f-]{36}$/i, 'request id is a uuid');

        // Ids differ per request.
        const res2 = await fetch(`${BASE}/health`);
        assert.notStrictEqual(res2.headers.get('x-request-id'), requestId, 'fresh id per request');
    });
});
