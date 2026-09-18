'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'review-fixes-test-secret';
const ROOT = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mau5-repairs-'));
const { repairSalesSchema } = require('../../src/models/migrations');
const delay = ms => new Promise(r => setTimeout(r, ms));
let child, base;
async function shutdown() {
    if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
}
after(async () => { await shutdown(); fs.rmSync(scratch, { recursive: true, force: true }); });
async function boot() {
    const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
    const port = socket.address().port; await new Promise(r => socket.close(r));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: scratch, stdio: ['ignore', 'pipe', 'pipe'], env: {
        PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), NODE_ENV: 'development',
        JWT_SECRET: process.env.JWT_SECRET, DB_DIALECT: 'sqlite', DB_STORAGE: path.join(scratch, 'test.sqlite'),
        DATABASE_URL: '', ADMIN_EMAIL: '', ADMIN_PASS: '', SCHEDULE_JOBS: 'false', USE_REAL_DATA: 'false', GROQ_API_KEY: '',
        SMTP_HOST: '', SMTP_PASS: '', SENDGRID_API_KEY: '', AUTO_PRINT: 'false'
    } });
    let output = ''; const capture = d => { output += d.toString(); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const deadline = Date.now() + 30000;
    while (!output.includes(`Server: http://localhost:${port}`)) {
        if (child.exitCode !== null || Date.now() > deadline) throw new Error(output.slice(-3000));
        await delay(50);
    }
}
async function api(token, method, route, body) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
}
async function login(email = 'admin@mau5trap.com', password = 'admin123') {
    const result = await api(null, 'POST', '/v3/auth/login', { email, password }); assert.equal(result.status, 200); return result.body.token;
}

test('sales migration preserves rows and enforces only the artist/month pair across restarts', async () => {
    const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    try {
        await db.query('CREATE TABLE SalesEntries (id INTEGER PRIMARY KEY AUTOINCREMENT, artistId TEXT NOT NULL UNIQUE, month TEXT NOT NULL UNIQUE, revenue FLOAT NOT NULL)');
        await db.query("INSERT INTO SalesEntries VALUES (17,'a','2026-01',25)");
        assert.equal(await repairSalesSchema(db), true);
        assert.deepEqual((await db.query('SELECT * FROM SalesEntries'))[0], [{ id: 17, artistId: 'a', month: '2026-01', revenue: 25 }]);
        await db.query("INSERT INTO SalesEntries(artistId,month,revenue) VALUES ('a','2026-02',0),('b','2026-01',75)");
        assert.equal(await repairSalesSchema(db), false);
        await assert.rejects(db.query("INSERT INTO SalesEntries(artistId,month,revenue) VALUES ('a','2026-01',99)"), /Validation error/);
        assert.equal((await db.query('SELECT COUNT(*) AS n FROM SalesEntries'))[0][0].n, 3);
    } finally { await db.close(); }
});

test('sales migration refuses unknown columns without dropping data', async () => {
    const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    try {
        await db.query('CREATE TABLE SalesEntries (id INTEGER PRIMARY KEY, artistId TEXT UNIQUE, month TEXT, revenue FLOAT, memo TEXT)');
        await db.query("INSERT INTO SalesEntries VALUES(1,'a','2026-01',1,'keep me')");
        await assert.rejects(repairSalesSchema(db), /refusing a lossy migration/);
        assert.equal((await db.query('SELECT memo FROM SalesEntries'))[0][0].memo, 'keep me');
    } finally { await db.close(); }
});

test('AI authorizes before reading a warmed cache and scopes label context to current grants', async () => {
    const { createAiService } = require('../../src/ai/aiService');
    const { createCacheService } = require('../../src/services/cacheService');
    const roster = [{ id: 'a', name: 'Allowed artist' }, { id: 'b', name: 'Private artist' }];
    const calls = [];
    const svc = createAiService({ cacheService: createCacheService(), usageService: { recordUsage: () => {} },
        repo: { findById: async id => roster.find(a => a.id === id), findAllHybrid: async () => roster },
        client: { isConfigured: () => true, complete: async request => { calls.push(request); return { content: 'Provider answer' }; } } });
    const admin = { id: 1, role: 'admin' }, artist = { id: 2, role: 'artist', artistAccess: 'a' };
    assert.equal((await svc.query({ prompt: 'secret', artistId: 'b', user: admin })).kind, 'ok');
    assert.equal((await svc.query({ prompt: 'secret', artistId: 'b', user: artist })).kind, 'forbidden');
    assert.equal(calls.length, 1);
    await svc.query({ prompt: 'overview', user: artist });
    assert.match(JSON.stringify(calls.at(-1)), /Allowed artist/);
    assert.doesNotMatch(JSON.stringify(calls.at(-1)), /Private artist/);
    assert.equal((await svc.query({ prompt: 'overview', user: artist })).kind, 'cached');
    await svc.query({ prompt: 'overview', user: { ...artist, artistAccess: 'b' } });
    assert.equal(calls.length, 3);
});

