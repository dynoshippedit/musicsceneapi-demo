/**
 * src/payments/index.js
 *
 * Payment-provider registry. Stripe Connect (the label's own account) is
 * the first implementation; a second provider plugs in here without
 * touching the P&L, export, or attribution code.
 */

'use strict';

const stripe = require('./providers/stripe');

const providers = { stripe };

const PROVIDER_IDS = Object.keys(providers);

function getProvider(id) {
    const p = providers[id];
    if (!p) throw new Error(`Unknown payment provider: ${id}`);
    return p;
}

module.exports = { PROVIDER_IDS, getProvider, providers };
