#!/usr/bin/env node
'use strict';

// Own both listeners and a throwaway database. No .env or operator server is used.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const ROOT = path.resolve(__dirname, '..');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function freePort() {
    const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
    const port = socket.address().port; await new Promise(r => socket.close(r)); return port;
}
async function main() {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsegrid-browser-'));
    const children = [];
    try {
        const apiPort = await freePort(), uiPort = await freePort();
        const common = { PATH: process.env.PATH, HOME: process.env.HOME };
        async function start(args, cwd, env, marker) {
            const child = spawn(process.execPath, args, { cwd, env: { ...common, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
            children.push(child); let output = '';
            const capture = data => { output = (output + data.toString()).slice(-16000); };
            child.stdout.on('data', capture); child.stderr.on('data', capture);
            const deadline = Date.now() + 30000;
            while (!output.includes(marker)) {
                if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Workflow server failed to start\n${output}`);
                await delay(50);
            }
        }
        await start([path.join(ROOT, 'server.js')], scratch, {
            PORT: String(apiPort), NODE_ENV: 'development', DB_DIALECT: 'sqlite', DB_STORAGE: path.join(scratch, 'test.sqlite'),
            JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'), DATABASE_URL: '',
            ADMIN_EMAIL: '', ADMIN_PASS: '', GROQ_API_KEY: '', SCHEDULE_JOBS: 'false', USE_REAL_DATA: 'false',
            SMTP_HOST: '', SMTP_PASS: '', SENDGRID_API_KEY: '', AUTO_PRINT: 'false'
        }, `Server: http://localhost:${apiPort}`);
        await start([path.join(ROOT, 'web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], path.join(ROOT, 'web'), {
            VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}`
        }, `http://127.0.0.1:${uiPort}`);
        const workflow = spawn(process.execPath, [path.join(ROOT, 'execution-validation/repair-2026-09-18/workflows.mjs')], {
            cwd: ROOT, stdio: 'inherit', env: { ...common, WORKFLOW_API: `http://127.0.0.1:${apiPort}`, WORKFLOW_UI: `http://127.0.0.1:${uiPort}`,
                WORKFLOW_OUTPUT: path.join(ROOT, 'execution-validation/browser-workflows'), WORKFLOW_OFFLINE: '1' }
        });
        children.push(workflow);
        const [code] = await once(workflow, 'exit');
        if (code !== 0) throw new Error(`Browser workflows failed (${code}); see execution-validation/browser-workflows/workflow-results.json`);
    } finally {
        for (const child of children.reverse()) {
            if (child.exitCode !== null || child.signalCode !== null) continue;
            const exited = once(child, 'exit'); child.kill('SIGTERM');
            await Promise.race([exited, delay(3000)]);
            if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
        }
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