test('auth rejects legacy ID-less tokens and fails closed during a database outage', async () => {
    const ctx = require('../../src/routes/context').buildContext();
    const jwt = require('jsonwebtoken');
    const original = ctx.User.findByPk;
    try {
        ctx.User.findByPk = async () => { throw new Error('injected database outage'); };
        for (const [claims, expected] of [[{ role: 'admin' }, 401], [{ id: 1, role: 'admin' }, 503]]) {
            const result = await new Promise(resolve => ctx.authenticateToken({ headers: { authorization: `Bearer ${jwt.sign(claims, process.env.JWT_SECRET)}` } }, {
                status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); }
            }, () => resolve({ code: 200 })));
            assert.equal(result.code, expected);
        }
    } finally { ctx.User.findByPk = original; }
});

test('report batch distinguishes total failure, partial success and empty roster', async () => {
    const handlers = new Map(); const app = { get() {}, post(route, ...middleware) { handlers.set(route, middleware.at(-1)); } };
    let roster = [{ id: 'a', name: 'Artist A' }, { id: 'b', name: 'Artist B' }], fail = true;
    require('../../src/routes/reports').register(app, { authenticateToken() {}, path, logger: { error() {} },
        fs: { existsSync: () => true, writeFileSync: file => { if (fail || file.includes('Artist B')) throw new Error('injected write failure'); } },
        artistRepo: { findAllHybrid: async () => roster }, generateMonthlyReport: async () => Buffer.from('pdf') });
    async function run() {
        let result; const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { result = { status: this.code, body }; } };
        await handlers.get('/v3/reports/generate-all')({ user: { role: 'admin' }, body: { month: '2026-09' } }, res); return result;
    }
    let result = await run(); assert.equal(result.status, 500); assert.equal(result.body.status, 'failed'); assert.equal(result.body.count, 0);
    fail = false; result = await run(); assert.equal(result.body.status, 'partial'); assert.equal(result.body.count, 1); assert.equal(result.body.failures.length, 1);
    roster = []; result = await run(); assert.equal(result.body.status, 'empty');
});

test('graph derives edges only from recorded collaborators, supports names/IDs, excludes archived artists', async () => {
    const { buildNetwork } = await import('../../web/src/charts/networkData.js');
    assert.equal(buildNetwork([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]).edges.length, 0);
    const graph = buildNetwork([{ id: 'a', name: 'A', collaborations: ['B'] }, { id: 'b', name: 'B', collaborations: [{ id: 'a' }] }, { id: 'c', name: 'C', status: 'archived' }]);
    assert.deepEqual(graph.edges, [['a', 'b']]); assert.equal(graph.nodes.length, 2);
});

