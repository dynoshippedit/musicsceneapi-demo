'use strict';

/**
 * tests/regression/directsales.test.js
 *
 * Label Stripe Connect (their account, not the platform's) + direct-sales
 * attribution + the comprehensive financial-handoff lifecycle + the
 * AI/financial liability posture.
 *
 * Part A — unit tests (no server):
 *   - provider interface shape + Stripe normalization/attribution math
 *   - AI disclaimer constants
 *   - monthly report default path NEVER invokes AI (the critical invariant)
 *   - POST /v3/ai/financial-analysis gating + disclaimer (fake app capture)
 * Part B — spawned server (PAYMENTS_STUB=true, stub fixtures via file):
 *   - connect OAuth round-trip, status, disconnect
 *   - mapping CRUD + validation
 *   - sync: attribution, idempotency, refunds updating in place, currencies
 *   - payouts pulled as reconciliation evidence (never attributed)
 *   - artist scoping (cross-artist isolation, unattributed hidden)
 *   - unified P&L + full CSV export (royalties + atVenu + direct sales)
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Part A — unit tests
// ---------------------------------------------------------------------------

describe('payment provider interface (Stripe)', () => {
    const stripe = require('../../src/payments/providers/stripe');
    const { getProvider, PROVIDER_IDS } = require('../../src/payments');

    test('registry exposes stripe behind the interface', () => {
        assert.ok(PROVIDER_IDS.includes('stripe'));
        assert.strictEqual(getProvider('stripe'), stripe);
        assert.throws(() => getProvider('nope'), /Unknown payment provider/);
    });

    test('authorizeUrl requests read-only scope on the Connect domain', () => {
        const url = stripe.authorizeUrl({ clientId: 'ca_test123', redirectUri: 'http://x/cb', state: 's' });
        assert.ok(url.startsWith('https://connect.stripe.com/oauth/authorize?'));
        assert.ok(url.includes('scope=read_only'), 'must request read_only scope');
        assert.ok(url.includes('client_id=ca_test123'));
    });

    test('normalizeCharge: integer cents, refund math, ISO currency', () => {
        const ok = stripe.normalizeCharge({
            id: 'ch_1', amount: 2000, amount_refunded: 500,
            currency: 'usd', created: 1759094400, description: 'LP',
            metadata: { sku: 'vinyl-001' }
        }, [{ product_id: 'prod_1', price_id: 'price_1' }]);
        assert.ok(!ok.error, ok.error);
        assert.deepStrictEqual(
            [ok.value.amountCents, ok.value.amountRefundedCents, ok.value.netCents],
            [2000, 500, 1500]
        );
        assert.strictEqual(ok.value.currency, 'USD');
        assert.strictEqual(ok.value.status, 'partially_refunded');
        assert.deepStrictEqual(ok.value.priceIds, ['price_1']);
        assert.deepStrictEqual(ok.value.productIds, ['prod_1']);
    });

    test('normalizeCharge: full refund -> refunded; invalid money -> skipped', () => {
        const full = stripe.normalizeCharge({ id: 'ch_2', amount: 1500, amount_refunded: 1500, currency: 'eur', created: 1, metadata: {} }, []);
        assert.strictEqual(full.value.status, 'refunded');
        assert.strictEqual(full.value.netCents, 0);
        const bad = stripe.normalizeCharge({ id: 'ch_3', amount: '19.99', currency: 'usd', created: 1, metadata: {} }, []);
        assert.ok(bad.error, 'float amount must be rejected');
        const badCur = stripe.normalizeCharge({ id: 'ch_4', amount: 100, currency: 'US', created: 1, metadata: {} }, []);
        assert.ok(badCur.error, 'bad currency must be rejected');
        const over = stripe.normalizeCharge({ id: 'ch_5', amount: 100, amount_refunded: 200, currency: 'usd', created: 1, metadata: {} }, []);
        assert.ok(over.error, 'refund exceeding the charge must be rejected');
    });

    test('normalizePayout: integer cents + ISO currency; invalid -> skipped', () => {
        const ok = stripe.normalizePayout({ id: 'po_1', amount: 485000, currency: 'usd', status: 'paid', arrival_date: 1790000000, type: 'bank_account' });
        assert.ok(!ok.error, ok.error);
        assert.strictEqual(ok.value.amountCents, 485000);
        assert.strictEqual(ok.value.currency, 'USD');
        assert.strictEqual(ok.value.status, 'paid');
        const bad = stripe.normalizePayout({ id: 'po_2', amount: 10.5, currency: 'usd' });
        assert.ok(bad.error, 'float payout amount must be rejected');
    });

    test('attributeToArtist: metadata > price_id > product_id; no match -> null', () => {
        const sale = {
            metadata: { sku: 'vinyl-001' },
            priceIds: ['price_tee'], productIds: ['prod_vinyl']
        };
        const mappings = [
            { matchType: 'product_id', matchValue: 'prod_vinyl', artistId: 'art_a' },
            { matchType: 'price_id', matchValue: 'price_tee', artistId: 'art_b' },
            { matchType: 'charge_metadata', matchValue: 'sku:vinyl-001', artistId: 'art_c' }
        ];
        assert.strictEqual(stripe.attributeToArtist(sale, mappings), 'art_c', 'metadata wins');
        assert.strictEqual(
            stripe.attributeToArtist(sale, mappings.filter((m) => m.matchType !== 'charge_metadata')),
            'art_b', 'price beats product'
        );
        assert.strictEqual(
            stripe.attributeToArtist({ metadata: {}, priceIds: [], productIds: [] }, mappings),
            null, 'unmatched sales are NEVER guessed'
        );
    });
});

describe('AI/financial liability posture — static guarantees', () => {
    const { AI_FINANCIAL_DISCLAIMER, AI_FINANCIAL_USER_RESPONSIBILITY, AI_INSIGHTS_NOT_REQUESTED } =
        require('../../src/ai/disclaimer');

    test('disclaimer labels output as not financial advice with user responsibility', () => {
        assert.match(AI_FINANCIAL_DISCLAIMER, /Not financial advice/);
        assert.match(AI_FINANCIAL_DISCLAIMER, /responsible for your own financial decisions/);
        assert.match(AI_FINANCIAL_USER_RESPONSIBILITY, /Liability for decisions.*stays with you/);
        assert.match(AI_INSIGHTS_NOT_REQUESTED, /No financial data was sent to any AI provider/);
    });

    test('CRITICAL: default monthly-report path never invokes AI', async () => {
        const aiService = require('../../src/ai/aiService');
        const { generateMonthlyReport } = require('../../src/reports/monthlyReport');
        const artistRepo = require('../../src/repositories/artistRepository');
        const orig = aiService.reportInsight;
        aiService.reportInsight = async () => { throw new Error('AI_MUST_NOT_BE_CALLED'); };
        try {
            const artist = artistRepo.findMockById('art_lumenveil');
            const buf = await generateMonthlyReport(artist, '2026-01');
            assert.ok(Buffer.isBuffer(buf), 'report still generates');
            assert.strictEqual(buf.slice(0, 4).toString('latin1'), '%PDF');
        } finally {
            aiService.reportInsight = orig;
        }
    });

    test('POST /v3/ai/financial-analysis: gated + labeled', async () => {
        const aiRoutes = require('../../src/routes/ai');
        const captured = {};
        const fakeApp = {
            get: () => {},
            post: (p, ...handlers) => { captured[p] = handlers[handlers.length - 1]; }
        };
        const fakeCtx = {
            authenticateToken: (req, res, next) => next(),
            validateBody: () => (req, res, next) => { req.validatedBody = req.body; next(); },
            aiService: { query: async () => ({ kind: 'ok', answer: 'analysis text', model: 'stub' }) },
            config: { groqModel: 'stub' },
            logger: { error: () => {} }
        };
        aiRoutes.register(fakeApp, fakeCtx);
        const handler = captured['/v3/ai/financial-analysis'];
        assert.ok(handler, 'endpoint is registered');

        const call = async (body) => {
            const req = { body, user: { id: 'u1', role: 'admin' } };
            let code = 200; let payload = null;
            const res = {
                status: (c) => { code = c; return res; },
                json: (p) => { payload = p; return res; }
            };
            await handler(req, res);
            return { code, payload };
        };

        const noAck = await call({ prompt: 'summarize revenue' });
        assert.strictEqual(noAck.code, 400);
        assert.match(noAck.payload.error, /acknowledgeNotAdvice/);

        const noPrompt = await call({ acknowledgeNotAdvice: true });
        assert.strictEqual(noPrompt.code, 400);

        const okRes = await call({ prompt: 'summarize revenue', acknowledgeNotAdvice: true });
        assert.strictEqual(okRes.code, 200);
        assert.strictEqual(okRes.payload.success, true);
        assert.match(okRes.payload.disclaimer, /Not financial advice/);
        assert.match(okRes.payload.userResponsibility, /stays with you/);
    });
});

// ---------------------------------------------------------------------------
// Part B — spawned server
// ---------------------------------------------------------------------------

const OAUTH_TOKEN_KEY = crypto.randomBytes(32).toString('hex');

function fixturesV1() {
    return [
        { id: 'ch_001', amount: 2000, amount_refunded: 0, currency: 'usd', created: 1759094400, description: 'Vinyl LP', metadata: { sku: 'vinyl-001' } },
        { id: 'ch_002', amount: 5000, amount_refunded: 0, currency: 'usd', created: 1759094500, description: 'T-shirt', metadata: {}, __stubLines: [{ product_id: 'prod_merch', price_id: 'price_merch_tee' }] },
        { id: 'ch_003', amount: 1500, amount_refunded: 1500, currency: 'eur', created: 1759094600, description: 'Digital album', metadata: {} },
        { id: 'ch_004', amount: 3000, amount_refunded: 1000, currency: 'usd', created: 1759094700, description: 'Ticket', metadata: {} },
        { id: 'ch_999', amount: '19.99', currency: 'usd', created: 1759094800, metadata: {} }
    ];
}

function baseEnv(port, scratch, fixturesFile) {
    return {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        JWT_SECRET: 'directsales-test-jwt-secret',
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(scratch, 'test.sqlite'),
        DATABASE_URL: '',
        ADMIN_EMAIL: '', ADMIN_PASS: '',
        GROQ_API_KEY: '',
        AUTO_PRINT: 'false',
        SCHEDULE_JOBS: 'false',
        OAUTH_TOKEN_KEY,
        PAYMENTS_STUB: 'true',
        PAYMENTS_STUB_CHARGES_FILE: fixturesFile,
        PAYMENTS_STUB_PAYOUTS_FILE: path.join(scratch, 'payouts.json')
    };
}

async function waitForHealth(base, timeoutMs = 40000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${base}/health`);
            if (res.ok) return true;
        } catch (_) { /* retry */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

