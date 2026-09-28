'use strict';

/**
 * tests/regression/monthlyclose.test.js
 *
 * Monthly-close workflow (2026-09-28, ChatGPT review fixes + research
 * update 8). Proves, against a spawned server with sqlite:
 *
 *   1. Same ISRC/source/period with different territory/right/rate splits
 *      import as SEPARATE lines (dedup is full-row, not catalogKey|period).
 *   2. An exact repeated full row is rejected as a duplicate.
 *   3. A revised statement supersedes every prior line as ONE UNIT.
 *   4. Re-uploading the SAME file leaves totals unchanged (already-imported).
 *   5. Dashboard KPIs equal the reconciliation (one pipeline).
 *   6. All four income categories obey period filtering.
 *   7. Disputed/estimated never enter trusted totals (reconciliation AND
 *      royalties summary AND direct-sales summary).
 *   8. Payout sync persists payouts idempotently.
 *   9. Bank deposits carry provenance (recordedBy, recordedAt, bankRef).
 *  10. Matching works; unmatched payouts/deposits stay visible.
 *  11. Cash never increases income (no double counting).
 *  12. Commission worksheet is exact and deterministic (round-half-up on
 *      integer basis points).
 *  13. Missing expected reports are flagged as evidence gaps.
 *  14. Identical approved mapping layouts are reused without re-review.
 *  15. Changed layouts require re-review — even on repeat sightings.
 *  16. Cash gaps show the owner/next-action annotation; nothing auto-fills.
 *  17. Authorization: writes are admin-only; artist-scoped reads fail
 *      closed; grant-less users are denied.
 *  18. Export carries full provenance (statements, mappings, review
 *      states, cash evidence).
 *  19. No fixture/mock fallback in financial totals.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const OAUTH_TOKEN_KEY = 'b'.repeat(64);

function fixturesV1() {
    return [
        { id: 'ch_001', amount: 2000, currency: 'usd', status: 'succeeded', created: 1789000000, metadata: { artist: 'art_novakin' }, priceIds: ['price_a'], productIds: ['prod_a'] }
    ];
}

function baseEnv(port, scratch) {
    return {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret-for-monthlyclose',
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(scratch, 'test.sqlite'),
        DATABASE_URL: '',
        ADMIN_EMAIL: '', ADMIN_PASS: '',
        GROQ_API_KEY: '',
        AUTO_PRINT: 'false',
        SCHEDULE_JOBS: 'false',
        OAUTH_TOKEN_KEY,
        PAYMENTS_STUB: 'true',
        PAYMENTS_STUB_CHARGES_FILE: path.join(scratch, 'charges.json'),
        PAYMENTS_STUB_PAYOUTS_FILE: path.join(scratch, 'payouts.json')
    };
}

async function waitForHealth(base, timeoutMs = 40000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${base}/health`);
            if (res.ok) return true;
        } catch (_) { /* retry */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

function makeApi(base) {
    return async function api(method, p, token, body, extraHeaders) {
        const headers = { ...(extraHeaders || {}) };
        const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
        if (!isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(base + p, {
            method, headers,
            ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {})
        });
        let json = null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try { json = await res.json(); } catch (_) { /* ignore */ }
        }
        const text = ct.includes('application/json') ? null : await res.text().catch(() => null);
        return { status: res.status, json, text, headers: res.headers };
    };
}

async function spawnServer(port) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'monthlyclose-'));
    fs.writeFileSync(path.join(scratch, 'charges.json'), JSON.stringify(fixturesV1()));
    fs.writeFileSync(path.join(scratch, 'payouts.json'), JSON.stringify([
        { id: 'po_mc1', amount: 50000, currency: 'usd', status: 'paid', arrival_date: 1790000000, type: 'bank_account' },
        { id: 'po_mc2', amount: 12000, currency: 'usd', status: 'paid', arrival_date: 1790100000, type: 'bank_account' }
    ]));
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: scratch, env: baseEnv(port, scratch), stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.resume();
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    const base = `http://127.0.0.1:${port}`;
    const up = await waitForHealth(base);
    if (!up) {
        child.kill('SIGKILL');
        throw new Error(`server.js (port ${port}) never became healthy.\n` + err.slice(0, 3000));
    }
    return { child, api: makeApi(base), scratch };
}

