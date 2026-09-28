/**
 * src/oauth/tokenCrypto.js
 *
 * Encrypts per-artist OAuth tokens at rest (AES-256-GCM).
 *
 * The key comes from OAUTH_TOKEN_KEY and must be 32 bytes, supplied as
 * 64 hex chars or 44 base64 chars. There is deliberately NO fallback:
 * deriving an encryption key from JWT_SECRET would couple token secrecy to
 * session secrecy, and a silent default would ship "encrypted" tokens whose
 * key is guessable. When the var is absent, oauth routes answer 503 naming
 * the variable (same convention as the Stripe billing workstream).
 *
 * Wire format: 'v1:' + base64(iv) + ':' + base64(ciphertext) + ':' + base64(tag)
 */

'use strict';

const crypto = require('crypto');

const MISSING_KEY_MESSAGE =
    'OAuth is not configured. Set OAUTH_TOKEN_KEY to 32 random bytes ' +
    '(64 hex chars or 44 base64 chars) — see .env.example.';

function getKey() {
    const raw = process.env.OAUTH_TOKEN_KEY;
    if (!raw) return null;
    const t = raw.trim();
    let key = null;
    if (/^[0-9a-fA-F]{64}$/.test(t)) key = Buffer.from(t, 'hex');
    else if (/^[A-Za-z0-9+/]{43}=$/.test(t)) key = Buffer.from(t, 'base64');
    if (!key || key.length !== 32) {
        throw new Error('OAUTH_TOKEN_KEY must be 32 bytes (64 hex chars or 44 base64 chars).');
    }
    return key;
}

/** True when OAuth token storage is usable. */
function oauthCryptoEnabled() {
    try {
        return !!getKey();
    } catch (_) {
        return false;
    }
}

function encryptToken(plaintext) {
    const key = getKey();
    if (!key) throw new Error(MISSING_KEY_MESSAGE);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join(':');
}

function decryptToken(payload) {
    const key = getKey();
    if (!key) throw new Error(MISSING_KEY_MESSAGE);
    const parts = String(payload || '').split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed encrypted token.');
    const iv = Buffer.from(parts[1], 'base64');
    const ct = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

module.exports = { getKey, oauthCryptoEnabled, encryptToken, decryptToken, MISSING_KEY_MESSAGE };
