/**
 * src/routes/oauth.js
 *
 * Per-artist OAuth: artists connect their OWN provider accounts
 * (spotify, instagram, tiktok, youtube, twitter).
 *
 * Tokens are encrypted at rest (AES-256-GCM, src/oauth/tokenCrypto.js).
 * No background sync loops are built here — connection + token storage only.
 *
 * Routes (4):
 *   GET    /v3/oauth/:provider/authorize   (auth)  provider auth URL + state
 *   GET    /v3/oauth/:provider/callback    (PUBLIC) provider redirect target;
 *          authenticity comes from the single-use state token, not a JWT
 *   GET    /v3/oauth/status                (auth)  connected providers (no secrets)
 *   DELETE /v3/oauth/:provider             (auth)  disconnect
 *
 * Artist scoping: an artist-role user acts for their own artistId (derived
 * from their artistAccess grant). Admins pass ?artistId= explicitly.
 *
 * When OAuth is unconfigured (no OAUTH_TOKEN_KEY, or the provider's client
 * id/secret missing and OAUTH_STUB off) the authorize/callback routes answer
 * 503 naming the missing variables — the app boots and serves everything
 * else normally (same convention as the billing workstream).
 */

'use strict';

const crypto = require('crypto');

const { PROVIDERS, PROVIDER_NAMES, providerConfigured, redirectUriFor, exchangeCode } = require('../oauth/providers');
const { oauthCryptoEnabled, encryptToken, MISSING_KEY_MESSAGE } = require('../oauth/tokenCrypto');

/** Single-use state tokens: state -> { userId, artistId, provider, createdAt }. */
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function mintState(binding) {
    const state = crypto.randomBytes(24).toString('hex');
    pendingStates.set(state, { ...binding, createdAt: Date.now() });
    return state;
}

function consumeState(state) {
    const binding = pendingStates.get(state);
    if (binding) pendingStates.delete(state);
    if (!binding) return null;
    if (Date.now() - binding.createdAt > STATE_TTL_MS) return null;
    return binding;
}

// Prune expired states opportunistically (cheap; keeps the Map bounded).
setInterval(() => {
    const now = Date.now();
    for (const [state, binding] of pendingStates) {
        if (now - binding.createdAt > STATE_TTL_MS) pendingStates.delete(state);
    }
}, STATE_TTL_MS).unref();

function requireAdminOrArtist(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    next();
}

/**
 * Resolve the artist this request acts for.
 * Admin: explicit ?artistId= (or body.artistId). Artist role: their own grant.
 * Returns { artistId } or sends the error response and returns null.
 */
function resolveArtistId(req, res) {
    if (req.user.role === 'admin') {
        const artistId = req.query.artistId || (req.body && req.body.artistId);
        if (!artistId) {
            res.status(400).json({ error: 'artistId is required for admin OAuth actions' });
            return null;
        }
        return { artistId: String(artistId) };
    }
    const access = req.user.artistAccess;
    if (typeof access === 'string' && /^art_[A-Za-z0-9]+$/.test(access)) {
        return { artistId: access };
    }
    res.status(403).json({ error: 'OAuth connections require an artist account' });
    return null;
}

function oauthUnavailable(res) {
    if (!oauthCryptoEnabled()) {
        return res.status(503).json({ error: MISSING_KEY_MESSAGE });
    }
    return null;
}

function register(app, ctx) {
    const { authenticateToken, ArtistOAuth, logger } = ctx;

    // Step 1 — hand the artist a provider authorization URL.
    app.get('/v3/oauth/:provider/authorize', authenticateToken, requireAdminOrArtist, async (req, res) => {
        const provider = String(req.params.provider || '').toLowerCase();
        if (!PROVIDERS[provider]) {
            return res.status(400).json({ error: `Unknown provider. Supported: ${PROVIDER_NAMES.join(', ')}` });
        }
        if (oauthUnavailable(res)) return;
        if (!providerConfigured(provider)) {
            return res.status(503).json({
                error: `OAuth provider "${provider}" is not configured. Set OAUTH_${provider.toUpperCase()}_CLIENT_ID and ` +
                    `OAUTH_${provider.toUpperCase()}_CLIENT_SECRET, or OAUTH_STUB=true for tests — see .env.example.`
            });
        }
        const resolved = resolveArtistId(req, res);
        if (!resolved) return;

        const state = mintState({ userId: req.user.id, artistId: resolved.artistId, provider });
        const { clientId } = require('../oauth/providers').providerEnv(provider);
        const authorizeUrl = PROVIDERS[provider].authorizeUrl({
            clientId: clientId || 'stub-client-id',
            redirectUri: redirectUriFor(provider),
            state
        });
        res.json({ provider, authorizeUrl, state });
    });

    // Step 2 — provider redirect target. PUBLIC: the browser arrives here
    // without a JWT, so the single-use state token carries the binding.
    app.get('/v3/oauth/:provider/callback', async (req, res) => {
        const provider = String(req.params.provider || '').toLowerCase();
        if (!PROVIDERS[provider]) {
            return res.status(400).json({ error: `Unknown provider. Supported: ${PROVIDER_NAMES.join(', ')}` });
        }
        if (oauthUnavailable(res)) return;

        const { code, state } = req.query;
        if (!code || !state) {
            return res.status(400).json({ error: 'Missing code or state' });
        }
        const binding = consumeState(String(state));
        if (!binding || binding.provider !== provider) {
            return res.status(400).json({ error: 'Invalid or expired state' });
        }

        try {
            const tokens = await exchangeCode(provider, String(code));
            if (!tokens.accessToken) throw new Error('Provider returned no access token');
            const expiresAt = tokens.expiresIn
                ? new Date(Date.now() + tokens.expiresIn * 1000)
                : null;
            await ArtistOAuth.upsert({
                artistId: binding.artistId,
                provider,
                accessTokenEnc: encryptToken(tokens.accessToken),
                refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
                expiresAt,
                scopes: tokens.scope || null,
                providerUserId: null
            });
            res.json({ connected: true, provider, artistId: binding.artistId });
        } catch (err) {
            if (logger) logger.error('OAuth callback failed:', err.message);
            res.status(502).json({ error: `Token exchange failed: ${err.message}` });
        }
    });

    // Which providers are connected (metadata only — never token values).
    app.get('/v3/oauth/status', authenticateToken, requireAdminOrArtist, async (req, res) => {
        const resolved = resolveArtistId(req, res);
        if (!resolved) return;
        const rows = await ArtistOAuth.findAll({ where: { artistId: resolved.artistId } });
        res.json({
            artistId: resolved.artistId,
            connections: rows.map((r) => ({
                provider: r.provider,
                connectedAt: r.createdAt,
                expiresAt: r.expiresAt,
                scopes: r.scopes
            }))
        });
    });

    // Disconnect a provider.
    app.delete('/v3/oauth/:provider', authenticateToken, requireAdminOrArtist, async (req, res) => {
        const provider = String(req.params.provider || '').toLowerCase();
        if (!PROVIDERS[provider]) {
            return res.status(400).json({ error: `Unknown provider. Supported: ${PROVIDER_NAMES.join(', ')}` });
        }
        const resolved = resolveArtistId(req, res);
        if (!resolved) return;
        const deleted = await ArtistOAuth.destroy({
            where: { artistId: resolved.artistId, provider }
        });
        res.json({ disconnected: deleted > 0, provider, artistId: resolved.artistId });
    });
}

module.exports = { register };
