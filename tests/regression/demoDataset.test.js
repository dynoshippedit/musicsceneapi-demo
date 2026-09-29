'use strict';

/**
 * tests/regression/demoDataset.test.js
 *
 * Audit gap 4 — versioned deterministic demo dataset.
 *
 * Loads demo/dataset-v1 against a scratch DEMO_MODE server and proves:
 *   - import counts match expected.json (matched, unmatched, invalid,
 *     superseded)
 *   - unmatched rows are rejected and NEVER persisted
 *   - the revised statement supersedes the initial as a unit
 *   - review states land as expected (1 disputed, 2 approved)
 *   - trusted reconciliation totals exclude disputed amounts
 *   - a second load is idempotent (no new lines, same counts)
 *   - the approved financial CSV export contains the approved rows
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const DATASET = require('../../demo/dataset-v1/load.js');
const PORT = 32202;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'admin@pulsegrid.fm';
const PASSWORD = 'admin123';

function childEnv(scratch) {
    return {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        DEMO_MODE: 'true', // demo-seeded path (audit gap 2)
        JWT_SECRET: 'test-secret-' + crypto.randomBytes(8).toString('hex'),
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(scratch, 'dataset.sqlite'),
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

async function login() {
    const res = await fetch(`${BASE}/v3/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });
    assert.strictEqual(res.status, 200, 'demo login must work');
    return (await res.json()).token;
}

async function datasetLines(token) {
    const res = await fetch(`${BASE}/v3/royalties/lines?source=demo-dataset-v1`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    return res.json();
}

describe('demo dataset v1', () => {
    let scratch;
    let child;
    let token;

    before(async () => {
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dataset-v1-'));
        child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
            cwd: scratch, env: childEnv(scratch), stdio: ['ignore', 'pipe', 'pipe']
        });
        child.stdout.resume();
        let err = '';
        child.stderr.on('data', (d) => { err += d.toString(); });
        if (!await waitForHealth()) {
            child.kill('SIGKILL');
            throw new Error('server.js (dataset v1) never became healthy.\n' + err.slice(0, 3000));
        }
        token = await login();
    });

    after(async () => {
        if (child && child.exitCode === null) child.kill('SIGKILL');
        fs.rmSync(scratch, { recursive: true, force: true });
    });

    test('first load matches expected.json', async () => {
        const summary = await DATASET.load({ base: BASE, email: EMAIL, password: PASSWORD, assertExpected: true });
        assert.strictEqual(summary.result, 'ok');
        const lines = await datasetLines(token);
        assert.strictEqual(lines.filter((l) => l.reviewState !== 'superseded').length, 5);
    });

    test('unmatched rows are rejected, never persisted', async () => {
        const lines = await datasetLines(token);
        const unmatched = lines.filter((l) => l.catalogKey === 'ZZAAA2699999');
        assert.strictEqual(unmatched.length, 0, 'unmatched ISRC must have zero persisted lines');
    });

    test('revised statement superseded the initial as a unit', async () => {
        const lines = await datasetLines(token);
        const july = lines.filter((l) => l.period === '2026-07');
        assert.strictEqual(july.filter((l) => l.reviewState === 'superseded').length, 3);
        assert.strictEqual(july.filter((l) => l.reviewState !== 'superseded').length, 3);
        const revised = july.find((l) => l.catalogKey === 'ZZAAA2600001' && l.reviewState !== 'superseded');
        assert.strictEqual(revised.amountCents, 14000, 'the revised amount (140.00) is the active one');
    });

    test('review states: 1 disputed, 2 approved', async () => {
        const lines = await datasetLines(token);
        const active = lines.filter((l) => l.reviewState !== 'superseded');
        assert.strictEqual(active.filter((l) => l.reviewState === 'disputed').length, 1);
        assert.strictEqual(active.filter((l) => l.reviewState === 'approved').length, 2);
    });

    test('second load is idempotent', async () => {
        const before = await datasetLines(token);
        const summary = await DATASET.load({ base: BASE, email: EMAIL, password: PASSWORD, assertExpected: true });
        assert.strictEqual(summary.result, 'ok');
        assert.ok(summary.steps.some((s) => s.name === 'imports' && s.skipped), 'imports must be skipped on re-run');
        const after = await datasetLines(token);
        assert.strictEqual(after.length, before.length, 'no new lines on second load');
        assert.deepStrictEqual(
            after.map((l) => [l.catalogKey, l.period, l.reviewState, l.amountCents]).sort(),
            before.map((l) => [l.catalogKey, l.period, l.reviewState, l.amountCents]).sort()
        );
    });

    test('approved export contains the approved rows', async () => {
        const res = await fetch(`${BASE}/v3/financials/export?format=csv`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.strictEqual(res.status, 200);
        const csv = await res.text();
        assert.ok(csv.includes('ZZAAA2600001'), 'export contains the approved August line');
        assert.ok(csv.includes('888880000001'), 'export contains the approved August UPC line');
    });
});