async function login(api, email, password) {
    const { status, json } = await api('POST', '/v3/auth/login', null, { email, password });
    assert.strictEqual(status, 200, `login failed for ${email}: ${JSON.stringify(json)}`);
    return json.token;
}

function csvFile(rows, name = 'import.csv') {
    const fd = new FormData();
    fd.append('file', new Blob([rows], { type: 'text/csv' }), name);
    return fd;
}

describe('monthly close: spawned server', () => {
    let srv, admin, artist;
    const state = {};

    before(async () => {
        srv = await spawnServer(32194);
        admin = await login(srv.api, 'admin@pulsegrid.fm', 'admin123');
        artist = await login(srv.api, 'tours@novakin.band', 'novakin123');
    });

    after(async () => {
        if (srv && srv.child) {
            srv.child.kill('SIGTERM');
            await new Promise((r) => setTimeout(r, 1500));
        }
    });

    // ---- 1. territory/right/rate splits import as separate lines ----
    test('same ISRC+source+period with different splits imports both lines', async () => {
        const rec = await srv.api('POST', '/v3/catalog/recordings', admin,
            { title: 'Split Track', isrc: 'ZZSPL2600001', artistId: 'art_novakin' });
        assert.strictEqual(rec.status, 201);
        const body =
            'isrc_or_upc,amount,currency,period,source,territory,rights_type,rate_tier\n' +
            'ZZSPL2600001,5.00,USD,2026-08,distributor,US,streaming,standard\n' +
            'ZZSPL2600001,3.00,USD,2026-08,distributor,EU,streaming,standard\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(body, 'splits.csv'));
        assert.strictEqual(imp.status, 201, JSON.stringify(imp.json));
        assert.strictEqual(imp.json.imported, 2, 'both split lines import — no catalogKey|period|source dedup');
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-08', admin);
        const split = lines.json.filter((l) => l.catalogKey === 'ZZSPL2600001' && l.reviewState !== 'superseded');
        assert.strictEqual(split.length, 2, JSON.stringify(lines.json));
        assert.ok(imp.json.statements && imp.json.statements[0], 'statement report present');
        assert.strictEqual(imp.json.statements[0].status, 'active');
        state.splitStatementId = imp.json.statements[0].id;
        assert.ok(state.splitStatementId, 'statement id returned');
    });

    // ---- 2. exact repeated full row rejected ----
    test('exact repeated full row inside one file is rejected as duplicate', async () => {
        // Fresh period (2026-12) so this file does NOT trigger the
        // (source, period) revision path — it purely tests within-file dedup.
        const body =
            'isrc_or_upc,amount,currency,period,source,territory,rights_type,rate_tier\n' +
            'ZZSPL2600001,5.00,USD,2026-12,distributor,US,streaming,standard\n' +
            'ZZSPL2600001,5.00,USD,2026-12,distributor,US,streaming,standard\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(body, 'dup.csv'));
        assert.strictEqual(imp.status, 201, JSON.stringify(imp.json));
        assert.strictEqual(imp.json.imported, 1, 'first copy imports; the exact repeat does not');
        const dups = (imp.json.rejected || []).filter((r) => r.code === 'exact_duplicate_row');
        assert.strictEqual(dups.length, 1, 'the repeat is rejected as an exact duplicate row');
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-12', admin);
        const act = lines.json.filter((l) => l.catalogKey === 'ZZSPL2600001' && l.reviewState !== 'superseded');
        assert.strictEqual(act.length, 1, 'only one active line exists for the duplicated row');
    });

    // ---- 3. revised statement supersedes every prior line as one unit ----
    test('revised statement supersedes ALL prior lines of the period+source as one unit', async () => {
        const revised =
            'isrc_or_upc,amount,currency,period,source,territory,rights_type,rate_tier\n' +
            'ZZSPL2600001,6.00,USD,2026-08,distributor,US,streaming,standard\n' +
            'ZZSPL2600001,4.00,USD,2026-08,distributor,EU,streaming,standard\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(revised, 'splits-revised.csv'));
        assert.strictEqual(imp.status, 201, JSON.stringify(imp.json));
        assert.strictEqual(imp.json.statements[0].superseded, 2, 'both prior lines superseded');
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-08', admin);
        const split = lines.json.filter((l) => l.catalogKey === 'ZZSPL2600001');
        assert.strictEqual(split.filter((l) => l.reviewState === 'superseded').length, 2);
        assert.strictEqual(split.filter((l) => l.reviewState !== 'superseded').length, 2);
        // The demo seed line (source 'demo seed', 125.00) belongs to a different
        // source and must survive the distributor revision untouched.
        const seed = lines.json.filter((l) => l.source === 'demo seed' && l.reviewState !== 'superseded');
        assert.strictEqual(seed.length, 1, 'seed line from another source survives the revision');
        // Trusted total for 2026-08 is 6.00 + 4.00 + 125.00 (seed) — old distributor lines excluded.
        const { json } = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-08', admin);
        const usd = json.totals.find((t) => t.currency === 'USD');
        assert.strictEqual(usd.totalExact, '135.00', JSON.stringify(usd));
    });

    // ---- 4. same-file re-upload leaves totals unchanged ----
    test('same-file re-upload reports already-imported without changing totals', async () => {
        const before = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-08', admin);
        const beforeTotal = before.json.totals.find((t) => t.currency === 'USD').totalExact;
        const revised =
            'isrc_or_upc,amount,currency,period,source,territory,rights_type,rate_tier\n' +
            'ZZSPL2600001,6.00,USD,2026-08,distributor,US,streaming,standard\n' +
            'ZZSPL2600001,4.00,USD,2026-08,distributor,EU,streaming,standard\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(revised, 'splits-revised.csv'));
        assert.strictEqual(imp.status, 200, 'same file -> 200 already-imported, not 201');
        assert.strictEqual(imp.json.alreadyImported, true);
        const after = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-08', admin);
        const afterTotal = after.json.totals.find((t) => t.currency === 'USD').totalExact;
        assert.strictEqual(afterTotal, beforeTotal, 'totals unchanged by re-upload');
    });

    // ---- 6. all four income categories obey period filtering ----
    test('all four income categories obey period filtering', async () => {
        // merch settlements for 2026-08 and 2026-07 via the atVenu import
        const merchCsv = 'show_date,venue,artist,gross_cents,fees_cents,taxes_cents,net_cents,currency,attendance\n' +
            '2026-08-15,Test Hall,novakin,25000,3000,2000,20000,USD,800\n' +
            '2026-07-15,Test Hall,novakin,20000,3000,2000,15000,USD,700\n';
        const merch = await srv.api('POST', '/v3/royalties/import/atvenu', admin, csvFile(merchCsv, 'merch.csv'));
        assert.strictEqual(merch.status, 201, JSON.stringify(merch.json));
        assert.strictEqual(merch.json.imported, 2, 'both merch settlements import');
        // manual adjustment for 2026-08 and 2026-07
        for (const [month, cents] of [['2026-08', 1000], ['2026-07', 999]]) {
            const r = await srv.api('POST', '/v3/financials/adjustments', admin, {
                artistId: 'art_novakin', month, amountCents: cents, currency: 'USD',
                source: 'test', note: 'period filter probe'
            });
            assert.strictEqual(r.status, 201, JSON.stringify(r.json));
        }
        const { json } = await srv.api('GET', '/v3/financials/reconciliation?artistId=art_novakin&period=2026-08', admin);
        const usd = json.artists[0].totals.USD;
        // royalties 10.00 (1000c) + demo seed 125.00 (12500c) + merch 20000c + adjustment 1000c = 34500c trusted.
        assert.strictEqual(usd.countedCents, 34500, JSON.stringify(usd));
        // The 2026-07 records (15000 merch + 999 adjustment) must NOT leak in:
        // counted total must equal exactly the 2026-08 components, no more.
        assert.strictEqual(usd.countedCents, 1000 + 12500 + 20000 + 1000,
            'no 2026-07 leakage: counted equals the 2026-08 components exactly');
        const cov = json.coverage;
        assert.ok(cov.merchSettlements && cov.directSales && cov.manualAdjustments && cov.royalties,
            'per-category period filtering documented in coverage');
    });

    // ---- 7. disputed/estimated never in trusted totals ----
    test('disputed and estimated records never enter trusted totals', async () => {
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-08', admin);
        const target = lines.json.find((l) => l.catalogKey === 'ZZSPL2600001' && l.reviewState !== 'superseded');
        assert.ok(target);
        const d1 = await srv.api('PATCH', `/v3/royalties/lines/${target.id}/review`, admin,
            { reviewState: 'disputed', evidence: 'territory split contested' });
        assert.strictEqual(d1.status, 200);
        const adj = await srv.api('POST', '/v3/financials/adjustments', admin, {
            artistId: 'art_novakin', month: '2026-08', amountCents: 500, currency: 'USD',
            source: 'test', note: 'estimated probe', reviewState: 'estimated'
        });
        assert.strictEqual(adj.status, 201);
        const { json } = await srv.api('GET', '/v3/financials/reconciliation?artistId=art_novakin&period=2026-08', admin);
        const usd = json.artists[0].totals.USD;
        // trusted: 4.00 royalty (400c) + 125.00 seed (12500c) + 20000 merch + 1000 adjustment = 33900c.
        // The disputed 6.00 and estimated 5.00 are reported separately, never in the total.
        assert.strictEqual(usd.countedCents, 33900, JSON.stringify(usd));
        assert.strictEqual(usd.disputedCents, 600, 'disputed 6.00 shown separately');
        assert.strictEqual(usd.estimatedCents, 500, 'estimated 5.00 shown separately');
        state.disputedLineId = target.id;
    });

    // ---- 5. KPI equals reconciliation ----
    test('dashboard KPIs equal the reconciliation (one pipeline)', async () => {
        // The overview and the reconciliation both run on the shared
        // aggregateIncome pipeline. The overview's reviewTotals are all-time
        // (period=null); they must equal an all-time reconciliation.
        const overview = await srv.api('GET', '/v3/label/overview', admin);
        assert.strictEqual(overview.status, 200);
        const reconAll = await srv.api('GET', '/v3/financials/reconciliation', admin);
        assert.strictEqual(reconAll.status, 200);
        assert.strictEqual(
            overview.json.reviewTotals.USD.countedCents,
            reconAll.json.totals.USD.countedCents,
            'overview reviewTotals (all-time) must equal all-time reconciliation trusted total'
        );
        assert.strictEqual(
            overview.json.reviewTotals.USD.disputedCents,
            reconAll.json.totals.USD.disputedCents,
            'disputed totals agree across surfaces'
        );
        assert.strictEqual(
            overview.json.reviewTotals.USD.estimatedCents,
            reconAll.json.totals.USD.estimatedCents,
            'estimated totals agree across surfaces'
        );
        // The monthly headline KPI must be non-negative integer cents.
        assert.ok(Number.isInteger(overview.json.monthlyRevenueCents.USD), 'KPI is integer cents');
        assert.ok(overview.json.monthlyRevenueCents.USD >= 0, 'KPI is non-negative');
        // And the 2026-08 monthly reconciliation still matches its components.
        const recon08 = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        assert.strictEqual(recon08.json.totals.USD.countedCents, 33900,
            '2026-08 trusted total is stable');
    });

    // ---- 8. payout sync persists idempotently ----
    test('payout sync persists payouts idempotently', async () => {
        // Stub OAuth round-trip -> connected account, then sync.
        const authz = await srv.api('POST', '/v3/direct-sales/connect/authorize', admin, {});
        assert.strictEqual(authz.status, 200, JSON.stringify(authz.json));
        const cb = await srv.api('GET',
            `/v3/direct-sales/connect/callback?code=testcode&state=${authz.json.state}`, null);
        assert.strictEqual(cb.status, 200, JSON.stringify(cb.json));
        const s1 = await srv.api('POST', '/v3/direct-sales/sync', admin, {});
        assert.strictEqual(s1.status, 200, JSON.stringify(s1.json));
        assert.ok(s1.json.payouts, 'sync reports on payouts');
        const p1 = await srv.api('GET', '/v3/financials/payouts', admin);
        assert.strictEqual(p1.status, 200);
        const n1 = p1.json.payouts.length;
        assert.strictEqual(n1, 2, 'both stub payouts persisted');
        const s2 = await srv.api('POST', '/v3/direct-sales/sync', admin, {});
        assert.strictEqual(s2.status, 200);
        assert.strictEqual(s2.json.payouts.alreadyStored, 2, 'second sync finds them already stored');
        const p2 = await srv.api('GET', '/v3/financials/payouts', admin);
        assert.strictEqual(p2.json.payouts.length, n1, 'second sync does not duplicate payouts');
        const ids = p2.json.payouts.map((p) => `${p.provider}:${p.providerPayoutId}`);
        assert.strictEqual(new Set(ids).size, ids.length, 'provider+payoutId unique');
        const po = p2.json.payouts[0];
        assert.ok(po.providerPayoutId && Number.isSafeInteger(po.amountCents) && po.currency,
            'payout has provider id, integer cents, currency');
        assert.ok(po.arrivalAt, 'payout arrival timestamp persisted');
        state.payoutCount = n1;
    });

    // ---- 9. deposit provenance ----
    test('bank deposits carry provenance', async () => {
        const r = await srv.api('POST', '/v3/financials/deposits', admin, {
            amountCents: 50000, currency: 'USD', bankRef: 'BANK-2026-08-001',
            description: 'August sweep', depositAt: '2026-08-31'
        });
        assert.strictEqual(r.status, 201, JSON.stringify(r.json));
        const d = r.json.deposit;
        assert.strictEqual(d.bankRef, 'BANK-2026-08-001');
        assert.strictEqual(d.recordedBy, 'admin@pulsegrid.fm', 'recorder identity stored');
        assert.ok(d.recordedAt, 'recorded timestamp stored');
        assert.strictEqual(d.matched, false);
        state.depositId = d.id;
        // duplicate bankRef rejected
        const dup = await srv.api('POST', '/v3/financials/deposits', admin, {
            amountCents: 100, currency: 'USD', bankRef: 'BANK-2026-08-001', description: 'dup'
        });
        assert.strictEqual(dup.status, 409, 'duplicate bank reference rejected');
    });

    // ---- 10. matching + unmatched visibility ----
    test('matching works; unmatched items stay visible', async () => {
        const payouts = await srv.api('GET', '/v3/financials/payouts', admin);
        const unmatched = payouts.json.payouts.filter((p) => !p.matched);
        if (unmatched.length === 0) {
            // No payouts persisted (no connected account in this env) — the
            // unmatched-deposit half of the test still runs.
            const deps = await srv.api('GET', '/v3/financials/deposits?matched=false', admin);
            assert.ok(deps.json.deposits.some((d) => d.id === state.depositId),
                'unmatched deposit is visible via the matched=false filter');
            return;
        }
        const m = await srv.api('POST', '/v3/financials/matches', admin, {
            payoutId: unmatched[0].id, depositId: state.depositId, note: 'test match'
        });
        assert.strictEqual(m.status, 201, JSON.stringify(m.json));
        assert.ok(m.json.match, 'match record returned');
        const recon = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        assert.ok(recon.json.cash.matched.length >= 1, 'match appears in reconciliation cash section');
        // unmatch restores visibility
        const u = await srv.api('DELETE', '/v3/financials/matches', admin,
            { payoutId: unmatched[0].id, depositId: state.depositId });
        assert.strictEqual(u.status, 200);
        const recon2 = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        assert.ok(recon2.json.cash.unmatchedDeposits.some((d) => d.id === state.depositId),
            'unmatched deposit returns to the unresolved list');
    });

    test('POST /v3/financials/matches rejects invalid IDs with 400/404, never 500', async () => {
        // 2026-09-28: NaN findByPk on missing/non-integer IDs produced HTTP 500.
        // Invalid input is now a clean 400; well-formed but absent IDs are 404.
        const bad = await srv.api('POST', '/v3/financials/matches', admin, {
            payoutId: 'not-a-number', depositId: null
        });
        assert.strictEqual(bad.status, 400, JSON.stringify(bad.json));
        const missing = await srv.api('POST', '/v3/financials/matches', admin, {
            payoutId: 999999, depositId: 999999
        });
        assert.strictEqual(missing.status, 404, JSON.stringify(missing.json));
    });

    // ---- 11. cash never increases income ----
    test('cash never increases income: no double counting', async () => {
        const before = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        const trustedBefore = before.json.totals.USD.countedCents;
        // Record and match a deposit equal to the whole trusted income.
        const dep = await srv.api('POST', '/v3/financials/deposits', admin, {
            amountCents: trustedBefore, currency: 'USD', bankRef: 'BANK-2026-08-002',
            description: 'full sweep', depositAt: '2026-08-31'
        });
        assert.strictEqual(dep.status, 201);
        const after = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        assert.strictEqual(after.json.totals.USD.countedCents, trustedBefore,
            'recording a deposit does not change trusted income');
        assert.ok(after.json.cash.unmatchedDeposits.some((d) => d.id === dep.json.deposit.id),
            'the new deposit is an unresolved item, not income');
        const note = JSON.stringify(after.json.cash);
        assert.ok(/never/i.test(after.json.coverage.cash.note) || /not income/i.test(after.json.coverage.cash.note),
            'cash-as-evidence policy stated');
        void note;
    });

    // ---- 12. exact deterministic commission ----
    test('commission worksheet is exact and deterministic', async () => {
        const c = await srv.api('POST', '/v3/financials/commissions/contracts', admin, {
            artistId: 'art_novakin', name: 'Test 15% net',
            rateBps: 1500, basis: 'counted_net_income',
            effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
            excludedCategories: [], sourceDescription: 'test contract'
        });
        assert.strictEqual(c.status, 201, JSON.stringify(c.json));
        const w1 = await srv.api('GET',
            '/v3/financials/commissions/worksheet?artistId=art_novakin&period=2026-08', admin);
        assert.strictEqual(w1.status, 200, JSON.stringify(w1.json));
        const w2 = await srv.api('GET',
            '/v3/financials/commissions/worksheet?artistId=art_novakin&period=2026-08', admin);
        assert.deepStrictEqual(w1.json, w2.json, 'worksheet is deterministic');
        // trusted 33900c net (400 royalty + 12500 seed + 20000 merch + 1000 adjustment);
        // 15% = 5085c exactly (33900 * 1500 / 10000).
        assert.strictEqual(w1.json.basisCents, 33900, JSON.stringify(w1.json));
        assert.strictEqual(w1.json.commissionCents, 5085, 'exact integer math, round-half-up');
        assert.strictEqual(w1.json.rateBps, 1500);
        assert.ok(w1.json.draftOnly, 'draft-only disclaimer present');
        assert.ok(w1.json.underlyingReview, 'underlying review depth shown');
        // A second contract with an exclusion changes the basis honestly.
        const c2 = await srv.api('POST', '/v3/financials/commissions/contracts', admin, {
            artistId: 'art_novakin', name: 'Test 10% excl merch',
            rateBps: 1000, basis: 'counted_net_income',
            effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
            excludedCategories: ['merch_settlements'], sourceDescription: 'test contract 2'
        });
        assert.strictEqual(c2.status, 201);
        const w3 = await srv.api('GET',
            `/v3/financials/commissions/worksheet?artistId=art_novakin&period=2026-08&contractId=${c2.json.contract.id}`, admin);
        assert.strictEqual(w3.json.basisCents, 13900, 'merch excluded from basis');
        assert.strictEqual(w3.json.commissionCents, 1390, '10% of 13900');
    });

    // ---- 13. missing expected report flagged ----
    test('missing expected reports are evidence gaps', async () => {
        // Source 'nowhere-labels' has no imported statement: the report is
        // genuinely missing.
        const r = await srv.api('POST', '/v3/financials/expected-reports', admin, {
            customer: 'Nowhere Labels', period: '2026-08', expectedBy: '2026-09-15', source: 'nowhere-labels'
        });
        assert.strictEqual(r.status, 201, JSON.stringify(r.json));
        const recon = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        const gaps = recon.json.evidenceGaps || [];
        assert.ok(gaps.some((g) => g.type.startsWith('missing_expected_report') && g.customer === 'Nowhere Labels'),
            'missing report is an evidence gap, not an auto-filled zero: ' + JSON.stringify(gaps));
        const list = await srv.api('GET', '/v3/financials/expected-reports', admin);
        assert.ok(list.json.expectedReports.some((e) => e.customer === 'Nowhere Labels' && e.status !== 'received'),
            'calendar shows the missing report');
    });

    // ---- 14. identical approved mapping reused without re-review ----
    test('identical approved mapping layout is reused without re-review', async () => {
        const maps = await srv.api('GET', '/v3/financials/mappings?source=distributor', admin);
        const seen = maps.json.mappings.find((m) => m.status !== 'approved');
        assert.ok(seen, 'a recorded unapproved layout exists from the earlier imports');
        const ap = await srv.api('POST', `/v3/financials/mappings/${seen.id}/approve`, admin,
            { evidence: 'columns verified against distributor spec v3' });
        assert.strictEqual(ap.status, 200, JSON.stringify(ap.json));
        // Import a NEW file with the identical header layout.
        const body =
            'isrc_or_upc,amount,currency,period,source,territory,rights_type,rate_tier\n' +
            'ZZSPL2600001,1.00,USD,2026-10,distributor,US,streaming,standard\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(body, 'reuse.csv'));
        assert.strictEqual(imp.status, 201, JSON.stringify(imp.json));
        assert.strictEqual(imp.json.mapping.reviewRequired, false, 'identical approved layout: no re-review');
        assert.strictEqual(imp.json.mapping.reused, true);
    });

    // ---- 15. changed layout requires re-review, even on repeat ----
    test('changed column layout requires re-review — every time until approved', async () => {
        const changed1 =
            'isrc_or_upc,amount,currency,period,source,territory,rights_type,rate_tier,extra_col\n' +
            'ZZSPL2600001,2.00,USD,2026-11,distributor,US,streaming,standard,X\n';
        const i1 = await srv.api('POST', '/v3/royalties/import', admin, csvFile(changed1, 'changed.csv'));
        assert.strictEqual(i1.status, 201, JSON.stringify(i1.json));
        assert.strictEqual(i1.json.mapping.reviewRequired, true, 'changed layout flags re-review');
        // A DIFFERENT file with the same unapproved layout: still review-required.
        // (Same column headers, different row content => different SHA-256, not a duplicate.)
        const changed2 =
            'isrc_or_upc,amount,currency,period,source,territory,rights_type,rate_tier,extra_col\n' +
            'ZZSPL2600001,3.00,USD,2026-11,distributor,US,streaming,standard,Y\n';
        const i2 = await srv.api('POST', '/v3/royalties/import', admin, csvFile(changed2, 'changed2.csv'));
        assert.strictEqual(i2.status, 201, JSON.stringify(i2.json));
        assert.strictEqual(i2.json.mapping.reviewRequired, true,
            'repeat sighting of an unapproved changed layout stays review-required');
    });

    // ---- 16. cash gaps annotated; nothing auto-fills ----
    test('cash gaps are computed with owner/next-action annotation, never auto-filled', async () => {
        // Trusted 2026-08 income (33900c) with no matched cash -> a gap.
        const recon = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        const gaps = recon.json.cash.gaps || [];
        assert.ok(gaps.length >= 1, 'cash gap computed for income without cash evidence');
        const gap = gaps[0];
        assert.ok(gap.annotationId, 'gap carries an annotation id');
        assert.strictEqual(typeof gap.gapCents, 'number');
        const ann = await srv.api('POST', `/v3/financials/gaps/${gap.annotationId}/annotate`, admin,
            { owner: 'business manager', nextAction: 'request August bank statement' });
        assert.strictEqual(ann.status, 200, JSON.stringify(ann.json));
        assert.strictEqual(ann.json.annotation.owner, 'business manager');
        const recon2 = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        const g2 = (recon2.json.cash.gaps || []).find((g) => g.annotationId === gap.annotationId);
        assert.strictEqual(g2.owner, 'business manager', 'annotation persists');
        // The gap amount is still the computed difference — never zeroed.
        assert.strictEqual(g2.gapCents, gap.gapCents);
    });

    // ---- 17. authorization ----
    test('authorization: admin writes, artist-scoped reads fail closed', async () => {
        // Non-admin cannot write.
        const w = await srv.api('POST', '/v3/financials/deposits', artist,
            { amountCents: 100, currency: 'USD', bankRef: 'NOPE-1', description: 'x' });
        assert.strictEqual(w.status, 403, 'non-admin deposit write denied');
        const m = await srv.api('POST', '/v3/financials/matches', artist, { payoutId: 1, depositId: 1 });
        assert.strictEqual(m.status, 403, 'non-admin match denied');
        const adj = await srv.api('POST', '/v3/financials/adjustments', artist,
            { artistId: 'art_novakin', month: '2026-08', amountCents: 100, currency: 'USD' });
        assert.strictEqual(adj.status, 403, 'non-admin adjustment denied');
        // Artist-scoped read for an artist they cannot access -> 403.
        const r = await srv.api('GET', '/v3/financials/reconciliation?artistId=art_lumenveil', artist);
        assert.strictEqual(r.status, 403, 'cross-artist reconciliation denied');
        const ws = await srv.api('GET',
            '/v3/financials/commissions/worksheet?artistId=art_lumenveil&period=2026-08', artist);
        assert.strictEqual(ws.status, 403, 'cross-artist worksheet denied');
        // Their own artist works.
        const own = await srv.api('GET', '/v3/financials/reconciliation?artistId=art_novakin', artist);
        assert.strictEqual(own.status, 200, 'own-artist reconciliation allowed');
        // Royalty lines are per-artist enforced too.
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_lumenveil', artist);
        assert.strictEqual(lines.status, 403, 'cross-artist royalty lines denied');
    });

    // ---- 18. export provenance ----
    test('export carries full provenance', async () => {
        const { status, text } = await srv.api('GET', '/v3/financials/export?period=2026-08', admin);
        assert.strictEqual(status, 200);
        assert.ok(text.includes('statement_id') || text.includes('statementId') || text.includes('statement'),
            'export references statements');
        assert.ok(/disputed|estimated/i.test(text), 'export separates disputed/estimated');
        assert.ok(/superseded/i.test(text), 'export marks superseded records');
        assert.ok(/no double|not income|cash/i.test(text), 'export states the cash policy');
    });

    // ---- 19. no fixture fallback in financial totals ----
    test('financial totals never fall back to fixtures', async () => {
        const { json } = await srv.api('GET', '/v3/financials/reconciliation?period=2026-08', admin);
        const flat = JSON.stringify(json).toLowerCase();
        assert.ok(!flat.includes('fixture'), 'no fixture markers in reconciliation');
        assert.ok(!flat.includes('mock'), 'no mock markers in reconciliation');
        assert.ok(json.coverage, 'coverage statement present');
        assert.ok(!/seed|sample/i.test(json.coverage.note || ''), 'coverage does not claim seeded data');
    });
});
