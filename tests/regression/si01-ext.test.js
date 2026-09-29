/**
 * tests/regression/si01-ext.test.js
 *
 * SI-01 extension: negative, NaN and Infinity revenue values must be rejected
 * with 400 (same style as the existing invalid-amount 400); null/undefined
 * ("no data") legitimately stay 0 with a 200.
 *
 * Why in-process: the HTTP tests in integrity.test.js exercise the real
 * persistence path, but NaN/Infinity cannot round-trip through the JSON
 * persistence layer (JSON.stringify(NaN) -> null), so they can only ever
 * reach the handler from in-memory data. These tests call the registered
 * route handler directly with such values, which is exactly the code branch
 * the SI-01 validation guards.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { register } = require('../../src/routes/finance.js');

function makeRes() {
    return {
        statusCode: 200, // Express default: res.json() without res.status() is a 200
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(p) { this.payload = p; return this; }
    };
}

// Invoke the handler with an in-memory artist record.
async function calc(streamingValue) {
    const req = {
        user: { id: 'u1' },
        body: { artistId: 'a1', revenueSources: ['streaming'] }
    };
    const revenue = {};
    if (streamingValue !== 'ABSENT') revenue.streaming = streamingValue;
    const ctx = {
        artistRepo: { findById: async () => ({ id: 'a1', name: 'Si01Ext', revenue }) },
        hasArtistAccess: () => true
    };
    const posts = [];
    const fakeApp = { post: (...args) => posts.push(args), get: (...args) => posts.push(args) };
    register(fakeApp, ctx);
    const h = posts.find(([path]) => path === '/v3/royalties/calculate').pop();
    const res = makeRes();
    await h(req, res);
    return res;
}

for (const [label, value] of [
    ['bare NaN', NaN],
    ['bare Infinity', Infinity],
    ['bare -Infinity', -Infinity],
    ['bare negative', -12.34],
    ['object-form NaN', { amount: NaN, currency: 'USD' }],
    ['object-form Infinity', { amount: Infinity, currency: 'USD' }],
    ['object-form negative', { amount: -5, currency: 'USD' }]
]) {
    test(`SI-01 ext: ${label} revenue is rejected with 400`, async () => {
        const res = await calc(value);
        assert.equal(res.statusCode, 400, `${label} must 400, got ${res.statusCode}: ${JSON.stringify(res.payload)}`);
        assert.match(res.payload.error, /invalid amount/);
    });
}

for (const [label, value] of [
    ['null stream', null],
    ['absent stream', 'ABSENT'],
    ['object-form null amount', { amount: null, currency: 'USD' }],
    ['object-form missing amount', { currency: 'USD' }],
    ['zero', 0]
]) {
    test(`SI-01 ext: ${label} stays 0 with a 200`, async () => {
        const res = await calc(value);
        assert.equal(res.statusCode, 200, `${label} must stay 200, got ${res.statusCode}: ${JSON.stringify(res.payload)}`);
        assert.equal(res.payload.breakdownCents.streaming, 0);
        assert.equal(res.payload.totalRevenueCents, 0);
    });
}

test('SI-01 ext: valid decimal still converts exactly (12.34 -> 1234 cents)', async () => {
    const res = await calc(12.34);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.breakdownCents.streaming, 1234);
    assert.equal(res.payload.totalRevenueCents, 1234);
});

test('SI-01 ext: non-USD object stream is flagged, not mixed in', async () => {
    const res = await calc({ amount: 100, currency: 'EUR' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.totalRevenueCents, 0);
    assert.deepEqual(res.payload.flaggedStreams, [{ source: 'streaming', currency: 'EUR', amount: 100 }]);
});
