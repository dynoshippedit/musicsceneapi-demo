#!/usr/bin/env node
/**
 * tests/support/verify_phase2.js
 *
 * End-of-phase operational verification against a RUNNING server.
 * Covers the checklist in the Phase 2 brief:
 *   - health/status endpoint
 *   - unauthenticated and authenticated requests
 *   - database operations (read + write + persistence check)
 *   - external integrations via safe/mock paths
 *   - AI boundary behavior with no API key
 *
 * Usage: node tests/support/verify_phase2.js [baseUrl]
 * Exits non-zero if any check fails.
 */

'use strict';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  PASS  ${name}${detail ? '  (' + detail + ')' : ''}`); }
    else { fail++; failures.push(name); console.log(`  FAIL  ${name}  ${detail}`); }
}

async function req(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + path, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const ctype = res.headers.get('content-type') || '';
    const payload = ctype.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, body: payload, ctype };
}

(async () => {
    console.log(`\n=== Phase 2 operational verification against ${BASE} ===\n`);

    // ---- 1. health / status ----
    console.log('[1] Health / status');
    const health = await req('GET', '/health');
    check('GET /health -> 200', health.status === 200);
    check('health.status == operational', health.body.status === 'operational');
    check('health.version == 3.0-production', health.body.version === '3.0-production');

    // ---- 2. unauthenticated behavior ----
    console.log('\n[2] Unauthenticated requests');
    const noTok = await req('GET', '/v3/artists');
    check('no token -> 401', noTok.status === 401, `got ${noTok.status}`);
    check('401 body contract', noTok.body.error === 'Authentication required');

    const badTok = await req('GET', '/v3/artists', { token: 'not.a.jwt' });
    check('bad token -> 403', badTok.status === 403, `got ${badTok.status}`);
    check('403 body contract', badTok.body.error === 'Invalid or expired token');

    const notFound = await req('GET', '/v3/no-such-route');
    check('unknown route -> 404', notFound.status === 404);
    check('404 body contract', notFound.body.error === 'Endpoint not found');

    // ---- 3. authentication ----
    console.log('\n[3] Authentication');
    const adminLogin = await req('POST', '/v3/auth/login',
        { body: { email: 'admin@mau5trap.com', password: 'admin123' } });
    check('seeded admin login -> 200', adminLogin.status === 200, `got ${adminLogin.status}`);
    const adminToken = adminLogin.body.token;
    check('admin token issued', !!adminToken);
    check('admin role in payload', adminLogin.body.user && adminLogin.body.user.role === 'admin');

    const artistLogin = await req('POST', '/v3/auth/login',
        { body: { email: 'tours@rezz.com', password: 'rezz123' } });
    check('seeded artist login -> 200', artistLogin.status === 200);
    const artistToken = artistLogin.body.token;

    const badCreds = await req('POST', '/v3/auth/login',
        { body: { email: 'nope@x.com', password: 'wrong' } });
    check('bad credentials -> 401', badCreds.status === 401);

    // FIXED CRITICAL-1 (Phase 3): empty body must NOT yield a token.
    const emptyBody = await req('POST', '/v3/auth/login', { body: {} });
    check('FIXED CRITICAL-1: empty body -> 401, no token',
        emptyBody.status === 401 && !emptyBody.body.token,
        `status ${emptyBody.status}`);

    // ---- 4. authorization ----
    console.log('\n[4] Authorization');
    const adminUsers = await req('GET', '/v3/users', { token: adminToken });
    check('admin can list users -> 200', adminUsers.status === 200);
    const artistUsers = await req('GET', '/v3/users', { token: artistToken });
    check('artist cannot list users -> 403', artistUsers.status === 403);
    const artistExport = await req('GET', '/v3/exports?format=csv', { token: artistToken });
    check('artist label-wide export -> 403', artistExport.status === 403);
    // FIXED HIGH-4 (Phase 3): artist can now read their own record.
    const artistOwn = await req('GET', '/v3/artists/art_rezz', { token: artistToken });
    check('FIXED HIGH-4: artist can read own record -> 200', artistOwn.status === 200,
        `status ${artistOwn.status}`);
    const artistOther = await req('GET', '/v3/artists/art_deadmau5', { token: artistToken });
    check('artist still denied OTHER artist -> 403', artistOther.status === 403,
        `status ${artistOther.status}`);

    // ---- 5. database operations ----
    console.log('\n[5] Database operations');
    const list = await req('GET', '/v3/artists?limit=5', { token: adminToken });
    check('GET /v3/artists -> 200', list.status === 200);
    check('29 artists resolved (DB + mock union)', list.body.total === 29, `total=${list.body.total}`);
    check('limit honoured', list.body.artists.length === 5);

    const detail = await req('GET', '/v3/artists/art_deadmau5', { token: adminToken });
    check('single artist read -> 200', detail.status === 200);

    const missing = await req('GET', '/v3/artists/art_does_not_exist', { token: adminToken });
    check('missing artist -> 404', missing.status === 404);

    // DB write: create an artist, then read it back through the list endpoint.
    // NOTE: POST /v3/artists IGNORES a client-supplied `id` and derives one
    // from the name (`art_` + lowercased name with spaces stripped). That is
    // pre-existing behavior, verified against the handler source — so the
    // archive/restore calls below must use the DERIVED id, not ours.
    const uniqueName = `Verify Artist ${Date.now()}`;
    const created = await req('POST', '/v3/artists', {
        token: adminToken,
        body: { name: uniqueName, tier: 'developing' }
    });
    check('POST /v3/artists (DB write) -> 2xx', created.status >= 200 && created.status < 300,
        `got ${created.status}`);
    const derivedId = created.body && created.body.artist && created.body.artist.id;
    check('response returns the server-derived id', !!derivedId, `id=${derivedId}`);

    const afterCreate = await req('GET', `/v3/artists?search=${encodeURIComponent('Verify Artist')}`,
        { token: adminToken });
    check('created artist is readable back', afterCreate.body.total >= 1,
        `found ${afterCreate.body.total}`);

    const archived = await req('POST', `/v3/artists/${derivedId}/archive`, { token: adminToken });
    check('archive artist -> 2xx', archived.status >= 200 && archived.status < 300,
        `got ${archived.status}`);
    const restored = await req('POST', `/v3/artists/${derivedId}/restore`, { token: adminToken });
    check('restore artist -> 2xx', restored.status >= 200 && restored.status < 300,
        `got ${restored.status}`);

    // Archiving a nonexistent artist must still 404.
    const archiveMissing = await req('POST', '/v3/artists/art_definitely_missing/archive',
        { token: adminToken });
    check('archive unknown artist -> 404', archiveMissing.status === 404);

    // Users table read excludes secrets.
    const usersBody = adminUsers.body;
    const leaked = Array.isArray(usersBody)
        && usersBody.some((u) => 'passwordHash' in u || 'resetToken' in u);
    check('user list does not leak passwordHash/resetToken', !leaked);

    // ---- 6. external integrations (safe / mock paths) ----
    console.log('\n[6] External integrations (mock + safe paths)');
    const integStatus = await req('GET', '/v3/integrations/status', { token: adminToken });
    check('GET /v3/integrations/status -> 200', integStatus.status === 200);
    check('services[] present', Array.isArray(integStatus.body.services),
        `${(integStatus.body.services || []).length} services`);

    const scout = await req('GET', '/v3/anr/scout?query=techno', { token: adminToken });
    check('A&R scout (mock provider) -> 200', scout.status === 200);
    check('scout results filtered', Array.isArray(scout.body.scouts) && scout.body.scouts.length > 0,
        `${(scout.body.scouts || []).length} scouts`);

    const limit = await req('GET', '/v3/integrations/test-limit/spotify', { token: adminToken });
    check('rate-limiter diagnostic -> 200', limit.status === 200);

    const disconnect = await req('POST', '/v3/integrations/disconnect',
        { token: adminToken, body: { service: 'spotify' } });
    check('integration disconnect -> 200', disconnect.status === 200);

    // ---- 7. AI boundary with no API key ----
    console.log('\n[7] AI boundary (no GROQ_API_KEY configured)');
    const aiAnalyze = await req('POST', '/v3/ai/analyze',
        { token: adminToken, body: { query: 'who has the best roi' } });
    check('POST /v3/ai/analyze -> 503 when no provider is configured', aiAnalyze.status === 503);
    check('unavailable AI returns no invented confidence', !('confidence' in aiAnalyze.body));
    check('unavailable AI has an explicit error and no invented answer', /unavailable/i.test(aiAnalyze.body.error || '') && !('response' in aiAnalyze.body));

    const aiNoPrompt = await req('POST', '/v3/ai/query', { token: adminToken, body: {} });
    check('POST /v3/ai/query without prompt -> 400', aiNoPrompt.status === 400);

    const aiQuery = await req('POST', '/v3/ai/query',
        { token: adminToken, body: { prompt: 'summarise the label' } });
    check('AI query degrades without a key instead of hanging',
        aiQuery.status === 503, `status ${aiQuery.status}`);

    // ---- 8. reports / exports ----
    console.log('\n[8] Reports and exports');
    const csvArtist = await req('GET', '/v3/exports?format=csv&artistId=art_deadmau5', { token: adminToken });
    check('CSV export (artist) -> 200', csvArtist.status === 200);
    check('CSV content-type', /text\/csv/.test(csvArtist.ctype), csvArtist.ctype);
    check('CSV payload non-trivial', String(csvArtist.body).length > 200,
        `${String(csvArtist.body).length} bytes`);

    const csvLabel = await req('GET', '/v3/exports?format=csv', { token: adminToken });
    check('CSV export (label-wide, admin) -> 200', csvLabel.status === 200);

    // ---- 9. analytics ----
    console.log('\n[9] Analytics');
    const geo = await req('GET', '/v3/analytics/geography', { token: adminToken });
    check('geography -> 200', geo.status === 200);
    const proj = await req('GET', '/v3/analytics/projections', { token: adminToken });
    check('projections -> 200', proj.status === 200);
    check('projections return chartData', proj.body && 'chartData' in proj.body);
    const sales = await req('POST', '/v3/analytics/sales',
        { token: adminToken, body: { artistId: 'art_deadmau5', month: '2026-01', revenue: 4321 } });
    check('sales write -> 200', sales.status === 200);

    // ---- 10. A&R split-brain still intact ----
    console.log('\n[10] Separate A&R Room and Scouting stores');
    const subs = await req('GET', '/v3/anr/submissions', { token: adminToken });
    check('submissions store readable', subs.status === 200 && Array.isArray(subs.body.submissions));
    const state = await req('GET', '/v3/anr/state', { token: adminToken });
    check('anrState store readable', state.status === 200 && Array.isArray(state.body.demos));
    check('Room and Scouting keep distinct demo catalogues',
        subs.body.submissions[0].id !== state.body.demos[0].id);

    // ---- summary ----
    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
    if (fail) {
        console.log('failures: ' + failures.join(', '));
        process.exit(1);
    }
    process.exit(0);
})().catch((e) => { console.error('verification crashed:', e); process.exit(1); });
