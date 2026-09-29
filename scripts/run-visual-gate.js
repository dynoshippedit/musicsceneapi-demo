#!/usr/bin/env node
'use strict';

// Runs the Phase 4B visual gate (web/validation/gate.mjs) against a fully
// self-hosted stack: a scratch API + scratch Vite on ephemeral ports with a
// throwaway sqlite database. No .env and no shared demo server are used.
//
// Why: the visual gate makes ~500 API requests per run and the product's
// /v3/ rate limiter (1000/hour per IP, src/config/index.js) makes back-to-back
// runs against the shared demo server non-deterministic (HTTP 429s mid-run).
// Owning the stack gives the gate a deterministic environment without touching
// the product's limiter or the already-running demo services.
//
// Usage:
//   node scripts/run-visual-gate.js                 # full gate, self-hosted
//   node scripts/run-visual-gate.js -- --static-only  # extra args go to gate.mjs
//
// The gate still honours BASE_URL / API_URL when set: if both are already set
// in the environment, this wrapper does NOT start servers and just runs the
// gate against them (i.e. the old "already-running servers" mode).

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const ROOT = path.resolve(__dirname, '..');
const delay = ms => new Promise(r => setTimeout(r, ms));

async function freePort() {
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise(r => socket.close(r));
    return port;
}

async function main() {
    const extraArgs = process.argv.includes('--') ? process.argv.slice(process.argv.indexOf('--') + 1) : [];

    // Already-running mode: both endpoints supplied -> just run the gate.
    if (process.env.BASE_URL && process.env.API_URL) {
        console.log(`run-visual-gate: using already-running servers BASE_URL=${process.env.BASE_URL} API_URL=${process.env.API_URL}`);
        const gate = spawn(process.execPath, [path.join(ROOT, 'web/validation/gate.mjs'), ...extraArgs], {
            cwd: path.join(ROOT, 'web'), stdio: 'inherit', env: process.env,
        });
        const [code] = await once(gate, 'exit');
        if (code !== 0) throw new Error(`Visual gate failed (${code})`);
        return;
    }

    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsegrid-visual-gate-'));
    const children = [];
    try {
        const apiPort = await freePort(), uiPort = await freePort();
        const common = { PATH: process.env.PATH, HOME: process.env.HOME };
        async function start(args, cwd, env, marker) {
            const child = spawn(process.execPath, args, { cwd, env: { ...common, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
            children.push(child);
            let output = '';
            const capture = data => { output = (output + data.toString()).slice(-16000); };
            child.stdout.on('data', capture);
            child.stderr.on('data', capture);
            const deadline = Date.now() + 60000;
            while (!output.includes(marker)) {
                if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Gate server failed to start\n${output}`);
                await delay(50);
            }
            console.log(`run-visual-gate: started pid ${child.pid} (${marker.trim().slice(0, 80)})`);
        }
        await start([path.join(ROOT, 'server.js')], scratch, {
            PORT: String(apiPort), NODE_ENV: 'development', DB_DIALECT: 'sqlite', DB_STORAGE: path.join(scratch, 'gate.sqlite'),
            JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'), DATABASE_URL: '',
            ADMIN_EMAIL: '', ADMIN_PASS: '', GROQ_API_KEY: '', SCHEDULE_JOBS: 'false', USE_REAL_DATA: 'false',
            SMTP_HOST: '', SMTP_PASS: '', SENDGRID_API_KEY: '', AUTO_PRINT: 'false',
            // DEMO_MODE (2026-09-29, audit gap 2): the gate exercises the
            // demo journey (demo logins, seeded artists), so the scratch API
            // must boot with the fictional demo dataset seeded. Without this
            // the scratch database boots empty and every demo login 401s.
            DEMO_MODE: 'true'
        }, `Server: http://localhost:${apiPort}`);
        await start([path.join(ROOT, 'web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], path.join(ROOT, 'web'), {
            VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}`
        }, `http://127.0.0.1:${uiPort}`);
        const gate = spawn(process.execPath, [path.join(ROOT, 'web/validation/gate.mjs'), ...extraArgs], {
            cwd: path.join(ROOT, 'web'), stdio: 'inherit',
            env: { ...common, BASE_URL: `http://127.0.0.1:${uiPort}`, API_URL: `http://127.0.0.1:${apiPort}` },
        });
        children.push(gate);
        const [code] = await once(gate, 'exit');
        if (code !== 0) throw new Error(`Visual gate failed (${code})`);
        console.log('run-visual-gate: gate passed');
    } finally {
        // Exact-PID teardown, newest first. Never broad kills.
        for (const child of children.reverse()) {
            if (child.exitCode !== null || child.signalCode !== null) continue;
            const exited = once(child, 'exit');
            child.kill('SIGTERM');
            await Promise.race([exited, delay(3000)]);
            if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
        }
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
