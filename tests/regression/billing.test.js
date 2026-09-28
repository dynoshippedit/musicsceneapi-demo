/**
 * tests/regression/billing.test.js
 *
 * Stripe billing regression gate.
 *
 * The Stripe client is STUBBED (STRIPE_STUB=true): the in-memory fake in
 * src/billing/stripeClient.js implements the SDK surface the routes use, so
 * these tests exercise the full HTTP surface — checkout creation, webhook
 * signature verification, and every state transition — without ever touching
 * api.stripe.com and without any API keys in the repo or the tests.
 *
 * Boots the canonical entrypoint against a disposable scratch database,
 * exactly like tests/regression/authz.test.js. Two server fixtures:
 *   A. no Stripe env at all          -> billing routes answer 503, app boots fine
 *   B. STRIPE_STUB=true + test vars  -> full checkout/webhook lifecycle
 */

'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { signTestWebhook } = require('../../src/billing/stripeClient');

const ROOT = path.resolve(__dirname, '..', '..');

const WEBHOOK_SECRET = 'whsec_test_billing_123';

function baseEnv(port, scratch, stripeEnv) {
    return {
        ...process.env,
        PORT: port,
        NODE_ENV: 'test',
        JWT_SECRET: 'test-jwt-secret-for-billing-suite',
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(scratch, 'test.sqlite'),
        DATABASE_URL: '',
        ADMIN_EMAIL: '', ADMIN_PASS: '',
        GROQ_API_KEY: 'dummy',
        AUTO_PRINT: 'false',
        SCHEDULE_JOBS: 'false',
        ...stripeEnv
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
        const isRaw = typeof body === 'string';
        // Raw string bodies (webhook payloads) are JSON too — without the
        // content type, express.json() skips parsing and req.rawBody is never
        // stashed, which breaks signature verification.
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(base + p, {
            method,
            headers,
            ...(body !== undefined ? { body: isRaw ? body : JSON.stringify(body) } : {})
        });
        let json = null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try { json = await res.json(); } catch (_) { /* ignore */ }
        }
        return { status: res.status, json };
    };
}

async function spawnServer(port, scratch, stripeEnv) {
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: scratch, env: baseEnv(port, scratch, stripeEnv), stdio: ['ignore', 'pipe', 'pipe']
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
    return { child, api: makeApi(base) };
}

async function login(api, email, password) {
    const { status, json } = await api('POST', '/v3/auth/login', null, { email, password });
    assert.strictEqual(status, 200, `login failed for ${email}`);
    assert.ok(json.token, `no token for ${email}`);
    return json.token;
}

function stripeEvent(type, object) {
    return {
        id: `evt_test_${Math.random().toString(36).slice(2)}`,
        object: 'event',
        type,
        data: { object }
    };
}

// ---------------------------------------------------------------------------
// Fixture A: Stripe not configured -> 503, everything else unaffected
// ---------------------------------------------------------------------------
describe('billing without Stripe keys', () => {
    let child, api, adminToken;
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsegrid-billing-nokeys-'));

    before(async () => {
        ({ child, api } = await spawnServer('3994', scratch, {}));
        adminToken = await login(api, 'admin@pulsegrid.fm', 'admin123');
    });

    after(async () => {
        if (child) child.kill('SIGKILL');
        await new Promise((r) => setTimeout(r, 200));
        fs.rmSync(scratch, { recursive: true, force: true });
    });

    test('POST /v3/billing/checkout -> 503 with a clear message', async () => {
        const { status, json } = await api('POST', '/v3/billing/checkout', adminToken, {});
        assert.strictEqual(status, 503);
        assert.match(json.error, /not configured/i);
        assert.match(json.error, /STRIPE_SECRET_KEY/);
    });

    test('GET /v3/billing/status -> 503 with a clear message', async () => {
        const { status, json } = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(status, 503);
        assert.match(json.error, /not configured/i);
    });

    test('POST /v3/billing/webhook -> 503 (cannot verify signatures)', async () => {
        const { status, json } = await api('POST', '/v3/billing/webhook', null, { type: 'ping' });
        assert.strictEqual(status, 503);
        assert.match(json.error, /not configured/i);
    });

    test('non-billing routes still work without Stripe keys', async () => {
        const { status } = await api('GET', '/v3/label/overview', adminToken);
        assert.strictEqual(status, 200);
    });
});

