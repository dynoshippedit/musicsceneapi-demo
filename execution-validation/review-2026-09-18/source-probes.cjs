'use strict';
// Dependency-injected probes against the application source. No operator DB or providers.
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'review-source-only-secret', GROQ_API_KEY: '', SCHEDULE_JOBS: 'false', DB_DIALECT: 'sqlite', DB_STORAGE: ':memory:', DATABASE_URL: '' });
const results = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const fakeResponse = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function handlers(moduleName, ctx) {
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (route, ...chain) => routes.set(`${method} ${route}`, chain.at(-1))]));
  require(path.join(root, moduleName)).register(app, ctx);
  return routes;
}
async function record(name, work) {
  try { const evidence = await work(); results.push({ name, evidence }); console.log(name, JSON.stringify(evidence)); }
  catch (err) { results.push({ name, harnessError: err.stack }); console.error(name, err.message); }
}
(async () => {
  await record('AI-004-late-rejection-after-timeout', async () => {
    const { createGroqClient } = require(path.join(root, 'src/ai/groqClient'));
    const unhandled = [];
    const listener = err => unhandled.push(err.message);
    process.on('unhandledRejection', listener);
    let lateRejected = false;
    const client = createGroqClient({ timeoutMs: 5, transport: { chat: { completions: { create: () => new Promise((_, reject) => setTimeout(() => { lateRejected = true; reject(new Error('late transport rejection')); }, 40)) } } } });
    let caught;
    try { await client.complete({ messages: [] }); } catch (err) { caught = err.name; }
    await delay(100);
    process.removeListener('unhandledRejection', listener);
    return { caught, lateRejected, unhandled, processSurvived: true };
  });
  await record('AI-cache-authorization-bypass', async () => {
    const { createAiService } = require(path.join(root, 'src/ai/aiService'));
    const values = new Map();
    const realKeys = require(path.join(root, 'src/services/cacheService')).keys;
    const client = { complete: async ({ messages }) => ({ content: messages[1].content, model: 'injected-test-provider' }) };
    let repoReads = 0;
    const service = createAiService({ client, cacheService: { keys: realKeys, get: key => values.get(key), set: (key, value) => values.set(key, value) },
      repo: { findById: async id => { repoReads++; return { id, name: 'Private Artist', revenue: { streaming: 123456 }, monthlyListeners: 10 }; } }, usageService: { recordUsage() {} } });
    const args = { artistId: 'private-artist', prompt: 'Revenue?' };
    const owner = await service.query({ ...args, user: { id: 1, role: 'admin', artistAccess: 'all' } });
    const restricted = await service.query({ ...args, user: { id: 2, role: 'artist', artistAccess: 'another-artist' } });
    return { ownerKind: owner.kind, restricted, repoReads, leakedPrivateContext: restricted.answer.includes('123456') };
  });
  await record('AUTH-002-db-revalidation-fails-open', async () => {
    const { buildContext } = require(path.join(root, 'src/routes/context'));
    const ctx = buildContext(); const jwt = require(path.join(root, 'node_modules/jsonwebtoken'));
    const original = ctx.User.findByPk;
    ctx.User.findByPk = async () => { throw new Error('injected DB outage'); };
    const token = jwt.sign({ id: 1, email: 'review@example.test', role: 'admin' }, require(path.join(root, 'src/config')).jwtSecret);
    const res = fakeResponse(); let authorized = false;
    try {
      ctx.authenticateToken({ headers: { authorization: `Bearer ${token}` } }, res, () => { authorized = true; });
      await delay(40); return { authorized, responseCode: res.code, body: res.body };
    } finally { ctx.User.findByPk = original; }
  });
  await record('API-009-all-report-writes-fail', async () => {
    const routes = handlers('src/routes/reports', { fs: { existsSync: () => true, writeFileSync: () => { throw new Error('injected write failure'); } }, path,
      artistRepo: { findAllHybrid: async () => [{ name: 'Review Artist' }] }, generateMonthlyReport: async () => Buffer.from('review'), logger: { error() {} } });
    const res = fakeResponse(); await routes.get('post /v3/reports/generate-all')({ user: { role: 'admin' }, body: { month: '2026-09' } }, res);
    return { status: res.code, body: res.body };
  });
  await record('forecast-history-lengths', async () => {
    const regression = require(path.join(root, 'src/analytics/regression'));
    const evidence = [];
    for (const count of [3, 12, 13]) {
      const routes = handlers('src/routes/analytics', { artistRepo: { findById: async () => ({ name: 'Review Artist', revenue: {}, growthRate: 5 }) },
        SalesEntry: { findAll: async () => Array.from({ length: count }, (_, i) => ({ month: `M${i + 1}`, revenue: (i + 1) * 100 })) },
        performLinearRegression: regression.performLinearRegression, profile: { charts: { projectionAccent: 'green' } }, logger: { error() {} } });
      const res = fakeResponse(); await routes.get('get /v3/analytics/projections')({ query: { artistId: 'review', months: '2' } }, res);
      const chart = res.body.chartData;
      evidence.push({ count, status: res.code, labelCount: chart.labels.length, historyCount: chart.datasets[0].data.length, projectionAnchor: chart.datasets[1].data[11] ?? null, firstProjection: chart.datasets[1].data[12], expectedFirstProjection: (count + 1) * 100 });
    }
    return evidence;
  });
  await record('rights-DB-rejection-escapes-handler', async () => {
    const routes = handlers('src/routes/finance', { artistRepo: { findById: async () => { throw new Error('injected DB failure'); } } });
    const res = fakeResponse(); let escaped;
    try { await routes.get('get /v3/rights/contracts')({ query: { artistId: 'review' } }, res); } catch (err) { escaped = err.message; }
    // Boundary probe only: the real repository normally catches DB lookup errors.
    // This result does NOT establish a live process crash during a database outage.
    return { escaped, responseSent: res.body !== null, boundaryOnly: true, repositoryNormallyCatchesDbErrors: true };
  });
  await record('sales-schema-corruption-on-second-sync', async () => {
    const { sequelize, SalesEntry } = require(path.join(root, 'src/models'));
    await sequelize.sync({ alter: true });
    const [firstSchema] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='SalesEntries'");
    await sequelize.sync({ alter: true });
    const [secondSchema] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='SalesEntries'");
    await SalesEntry.create({ artistId: 'artist-one', month: '2026-01', revenue: 100 });
    const outcomes = [];
    for (const row of [{ artistId: 'artist-one', month: '2026-02', revenue: 200 }, { artistId: 'artist-two', month: '2026-01', revenue: 300 }]) {
      try { await SalesEntry.create(row); outcomes.push({ row, saved: true }); }
      catch (err) { outcomes.push({ row, saved: false, error: err.name, fields: err.errors.map(e => e.path) }); }
    }
    await sequelize.close();
    return { firstSchema, secondSchema, outcomes };
  });
  fs.writeFileSync(path.join(__dirname, 'source-evidence.json'), JSON.stringify(results, null, 2) + '\n');
  process.exit(results.some(result => result.harnessError) ? 1 : 0);
})();
