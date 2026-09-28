/**
 * src/payments/providers/stripe.js
 *
 * Stripe Connect implementation of the payment-provider interface
 * (see src/payments/providerInterface.js).
 *
 * THIS IS NOT THE PLATFORM'S BILLING. The platform's own subscription
 * billing lives in src/billing/stripeClient.js and charges the LABEL for
 * using this software. THIS module reads the LABEL's OWN Stripe account —
 * connected by the label via OAuth — so the label can see its direct sales
 * and the API can attribute what sold per managed artist.
 *
 * TEST MODE ONLY. The OAuth exchange refuses livemode accounts, and every
 * live API call is authenticated with the platform's test-mode secret key
 * (assertTestKey, same as src/billing/stripeClient.js). There is no code
 * path that can touch real money.
 *
 * Scopes: the Connect authorization URL requests `read_only`. This API is
 * a lens on the label's sales — it can never create charges, refunds, or
 * payouts on the connected account.
 *
 * Stub mode (PAYMENTS_STUB=true, test-only): an in-memory fake implementing
 * the exact SDK surface pullSales/pullPayouts use (charges.list,
 * payouts.list, invoices.retrieve). The stub NEVER touches api.stripe.com.
 * Fixtures are injectable via PAYMENTS_STUB_CHARGES_FILE /
 * PAYMENTS_STUB_PAYOUTS_FILE (re-read per pull) or the __setConnectClient
 * unit-level seam.
 */

'use strict';

const axios = require('axios');
const config = require('../../config');

const CONNECT_AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize';
const CONNECT_TOKEN_URL = 'https://connect.stripe.com/oauth/token';

const CURRENCY_RE = /^[A-Z]{3}$/;

/** Refuse anything that is not a test-mode key. Live keys have no business here. */
function assertTestKey(key) {
    if (typeof key !== 'string' || !key.startsWith('sk_test_')) {
        throw new Error('Refusing non-test Stripe key: the platform STRIPE_SECRET_KEY must start with sk_test_ (TEST MODE ONLY).');
    }
}

function paymentsConfig() {
    return (config.payments && config.payments.stripe) || {};
}

function isConfigured() {
    if (paymentsConfig().stub) return true;
    const { clientId, clientSecret } = paymentsConfig();
    if (!clientId || !clientSecret) return false;
    try {
        return require('../../oauth/tokenCrypto').oauthCryptoEnabled();
    } catch (_) {
        return false;
    }
}

function notConfiguredMessage() {
    if (paymentsConfig().stub) return 'unreachable: stub is on';
    const missing = [];
    const { clientId, clientSecret } = paymentsConfig();
    if (!clientId) missing.push('LABEL_STRIPE_CLIENT_ID');
    if (!clientSecret) missing.push('LABEL_STRIPE_CLIENT_SECRET');
    try {
        if (!require('../../oauth/tokenCrypto').oauthCryptoEnabled()) missing.push('OAUTH_TOKEN_KEY');
    } catch (_) {
        missing.push('OAUTH_TOKEN_KEY');
    }
    return 'Label Stripe Connect is not configured. Set ' + missing.join(', ') +
        ' (or PAYMENTS_STUB=true for tests) — see .env.example.';
}

function redirectUri() {
    return paymentsConfig().redirectUri || 'http://localhost:3000/v3/direct-sales/connect/callback';
}

/**
 * Step 1 — authorization URL for the LABEL's own Stripe account.
 * read_only scope: the API can read sales, never move money.
 */