function makeApi(base) {
    return async function api(method, p, token, body, extraHeaders) {
        const headers = { ...(extraHeaders || {}) };
        const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
        if (!isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(base + p, {
            method, headers,
            ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {})
        });
        let json = null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try { json = await res.json(); } catch (_) { /* ignore */ }
        }
        const text = ct.includes('application/json') ? null : await res.text().catch(() => null);
        return { status: res.status, json, text, headers: res.headers };
    };
}

async function spawnServer(port) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'directsales-'));
    const fixturesFile = path.join(scratch, 'charges.json');
    fs.writeFileSync(fixturesFile, JSON.stringify(fixturesV1()));
    // Payout fixtures: reconciliation visibility, never attributed to artists.
    fs.writeFileSync(path.join(scratch, 'payouts.json'), JSON.stringify([
        { id: 'po_001', amount: 485000, currency: 'usd', status: 'paid', arrival_date: 1790000000, type: 'bank_account' },
        { id: 'po_002', amount: 12500, currency: 'eur', status: 'in_transit', arrival_date: 1790100000, type: 'bank_account' },
        { id: 'po_bad', amount: 10.5, currency: 'USD', status: 'paid' } // non-integer amount -> skipped
    ]));
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: scratch, env: baseEnv(port, scratch, fixturesFile), stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.resume();
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    const base = `http://127.0.0.1:${port}`;
    const up = await waitForHealth(base);
    if (!up) {
        child.kill('SIGKILL');
        throw new Error(`server.js (port ${port}) never became healthy.\n` + err.slice(0, 3000));
    }
    return { child, api: makeApi(base), scratch, fixturesFile };
}

