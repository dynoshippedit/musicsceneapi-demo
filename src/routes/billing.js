/**
 * src/routes/billing.js
 *
 * Stripe billing (TEST MODE only — see src/billing/stripeClient.js).
 *
 * The label is billed through Stripe Checkout with a single session that
 * combines TWO line items:
 *   1. a ONE-TIME setup fee (STRIPE_SETUP_PRICE_ID) — invoiced immediately
 *      with the first subscription invoice;
 *   2. a RECURRING subscription (STRIPE_SUBSCRIPTION_PRICE_ID) — MONTHLY
 *      billing was chosen over yearly (lower onboarding commitment; the
 *      cadence is owned by the Stripe Price object, so switching to yearly
 *      later is a dashboard change, not a code change).
 *
 * Local state lives in the Subscription model (one row per label slug):
 * stripe customer id, subscription id, lifecycle status
 * (none|incomplete|trialing|active|past_due|canceled), current period end,
 * and whether the setup fee was paid. Stripe is the source of truth for
 * money; the local row is a read model updated by webhooks.
 *
 * Routes (3):
 *   POST   /v3/billing/checkout   (admin)  create/reuse a Checkout Session
 *   POST   /v3/billing/webhook    (public)  Stripe-signed event receiver
 *   GET    /v3/billing/status     (admin)  current subscription state
 *
 * When Stripe is not configured (no STRIPE_SECRET_KEY and no STRIPE_STUB),
 * the checkout and status routes answer 503 and the webhook answers 503 as
 * well (it cannot verify signatures). The app boots and serves everything
 * else normally.
 */

'use strict';

const { ACTIVE_LABEL_SLUG } = require('../profile');
const { getStripeClient } = require('../billing/stripeClient');

const SETUP_NOT_CONFIGURED =
    'Billing is not configured. Set STRIPE_SECRET_KEY (test mode), ' +
    'STRIPE_WEBHOOK_SECRET, STRIPE_SETUP_PRICE_ID and STRIPE_SUBSCRIPTION_PRICE_ID — see .env.example.';

