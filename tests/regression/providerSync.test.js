'use strict';

/**
 * tests/regression/providerSync.test.js
 *
 * Audit gap 5 — provider synchronization runner.
 *
 * Runner tests (in-process, scratch sqlite, injected fixture adapters,
 * zero network):
 *   - fixture execution when credentials are absent (labeled, no writes)
 *   - bounded retries with backoff, then terminal failure with sanitized
 *     error summary (no credential-shaped text persisted)
 *   - blocked status when the adapter cannot proceed
 *   - idempotency: same key never re-runs; concurrent 'running' row is a
 *     duplicate; stale 'running' rows are retaken
 *   - attempt history recorded per attempt
 *   - unknown provider/kind rejected
 *
 * HTTP tests (spawned DEMO_MODE server):
 *   - POST /v3/sync/run and GET /v3/sync/executions require admin (403
 *     for artist tokens)
 *   - admin trigger runs the fixture adapter and the execution appears in
 *     history
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'providersync-'));
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = path.join(scratch, 'sync.sqlite');
delete process.env.SPOTIFY_CLIENT_ID;
delete process.env.SPOTIFY_CLIENT_SECRET;
delete process.env.STRIPE_SECRET_KEY;

const { runProviderSync, createAdapters, sanitizeErrorSummary } = require('../../src/jobs/providerSync');
const models = require('../../src/models');

const noSleep = () => Promise.resolve();
const sleeps = [];
const recordingSleep = (ms) => { sleeps.push(ms); return Promise.resolve(); };

function fixtureAdapters() {
    return createAdapters({
        spotifyLib: { isConfigured: () => false },
        stripeLib: { getStripeClient: () => { throw new Error('should not be called in fixture mode'); } }
    });
}

describe('providerSync runner', () => {
    before(async () => {
        await models.sequelize.sync();
    });

    after(async () => {
        await models.sequelize.close();
        fs.rmSync(scratch, { recursive: true, force: true });
    });

    test('fixture execution when credentials are absent', async () => {
        const { execution, duplicate } = await runProviderSync({
            provider: 'spotify', kind: 'artist-stats',
            idempotencyKey: 'test-fixture-1', triggeredBy: 'test',
            models, adapters: fixtureAdapters(), sleep: noSleep,
            artists: [{ id: 'art_a' }, { id: 'art_b' }]
        });
        assert.strictEqual(duplicate, false);
        assert.strictEqual(execution.status, 'fixture');
        assert.strictEqual(execution.fixture, true);
        assert.ok(execution.finishedAt);
        assert.strictEqual(execution.attempts.length, 1);
        assert.strictEqual(execution.attempts[0].ok, true);
        assert.strictEqual(execution.resultSummary.fixture, true);
        assert.strictEqual(execution.resultSummary.artistsScanned, 2);
        assert.match(execution.resultSummary.note, /FIXTURE/);
    });

    test('retries are bounded, then terminal failure with sanitized error', async () => {
        let calls = 0;
        const adapters = {
            spotify: {
                isConfigured: () => true,
                run: async () => {
                    calls += 1;
                    throw new Error('boom token=secret-abc-123 sk_test_456');
                }
            }
        };
        const { execution } = await runProviderSync({
            provider: 'spotify', kind: 'artist-stats',
            idempotencyKey: 'test-retry-1', triggeredBy: 'test',
            models, adapters, sleep: recordingSleep, maxAttempts: 3
        });
        assert.strictEqual(calls, 3, 'exactly maxAttempts calls');
        assert.deepStrictEqual(sleeps.slice(-2), [1000, 2000], 'exponential backoff 1s, 2s');
        assert.strictEqual(execution.status, 'failed');
        assert.strictEqual(execution.attempt, 3);
        assert.strictEqual(execution.attempts.length, 3);
        assert.ok(execution.attempts.every((a) => a.ok === false));
        assert.doesNotMatch(execution.errorSummary, /secret-abc-123/);
        assert.doesNotMatch(execution.errorSummary, /sk_test_456/);
        assert.match(execution.errorSummary, /\[redacted\]/);
    });

    test('blocked status when the adapter cannot proceed', async () => {
        const adapters = {
            stripe: {
                isConfigured: () => true,
                run: async () => ({ blocked: 'no Stripe account connected' })
            }
        };
        const { execution } = await runProviderSync({
            provider: 'stripe', kind: 'sales-pull',
            idempotencyKey: 'test-blocked-1', triggeredBy: 'test',
            models, adapters, sleep: noSleep
        });
        assert.strictEqual(execution.status, 'blocked');
        assert.strictEqual(execution.errorSummary, 'no Stripe account connected');
        assert.ok(execution.finishedAt);
    });

    test('idempotency: same key never re-runs', async () => {
        let calls = 0;
        const adapters = {
            spotify: { isConfigured: () => true, run: async () => { calls += 1; return { ok: true }; } }
        };
        const opts = {
            provider: 'spotify', kind: 'artist-stats',
            idempotencyKey: 'test-idem-1', triggeredBy: 'test',
            models, adapters, sleep: noSleep
        };
        const first = await runProviderSync(opts);
        assert.strictEqual(first.duplicate, false);
        assert.strictEqual(first.execution.status, 'succeeded');
        const second = await runProviderSync(opts);
        assert.strictEqual(second.duplicate, true);
        assert.strictEqual(second.execution.id, first.execution.id);
        assert.strictEqual(calls, 1, 'adapter ran exactly once');
    });

    test('concurrent running row is a duplicate; stale running rows are retaken', async () => {
        const adapters = fixtureAdapters();
        // Simulate a live 'running' row.
        const live = await models.ProviderSyncExecution.create({
            idempotencyKey: 'test-running-1', provider: 'spotify', kind: 'artist-stats',
            status: 'running', attempt: 1, maxAttempts: 3, startedAt: new Date(), attempts: []
        });
        const dup = await runProviderSync({
            provider: 'spotify', kind: 'artist-stats', idempotencyKey: 'test-running-1',
            triggeredBy: 'test', models, adapters, sleep: noSleep
        });
        assert.strictEqual(dup.duplicate, true);
        assert.strictEqual(dup.execution.id, live.id);

        // Stale 'running' row (started 2h ago) is retaken.
        const stale = await models.ProviderSyncExecution.create({
            idempotencyKey: 'test-stale-1', provider: 'spotify', kind: 'artist-stats',
            status: 'running', attempt: 1, maxAttempts: 3,
            startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), attempts: []
        });
        const retaken = await runProviderSync({
            provider: 'spotify', kind: 'artist-stats', idempotencyKey: 'test-stale-1',
            triggeredBy: 'test', models, adapters: fixtureAdapters(), sleep: noSleep
        });
        assert.strictEqual(retaken.duplicate, false);
        assert.strictEqual(retaken.execution.id, stale.id);
        assert.strictEqual(retaken.execution.status, 'fixture');
    });

    test('unknown provider/kind rejected', async () => {
        await assert.rejects(
            runProviderSync({ provider: 'nope', kind: 'x', models, sleep: noSleep }),
            /unknown provider/
        );
        await assert.rejects(
            runProviderSync({ provider: 'spotify', kind: 'nope', models, sleep: noSleep }),
            /unknown kind/
        );
    });

    test('sanitizeErrorSummary redacts credential shapes', async () => {
        const s = sanitizeErrorSummary(new Error('bearer abc.def-ghi STRIPE key sk_live_12345 and api_key: hunter2!!'));
        assert.doesNotMatch(s, /abc\.def-ghi/);
        assert.doesNotMatch(s, /sk_live_12345/);
        assert.doesNotMatch(s, /hunter2/);
    });
});

// ---------------------------------------------------------------------------
// HTTP surface: permissions + history visibility (spawned server).
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 32203;
const BASE = `http://127.0.0.1:${PORT}`;

function serverEnv(dir) {
    return {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        DEMO_MODE: 'true', // demo-seeded path (audit gap 2)
        JWT_SECRET: 'test-secret-' + crypto.randomBytes(8).toString('hex'),
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(dir, 'http.sqlite'),
        DATABASE_URL: '',
        ADMIN_EMAIL: '', ADMIN_PASS: '',
        GROQ_API_KEY: '',
        AUTO_PRINT: 'false',
        SCHEDULE_JOBS: 'false',
        OAUTH_TOKEN_KEY: crypto.randomBytes(32).toString('hex')
    };
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

describe('providerSync HTTP surface', () => {
    let dir;
    let child;
    let adminToken;
    let artistToken;

    before(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'providersync-http-'));
        child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
            cwd: dir, env: serverEnv(dir), stdio: ['ignore', 'pipe', 'pipe']
        });
        child.stdout.resume();
        let err = '';
        child.stderr.on('data', (d) => { err += d.toString(); });
        if (!await waitForHealth()) {
            child.kill('SIGKILL');
            throw new Error('server.js (sync http) never became healthy.\n' + err.slice(0, 3000));
        }
        const login = async (email, password) => {
            const r = await fetch(`${BASE}/v3/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            assert.strictEqual(r.status, 200);
            return (await r.json()).token;
        };
        adminToken = await login('admin@pulsegrid.fm', 'admin123');
        artistToken = await login('tours@novakin.band', 'novakin123');
    });

    after(async () => {
        if (child && child.exitCode === null) child.kill('SIGKILL');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('non-admin cannot trigger or read sync history', async () => {
        const h = { Authorization: `Bearer ${artistToken}`, 'Content-Type': 'application/json' };
        const run = await fetch(`${BASE}/v3/sync/run`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ provider: 'spotify', kind: 'artist-stats' })
        });
        assert.strictEqual(run.status, 403);
        const hist = await fetch(`${BASE}/v3/sync/executions`, { headers: { Authorization: `Bearer ${artistToken}` } });
        assert.strictEqual(hist.status, 403);
    });

    test('unauthenticated requests are rejected', async () => {
        const run = await fetch(`${BASE}/v3/sync/run`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'spotify', kind: 'artist-stats' })
        });
        assert.ok([401, 403].includes(run.status), `expected 401/403, got ${run.status}`);
    });

    test('admin trigger runs fixture sync; history shows it', async () => {
        const h = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
        const key = `http-test-${Date.now()}`;
        const run = await fetch(`${BASE}/v3/sync/run`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ provider: 'spotify', kind: 'artist-stats', idempotencyKey: key })
        });
        assert.strictEqual(run.status, 200);
        const body = await run.json();
        assert.strictEqual(body.duplicate, false);
        assert.strictEqual(body.execution.status, 'fixture');
        assert.strictEqual(body.execution.fixture, true);
        assert.strictEqual(body.execution.idempotencyKey, key);

        // Duplicate trigger with the same key does not re-run.
        const dup = await fetch(`${BASE}/v3/sync/run`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ provider: 'spotify', kind: 'artist-stats', idempotencyKey: key })
        });
        assert.strictEqual((await dup.json()).duplicate, true);

        // History is visible, newest first.
        const hist = await fetch(`${BASE}/v3/sync/executions?provider=spotify`, { headers: { Authorization: `Bearer ${adminToken}` } });
        assert.strictEqual(hist.status, 200);
        const executions = (await hist.json()).executions;
        assert.ok(executions.length >= 1);
        assert.ok(executions.some((e) => e.idempotencyKey === key));
    });

    test('unknown provider/kind is a 400, not a 500', async () => {
        const run = await fetch(`${BASE}/v3/sync/run`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'nope', kind: 'x' })
        });
        assert.strictEqual(run.status, 400);
    });
});