async function login(api, email, password) {
    const { status, json } = await api('POST', '/v3/auth/login', null, { email, password });
    assert.strictEqual(status, 200, `login failed for ${email}: ${JSON.stringify(json)}`);
    return json.token;
}

describe('direct-sales: full lifecycle (spawned server, PAYMENTS_STUB=true)', () => {
    let srv, admin, artist;

    before(async () => {
        srv = await spawnServer(32192);
        admin = await login(srv.api, 'admin@pulsegrid.fm', 'admin123');
        artist = await login(srv.api, 'tours@novakin.band', 'novakin123');
    });
    after(() => { srv.child.kill('SIGKILL'); });

    test('non-admin cannot authorize, sync, or manage mappings', async () => {
        assert.strictEqual((await srv.api('POST', '/v3/direct-sales/connect/authorize', artist, {})).status, 403);
        assert.strictEqual((await srv.api('POST', '/v3/direct-sales/sync', artist, {})).status, 403);
        assert.strictEqual((await srv.api('POST', '/v3/direct-sales/mappings', artist, {})).status, 403);
    });

    test('OAuth round-trip: authorize -> callback(state) -> connected', async () => {
        const authz = await srv.api('POST', '/v3/direct-sales/connect/authorize', admin, {});
        assert.strictEqual(authz.status, 200);
        assert.ok(authz.json.authorizeUrl.includes('connect.stripe.com'));
        assert.ok(authz.json.authorizeUrl.includes('scope=read_only'));
        assert.ok(authz.json.state);

        const bad = await srv.api('GET', `/v3/direct-sales/connect/callback?code=x&state=badstate`, null);
        assert.strictEqual(bad.status, 400);

        const cb = await srv.api('GET', `/v3/direct-sales/connect/callback?code=testcode&state=${authz.json.state}`, null);
        assert.strictEqual(cb.status, 200);
        assert.strictEqual(cb.json.connected, true);
        assert.strictEqual(cb.json.accountId, 'acct_stub_test123');
        assert.strictEqual(cb.json.livemode, false);

        // state is single-use
        const replay = await srv.api('GET', `/v3/direct-sales/connect/callback?code=testcode&state=${authz.json.state}`, null);
        assert.strictEqual(replay.status, 400);

        const st = await srv.api('GET', '/v3/direct-sales/connect/status', admin);
        assert.strictEqual(st.json.connected, true);
        assert.strictEqual(st.json.accountId, 'acct_stub_test123');
    });

    test('mapping validation: bad type, bad metadata format, unknown artist', async () => {
        const badType = await srv.api('POST', '/v3/direct-sales/mappings', admin,
            { matchType: 'email', matchValue: 'x', artistId: 'art_novakin' });
        assert.strictEqual(badType.status, 400);
        const badMeta = await srv.api('POST', '/v3/direct-sales/mappings', admin,
            { matchType: 'charge_metadata', matchValue: 'no-colon', artistId: 'art_novakin' });
        assert.strictEqual(badMeta.status, 400);
        const badArtist = await srv.api('POST', '/v3/direct-sales/mappings', admin,
            { matchType: 'price_id', matchValue: 'price_x', artistId: 'art_nobody' });
        assert.strictEqual(badArtist.status, 404);
    });

    test('create attribution mappings (label-managed)', async () => {
        const m1 = await srv.api('POST', '/v3/direct-sales/mappings', admin,
            { matchType: 'charge_metadata', matchValue: 'sku:vinyl-001', artistId: 'art_novakin', note: 'LP SKU' });
        assert.strictEqual(m1.status, 201);
        const m2 = await srv.api('POST', '/v3/direct-sales/mappings', admin,
            { matchType: 'price_id', matchValue: 'price_merch_tee', artistId: 'art_lumenveil' });
        assert.strictEqual(m2.status, 201);
        const list = await srv.api('GET', '/v3/direct-sales/mappings', admin);
        assert.strictEqual(list.json.mappings.length, 2);
        // duplicate mapping upserts instead of duplicating
        const dup = await srv.api('POST', '/v3/direct-sales/mappings', admin,
            { matchType: 'charge_metadata', matchValue: 'sku:vinyl-001', artistId: 'art_novakin' });
        assert.strictEqual(dup.status, 200);
        assert.strictEqual(dup.json.created, false);
        // artist role can view mappings
        const asArtist = await srv.api('GET', '/v3/direct-sales/mappings', artist);
        assert.strictEqual(asArtist.status, 200);
        assert.strictEqual(asArtist.json.mappings.length, 2);
    });

    test('sync: pulls, normalizes to cents, attributes per artist', async () => {
        const { status, json } = await srv.api('POST', '/v3/direct-sales/sync', admin, {});
        assert.strictEqual(status, 200);
        assert.strictEqual(json.pulled, 4);
        assert.strictEqual(json.skipped, 1, 'the float-money charge is reported skipped');
        assert.strictEqual(json.imported, 4);
        assert.strictEqual(json.attributed, 2);
        assert.strictEqual(json.unattributed, 2);
        assert.deepStrictEqual(json.unattributedIds.sort(), ['ch_003', 'ch_004']);
    });

    test('re-sync is idempotent: no double-count, refunds update in place', async () => {
        const { json } = await srv.api('POST', '/v3/direct-sales/sync', admin, {});
        assert.strictEqual(json.imported, 0);
        assert.strictEqual(json.updated, 4);
        assert.strictEqual(json.duplicates, 4);

        // A refund landing later updates the ORIGINAL row — no new row.
        const v2 = fixturesV1().map((c) =>
            c.id === 'ch_001' ? { ...c, amount_refunded: 2000 } : c);
        fs.writeFileSync(srv.fixturesFile, JSON.stringify(v2));
        const again = await srv.api('POST', '/v3/direct-sales/sync', admin, {});
        assert.strictEqual(again.json.imported, 0, 'refund does not create a second row');
        assert.strictEqual(again.json.updated, 4);

        const list = await srv.api('GET', '/v3/direct-sales?limit=500', admin);
        const ch1 = list.json.sales.find((s) => s.providerSaleId === 'ch_001');
        assert.strictEqual(list.json.sales.length, 4, 'still exactly 4 sale rows');
        assert.strictEqual(ch1.status, 'refunded');
        assert.strictEqual(ch1.netCents, 0);
        assert.strictEqual(ch1.amountRefundedCents, 2000);
    });

    test('summary: integer-cent math per currency, no conversion', async () => {
        const { status, json } = await srv.api('GET', '/v3/direct-sales/summary', admin);
        assert.strictEqual(status, 200);
        const usd = json.totals.find((t) => t.currency === 'USD');
        const eur = json.totals.find((t) => t.currency === 'EUR');
        // After the ch_001 full refund: USD gross 10000, refunded 3000, net 7000.
        assert.deepStrictEqual(
            [usd.grossCents, usd.refundedCents, usd.netCents, usd.saleCount],
            [10000, 3000, 7000, 3]
        );
        assert.deepStrictEqual(
            [eur.grossCents, eur.refundedCents, eur.netCents, eur.saleCount],
            [1500, 1500, 0, 1]
        );
        for (const t of json.totals) {
            for (const k of ['grossCents', 'refundedCents', 'netCents']) {
                assert.ok(Number.isInteger(t[k]), `${k} is an integer`);
            }
        }
    });

    test('cross-artist attribution: sales land on exactly the right artist', async () => {
        const novakin = await srv.api('GET', '/v3/financials/reconciliation?artistId=art_novakin', admin);
        const lumenveil = await srv.api('GET', '/v3/financials/reconciliation?artistId=art_lumenveil', admin);
        assert.strictEqual(novakin.status, 200);
        const nUsd = novakin.json.artists.find((a) => a.artistId === 'art_novakin').currencies.find((c) => c.currency === 'USD');
        const lUsd = lumenveil.json.artists.find((a) => a.artistId === 'art_lumenveil').currencies.find((c) => c.currency === 'USD');
        assert.strictEqual(nUsd.directSalesCents, 0, 'ch_001 fully refunded -> net 0 for novakin');
        assert.strictEqual(lUsd.directSalesCents, 5000, 'ch_002 attributed to lumenveil only');
        assert.strictEqual(nUsd.totalCents, nUsd.royaltiesCents + nUsd.merchSettlementsCents + nUsd.directSalesCents);
    });

    test('sync pulls payouts as reconciliation evidence (never attributed)', async () => {
        const { status, json } = await srv.api('POST', '/v3/direct-sales/sync', admin, {});
        assert.strictEqual(status, 200);
        // 2 valid payouts pulled, 1 malformed skipped
        assert.strictEqual(json.payouts.pulled, 2, JSON.stringify(json.payouts));
        assert.strictEqual(json.payouts.skipped, 1);
        assert.strictEqual(json.payouts.payouts.length, 2);
        const po1 = json.payouts.payouts.find((p) => p.providerPayoutId === 'po_001');
        assert.ok(po1);
        assert.strictEqual(po1.amountCents, 485000);
        assert.strictEqual(po1.currency, 'USD');
        assert.strictEqual(po1.status, 'paid');
        // Integer cents discipline holds for every payout
        for (const p of json.payouts.payouts) {
            assert.ok(Number.isSafeInteger(p.amountCents));
            assert.match(p.currency, /^[A-Z]{3}$/);
        }
        // Payouts are NOT attributed and never touch artist P&L
        assert.ok(!('artistId' in (json.payouts.payouts[0] || {})));
    });

    test('artist role: sees own attributed sales only; unattributed hidden', async () => {
        const list = await srv.api('GET', '/v3/direct-sales', artist);
        assert.strictEqual(list.status, 200);
        assert.ok(list.json.sales.length >= 1);
        for (const s of list.json.sales) {
            assert.strictEqual(s.artistId, 'art_novakin', 'never leaks another artist\'s sales');
        }
        const denied = await srv.api('GET', '/v3/financials/reconciliation?artistId=art_lumenveil', artist);
        assert.strictEqual(denied.status, 403);
    });

    test('full financial handoff: royalty + atVenu + direct sales -> one CSV export', async () => {
        // Seed one royalty line via the catalog + royalty import.
        const rec = await srv.api('POST', '/v3/catalog/recordings', admin,
            { title: 'Export Test Track', isrc: 'ZZEXP2600001', artistId: 'art_novakin' });
        assert.strictEqual(rec.status, 201);
        const fd = new FormData();
        fd.append('file', new Blob(['isrc_or_upc,amount_cents,currency,period,source\nZZEXP2600001,12500,USD,2026-09,distributor\n'], { type: 'text/csv' }), 'roy.csv');
        const imp = await srv.api('POST', '/v3/royalties/import', admin, fd);
        assert.strictEqual(imp.status, 201);
        assert.strictEqual(imp.json.imported, 1);
        const fd2 = new FormData();
        fd2.append('file', new Blob(['show_date,venue,artist,gross_cents,fees_cents,taxes_cents,net_cents,currency,attendance\n2026-09-15,The Danforth,novakin,500000,25000,65000,410000,USD,800\n'], { type: 'text/csv' }), 'set.csv');
        const imp2 = await srv.api('POST', '/v3/royalties/import/atvenu', admin, fd2);
        assert.strictEqual(imp2.status, 201);

        const badFmt = await srv.api('GET', '/v3/financials/export?format=pdf', admin);
        assert.strictEqual(badFmt.status, 400);

        const { status, text, headers } = await srv.api('GET', '/v3/financials/export?format=csv', admin);
        assert.strictEqual(status, 200);
        assert.ok(headers.get('content-type').includes('text/csv'));
        for (const rt of ['royalty_line', 'merch_settlement', 'direct_sale', 'reconciliation_summary']) {
            assert.ok(text.includes(rt), `export contains ${rt} records`);
        }
        assert.ok(text.includes('12500'), 'royalty cents present');
        assert.ok(text.includes('410000'), 'settlement net cents present');
        assert.ok(text.includes('ch_002'), 'direct sale present');
        // reconciliation_summary for art_novakin USD: royalties 12500 (demo seed, 2026-08)
        //   + 12500 (imported above, 2026-09) + merch 410000 + direct 0 = 435000.
        // The seed line proves the export covers pre-existing records too.
        const recLine = text.split('\n').find((l) => l.startsWith('reconciliation_summary,art_novakin,USD'));
        assert.ok(recLine, 'reconciliation summary row for art_novakin/USD exists');
        const cols = recLine.split(',');
        assert.strictEqual(cols[5], '435000', 'reconciliation total is integer-cent exact');

        // Artist-role export: own artist only; label-wide denied.
        const own = await srv.api('GET', '/v3/financials/export?format=csv&artistId=art_novakin', artist);
        assert.strictEqual(own.status, 200);
        assert.ok(!own.text.includes('art_lumenveil'), 'artist export leaks no other artist');
        const wide = await srv.api('GET', '/v3/financials/export?format=csv', artist);
        assert.strictEqual(wide.status, 403);
    });

    test('royalties summary surfaces direct-sales totals (existing P&L view)', async () => {
        const { status, json } = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin', admin);
        assert.strictEqual(status, 200);
        assert.ok(Array.isArray(json.totals), 'existing shape intact');
        assert.ok(Array.isArray(json.directSales), 'direct-sales totals added');
        const usd = json.directSales.find((t) => t.currency === 'USD');
        assert.strictEqual(usd.netCents, 0, 'novakin direct net is 0 after the ch_001 refund');
    });

    test('AI financial-analysis endpoint gating (spawned server, no provider)', async () => {
        const noAck = await srv.api('POST', '/v3/ai/financial-analysis', admin, { prompt: 'x' });
        assert.strictEqual(noAck.status, 400);
        const withAck = await srv.api('POST', '/v3/ai/financial-analysis', admin,
            { prompt: 'summarize', acknowledgeNotAdvice: true });
        assert.strictEqual(withAck.status, 503, 'no AI provider configured in test env');
        assert.ok(!JSON.stringify(withAck.json).includes('disclaimer'), 'error shape unchanged');
    });

    test('disconnect destroys the connection cleanly', async () => {
        const del = await srv.api('DELETE', '/v3/direct-sales/connect', admin);
        assert.strictEqual(del.status, 200);
        const st = await srv.api('GET', '/v3/direct-sales/connect/status', admin);
        assert.strictEqual(st.json.connected, false);
        const sync = await srv.api('POST', '/v3/direct-sales/sync', admin, {});
        assert.strictEqual(sync.status, 409);
        // mappings are label-managed and survive disconnect
        const list = await srv.api('GET', '/v3/direct-sales/mappings', admin);
        assert.strictEqual(list.json.mappings.length, 2);
    });
});