/** Billing is usable when a key is present or the test stub is enabled. */
function stripeEnabled(config) {
    return !!(config.stripe && (config.stripe.stub || config.stripe.secretKey));
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

function toStatusJson(row) {
    return {
        label: ACTIVE_LABEL_SLUG,
        status: row ? row.status : 'none',
        setupFeePaid: row ? !!row.setupFeePaid : false,
        currentPeriodEnd: row && row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
        stripeCustomerId: row ? row.stripeCustomerId || null : null,
        stripeSubscriptionId: row ? row.stripeSubscriptionId || null : null
    };
}

/**
 * Apply one verified Stripe event to the local subscription row.
 * Unknown event types are ignored (200, no state change).
 */
async function applyEvent(event, { Subscription, logger }) {
    const type = event && event.type;
    const obj = (event && event.data && event.data.object) || {};

    const findRow = async () => {
        if (obj.id) {
            const bySub = await Subscription.findOne({ where: { stripeSubscriptionId: obj.id } });
            if (bySub) return bySub;
        }
        const customerId = obj.customer;
        if (customerId) {
            return Subscription.findOne({ where: { stripeCustomerId: customerId } });
        }
        return null;
    };

    if (type === 'checkout.session.completed') {
        const row = await Subscription.findOne({ where: { stripeCustomerId: obj.customer } });
        if (!row) {
            logger.warn('billing webhook: checkout.session.completed for unknown customer', { customer: obj.customer });
            return;
        }
        row.setupFeePaid = true;
        row.checkoutSessionId = null; // session consumed; a later checkout opens a fresh one
        if (obj.subscription) {
            row.stripeSubscriptionId = obj.subscription;
            try {
                const sub = await getStripeClient().subscriptions.retrieve(obj.subscription);
                row.status = sub.status || 'active';
                row.currentPeriodEnd = sub.current_period_end
                    ? new Date(sub.current_period_end * 1000)
                    : null;
            } catch (err) {
                logger.warn('billing webhook: subscription retrieve failed; marking active', { err: err.message });
                row.status = 'active';
            }
        } else {
            row.status = 'active';
        }
        await row.save();
        return;
    }

    if (type === 'customer.subscription.updated') {
        const row = await findRow();
        if (!row) return;
        row.status = obj.status || row.status;
        if (obj.current_period_end) row.currentPeriodEnd = new Date(obj.current_period_end * 1000);
        await row.save();
        return;
    }

    if (type === 'customer.subscription.deleted') {
        const row = await findRow();
        if (!row) return;
        row.status = 'canceled';
        await row.save();
        return;
    }

    if (type === 'invoice.payment_failed') {
        const row = await findRow();
        if (!row) return;
        row.status = 'past_due';
        await row.save();
        return;
    }

    if (type === 'invoice.payment_succeeded') {
        const row = await findRow();
        if (!row) return;
        // A successful payment after past_due clears the flag immediately
        // instead of waiting for the next subscription.updated event (which
        // may arrive late or not at all). Only past_due flips back — a
        // canceled subscription stays canceled.
        if (row.status === 'past_due') {
            row.status = 'active';
            await row.save();
        }
        return;
    }

    logger.info('billing webhook: ignoring unhandled event type', { type });
}

/**
 * @param {object} app Express application
 * @param {object} ctx dependency bundle from src/routes/context.js
 */
function register(app, ctx) {
    const { config, logger, authenticateToken, Subscription } = ctx;

    // Create (or reuse) a Checkout Session: one-time setup fee + monthly subscription.
    app.post('/v3/billing/checkout', authenticateToken, requireAdmin, async (req, res) => {
        try {
            if (!stripeEnabled(config)) {
                return res.status(503).json({ error: SETUP_NOT_CONFIGURED });
            }
            if (!config.stripe.setupPriceId || !config.stripe.subscriptionPriceId) {
                return res.status(503).json({
                    error: 'Billing price IDs are not configured (STRIPE_SETUP_PRICE_ID, STRIPE_SUBSCRIPTION_PRICE_ID).'
                });
            }

            const stripe = getStripeClient();
            const [row] = await Subscription.findOrCreate({
                where: { labelSlug: ACTIVE_LABEL_SLUG },
                defaults: { labelSlug: ACTIVE_LABEL_SLUG, status: 'none' }
            });

            // Idempotent per label: never open a second checkout while a
            // subscription is already live.
            if (row.stripeSubscriptionId && (row.status === 'trialing' || row.status === 'active')) {
                return res.status(200).json({ ...toStatusJson(row), alreadyActive: true });
            }

            // Reuse the Stripe customer across checkouts for this label.
            if (!row.stripeCustomerId) {
                const customer = await stripe.customers.create({
                    metadata: { labelSlug: ACTIVE_LABEL_SLUG, app: 'pulsegrid' }
                });
                row.stripeCustomerId = customer.id;
                await row.save();
            }

            // Reuse an still-open checkout session instead of opening another.
            if (row.checkoutSessionId) {
                try {
                    const existing = await stripe.checkout.sessions.retrieve(row.checkoutSessionId);
                    if (existing && existing.status === 'open' && existing.url) {
                        return res.status(200).json({
                            url: existing.url,
                            sessionId: existing.id,
                            status: row.status,
                            reused: true
                        });
                    }
                } catch (err) {
                    logger.warn('billing: previous checkout session not retrievable; creating a new one', {
                        err: err.message
                    });
                }
            }

            const session = await stripe.checkout.sessions.create({
                mode: 'subscription',
                customer: row.stripeCustomerId,
                line_items: [
                    // Recurring plan (monthly Price configured via env).
                    { price: config.stripe.subscriptionPriceId, quantity: 1 },
                    // One-time setup fee, invoiced together with the first
                    // subscription invoice (Stripe supports mixing one-time
                    // prices into subscription-mode Checkout Sessions).
                    { price: config.stripe.setupPriceId, quantity: 1 }
                ],
                success_url: config.stripe.successUrl,
                cancel_url: config.stripe.cancelUrl,
                metadata: { labelSlug: ACTIVE_LABEL_SLUG }
            });

            row.checkoutSessionId = session.id;
            row.status = 'incomplete';
            await row.save();

            return res.status(200).json({ url: session.url, sessionId: session.id, status: row.status });
        } catch (err) {
            logger.error('billing checkout failed', { err: err.message });
            return res.status(502).json({ error: 'Billing provider error; please retry.' });
        }
    });

    // Stripe-signed webhook. PUBLIC — no bearer token; authenticity comes
    // from the Stripe-Signature header verified against STRIPE_WEBHOOK_SECRET
    // over the raw request body (req.rawBody, stashed by the JSON middleware).
    app.post('/v3/billing/webhook', async (req, res) => {
        try {
            if (!stripeEnabled(config) || !config.stripe.webhookSecret) {
                return res.status(503).json({ error: SETUP_NOT_CONFIGURED });
            }
            const signature = req.headers['stripe-signature'];
            const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || ''), 'utf8');
            let event;
            try {
                event = getStripeClient().webhooks.constructEvent(raw, signature, config.stripe.webhookSecret);
            } catch (err) {
                return res.status(400).json({ error: 'Invalid webhook signature' });
            }
            await applyEvent(event, { Subscription, logger });
            return res.status(200).json({ received: true });
        } catch (err) {
            logger.error('billing webhook handler failed', { err: err.message });
            return res.status(500).json({ error: 'Webhook handler error' });
        }
    });

    // Current subscription state for this label's instance.
    app.get('/v3/billing/status', authenticateToken, requireAdmin, async (req, res) => {
        try {
            if (!stripeEnabled(config)) {
                return res.status(503).json({ error: SETUP_NOT_CONFIGURED });
            }
            const row = await Subscription.findOne({ where: { labelSlug: ACTIVE_LABEL_SLUG } });
            return res.status(200).json(toStatusJson(row));
        } catch (err) {
            logger.error('billing status failed', { err: err.message });
            return res.status(500).json({ error: 'Unable to read billing status' });
        }
    });
}

module.exports = { register, applyEvent, stripeEnabled };
