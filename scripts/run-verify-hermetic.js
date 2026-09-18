#!/usr/bin/env node
/**
 * scripts/run-verify-hermetic.js
 *
 * Step 2 — spawn server.js against a throwaway SQLite file, run the existing
 * 54-check verifier against that child, then tear everything down.
 *
 * Does not edit tests/support/verify_phase2.js. Passes an absolute BASE URL
 * (verify_phase2.js uses argv[2] verbatim). Never opens the operator database.
 */

'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.HERMETIC_PORT || 3971);
const BASE = `http://127.0.0.1:${PORT}`;
const VERIFY = path.join(ROOT, 'tests', 'support', 'verify_phase2.js');
const SERVER = path.join(ROOT, 'server.js');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function assertPortFree(port) {
    const s = net.createServer();
    try {
        await new Promise((resolve, reject) => {
            s.once('error', reject);
            s.listen(port, '127.0.0.1', resolve);
        });
    } catch (err) {
        if (err && err.code === 'EADDRINUSE') {
            throw new Error(
                `hermetic verify: port ${port} is already in use; refusing to probe a foreign listener`
            );
        }
        throw err;
    } finally {
        await new Promise((resolve) => s.close(resolve));
    }
}

function unlinkDb(dbFile) {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
        try { fs.unlinkSync(dbFile + suffix); } catch (_) { /* absent */ }
    }
}

async function main() {
    if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
        throw new Error(`hermetic verify: invalid HERMETIC_PORT ${process.env.HERMETIC_PORT}`);
    }
    await assertPortFree(PORT);

    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mau5-verify-hermetic-'));
    const dbFile = path.join(scratch, 'verify.sqlite');
    const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'test',
        PORT: String(PORT),
        DB_DIALECT: 'sqlite',
        DB_STORAGE: dbFile,
        DATABASE_URL: '',
        LABEL_SLUG: 'mau5trap',
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
        SENDGRID_API_KEY: '',
        ALLOWED_ORIGINS: ''
    };

    let child = null;
    let output = '';
    let verifyCode = 1;

    try {
        child = spawn(process.execPath, [SERVER], {
            cwd: scratch,
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const onChunk = (buf) => { output += buf.toString(); };
        child.stdout.on('data', onChunk);
        child.stderr.on('data', onChunk);

        const until = Date.now() + 30000;
        const marker = `Server: http://localhost:${PORT}`;
        while (!output.includes(marker)) {
            if (child.exitCode !== null || child.signalCode !== null) {
                const why = child.exitCode !== null ? `exit ${child.exitCode}` : `signal ${child.signalCode}`;
                throw new Error(
                    `hermetic verify: child died (${why}) before announcing ${marker}\n${output.slice(-4000)}`
                );
            }
            if (Date.now() > until) {
                throw new Error(
                    `hermetic verify: timed out waiting for this child's listener on ${PORT}\n${output.slice(-4000)}`
                );
            }
            await delay(50);
        }

        if (child.exitCode !== null) {
            throw new Error('hermetic verify: child exited after announcing listen');
        }

        let health;
        try {
            health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
        } catch (err) {
            throw new Error(`hermetic verify: this child's /health was unreachable: ${err.message}`);
        }
        if (health.status !== 200) {
            throw new Error(`hermetic verify: this child's /health returned ${health.status}`);
        }

        const verify = spawn(process.execPath, [VERIFY, BASE], {
            cwd: ROOT,
            stdio: 'inherit',
            env: { PATH: process.env.PATH, HOME: process.env.HOME }
        });
        const [code] = await once(verify, 'exit');
        verifyCode = code === null ? 1 : code;
    } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit');
            child.kill('SIGTERM');
            await Promise.race([exited, delay(5000)]);
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }
        unlinkDb(dbFile);
        try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
    }

    process.exit(verifyCode);
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
});
