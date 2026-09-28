/**
 * tests/regression/durability.test.js
 *
 * PHASE 4CF — restart durability gate (Objective 3 & 4).
 *
 * Boots the canonical entrypoint twice against the SAME disposable SQLite
 * database (DB_STORAGE env — added this phase) and proves that customer
 * writes survive a process restart:
 *
 *   - artist create survives; detail/archive/restore keep working (the
 *     pre-fix behavior: list showed the artist, detail 404'd);
 *   - archive state is visible through detail after restart (the pre-fix
 *     split-brain: list said archived, detail said flagship);
 *   - A&R submissions and votes persist (were process memory);
 *   - sales entries drive projections after restart (were process memory);
 *   - audit events were written to the AuditEvents table for user/artist
 *     writes (the new minimal audit seam).
 *
 * The operator database is never touched: DB_STORAGE points at a temp file.
 */

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = process.env.DURABILITY_PORT || '3989';
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.join(ROOT, 'tests', 'snapshots', '.durability.sqlite');

const ENV = {
    ...process.env,
    PORT,
    NODE_ENV: 'test',
    JWT_SECRET: 'durability-probe-secret-1234567890',
    // Hermetic: an ambient ADMIN_EMAIL/ADMIN_PASS would flip login to the
    // override branch, mint id-less tokens, and break the audit-actor
    // assertions (actorId must be numeric for DB-branch logins).
    ADMIN_EMAIL: '',
    ADMIN_PASS: '',
    USE_REAL_DATA: 'false',
    DB_DIALECT: 'sqlite',
    DB_STORAGE: DB_FILE,
    GROQ_API_KEY: '',
    AUTO_PRINT: 'false',
    SCHEDULE_JOBS: 'false'
};

let child = null;

