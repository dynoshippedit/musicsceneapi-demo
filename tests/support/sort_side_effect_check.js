#!/usr/bin/env node
/**
 * tests/support/sort_side_effect_check.js
 *
 * One-off investigation: is the in-place `labelData.artists.sort()` performed by
 * POST /v3/ai/analyze observable through GET /v3/artists ordering?
 *
 * Usage: node tests/support/sort_side_effect_check.js <baseUrl>
 */
'use strict';

const BASE = process.argv[2] || 'http://127.0.0.1:3021';

async function login() {
    const res = await fetch(`${BASE}/v3/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@mau5trap.com', password: 'admin123' })
    });
    return (await res.json()).token;
}

async function order(token) {
    const res = await fetch(`${BASE}/v3/artists?limit=6`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const j = await res.json();
    return j.artists.map((a) => a.id);
}

(async () => {
    const token = await login();
    const before = await order(token);
    console.log('order BEFORE /v3/ai/analyze :', before.join(', '));

    await fetch(`${BASE}/v3/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: 'roi' })
    });

    const after = await order(token);
    console.log('order AFTER  /v3/ai/analyze :', after.join(', '));
    console.log('');
    console.log('OBSERVABLE THROUGH API?', before.join() !== after.join() ? 'YES' : 'NO');
})();
