#!/usr/bin/env node
/**
 * tests/support/probe.js
 *
 * Boots a server entrypoint as a child process, replays the shared case
 * catalogue (tests/support/cases.js) against it, and writes a normalized
 * JSON snapshot.
 *
 * Used to prove behavioral equivalence across refactoring phases.
 * Usage: node tests/support/probe.js <entrypoint.js> <output.json>
 *
 * Cases run in order against ONE server process so that stateful sequences
 * (create -> list -> vote -> stats) characterize the in-memory stores.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CASES } = require('./cases');

const ENTRY = process.argv[2];
const OUT = process.argv[3];
const PORT = process.env.PROBE_PORT || '3999';
const BASE = `http://127.0.0.1:${PORT}`;

// Deterministic env shared by every probe run.
const ENV = {
    ...process.env,
    PORT,
    NODE_ENV: 'test',
    JWT_SECRET: 'probe-fixed-secret-for-snapshot-determinism',
    ADMIN_EMAIL: '', ADMIN_PASS: '', DATABASE_URL: '', SCHEDULE_JOBS: 'false',
    USE_REAL_DATA: 'false',
    DB_DIALECT: 'sqlite',
    GROQ_API_KEY: '',
    AUTO_PRINT: 'false'
};

/** Keys whose values are inherently non-deterministic across runs. */
const VOLATILE_KEYS = new Set([
    'timestamp', 'auditDate', 'lastUpdated', 'generatedAt', 'recordedAt',
    'submittedAt', 'updatedAt', 'createdAt', 'date', 'expiresAt', 'lastSync',
    'id', 'demoId', 'campaignId', 'downloadUrl', 'filepath', 'generated'
]);

function scrubVolatile(value, depth = 0) {
    if (depth > 14 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => scrubVolatile(v, depth + 1));
    const out = {};
    for (const k of Object.keys(value)) {
        out[k] = VOLATILE_KEYS.has(k) ? '<VOLATILE>' : scrubVolatile(value[k], depth + 1);
    }
    return out;
}

function normalize(value, depth = 0) {
    if (depth > 14) return '<deep>';
    if (value === undefined) return '<undefined>';
    if (value === null) return null;
    if (Array.isArray(value)) return value.map((v) => normalize(v, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value).sort()) out[k] = normalize(value[k], depth + 1);
        return out;
    }
    if (typeof value === 'string') {
        if (/^ey[A-Za-z0-9_-]+\./.test(value)) return '<JWT>';
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return '<ISO_TIMESTAMP>';
        return value;
    }
    return value;
}

async function waitForHealth(timeoutMs = 40000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${BASE}/health`);
            if (res.ok) return true;
        } catch (_) { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

async function login(email, password) {
    try {
        const res = await fetch(`${BASE}/v3/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!res.ok) return null;
        return (await res.json()).token || null;
    } catch (_) {
        return null;
    }
}

async function runCase(c, tokens) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = c.token || (c.useToken ? tokens[c.useToken] : null);
    if (tok) headers.Authorization = `Bearer ${tok}`;

    try {
        const res = await fetch(BASE + c.path, {
            method: c.method,
            headers,
            body: c.body !== undefined ? JSON.stringify(c.body) : undefined
        });
        const ctype = (res.headers.get('content-type') || '').split(';')[0];
        let body;
        if (ctype === 'application/json') {
            body = normalize(scrubVolatile(await res.json()));
        } else {
            const txt = await res.text();
            // Byte length of binary/CSV payloads varies with volatile content,
            // so record type and a coarse size bucket instead of exact bytes.
            body = { __nonJson: ctype, __sizeBucket: Math.floor(Buffer.byteLength(txt) / 500) };
        }
        return { status: res.status, contentType: ctype, body };
    } catch (err) {
        return { transportError: err.message };
    }
}

async function run() {
    if (!ENTRY || !OUT) {
        console.error('usage: node tests/support/probe.js <entrypoint.js> <output.json>');
        process.exit(2);
    }

    const scratch = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mau5-probe-'));
    const child = spawn(process.execPath, [path.resolve(ENTRY)], {
        env: { ...ENV, DB_STORAGE: path.join(scratch, 'test.sqlite') }, cwd: scratch, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const up = await waitForHealth();
    if (!up) {
        child.kill('SIGKILL');
        console.error('[probe] server never became healthy');
        console.error('--- stdout ---\n' + stdout.slice(0, 4000));
        console.error('--- stderr ---\n' + stderr.slice(0, 4000));
        await new Promise(r => child.once('exit', r));
        fs.rmSync(scratch, { recursive: true, force: true });
        process.exit(1);
    }

    // Acquire tokens up front so ordering of stateful cases is preserved.
    const tokens = {
        admin: await login('admin@mau5trap.com', 'admin123'),
        artist: await login('tours@rezz.com', 'rezz123')
    };

    const results = {};
    for (const c of CASES) {
        results[c.name] = await runCase(c, tokens);
    }

    results.__meta = {
        adminTokenObtained: !!tokens.admin,
        artistTokenObtained: !!tokens.artist,
        entry: path.basename(ENTRY),
        caseCount: CASES.length
    };

    child.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 250));

    fs.writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n');
    console.log(`[probe] wrote ${OUT} (${CASES.length} cases)`);

    fs.rmSync(scratch, { recursive: true, force: true });
}

run().catch((e) => { console.error(e); process.exit(1); });
