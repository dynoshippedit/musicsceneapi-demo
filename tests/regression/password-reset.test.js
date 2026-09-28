'use strict';

// Isolated, authoritative database + injected mail transport. Never opens an operator file.
process.env.DB_STORAGE = ':memory:';
process.env.DB_DIALECT = 'sqlite';
process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'password-reset-regression-secret-20260918';
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = '';
process.env.ADMIN_PASS = '';
process.env.SMTP_HOST = '';
process.env.SENDGRID_API_KEY = '';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { once } = require('node:events');
const models = require('../../src/models');
const { buildContext } = require('../../src/routes/context');
const { createEmailService } = require('../../src/services/emailService');
const config = require('../../src/config');
const { register } = require('../../src/routes/auth');

let listener, base, rejectMail = false;
const sent = [], logs = [], audits = [];
const logger = { info: (...v) => logs.push(v), warn: (...v) => logs.push(v), error: (...v) => logs.push(v) };
const mail = createEmailService({
    transport: { sendMail: async message => {
        if (rejectMail) throw new Error('fixture SMTP rejection');
        sent.push(message);
        return { messageId: 'disposable-message', accepted: [message.to], rejected: [] };
    } }, log: logger
});

before(async () => {
    await models.sequelize.sync({ force: true });
    const app = express();
    app.use(express.json());
    const ctx = buildContext();
    register(app, { ...ctx, logger, emailService: mail, sendEmail: mail.sendEmail,
        auditService: { emitAudit: event => audits.push(event) } });
    listener = app.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    base = `http://127.0.0.1:${listener.address().port}`;
});
after(async () => {
    if (listener) await new Promise(resolve => listener.close(resolve));
    await models.sequelize.close();
});