test('room, campaigns and multimonth sales survive two restarts; restricted reads and writes are denied', async () => {
    await boot(); let admin = await login(); const artist = await login('tours@rezz.com', 'rezz123');
    const room = await api(admin, 'POST', '/v3/anr/demos', { artist: 'Repair Artist', title: 'Durable Demo', genre: 'Techno', url: 'https://example.com/demo.mp3' });
    assert.equal(room.status, 201); const demoId = room.body.demo.id;
    await api(admin, 'POST', '/v3/anr/whiteboard', { message: 'Durable whiteboard' });
    await api(admin, 'POST', '/v3/anr/listening', { url: 'https://example.com/listen.mp3' });
    await Promise.all([admin, artist].map(token => api(token, 'POST', `/v3/anr/vote/${demoId}`, { action: 'add' })));
    assert.equal((await api(admin, 'GET', `/v3/anr/stats/${demoId}`)).body.artistVotes, 2);
    const draft = await api(admin, 'POST', '/v3/marketing/campaigns', { name: 'Durable plan', artistId: 'art_deadmau5', type: 'playlist-push', platforms: ['spotify'] });
    assert.equal(draft.status, 201); assert.equal(draft.body.status, 'draft');
    const sale = (token, artistId, month, revenue) => api(token, 'POST', '/v3/analytics/sales', { artistId, month, revenue });
    for (let month = 1; month <= 13; month++) {
        const label = month <= 12 ? `2025-${String(month).padStart(2, '0')}` : '2026-01';
        assert.equal((await sale(admin, 'art_deadmau5', label, month * 100)).status, 200);
    }
    assert.equal((await sale(admin, 'art_rezz', '2025-01', 40)).status, 200);
    assert.equal((await sale(admin, 'art_rezz', '2025-03', 60)).status, 200);
    assert.equal((await sale(admin, 'art_rezz', '2025-04', 70)).status, 200);
    for (const value of [-1, '123junk', ' ', true]) assert.equal((await sale(admin, 'art_rezz', '2025-05', value)).status, 400);
    assert.equal((await sale(admin, 'art_rezz', '2025-99', 1)).status, 400);
    for (const [method, route, body] of [
        ['POST', '/v3/analytics/sales', { artistId: 'art_deadmau5', month: '2026-02', revenue: 999 }],
        ['POST', '/v3/royalties/calculate', { artistId: 'art_deadmau5' }],
        ['POST', '/v3/ai/query', { prompt: 'secret', artistId: 'art_deadmau5' }],
        ['GET', '/v3/analytics/projections?artistId=art_deadmau5'],
        ['GET', '/v3/artists/art_deadmau5/entity-audit'],
        ['GET', '/v3/artists/art_deadmau5/development']
    ]) assert.equal((await api(artist, method, route, body)).status, 403, route);
    assert.equal((await api(artist, 'GET', '/v3/label/overview')).body.monthlyRevenue, 70);
    assert.equal((await api(artist, 'GET', '/v3/marketing/campaigns')).body.campaigns.length, 0);
    const sparse = (await api(artist, 'GET', '/v3/analytics/projections?months=1')).body.chartData;
    assert.deepEqual(sparse.labels, ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05']);
    assert.deepEqual(sparse.datasets[0].data, [40, null, 60, 70, null]); assert.equal(sparse.datasets[1].data.at(-1), 80);
    for (const endpoint of ['query', 'analyze']) {
        const ai = await api(admin, 'POST', `/v3/ai/${endpoint}`, { prompt: 'growth', artistId: 'art_rezz' });
        assert.equal(ai.status, 503); assert.equal(ai.body.answer, undefined);
    }
    assert.equal((await api(admin, 'GET', '/v3/ai/providers')).body.status, 'unconfigured');
    assert.equal((await api(admin, 'GET', '/v3/integrations/auth/spotify')).status, 501);
    assert.ok((await api(admin, 'GET', '/v3/integrations/status')).body.services.every(s => !s.connected));
    assert.equal((await api(admin, 'GET', '/v3/rights/contracts?artistId=missing')).status, 404);
    assert.equal((await api(admin, 'GET', '/v3/rights/contracts?artistId=art_rezz')).status, 501);
    for (let restart = 0; restart < 2; restart++) {
        await shutdown(); await boot(); admin = await login();
        const state = (await api(admin, 'GET', '/v3/anr/state')).body;
        assert.ok(state.demos.find(d => d.id === demoId && d.hasVoted));
        assert.equal(state.whiteboard, 'Durable whiteboard'); assert.equal(state.nowListening.url, 'https://example.com/listen.mp3');
        assert.equal((await api(admin, 'GET', `/v3/anr/stats/${demoId}`)).body.artistVotes, 2);
        assert.ok((await api(admin, 'GET', '/v3/marketing/campaigns')).body.campaigns.some(c => c.id === draft.body.id && c.name === 'Durable plan'));
        const forecast = (await api(admin, 'GET', '/v3/analytics/projections?artistId=art_deadmau5&months=1')).body.chartData;
        assert.equal(forecast.labels.length, 14); assert.equal(forecast.labels.at(-1), '2026-02'); assert.equal(forecast.datasets[1].data.at(-1), 1400);
        assert.equal((await sale(admin, 'art_deadmau5', '2026-01', 1300)).status, 200);
        assert.equal((await sale(admin, 'art_rezz', `2026-0${restart + 2}`, 0)).status, 200);
    }
});
