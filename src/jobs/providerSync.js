'use strict';

/**
 * src/jobs/providerSync.js — provider synchronization runner
 * (2026-09-28, audit gap 5).
 *
 * What this is:
 *   A durable, observable runner for provider syncs (Spotify artist stats,
 *   Stripe sales pull). Every run is a `ProviderSyncExecution` row:
 *   idempotency key, duplicate-execution protection, per-attempt history,
 *   bounded retries with backoff, terminal status
 *   (succeeded|failed|blocked|fixture), timestamps, and a SANITIZED error
 *   summary (no tokens ever touch the database).
 *
 * What this is NOT:
 *   - Not a live-data guarantee. Without provider credentials the adapters
 *     run in FIXTURE mode: deterministic, zero-network, unmistakably
 *     labeled `fixture: true`, and never writing provider data.
 *   - Not a Stats-table writer for Spotify. Spotify's Web API exposes
 *     followers/popularity — NOT monthly listeners or stream counts — so
 *     the live adapter records the verbatim observation on the execution
 *     row instead of fabricating Stats.listeners/streams (the Phase 1B
 *     fabrication removal stands). Persisting provider-verbatim stats
 *     needs a schema follow-up (e.g. a provider_verbatim JSON column).
 *
 * Scheduler registration is explicit: src/jobs/index.js registers this
 * job only when PROVIDER_SYNC_ENABLED=true (and SCHEDULE_JOBS is not
 * 'false'). A manual admin trigger lives at POST /v3/sync/run;
 * execution history at GET /v3/sync/executions.
 *
 * Adapters are injected (createAdapters) so tests prove retries, failure
 * visibility, idempotency, and permissions with fixtures and zero network.
 */

const cron = require('node-cron');
const logger = require('../config/logger');

const PROVIDERS = ['spotify', 'stripe'];
const KINDS = {
    spotify: ['artist-stats'],
    stripe: ['sales-pull']
};
const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000;
const STALE_RUNNING_MS = 30 * 60 * 1000; // a 'running' row older than this may be re-run
const SCHEDULE = '0 4 * * *'; // daily 04:00, only when PROVIDER_SYNC_ENABLED=true

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Strip anything credential-shaped from an error before persistence.
 * Provider errors routinely echo tokens, keys, and secrets.
 */