describe('direct-sales connect: unconfigured states (no keys, no stub)', () => {
    let srv2, admin2;
    before(async () => {
        // Separate spawn WITHOUT PAYMENTS_STUB and WITHOUT keys.
        const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'directsales-nokeys-'));
        const env = {
            ...process.env,
            PORT: '32193',
            NODE_ENV: 'test',
            JWT_SECRET: 'directsales-test-jwt-secret',
            USE_REAL_DATA: 'false',
            DB_DIALECT: 'sqlite',
            DB_STORAGE: path.join(scratch, 'test.sqlite'),
            DATABASE_URL: '',
            ADMIN_EMAIL: '', ADMIN_PASS: '',
            GROQ_API_KEY: '',
            AUTO_PRINT: 'false',
            SCHEDULE_JOBS: 'false'
        };
        delete env.PAYMENTS_STUB;
        delete env.LABEL_STRIPE_CLIENT_ID;
        delete env.LABEL_STRIPE_CLIENT_SECRET;
        delete env.OAUTH_TOKEN_KEY;
        const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
            cwd: scratch, env, stdio: ['ignore', 'pipe', 'pipe']
        });
        child.stdout.resume();
        const base = 'http://127.0.0.1:32193';
        const up = await waitForHealth(base);
        if (!up) { child.kill('SIGKILL'); throw new Error('unconfigured server never became healthy'); }
        srv2 = { child, api: makeApi(base) };
        admin2 = await login(srv2.api, 'admin@pulsegrid.fm', 'admin123');
    });
    after(() => { srv2.child.kill('SIGKILL'); });

    test('authorize/sync answer 503 naming the missing variables; reads still work', async () => {
        const authz = await srv2.api('POST', '/v3/direct-sales/connect/authorize', admin2, {});
        assert.strictEqual(authz.status, 503);
        assert.match(authz.json.error, /LABEL_STRIPE_CLIENT_ID/);
        const sync = await srv2.api('POST', '/v3/direct-sales/sync', admin2, {});
        assert.strictEqual(sync.status, 503);
        const st = await srv2.api('GET', '/v3/direct-sales/connect/status', admin2);
        assert.strictEqual(st.status, 200);
        assert.strictEqual(st.json.configured, false);
        assert.strictEqual(st.json.connected, false);
    });
});