// ---------------------------------------------------------------------------
// Fixture B: stubbed Stripe -> full lifecycle
// ---------------------------------------------------------------------------
describe('billing with stubbed Stripe (TEST MODE)', () => {
    let child, api, adminToken, artistToken;
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsegrid-billing-stub-'));

    const STRIPE_ENV = {
        STRIPE_STUB: 'true',
        STRIPE_SECRET_KEY: 'sk_test_dummy_for_stub_mode',
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        STRIPE_SETUP_PRICE_ID: 'price_setup_test',
        STRIPE_SUBSCRIPTION_PRICE_ID: 'price_sub_monthly_test'
    };

    let customerId;
    let firstSessionId;

    /** POST a signed webhook event; returns the raw fetch result. */
    async function webhook(type, object, secret = WEBHOOK_SECRET) {
        const { header, body } = signTestWebhook(stripeEvent(type, object), secret);
        return api('POST', '/v3/billing/webhook', null, body, { 'Stripe-Signature': header });
    }

    before(async () => {
        ({ child, api } = await spawnServer('3995', scratch, STRIPE_ENV));
        adminToken = await login(api, 'admin@pulsegrid.fm', 'admin123');
        artistToken = await login(api, 'tours@novakin.band', 'novakin123');
    });

    after(async () => {
        if (child) child.kill('SIGKILL');
        await new Promise((r) => setTimeout(r, 200));
        fs.rmSync(scratch, { recursive: true, force: true });
    });

    test('non-admin gets 403 on checkout and status', async () => {
        for (const [method, p, body] of [['POST', '/v3/billing/checkout', {}], ['GET', '/v3/billing/status', undefined]]) {
            const { status, json } = await api(method, p, artistToken, body);
            assert.strictEqual(status, 403, `${method} ${p} leaked to artist`);
            assert.strictEqual(json.error, 'Admin access required');
        }
    });

    test('unauthenticated requests are rejected on checkout and status', async () => {
        assert.strictEqual((await api('POST', '/v3/billing/checkout', null, {})).status, 401);
        assert.strictEqual((await api('GET', '/v3/billing/status', null)).status, 401);
    });

    test('status starts at none before any checkout', async () => {
        const { status, json } = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(status, 200);
        assert.strictEqual(json.status, 'none');
        assert.strictEqual(json.setupFeePaid, false);
    });

    test('checkout creates a session and returns its URL', async () => {
        const { status, json } = await api('POST', '/v3/billing/checkout', adminToken, {});
        assert.strictEqual(status, 200);
        assert.ok(typeof json.url === 'string' && json.url.startsWith('https://'), 'expected a checkout URL');
        assert.ok(typeof json.sessionId === 'string' && json.sessionId.length > 0, 'expected a session id');
        assert.strictEqual(json.status, 'incomplete');
        firstSessionId = json.sessionId;

        const st = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(st.json.status, 'incomplete');
        assert.ok(st.json.stripeCustomerId, 'expected a Stripe customer id to be stored');
        customerId = st.json.stripeCustomerId;
    });

    test('checkout is idempotent per label: open session is reused', async () => {
        const { status, json } = await api('POST', '/v3/billing/checkout', adminToken, {});
        assert.strictEqual(status, 200);
        assert.strictEqual(json.sessionId, firstSessionId, 'a second checkout must reuse the open session');
        assert.strictEqual(json.reused, true);
    });

    test('webhook rejects a bad signature with 400', async () => {
        const { status, json } = await api(
            'POST', '/v3/billing/webhook', null,
            JSON.stringify(stripeEvent('ping', {})),
            { 'Stripe-Signature': 't=123,v1=deadbeef' }
        );
        assert.strictEqual(status, 400);
        assert.match(json.error, /signature/i);
    });

    test('webhook rejects a signature made with the wrong secret', async () => {
        const { status } = await webhook('ping', {}, 'whsec_wrong_secret');
        assert.strictEqual(status, 400);
    });

    test('webhook ignores unknown event types with 200', async () => {
        const { status, json } = await webhook('customer.created', { id: customerId });
        assert.strictEqual(status, 200);
        assert.strictEqual(json.received, true);
        const st = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(st.json.status, 'incomplete', 'unknown events must not change state');
    });

    test('checkout.session.completed -> active, setup fee paid', async () => {
        // The subscription id is unknown to the stub, which exercises the
        // retrieve-failure fallback (still marks the subscription active).
        const { status } = await webhook('checkout.session.completed', {
            id: firstSessionId,
            customer: customerId,
            subscription: 'sub_stub_probe_1'
        });
        assert.strictEqual(status, 200);

        const st = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(st.json.status, 'active');
        assert.strictEqual(st.json.setupFeePaid, true);
        assert.strictEqual(st.json.stripeSubscriptionId, 'sub_stub_probe_1');
    });

    test('checkout while active does not open a new session', async () => {
        const { status, json } = await api('POST', '/v3/billing/checkout', adminToken, {});
        assert.strictEqual(status, 200);
        assert.strictEqual(json.alreadyActive, true);
        assert.strictEqual(json.status, 'active');
    });

    test('customer.subscription.updated -> status follows Stripe', async () => {
        const periodEnd = Math.floor(Date.now() / 1000) + 60 * 24 * 3600;
        const { status } = await webhook('customer.subscription.updated', {
            id: 'sub_stub_probe_1',
            customer: customerId,
            status: 'trialing',
            current_period_end: periodEnd
        });
        assert.strictEqual(status, 200);

        const st = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(st.json.status, 'trialing');
        assert.strictEqual(
            new Date(st.json.currentPeriodEnd).getTime(),
            periodEnd * 1000,
            'current period end must track the subscription object'
        );
    });

    test('invoice.payment_failed -> past_due', async () => {
        const { status } = await webhook('invoice.payment_failed', {
            id: 'in_stub_probe_1',
            customer: customerId
        });
        assert.strictEqual(status, 200);

        const st = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(st.json.status, 'past_due');
    });

    test('customer.subscription.deleted -> canceled', async () => {
        const { status } = await webhook('customer.subscription.deleted', {
            id: 'sub_stub_probe_1',
            customer: customerId,
            status: 'canceled'
        });
        assert.strictEqual(status, 200);

        const st = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(st.json.status, 'canceled');
    });

    test('checkout after cancel opens a fresh session', async () => {
        const { status, json } = await api('POST', '/v3/billing/checkout', adminToken, {});
        assert.strictEqual(status, 200);
        assert.ok(json.sessionId && json.sessionId !== firstSessionId, 'expected a new session after cancel');
        assert.strictEqual(json.status, 'incomplete');
        // Same Stripe customer is reused across checkouts for the label.
        const st = await api('GET', '/v3/billing/status', adminToken);
        assert.strictEqual(st.json.stripeCustomerId, customerId);
    });
});

