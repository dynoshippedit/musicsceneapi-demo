/**
 * src/oauth/providers.js
 *
 * Per-artist OAuth provider registry.
 *
 * Each provider declares:
 *   - authorizeUrl({ clientId, redirectUri, state, scopes }) -> URL the
 *     artist's browser visits to grant access
 *   - tokenUrl + exchangeBody({ code, redirectUri, clientId, clientSecret })
 *     -> x-www-form-urlencoded body for the code exchange
 *   - normalizeTokenResponse(json) -> { accessToken, refreshToken, expiresIn, scope }
 *
 * Client ids/secrets come from env (OAUTH_<PROVIDER>_CLIENT_ID /
 * OAUTH_<PROVIDER>_CLIENT_SECRET); OAUTH_STUB=true bypasses the network and
 * returns canned tokens (test convention, mirrors STRIPE_STUB). The exchange
 * accepts an injectable fetch implementation so unit tests never touch the
 * real provider endpoints.
 *
 * No background sync loops are built here — connection + token storage only.
 */

'use strict';

function form(params) {
    return new URLSearchParams(params).toString();
}

const PROVIDERS = {
    spotify: {
        label: 'Spotify',
        authorizeBase: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        defaultScopes: ['user-read-email', 'user-read-private'],
        authorizeUrl({ clientId, redirectUri, state, scopes }) {
            return `${this.authorizeBase}?${form({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: redirectUri,
                scope: (scopes || this.defaultScopes).join(' '),
                state
            })}`;
        },
        exchangeBody({ code, redirectUri, clientId, clientSecret }) {
            return {
                body: form({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri,
                    client_id: clientId,
                    client_secret: clientSecret
                })
            };
        },
        normalizeTokenResponse(json) {
            return {
                accessToken: json.access_token,
                refreshToken: json.refresh_token || null,
                expiresIn: json.expires_in || 3600,
                scope: json.scope || ''
            };
        }
    },
    instagram: {
        label: 'Instagram',
        authorizeBase: 'https://www.instagram.com/oauth/authorize',
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        defaultScopes: ['user_profile', 'user_media'],
        authorizeUrl({ clientId, redirectUri, state, scopes }) {
            return `${this.authorizeBase}?${form({
                client_id: clientId,
                redirect_uri: redirectUri,
                scope: (scopes || this.defaultScopes).join(','),
                response_type: 'code',
                state
            })}`;
        },
        exchangeBody({ code, redirectUri, clientId, clientSecret }) {
            return {
                body: form({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    code
                })
            };
        },
        normalizeTokenResponse(json) {
            return {
                accessToken: json.access_token,
                refreshToken: null,
                expiresIn: json.expires_in || 3600 * 24 * 60,
                scope: ''
            };
        }
    },
    tiktok: {
        label: 'TikTok',
        authorizeBase: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        defaultScopes: ['user.info.basic'],
        authorizeUrl({ clientId, redirectUri, state, scopes }) {
            return `${this.authorizeBase}?${form({
                client_key: clientId,
                redirect_uri: redirectUri,
                scope: (scopes || this.defaultScopes).join(','),
                response_type: 'code',
                state
            })}`;
        },
        exchangeBody({ code, redirectUri, clientId, clientSecret }) {
            return {
                body: form({
                    client_key: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    code
                })
            };
        },
        normalizeTokenResponse(json) {
            return {
                accessToken: json.access_token,
                refreshToken: json.refresh_token || null,
                expiresIn: json.expires_in || 86400,
                scope: json.scope || ''
            };
        }
    },
    youtube: {
        label: 'YouTube',
        authorizeBase: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        defaultScopes: ['https://www.googleapis.com/auth/youtube.readonly'],
        authorizeUrl({ clientId, redirectUri, state, scopes }) {
            return `${this.authorizeBase}?${form({
                client_id: clientId,
                redirect_uri: redirectUri,
                scope: (scopes || this.defaultScopes).join(' '),
                response_type: 'code',
                access_type: 'offline',
                prompt: 'consent',
                state
            })}`;
        },
        exchangeBody({ code, redirectUri, clientId, clientSecret }) {
            return {
                body: form({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    code
                })
            };
        },
        normalizeTokenResponse(json) {
            return {
                accessToken: json.access_token,
                refreshToken: json.refresh_token || null,
                expiresIn: json.expires_in || 3600,
                scope: json.scope || ''
            };
        }
    },
    twitter: {
        label: 'X (Twitter)',
        authorizeBase: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        defaultScopes: ['tweet.read', 'users.read'],
        authorizeUrl({ clientId, redirectUri, state, scopes }) {
            return `${this.authorizeBase}?${form({
                client_id: clientId,
                redirect_uri: redirectUri,
                scope: (scopes || this.defaultScopes).join(' '),
                response_type: 'code',
                state,
                code_challenge: 'pulsegrid-static-challenge',
                code_challenge_method: 'plain'
            })}`;
        },
        exchangeBody({ code, redirectUri, clientId, clientSecret }) {
            return {
                body: form({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    code,
                    code_verifier: 'pulsegrid-static-challenge'
                })
            };
        },
        normalizeTokenResponse(json) {
            return {
                accessToken: json.access_token,
                refreshToken: json.refresh_token || null,
                expiresIn: json.expires_in || 7200,
                scope: json.scope || ''
            };
        }
    }
};

const PROVIDER_NAMES = Object.keys(PROVIDERS);

function providerEnv(name) {
    const prefix = `OAUTH_${name.toUpperCase()}`;
    return {
        clientId: process.env[`${prefix}_CLIENT_ID`] || null,
        clientSecret: process.env[`${prefix}_CLIENT_SECRET`] || null
    };
}

/** True when the provider can start an authorize flow (or the stub is on). */
function providerConfigured(name) {
    if (process.env.OAUTH_STUB === 'true') return true;
    const { clientId, clientSecret } = providerEnv(name);
    return !!(clientId && clientSecret);
}

function redirectUriFor(provider) {
    const base = (process.env.OAUTH_REDIRECT_BASE || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/v3/oauth/${provider}/callback`;
}

function stubTokenResponse(provider) {
    return {
        accessToken: `stub_access_${provider}_${Date.now()}`,
        refreshToken: `stub_refresh_${provider}_${Date.now()}`,
        expiresIn: 3600,
        scope: (PROVIDERS[provider].defaultScopes || []).join(' ')
    };
}

/**
 * Exchange an authorization code for tokens.
 * With OAUTH_STUB=true no network is touched (test convention).
 */
async function exchangeCode(provider, code, fetchImpl) {
    const def = PROVIDERS[provider];
    if (!def) throw new Error(`Unknown OAuth provider: ${provider}`);
    if (process.env.OAUTH_STUB === 'true') return stubTokenResponse(provider);

    const { clientId, clientSecret } = providerEnv(provider);
    if (!clientId || !clientSecret) {
        throw new Error(
            `OAuth provider "${provider}" is not configured. Set OAUTH_${provider.toUpperCase()}_CLIENT_ID and ` +
            `OAUTH_${provider.toUpperCase()}_CLIENT_SECRET — see .env.example.`
        );
    }
    const fetchFn = fetchImpl || globalThis.fetch;
    const { body } = def.exchangeBody({
        code,
        redirectUri: redirectUriFor(provider),
        clientId,
        clientSecret
    });
    const res = await fetchFn(def.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Token exchange failed for ${provider}: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return def.normalizeTokenResponse(await res.json());
}

module.exports = {
    PROVIDERS,
    PROVIDER_NAMES,
    providerEnv,
    providerConfigured,
    redirectUriFor,
    exchangeCode
};
