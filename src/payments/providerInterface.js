/**
 * src/payments/providerInterface.js
 *
 * The payment-provider interface. Stripe is the first implementation
 * (src/payments/providers/stripe.js); a second provider (e.g. a payout-file
 * importer, a merch-platform API) plugs in here without touching the P&L,
 * export, or attribution code.
 *
 * Every provider MUST implement:
 *
 *   id: string                        // 'stripe', ...
 *   displayName: string
 *   isConfigured(): boolean           // all secrets/keys present (or stub on)
 *   notConfiguredMessage(): string    // human-readable 503 body naming the missing vars
 *   authorizeUrl({ clientId, redirectUri, state }): string
 *       // OAuth authorization URL that sends the LABEL's own account holder
 *       // to the provider. Request READ-ONLY scopes: this API is a lens on
 *       // the label's sales, it can never move money.
 *   exchangeCode({ code, clientId, clientSecret }): Promise<{
 *       accountId, accessToken, refreshToken|null, livemode:boolean }>
 *       // Exchange the OAuth code. MUST refuse live mode (livemode === true)
 *       // — TEST MODE ONLY, same posture as the platform billing workstream.
 *   pullSales({ client, accountId, limit }): Promise<{ sales, skipped }>
 *       // Pull charges/refunds from the LABEL's connected account.
 *       // Returns NORMALIZED sales (integer cents, ISO currency):
 *       //   { providerSaleId, amountCents, amountRefundedCents, netCents,
 *       //     currency, status: 'succeeded'|'refunded'|'partially_refunded',
 *       //     occurredAt: Date, productIds: string[], priceIds: string[],
 *       //     description: string|null, metadata: object }
 *       // `skipped` counts provider records that failed normalization
 *       // (reported, never silently dropped).
 *   pullPayouts({ client, accountId, limit }): Promise<{ payouts, skipped }>
 *       // Pull payouts (reconciliation evidence, NOT per-artist revenue).
 *       // Returns NORMALIZED payouts (integer cents, ISO currency):
 *       //   { providerPayoutId, amountCents, currency,
 *       //     status: string|null, arrivalAt: Date|null, type: string|null }
 *       // Reported in the sync response for reconciliation visibility;
 *       // never attributed to artists.
 *   attributeToArtist(sale, mappings): string|null
 *       // Map a normalized sale to a roster artistId using the label-managed
 *       // mappings (see ArtistPaymentMapping). Returns null when nothing
 *       // matches — unattributed sales are reported, never guessed.
 *
 * Money discipline (same as the royalty workstream):
 *   - integer cents everywhere; no float math on money, ever
 *   - ISO 4217 currency codes, uppercase, stored per-record
 *   - no cross-currency conversion; totals are per-currency
 */

'use strict';

const REQUIRED_METHODS = [
    'isConfigured',
    'notConfiguredMessage',
    'authorizeUrl',
    'exchangeCode',
    'pullSales',
    'pullPayouts',
    'attributeToArtist'
];

/** Assert that an object satisfies the provider interface. Throws if not. */
function assertProviderShape(provider) {
    if (!provider || typeof provider !== 'object') {
        throw new Error('Payment provider must be an object');
    }
    if (typeof provider.id !== 'string' || !provider.id) {
        throw new Error('Payment provider must define a non-empty string id');
    }
    for (const method of REQUIRED_METHODS) {
        if (typeof provider[method] !== 'function') {
            throw new Error(`Payment provider "${provider.id}" is missing required method: ${method}`);
        }
    }
    return true;
}

module.exports = { REQUIRED_METHODS, assertProviderShape };