// ---------------------------------------------------------------------------
// Stub client unit checks (no server): signature scheme + test-mode guard
// ---------------------------------------------------------------------------
describe('stripeClient unit', () => {
    const { createStubClient, getStripeClient, verifyStubSignature } = require('../../src/billing/stripeClient');

    test('stub verifies its own signatures and rejects tampering', () => {
        const stub = createStubClient();
        const { header, body } = signTestWebhook({ type: 'ping' }, WEBHOOK_SECRET);
        const event = stub.webhooks.constructEvent(body, header, WEBHOOK_SECRET);
        assert.strictEqual(event.type, 'ping');
        assert.throws(
            () => stub.webhooks.constructEvent(body + 'tampered', header, WEBHOOK_SECRET),
            /signature/i
        );
        assert.throws(
            () => verifyStubSignature(body, 't=1,v1=nope', WEBHOOK_SECRET),
            /signature/i
        );
    });

    test('stub checkout session create/retrieve round-trips', async () => {
        const stub = createStubClient();
        const session = await stub.checkout.sessions.create({ mode: 'subscription', customer: 'cus_x' });
        assert.ok(session.url.startsWith('https://'));
        const again = await stub.checkout.sessions.retrieve(session.id);
        assert.strictEqual(again.id, session.id);
        const sub = await stub.subscriptions.retrieve(session.subscription);
        assert.strictEqual(sub.status, 'active');
    });

    test('getStripeClient refuses non-test keys', () => {
        const config = require('../../src/config');
        const prev = { ...config.stripe };
        config.stripe = { ...prev, stub: false, secretKey: 'sk_live_abc' };
        assert.throws(() => getStripeClient(), /test/i);
        config.stripe = prev;
    });
});
