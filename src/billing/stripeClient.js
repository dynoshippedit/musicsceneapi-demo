/**
 * src/billing/stripeClient.js
 *
 * Stripe client factory for the label billing integration.
 *
 * TEST MODE ONLY. No live keys are ever accepted here on purpose: the factory
 * refuses any secret key that does not look like a test key (sk_test_...).
 * There is no code path that can issue a real charge.
 *
 * Two modes:
 *   1. Real SDK mode — STRIPE_SECRET_KEY is set (must start with sk_test_).
 *      Uses the pinned `stripe` npm package. Webhook verification delegates
 *      to `stripe.webhooks.constructEvent`, which requires the RAW request
 *      body (stashed as req.rawBody by the JSON middleware's verify hook —
 *      see src/middleware/index.js).
 *   2. Stub mode — STRIPE_STUB=true (test-only). Returns an in-memory fake
 *      that implements the exact SDK surface the routes use
 *      (customers.create, checkout.sessions.create/retrieve,
 *      subscriptions.retrieve, webhooks.constructEvent) with HMAC-SHA256
 *      signature verification that mirrors Stripe's t=...,v1=... scheme.
 *      The stub NEVER touches api.stripe.com. It exists so the regression
 *      suite can exercise the full HTTP surface without credentials.
 *
 * The stub instance is memoized per process so a checkout session created by
 * one request is retrievable by a later webhook in the same process.
 */

'use strict';

const crypto = require('crypto');
const config = require('../config');

let stubInstance = null;
let clientOverride = null;

/**
 * Verify a Stripe-style signature header against the raw payload.
 * Throws on any mismatch (mirrors stripe.webhooks.constructEvent behaviour).
 */
function verifyStubSignature(payload, header, secret) {
    const raw = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload || ''), 'utf8');
    const parts = String(header || '').split(',').reduce((acc, kv) => {
        const idx = kv.indexOf('=');
        if (idx > 0) acc[kv.slice(0, idx)] = kv.slice(idx + 1);
        return acc;
    }, {});
    const fail = (msg) => {
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
    };
    if (!parts.t || !parts.v1) fail('Invalid Stripe-Signature header');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${parts.t}.${raw.toString('utf8')}`, 'utf8')
        .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(parts.v1), 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) fail('Invalid webhook signature');
    return JSON.parse(raw.toString('utf8'));
}

/**
 * Build a valid Stripe-Signature header for a test payload. Exported so the
 * regression suite can sign webhook bodies the same way Stripe would.
 * @returns {{ header: string, body: string }}
 */
function signTestWebhook(payload, secret) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
    return { header: `t=${t},v1=${v1}`, body };
}

function createStubClient() {
    let seq = 0;
    const sessions = new Map();
    const subscriptions = new Map();
    const customers = new Map();
    const next = (prefix) => `${prefix}_stub_${(++seq).toString(36)}_${Date.now().toString(36)}`;
    const notFound = (what) => {
        const err = new Error(`No such ${what}`);
        err.statusCode = 404;
        return err;
    };

    return {
        __isStub: true,
        customers: {
            create: async (params = {}) => {
                const customer = { id: next('cus'), object: 'customer', ...params };
                customers.set(customer.id, customer);
                return customer;
            }
        },
        checkout: {
            sessions: {
                create: async (params = {}) => {
                    const subId = next('sub');
                    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
                    subscriptions.set(subId, {
                        id: subId,
                        object: 'subscription',
                        customer: params.customer || null,
                        status: 'active',
                        current_period_end: periodEnd
                    });
                    const session = {
                        id: next('cs'),
                        object: 'checkout.session',
                        status: 'open',
                        mode: 'subscription',
                        customer: params.customer || null,
                        subscription: subId,
                        ...params,
                        url: null
                    };
                    session.url = `https://checkout.stripe.com/stub/${session.id}`;
                    sessions.set(session.id, session);
                    return session;
                },
                retrieve: async (id) => {
                    const session = sessions.get(id);
                    if (!session) throw notFound('checkout session');
                    return session;
                }
            }
        },
        subscriptions: {
            retrieve: async (id) => {
                const sub = subscriptions.get(id);
                if (!sub) throw notFound('subscription');
                return sub;
            }
        },
        webhooks: {
            constructEvent: (payload, header, secret) => verifyStubSignature(payload, header, secret)
        }
    };
}

/** Refuse anything that is not a test-mode key. Live keys have no business here. */
function assertTestKey(key) {
    if (typeof key !== 'string' || !key.startsWith('sk_test_')) {
        throw new Error('Refusing non-test Stripe key: STRIPE_SECRET_KEY must start with sk_test_ (TEST MODE ONLY).');
    }
}

function getStripeClient() {
    if (clientOverride) return clientOverride;
    if (config.stripe.stub) {
        if (!stubInstance) stubInstance = createStubClient();
        return stubInstance;
    }
    assertTestKey(config.stripe.secretKey);
    // Lazy require: a machine without the SDK installed, or without keys,
    // must still boot and serve every non-billing route.
    // eslint-disable-next-line global-require
    const Stripe = require('stripe');
    return new Stripe(config.stripe.secretKey);
}

/** Unit-level injection seam (not used by the spawned-server regression suite). */
function __setStripeClient(client) { clientOverride = client; }
function __clearStripeClient() { clientOverride = null; stubInstance = null; }

module.exports = {
    getStripeClient,
    createStubClient,
    verifyStubSignature,
    signTestWebhook,
    __setStripeClient,
    __clearStripeClient
};