function authorizeUrl({ clientId, redirectUri: redirect, state }) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'read_only',
        redirect_uri: redirect,
        state
    });
    return `${CONNECT_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Step 2 — exchange the OAuth code for connected-account credentials.
 * Refuses live-mode accounts outright.
 *
 * Stub mode (PAYMENTS_STUB=true): no network — returns canned TEST
 * credentials so the regression suite can exercise the full OAuth
 * round-trip without touching connect.stripe.com.
 */
async function exchangeCode({ code, clientId, clientSecret }) {
    if (paymentsConfig().stub) {
        if (!code) {
            const e = new Error('Stripe OAuth token exchange failed: missing code');
            e.statusCode = 502;
            throw e;
        }
        return {
            accountId: 'acct_stub_test123',
            accessToken: 'sk_test_stub_connect_access',
            refreshToken: null,
            livemode: false
        };
    }
    let resp;
    try {
        resp = await axios.post(CONNECT_TOKEN_URL, new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            client_secret: clientSecret
        }).toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });
    } catch (err) {
        const detail = err.response && err.response.data && err.response.data.error_description
            ? err.response.data.error_description
            : err.message;
        const e = new Error(`Stripe OAuth token exchange failed: ${detail}`);
        e.statusCode = 502;
        throw e;
    }
    const data = resp.data || {};
    if (data.livemode) {
        throw new Error('Refusing live-mode Stripe Connect account: TEST MODE ONLY.');
    }
    if (!data.stripe_user_id || !data.access_token) {
        const e = new Error('Stripe OAuth exchange returned an incomplete response.');
        e.statusCode = 502;
        throw e;
    }
    return {
        accountId: data.stripe_user_id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        livemode: false
    };
}

// ---------------------------------------------------------------------------
// Normalization: Stripe charge -> provider-agnostic sale (integer cents).
// ---------------------------------------------------------------------------

function normalizeCharge(charge, lineItems) {
    const id = charge && charge.id;
    const amount = charge && charge.amount;
    const refunded = (charge && charge.amount_refunded) || 0;
    const currency = String((charge && charge.currency) || '').toUpperCase();
    const created = charge && charge.created;
    if (typeof id !== 'string' || !id) return { error: 'charge has no id' };
    if (!Number.isSafeInteger(amount) || amount < 0) return { error: `charge ${id} has a non-integer amount` };
    if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > amount) {
        return { error: `charge ${id} has an invalid amount_refunded` };
    }
    if (!CURRENCY_RE.test(currency)) return { error: `charge ${id} has an invalid currency` };
    const metadata = (charge && charge.metadata && typeof charge.metadata === 'object') ? charge.metadata : {};
    const productIds = [];
    const priceIds = [];
    for (const li of lineItems || []) {
        if (li && li.product_id && !productIds.includes(li.product_id)) productIds.push(String(li.product_id));
        if (li && li.price_id && !priceIds.includes(li.price_id)) priceIds.push(String(li.price_id));
    }
    // The label can also pin product/price attribution in charge metadata
    // (set in their Stripe dashboard or checkout); metadata wins over lines.
    if (metadata.product_id && !productIds.includes(String(metadata.product_id))) productIds.unshift(String(metadata.product_id));
    if (metadata.price_id && !priceIds.includes(String(metadata.price_id))) priceIds.unshift(String(metadata.price_id));
    return {
        value: {
            providerSaleId: id,
            amountCents: amount,
            amountRefundedCents: refunded,
            netCents: amount - refunded,
            currency,
            status: refunded <= 0 ? 'succeeded' : (refunded >= amount ? 'refunded' : 'partially_refunded'),
            occurredAt: created ? new Date(created * 1000) : new Date(),
            productIds,
            priceIds,
            description: (charge && charge.description) || null,
            metadata
        }
    };
}

/**
 * Best-effort invoice line expansion for product/price attribution.
 * A charge may have no invoice; failures degrade to "no line items",
 * never to a failed sync.
 */
async function lineItemsForCharge(client, accountId, charge) {
    // Test-stub escape hatch: stub fixtures carry line items inline.
    if (charge && Array.isArray(charge.__stubLines)) return charge.__stubLines;
    const invoiceId = charge && charge.invoice;
    if (!invoiceId || typeof invoiceId !== 'string') return [];
    try {
        const opts = accountId ? { stripeAccount: accountId } : undefined;
        const invoice = await client.invoices.retrieve(invoiceId, { expand: ['lines'] }, opts);
        const lines = (invoice && invoice.lines && invoice.lines.data) || [];
        return lines.map((l) => ({
            product_id: l.price && l.price.product ? String(l.price.product) : null,
            price_id: l.price && l.price.id ? String(l.price.id) : null
        })).filter((l) => l.product_id || l.price_id);
    } catch (_) {
        return [];
    }
}

/**
 * Pull charges from the LABEL's connected account.
 * `client` is the raw Stripe SDK (or stub); `accountId` selects the
 * connected account via the Stripe-Account header (real mode only).
 */
async function pullSales({ client, accountId, limit = 100 }) {
    const perPage = Math.max(1, Math.min(100, limit | 0 || 100));
    const opts = accountId ? { stripeAccount: accountId } : undefined;
    const resp = await client.charges.list({ limit: perPage }, opts);
    const charges = (resp && resp.data) || [];
    const sales = [];
    let skipped = 0;
    for (const charge of charges) {
        const lines = await lineItemsForCharge(client, accountId, charge);
        const normalized = normalizeCharge(charge, lines);
        if (normalized.error) {
            skipped++;
            continue;
        }
        sales.push(normalized.value);
    }
    return { sales, skipped };
}

// ---------------------------------------------------------------------------
// Payouts: reconciliation evidence, NOT per-artist revenue.
// ---------------------------------------------------------------------------

function normalizePayout(payout) {
    const id = payout && payout.id;
    const amount = payout && payout.amount;
    const currency = String((payout && payout.currency) || '').toUpperCase();
    const arrival = payout && payout.arrival_date;
    if (typeof id !== 'string' || !id) return { error: 'payout has no id' };
    if (!Number.isSafeInteger(amount) || amount < 0) return { error: `payout ${id} has a non-integer amount` };
    if (!CURRENCY_RE.test(currency)) return { error: `payout ${id} has an invalid currency` };
    return {
        value: {
            providerPayoutId: id,
            amountCents: amount,
            currency,
            status: (payout && payout.status) || null,
            arrivalAt: Number.isSafeInteger(arrival) ? new Date(arrival * 1000) : null,
            type: (payout && payout.type) || null
        }
    };
}

/**
 * Pull payouts from the LABEL's connected account. Payouts are
 * reconciliation visibility (money the provider sent to the label's bank),
 * never attributed to artists — they cross-cut many sales and currencies.
 */
async function pullPayouts({ client, accountId, limit = 100 }) {
    if (!client || !client.payouts || typeof client.payouts.list !== 'function') {
        return { payouts: [], skipped: 0, unsupported: true };
    }
    const perPage = Math.max(1, Math.min(100, limit | 0 || 100));
    const opts = accountId ? { stripeAccount: accountId } : undefined;
    const resp = await client.payouts.list({ limit: perPage }, opts);
    const payouts = (resp && resp.data) || [];
    const out = [];
    let skipped = 0;
    for (const p of payouts) {
        const normalized = normalizePayout(p);
        if (normalized.error) {
            skipped++;
            continue;
        }
        out.push(normalized.value);
    }
    return { payouts: out, skipped };
}

// ---------------------------------------------------------------------------
// Attribution: normalized sale + label-managed mappings -> artistId | null.
// Priority: charge metadata key match > price_id > product_id.
// Unmatched sales return null — reported as unattributed, never guessed.
// ---------------------------------------------------------------------------

function metadataMatchValue(matchValue) {
    const idx = String(matchValue).indexOf(':');
    if (idx <= 0) return null;
    return { key: String(matchValue).slice(0, idx), value: String(matchValue).slice(idx + 1) };
}

function attributeToArtist(sale, mappings) {
    if (!sale || !Array.isArray(mappings)) return null;
    const byType = { charge_metadata: [], price_id: [], product_id: [] };
    for (const m of mappings) {
        if (m && byType[m.matchType]) byType[m.matchType].push(m);
    }
    for (const m of byType.charge_metadata) {
        const kv = metadataMatchValue(m.matchValue);
        if (kv && sale.metadata && String(sale.metadata[kv.key]) === kv.value) return m.artistId;
    }
    for (const m of byType.price_id) {
        if (sale.priceIds && sale.priceIds.includes(String(m.matchValue))) return m.artistId;
    }
    for (const m of byType.product_id) {
        if (sale.productIds && sale.productIds.includes(String(m.matchValue))) return m.artistId;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Client factory: real SDK (test-mode platform key) or in-memory stub.
// ---------------------------------------------------------------------------

let connectClientOverride = null;

/**
 * Test-only fixture sources (PAYMENTS_STUB=true). Precedence:
 *   1. PAYMENTS_STUB_CHARGES_FILE — path to a JSON array of charge fixtures.
 *      Read on EVERY charges.list call so a test can rewrite the file
 *      between syncs (e.g. to simulate a refund landing later).
 *   2. PAYMENTS_STUB_CHARGES — inline JSON array.
 *   3. [] (no sales).
 *
 * Payouts mirror the same shape with PAYMENTS_STUB_PAYOUTS_FILE /
 * PAYMENTS_STUB_PAYOUTS (each entry: { id, amount, currency, status?,
 * arrival_date?, type? }).
 */
function readStubFixtures() {
    const fs = require('fs');
    const file = process.env.PAYMENTS_STUB_CHARGES_FILE;
    if (file) {
        try {
            const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (Array.isArray(arr)) return arr;
        } catch (_) { /* fall through to inline/empty */ }
    }
    const inline = process.env.PAYMENTS_STUB_CHARGES;
    if (inline) {
        try {
            const arr = JSON.parse(inline);
            if (Array.isArray(arr)) return arr;
        } catch (_) { /* fall through to empty */ }
    }
    return [];
}

function readStubPayoutFixtures() {
    const fs = require('fs');
    const file = process.env.PAYMENTS_STUB_PAYOUTS_FILE;
    if (file) {
        try {
            const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (Array.isArray(arr)) return arr;
        } catch (_) { /* fall through to inline/empty */ }
    }
    const inline = process.env.PAYMENTS_STUB_PAYOUTS;
    if (inline) {
        try {
            const arr = JSON.parse(inline);
            if (Array.isArray(arr)) return arr;
        } catch (_) { /* fall through to empty */ }
    }
    return [];
}

function createConnectStubClient() {
    return {
        __isStub: true,
        charges: {
            list: async () => ({ data: readStubFixtures(), has_more: false })
        },
        payouts: {
            list: async () => ({ data: readStubPayoutFixtures(), has_more: false })
        },
        invoices: {
            // Stub charges carry their line items inline (__stubLines); the
            // real path expands invoices over the API instead.
            retrieve: async () => null
        }
    };
}

function getConnectClient() {
    if (connectClientOverride) return connectClientOverride;
    if (paymentsConfig().stub) {
        return createConnectStubClient();
    }
    assertTestKey(config.stripe.secretKey);
    // Lazy require: machines without the SDK installed, or without keys,
    // must still boot and serve every non-payment route.
    // eslint-disable-next-line global-require
    const Stripe = require('stripe');
    const stripe = new Stripe(config.stripe.secretKey);
    // Wrap so pullSales can pass the connected account through uniformly;
    // the real SDK takes { stripeAccount } as the per-request options arg.
    return stripe;
}

/** Unit-level injection seam (not used by the spawned-server regression suite). */
function __setConnectClient(client) { connectClientOverride = client; }
function __clearConnectClient() { connectClientOverride = null; }

const stripeProvider = {
    id: 'stripe',
    displayName: 'Stripe Connect (label-owned account)',
    isConfigured,
    notConfiguredMessage,
    redirectUri,
    authorizeUrl,
    exchangeCode,
    pullSales,
    pullPayouts,
    normalizePayout,
    attributeToArtist,
    normalizeCharge,
    createConnectStubClient,
    getConnectClient,
    __setConnectClient,
    __clearConnectClient
};

require('../providerInterface').assertProviderShape(stripeProvider);

module.exports = stripeProvider;