async function call(path, body, token, method = 'POST') {
    const res = await fetch(base + '/v3/auth/' + path, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
}
async function account(suffix) {
    return models.User.create({ email: `${suffix}@example.test`, name: suffix, role: 'viewer',
        passwordHash: await bcrypt.hash('existing-password-123', 4), active: true, sessionVersion: 0, version: 0 });
}
async function login(user, password = 'existing-password-123') {
    return call('login', { email: user.email, password });
}
function tokenFromLastMail() {
    const url = sent.at(-1).html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
    assert.equal(new URL(url).origin, new URL(config.email.resetLinkBase).origin);
    return new URL(url).searchParams.get('token');
}
async function requestToken(user) {
    assert.equal((await call('forgot-password', { email: user.email })).status, 200);
    return tokenFromLastMail();
}

test('reset request is generic, stores only digest, and does not leak reset secrets to logs', async () => {
    const user = await account('reset-generic');
    const known = await call('forgot-password', { email: user.email });
    const unknown = await call('forgot-password', { email: 'unknown@example.test' });
    assert.deepEqual(known, unknown);
    assert.equal(known.status, 200);
    const token = tokenFromLastMail();
    assert.match(token, /^[a-f0-9]{64}$/);
    await user.reload();
    assert.equal(user.resetToken, crypto.createHash('sha256').update(token).digest('hex'));
    assert.notEqual(user.resetToken, token);
    assert.ok(Number(user.resetTokenExpiry) > Date.now());
    assert.equal(JSON.stringify(logs).includes(token), false);
    assert.equal(JSON.stringify(known).includes(token), false);
});

test('invalid, expired and consumed tokens share controlled failure; malformed and short passwords rejected', async () => {
    const user = await account('reset-invalid');
    const token = await requestToken(user);
    const newPassword = 'replacement-password-123';
    const invalid = await call('reset-password', { token: 'a'.repeat(64), newPassword });
    assert.equal(invalid.status, 400);
    await user.update({ resetTokenExpiry: String(Date.now() - 1000) });
    const expired = await call('reset-password', { token, newPassword });
    assert.deepEqual(expired, invalid);
    for (const bad of [{}, { token: [], newPassword }, { token, newPassword: 'short' },
        { token, newPassword: 'é'.repeat(40) }, { token, newPassword: { bad: true } }]) {
        assert.equal((await call('reset-password', bad)).status, 400);
    }
});

test('reset consumes token once, persists hash and revokes existing sessions', async () => {
    const user = await account('reset-success');
    const oldSession = (await login(user)).body.token;
    const token = await requestToken(user);
    const password = 'replacement-password-123';
    const reset = await call('reset-password', { token, newPassword: password });
    assert.equal(reset.status, 200);
    await user.reload();
    assert.equal(user.resetToken, null);
    assert.equal(user.resetTokenExpiry, null);
    assert.equal(user.sessionVersion, 1);
    assert.equal(user.version, 1);
    assert.equal(await bcrypt.compare(password, user.passwordHash), true);
    assert.equal((await login(user)).status, 401);
    assert.equal((await login(user, password)).status, 200);
    assert.equal((await call('me', undefined, oldSession, 'GET')).status, 401);
    assert.equal((await call('reset-password', { token, newPassword: password })).status, 400);
    assert.ok(audits.some(event => event.action === 'user.password_reset' && event.resourceId === String(user.id)));
});

test('simultaneous redemption acknowledges exactly one password', async () => {
    const user = await account('reset-race');
    const token = await requestToken(user);
    const passwords = ['first-replacement-123', 'second-replacement-123'];
    const results = await Promise.all(passwords.map(newPassword => call('reset-password', { token, newPassword })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    const winner = results.findIndex(r => r.status === 200);
    assert.equal((await login(user, passwords[winner])).status, 200);
    assert.equal((await login(user, passwords[1 - winner])).status, 401);
    await user.reload();
    assert.equal(user.sessionVersion, 1);
});

test('rejected reset write keeps old credentials, token and sessions; emits no success audit', async () => {
    const user = await account('reset-rejected');
    const session = (await login(user)).body.token;
    const token = await requestToken(user);
    await user.reload();
    const original = user.toJSON();
    await models.sequelize.query(`CREATE TRIGGER reject_reset BEFORE UPDATE ON Users WHEN NEW.id=${user.id} BEGIN SELECT RAISE(ABORT, 'disposable reset write rejection'); END`);
    try {
        const reply = await call('reset-password', { token, newPassword: 'rejected-password-123' });
        assert.equal(reply.status, 503);
        await user.reload();
        assert.equal(user.passwordHash, original.passwordHash);
        assert.equal(user.resetToken, original.resetToken);
        assert.equal(user.sessionVersion, original.sessionVersion);
        assert.equal(audits.some(event => event.action === 'user.password_reset' && event.resourceId === String(user.id)), false);
        assert.equal((await call('me', undefined, session, 'GET')).status, 200);
    } finally { await models.sequelize.query('DROP TRIGGER reject_reset'); }
});

test('failed mail delivery clears pending token without account enumeration or plaintext logging', async () => {
    const user = await account('reset-mail-failure');
    rejectMail = true;
    try {
        const known = await call('forgot-password', { email: user.email });
        const unknown = await call('forgot-password', { email: 'mail-unknown@example.test' });
        assert.deepEqual(known, unknown);
        assert.equal(known.status, 200);
        await user.reload();
        assert.equal(user.resetToken, null);
        assert.equal(user.resetTokenExpiry, null);
    } finally { rejectMail = false; }
});

test('deactivated and deleted accounts lose old tokens and cannot log in', async () => {
    const user = await account('reset-inactive');
    const session = (await login(user)).body.token;
    await user.update({ active: false });
    assert.equal((await login(user)).status, 401);
    assert.equal((await call('me', undefined, session, 'GET')).status, 401);
    await user.destroy();
    assert.equal((await call('me', undefined, session, 'GET')).status, 401);
});

test('change password validates password, revokes old sessions, and invalidates pending reset', async () => {
    const user = await account('reset-change');
    const session = (await login(user)).body.token;
    const resetToken = await requestToken(user);
    assert.equal((await call('change-password', { currentPassword: 'existing-password-123', newPassword: 'tiny' }, session)).status, 400);
    const reply = await call('change-password', { currentPassword: 'existing-password-123', newPassword: 'changed-password-123' }, session);
    assert.equal(reply.status, 200);
    assert.equal((await call('me', undefined, session, 'GET')).status, 401);
    assert.equal((await call('reset-password', { token: resetToken, newPassword: 'another-password-123' })).status, 400);
    assert.equal((await login(user, 'changed-password-123')).status, 200);
    await user.reload();
    assert.equal(user.version, 1);
});

test('environment bootstrap credentials cannot bypass an existing changed password', async () => {
    const user = await account('reset-bootstrap');
    await user.update({ role: 'admin' });
    config.adminEmail = user.email;
    config.adminPass = 'old-bootstrap-password';
    try {
        assert.equal((await login(user, config.adminPass)).status, 401);
        assert.equal((await login(user)).status, 200);
    } finally { config.adminEmail = ''; config.adminPass = ''; }
});

test('email transport requires real delivery acknowledgement and sanitizes failure logging', async () => {
    const unavailable = createEmailService({ emailConfig: { enabled: false }, log: logger });
    assert.equal(unavailable.isConfigured(), false);
    assert.equal(await unavailable.sendEmail({ to: 'nobody@example.test', subject: 'x', html: 'secret-body' }), false);
    const notAccepted = createEmailService({ transport: { sendMail: async () => ({ accepted: [], rejected: ['nobody@example.test'] }) }, log: logger });
    assert.equal(await notAccepted.sendEmail({ to: 'nobody@example.test', subject: 'x', html: 'secret-body' }), false);
    assert.equal(JSON.stringify(logs).includes('secret-body'), false);
});