function sanitizeErrorSummary(err) {
    let msg = err && err.message ? String(err.message) : String(err);
    msg = msg.replace(/(bearer\s+)[\w\-.~+/=]+/gi, '$1[redacted]');
    msg = msg.replace(/(api[_-]?key\s*[:=]\s*)['"]?[\w\-.~+/=]+['"]?/gi, '$1[redacted]');
    msg = msg.replace(/(\btoken\s*[:=]\s*)['"]?[\w\-.~+/=]{8,}['"]?/gi, '$1[redacted]');
    msg = msg.replace(/sk_(live|test)_[A-Za-z0-9]+/g, 'sk_[redacted]');
    msg = msg.replace(/refresh[_-]?token[=:]\s*['"]?[\w\-.~+/=]+['"]?/gi, 'refresh_token=[redacted]');
    return msg.slice(0, 500);
}

function validateProviderKind(provider, kind) {
    if (!PROVIDERS.includes(provider)) {
        throw new Error(`unknown provider "${provider}" (expected one of: ${PROVIDERS.join(', ')})`);
    }
    if (!KINDS[provider].includes(kind)) {
        throw new Error(`unknown kind "${kind}" for ${provider} (expected one of: ${KINDS[provider].join(', ')})`);
    }
}

/**
 * Default adapter set, wired to the existing provider architecture:
 * integrations/spotify.js (singleton), src/billing/stripeClient.js,
 * ArtistOAuth / PaymentConnection tables, src/oauth/tokenCrypto.js.
 *
 * @param {object} [overrides] { spotifyLib, stripeLib } for tests
 */
function createAdapters(overrides = {}) {
    const spotifyLib = overrides.spotifyLib || require('../../integrations/spotify');
    const stripeLib = overrides.stripeLib || require('../billing/stripeClient');

    const spotify = {
        provider: 'spotify',
        isConfigured() {
            try {
                return typeof spotifyLib.isConfigured === 'function'
                    ? spotifyLib.isConfigured()
                    : Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
            } catch (_) {
                return false;
            }
        },
        /**
         * @returns {object} { fixture:true, ... } | { blocked: reason } | live summary
         */
        async run(ctx) {
            const artists = ctx.artists || [];
            if (!this.isConfigured()) {
                // FIXTURE MODE: deterministic, zero network, labeled.
                return {
                    fixture: true,
                    artistsScanned: artists.length,
                    synced: artists.map((a) => ({
                        artistId: a.id || a,
                        followers: 1000 + String(a.id || a).length * 7,
                        popularity: 42
                    })),
                    note: 'FIXTURE: no Spotify credentials configured. No live API calls were made and no provider data was written.'
                };
            }
            const { ArtistOAuth } = ctx.models;
            const links = ArtistOAuth ? await ArtistOAuth.findAll({ where: { provider: 'spotify' } }) : [];
            if (links.length === 0) {
                return { blocked: 'Spotify credentials are configured but no artist has a linked Spotify account; connect via the OAuth flow first.' };
            }
            const { decryptToken, oauthCryptoEnabled } = require('../oauth/tokenCrypto');
            if (!oauthCryptoEnabled()) {
                throw new Error('OAUTH_TOKEN_KEY is not configured; cannot decrypt stored Spotify tokens.');
            }
            const SpotifyWebApi = require('spotify-web-api-node');
            const SafeStatsSchema = require('../../modules/SafeStatsSchema');
            const synced = [];
            for (const link of links) {
                const accessToken = decryptToken(link.accessTokenEnc);
                const api = new SpotifyWebApi();
                api.setAccessToken(accessToken);
                // May throw (network/auth) -> retryable.
                const resp = await api.getArtist(link.providerUserId);
                const body = resp.body || {};
                const observed = {
                    followers: body.followers?.total ?? 0,
                    popularity: body.popularity ?? 0,
                    social: { spotify: body.followers?.total ?? 0 },
                    meta: {
                        dataSource: 'spotify_api',
                        lastUpdated: new Date().toISOString(),
                        spotifyId: link.providerUserId,
                        spotifyUrl: body.external_urls?.spotify || ''
                    },
                    provenance: { source: 'spotify_api', observedAt: new Date().toISOString(), basis: 'measured' }
                };
                SafeStatsSchema.parse(observed); // throws on shape drift -> retryable
                synced.push({ artistId: link.artistId, followers: observed.followers, popularity: observed.popularity });
            }
            // NOTE: verbatim observations are recorded on the execution row
            // (resultSummary). They are NOT written to Stats.listeners /
            // Stats.streams: Spotify's API does not provide those metrics and
            // the old followers-as-listeners mapping was removed as a
            // fabrication (Phase 1B). A provider_verbatim column is the
            // follow-up that would make Stats writes honest.
            return { artistsSynced: synced.length, synced };
        }
    };

    const stripe = {
        provider: 'stripe',
        isConfigured() {
            return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'your_stripe_secret_key_here');
        },
        async run(ctx) {
            if (!this.isConfigured()) {
                return {
                    fixture: true,
                    salesPulled: 0,
                    note: 'FIXTURE: no Stripe credentials configured. No live API calls were made and no sales were pulled.'
                };
            }
            const { PaymentConnection } = ctx.models;
            const conn = PaymentConnection ? await PaymentConnection.findByPk('stripe') : null;
            if (!conn || conn.status !== 'connected') {
                return { blocked: 'Stripe keys are configured but no Stripe account is connected; complete the Connect OAuth flow first.' };
            }
            // Live pull (test mode only — the platform never touches live
            // charges; PaymentConnection.livemode is always false).
            // Any throw here (auth/network) is retryable.
            const client = stripeLib.getStripeClient();
            const charges = await client.charges.list({ limit: 100 });
            return {
                salesPulled: Array.isArray(charges?.data) ? charges.data.length : 0,
                livemode: false,
                note: 'test-mode pull; normalization into DirectSale rows is a follow-up (see docs/audit/06).'
            };
        }
    };

    return { spotify, stripe };
}

/**
 * Run one provider sync with idempotency, retries, and full history.
 *
 * @param {object} opts
 * @param {string} opts.provider 'spotify'|'stripe'
 * @param {string} opts.kind provider-specific kind
 * @param {string} [opts.idempotencyKey] defaults to provider:kind:YYYY-MM-DDTHH
 * @param {string} [opts.triggeredBy] admin email or 'scheduler'
 * @param {object} opts.models must include ProviderSyncExecution (+ ArtistOAuth/PaymentConnection for live)
 * @param {object} [opts.adapters] from createAdapters()
 * @param {number} [opts.maxAttempts]
 * @param {function} [opts.sleep] injectable backoff sleep (tests pass () => Promise.resolve())
 * @param {object[]} [opts.artists] artist list handed to adapters
 * @returns {Promise<{execution: Model, duplicate: boolean}>}
 */
async function runProviderSync({
    provider, kind, idempotencyKey, triggeredBy = 'manual',
    models, adapters, maxAttempts = DEFAULT_MAX_ATTEMPTS,
    sleep = defaultSleep, artists = []
}) {
    validateProviderKind(provider, kind);
    if (!models || !models.ProviderSyncExecution) {
        throw new Error('models.ProviderSyncExecution is required');
    }
    const { ProviderSyncExecution } = models;
    const adapter = (adapters || createAdapters())[provider];
    if (!adapter) throw new Error(`no adapter for provider "${provider}"`);

    const key = idempotencyKey || `${provider}:${kind}:${new Date().toISOString().slice(0, 13)}`;

    const [exec, created] = await ProviderSyncExecution.findOrCreate({
        where: { idempotencyKey: key },
        defaults: {
            provider, kind, status: 'running', attempt: 0, maxAttempts,
            triggeredBy: String(triggeredBy).slice(0, 120),
            attempts: [], fixture: false, startedAt: new Date()
        }
    });

    if (!created) {
        await exec.reload();
        const terminal = ['succeeded', 'failed', 'blocked', 'fixture'];
        if (terminal.includes(exec.status)) {
            return { execution: exec, duplicate: true }; // already ran; never re-run
        }
        // 'running' — duplicate protection unless the row is stale (crashed worker).
        const ageMs = Date.now() - new Date(exec.startedAt).getTime();
        if (ageMs < STALE_RUNNING_MS) {
            return { execution: exec, duplicate: true };
        }
        // Stale: reset and take over the run.
        await exec.update({ status: 'running', attempt: 0, attempts: [], startedAt: new Date(), triggeredBy: String(triggeredBy).slice(0, 120) });
    }

    const ctx = { models, artists, execution: exec };
    const attempts = Array.isArray(exec.attempts) ? [...exec.attempts] : [];
    let n = 0;
    while (n < maxAttempts) {
        n += 1;
        await exec.update({ attempt: n });
        try {
            const result = await adapter.run(ctx);
            attempts.push({ n, at: new Date().toISOString(), ok: true });
            if (result && result.blocked) {
                await exec.update({
                    status: 'blocked', finishedAt: new Date(),
                    errorSummary: String(result.blocked).slice(0, 500),
                    attempts, resultSummary: { blocked: true }
                });
            } else {
                const isFixture = Boolean(result && result.fixture);
                await exec.update({
                    status: isFixture ? 'fixture' : 'succeeded',
                    fixture: isFixture,
                    finishedAt: new Date(),
                    attempts,
                    resultSummary: result && typeof result === 'object' ? result : { ok: true }
                });
            }
            await exec.reload();
            return { execution: exec, duplicate: false };
        } catch (err) {
            const summary = sanitizeErrorSummary(err);
            attempts.push({ n, at: new Date().toISOString(), ok: false, error: summary });
            if (logger) logger.warn(`[providerSync] ${provider}/${kind} attempt ${n}/${maxAttempts} failed: ${summary}`);
            if (n >= maxAttempts) {
                await exec.update({ status: 'failed', finishedAt: new Date(), errorSummary: summary, attempts });
                await exec.reload();
                return { execution: exec, duplicate: false };
            }
            await exec.update({ attempts: [...attempts] });
            await sleep(BACKOFF_BASE_MS * 2 ** (n - 1));
        }
    }
    // Unreachable (loop always returns), but fail closed.
    await exec.update({ status: 'failed', finishedAt: new Date(), errorSummary: 'exhausted attempts without a terminal state', attempts });
    await exec.reload();
    return { execution: exec, duplicate: false };
}

/**
 * Register the daily scheduled sync. Called explicitly by
 * src/jobs/index.js when PROVIDER_SYNC_ENABLED=true.
 *
 * @param {object} [opts] { models, adapters, triggeredBy }
 * @returns {import('node-cron').ScheduledTask}
 */
function register({ models, adapters, triggeredBy = 'scheduler' } = {}) {
    if (!models || !models.ProviderSyncExecution) {
        throw new Error('providerSync.register requires models.ProviderSyncExecution');
    }
    return cron.schedule(SCHEDULE, async () => {
        for (const provider of PROVIDERS) {
            for (const kind of KINDS[provider]) {
                try {
                    await runProviderSync({ provider, kind, triggeredBy, models, adapters });
                } catch (err) {
                    if (logger) logger.error(`[providerSync] scheduled ${provider}/${kind} errored:`, sanitizeErrorSummary(err));
                }
            }
        }
    });
}

module.exports = {
    runProviderSync,
    createAdapters,
    register,
    sanitizeErrorSummary,
    validateProviderKind,
    PROVIDERS,
    KINDS,
    SCHEDULE,
    DEFAULT_MAX_ATTEMPTS
};