async function waitForHealth(timeoutMs = 40000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        // Fail fast if our child died (e.g. EADDRINUSE from an orphaned run):
        // never let the assertions silently hit a server we did not spawn.
        if (child && child.exitCode !== null) return false;
        try {
            const res = await fetch(`${BASE}/health`);
            if (res.ok) return true;
        } catch (_) { /* retry */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

async function boot() {
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
}

async function shutdown() {
    if (child) { child.kill('SIGKILL'); child = null; }
    await new Promise((r) => setTimeout(r, 300));
}

async function login(email, password) {
    const res = await fetch(`${BASE}/v3/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (!res.ok) return null;
    return (await res.json()).token || null;
}

async function api(token, method, pathname, body) {
    const res = await fetch(`${BASE}${pathname}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    let payload = null;
    try { payload = await res.json(); } catch (_) { /* non-JSON */ }
    return { status: res.status, body: payload, headers: res.headers };
}

before(async () => {
    try { if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE); } catch (_) { /* fresh */ }
});

after(async () => {
    await shutdown();
    try { if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE); } catch (_) { /* cleanup */ }
    try { fs.unlinkSync(`${DB_FILE}-journal`); } catch (_) { /* no journal */ }
    try { fs.unlinkSync(`${DB_FILE}-wal`); } catch (_) { /* no wal */ }
    try { fs.unlinkSync(`${DB_FILE}-shm`); } catch (_) { /* no shm */ }
});

test('artist, A&R, sales and audit state survive a full process restart', async () => {
    // ---------------- PHASE A: first boot, write everything ----------------
    await boot();
    const admin = await login('admin@pulsegrid.fm', 'admin123');
    assert.ok(admin, 'seeded admin logs in on the disposable DB');

    // Artist: create → detail → archive.
    const created = await api(admin, 'POST', '/v3/artists', { name: 'Durability Probe', tier: 'developing' });
    assert.strictEqual(created.status, 200, 'artist create succeeds');
    assert.strictEqual(created.body.artist.id, 'art_durabilityprobe');

    const detailPre = await api(admin, 'GET', '/v3/artists/art_durabilityprobe');
    assert.strictEqual(detailPre.status, 200, 'detail works pre-restart');
    assert.strictEqual(detailPre.body.tier, 'developing');

    const archived = await api(admin, 'POST', '/v3/artists/art_durabilityprobe/archive');
    assert.strictEqual(archived.status, 200, 'archive succeeds');

    // A&R submission + vote.
    const sub = await api(admin, 'POST', '/v3/anr/submissions', {
        artist: 'Durability Artist', track: 'Durability Track', url: 'https://example.com/d', genre: 'Techno'
    });
    assert.strictEqual(sub.status, 200, 'submission create succeeds');
    const subId = sub.body.submission.id;
    assert.ok(subId, 'submission has an id');

    const voted = await api(admin, 'POST', `/v3/anr/submissions/${subId}/vote`, { direction: 'up' });
    assert.strictEqual(voted.status, 200);
    assert.strictEqual(voted.body.votes, 1, 'vote counted');

    // Sales: three months for a seeded artist.
    for (const [month, amountCents] of [['2026-01', 1000], ['2026-02', 2000], ['2026-03', 3000]]) {
        const sale = await api(admin, 'POST', '/v3/analytics/sales', { artistId: 'art_lumenveil', month, amountCents });
        assert.strictEqual(sale.status, 200, `sale ${month} logged`);
    }

    // Ghost-artistId guard (F-7): sale for a nonexistent artist is rejected.
    const ghost = await api(admin, 'POST', '/v3/analytics/sales', { artistId: 'art_nope', month: '2026-04', amountCents: 9 });
    assert.strictEqual(ghost.status, 404, 'ghost artistId rejected');

    // Duplicate artist → 409 (F-4).
    const dup = await api(admin, 'POST', '/v3/artists', { name: 'Durability Probe', tier: 'developing' });
    assert.strictEqual(dup.status, 409, 'duplicate artist name rejected');

    // A user write for the audit seam.
    const userCreate = await api(admin, 'POST', '/v3/users', {
        email: 'durability-user@example.test', password: 'durability-pass-1', name: 'Durability User',
        role: 'viewer', artistAccess: 'none', pageAccess: ['overview']
    });
    assert.strictEqual(userCreate.status, 200, 'user created for audit coverage');

    const requestIdPre = (await api(admin, 'GET', '/v3/label/overview')).headers.get('x-request-id');
    assert.ok(requestIdPre, 'request id present on responses');

    // ---------------- RESTART against the same disposable DB ----------------
    await shutdown();
    await boot();

    const admin2 = await login('admin@pulsegrid.fm', 'admin123');
    assert.ok(admin2, 'seeded admin logs in after restart (users durable)');

    // Artist: detail resolves from the DB, showing the ARCHIVED state.
    const detailPost = await api(admin2, 'GET', '/v3/artists/art_durabilityprobe');
    assert.strictEqual(detailPost.status, 200, 'created artist detail survives restart');
    assert.strictEqual(detailPost.body.tier, 'archived', 'archive state survives restart (no split-brain)');
    assert.strictEqual(detailPost.body.status, 'archived');

    const listPost = await api(admin2, 'GET', '/v3/artists?search=Durability');
    assert.strictEqual(listPost.status, 200);
    assert.strictEqual(listPost.body.total, 1, 'created artist still listed after restart');
    assert.strictEqual(listPost.body.artists[0].tier, 'archived', 'list and detail AGREE after restart');

    // Restore works against the DB-backed record.
    const restored = await api(admin2, 'POST', '/v3/artists/art_durabilityprobe/restore');
    assert.strictEqual(restored.status, 200, 'restore works after restart');
    const detailRestored = await api(admin2, 'GET', '/v3/artists/art_durabilityprobe');
    assert.strictEqual(detailRestored.body.tier, 'developing', 'restore persisted');

    // A&R submission + its vote survived.
    const subs = await api(admin2, 'GET', '/v3/anr/submissions');
    assert.strictEqual(subs.status, 200);
    const persistedSub = subs.body.submissions.find((s) => s.id === subId);
    assert.ok(persistedSub, 'submission survives restart');
    assert.strictEqual(persistedSub.votes, 1, 'vote survives restart');

    // Sales drive projections after restart (no synthetic reversion).
    const proj = await api(admin2, 'GET', '/v3/analytics/projections?artistId=art_lumenveil');
    assert.strictEqual(proj.status, 200);
    assert.deepStrictEqual(proj.body.chartData.datasets[0].data.slice(0, 3), [1000, 2000, 3000],
        'logged sales drive projections after restart');

    // Deleted-user token revocation still holds across the restart boundary:
    // tokens are revalidated per request, so nothing special is needed — the
    // user row simply exists.
    const me = await api(admin2, 'GET', '/v3/auth/me');
    assert.strictEqual(me.status, 200);

    // ---------------- PHASE C: audit table verification (after shutdown) ----------------
    await shutdown();

    // The AuditEvents table must contain the representative writes. Read the
    // disposable SQLite file directly (the server is down, the file is ours).
    const sqlite3 = require('sqlite3');
    const rows = await new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY, (err) => {
            if (err) return reject(err);
            db.all(
                "SELECT action, resourceType, resourceId, labelSlug, actorId, requestId FROM AuditEvents ORDER BY id",
                (qerr, results) => {
                    db.close();
                    if (qerr) return reject(qerr);
                    resolve(results);
                }
            );
        });
    });

    const actions = rows.map((r) => r.action);
    for (const expected of ['user.create', 'artist.create', 'artist.archive', 'artist.restore']) {
        assert.ok(actions.includes(expected), `audit row for ${expected} exists (got: ${actions.join(', ')})`);
    }
    const artistCreate = rows.find((r) => r.action === 'artist.create');
    assert.strictEqual(artistCreate.labelSlug, 'pulsegrid', 'audit rows carry the active label slug');
    assert.strictEqual(artistCreate.resourceId, 'art_durabilityprobe');
    assert.strictEqual(typeof artistCreate.actorId, 'number', 'audit rows carry the acting user id');
    assert.ok(artistCreate.requestId, 'audit rows correlate to a request id');
});
