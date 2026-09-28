'use strict';

/**
 * tests/regression/financials.test.js
 *
 * Research-correction tests (2026-09-28):
 *
 *   - Exact-decimal precision on royalty lines (not integer cents only):
 *     1,000,000 × $0.003 = $3,000 exactly; line-level cent rounding would
 *     have zeroed it. Source amount string, decimal, scale, file hash,
 *     row ref, and import version are all preserved.
 *   - Review state machine: reported -> reconciled -> approved (+disputed,
 *     estimated), reviewer identity + evidence required, invalid
 *     transitions rejected, superseded excluded from totals.
 *   - Supersede: re-uploading the SAME file never double-counts; uploading
 *     a REVISED file supersedes (replaces) the prior lines.
 *   - First financial output is an "income and cash reconciliation" with a
 *     coverage statement — not a P&L, not a credit rating.
 *   - AI proposes/explains/drafts; deterministic calc + human reviewers
 *     control final amounts. No auto-approval.
 *
 * Part A — unit tests (no server): decimal math + review transitions.
 * Part B — spawned server: import, review, supersede, reconciliation, export.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Part A — unit tests
// ---------------------------------------------------------------------------

describe('exact-decimal arithmetic (src/finance/decimal.js)', () => {
    const dec = require('../../src/finance/decimal');

    test('parses and formats exact decimals without float error', () => {
        const d = dec.parseDecimal('0.003');
        assert.strictEqual(d.mantissa, 3n);
        assert.strictEqual(d.scale, 3);
        assert.strictEqual(dec.formatDecimal(d), '0.003');
        const d2 = dec.parseDecimal('125.00');
        assert.strictEqual(dec.formatDecimal(d2), '125.00');
    });

    test('rejects non-finite and non-numeric input', () => {
        assert.throws(() => dec.parseDecimal('abc'), /not an exact decimal/);
        assert.throws(() => dec.parseDecimal(''), /not an exact decimal/);
        assert.throws(() => dec.parseDecimal('NaN'), /not an exact decimal/);
    });

    test('1,000,000 × 0.003 = 3,000.00 exactly (the line-rounding trap)', () => {
        // 1M rows would be absurd to create in the DB; this unit test proves
        // the arithmetic deterministically: summing 1M copies of 0.003 at
        // exact precision gives 3000, while per-line cent rounding gives 0.
        const line = dec.parseDecimal('0.003');
        let total = { mantissa: 0n, scale: 0 };
        for (let i = 0; i < 1000000; i++) total = dec.addDecimals(total, line);
        assert.strictEqual(dec.formatDecimal(total), '3000.000');
        assert.strictEqual(dec.decimalToCents(total), 300000n);
        // The trap this guards against:
        const perLineRounded = 1000000 * Math.round(0.003 * 100);
        assert.strictEqual(perLineRounded, 0, 'per-line cent rounding zeroes 0.003');
    });

    test('boundary conversion uses round-half-up, once per aggregate', () => {
        // 0.005 rounds UP to 1 cent; 0.004 rounds DOWN to 0.
        assert.strictEqual(dec.decimalToCents(dec.parseDecimal('0.005')), 1n);
        assert.strictEqual(dec.decimalToCents(dec.parseDecimal('0.004')), 0n);
        // Negative values round symmetrically (half away from zero).
        assert.strictEqual(dec.decimalToCents(dec.parseDecimal('-0.005')), -1n);
        // Sum-then-round, not round-then-sum: 0.004 + 0.004 = 0.008 -> 1 cent.
        const s = dec.sumDecimals([dec.parseDecimal('0.004'), dec.parseDecimal('0.004')]);
        assert.strictEqual(dec.decimalToCents(s), 1n, 'aggregate 0.008 rounds to 1 cent');
    });

    test('legacy cents construction preserves exactness', () => {
        const p = dec.precisionFromCents(12500);
        assert.strictEqual(p.amountCents, 12500);
        assert.strictEqual(p.amountDecimal, '125.00');
        assert.strictEqual(p.amountScale, 2);
        // The returned boundary cents round-trip through decimalToCents.
        const d = dec.parseDecimal(p.amountDecimal);
        assert.strictEqual(dec.decimalToCents(d), 12500n);
    });
});

describe('review state machine (src/finance/reviewState.js)', () => {
    const rs = require('../../src/finance/reviewState');

    test('valid transitions follow the documented path', () => {
        assert.ok(rs.canTransition('reported', 'reconciled'));
        assert.ok(rs.canTransition('reconciled', 'approved'));
        assert.ok(rs.canTransition('reported', 'disputed'));
        assert.ok(rs.canTransition('reconciled', 'disputed'));
        assert.ok(rs.canTransition('approved', 'disputed'));
        assert.ok(rs.canTransition('reported', 'estimated'));
        assert.ok(rs.canTransition('disputed', 'reconciled'));
        assert.ok(rs.canTransition('disputed', 'reported'));
        assert.ok(rs.canTransition('estimated', 'reconciled'));
    });

    test('invalid transitions are rejected', () => {
        assert.ok(!rs.canTransition('reported', 'approved'), 'no skipping reconciled');
        assert.ok(!rs.canTransition('approved', 'reconciled'), 'approved is terminal except dispute');
        assert.ok(!rs.canTransition('approved', 'reported'), 'no un-approving');
        assert.ok(!rs.canTransition('reconciled', 'reported'), 'no backward move');
        assert.ok(!rs.canTransition('estimated', 'approved'), 'estimates must reconcile first');
        assert.ok(!rs.canTransition('superseded', 'reported'), 'superseded is terminal');
    });

    test('superseded cannot be set via normal review transitions', () => {
        for (const from of ['reported', 'reconciled', 'approved', 'disputed', 'estimated']) {
            assert.ok(!rs.canTransition(from, 'superseded'), `${from} -> superseded blocked`);
        }
    });

    test('applyTransition requires reviewer identity and records evidence', () => {
        const rec = { reviewState: 'reported', save: async () => {} };
        assert.throws(() => rs.applyTransition(rec, 'reconciled', '', 'x'), /reviewer/);
        const done = rs.applyTransition(rec, 'reconciled',
            'admin@pulsegrid.fm', 'matched distributor statement');
        assert.strictEqual(done.reviewState, 'reconciled');
        assert.strictEqual(done.reviewedBy, 'admin@pulsegrid.fm');
        assert.strictEqual(done.reviewEvidence, 'matched distributor statement');
        assert.ok(done.reviewedAt instanceof Date);
    });

    test('isCounted: trusted states only — disputed/estimated never in the headline total', () => {
        for (const s of ['reported', 'reconciled', 'approved']) {
            assert.ok(rs.isCounted(s), `${s} counts toward the trusted total`);
        }
        for (const s of ['disputed', 'estimated', 'superseded']) {
            assert.ok(!rs.isCounted(s), `${s} excluded from the trusted total`);
        }
        assert.ok(rs.isDisputed('disputed') && !rs.isDisputed('reported'));
        assert.ok(rs.isEstimated('estimated') && !rs.isEstimated('reported'));
    });
});

// ---------------------------------------------------------------------------
// Part B — spawned server
// ---------------------------------------------------------------------------

const OAUTH_TOKEN_KEY = crypto.randomBytes(32).toString('hex');

function baseEnv(port, scratch) {
    return {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        JWT_SECRET: 'financials-test-jwt-secret',
        USE_REAL_DATA: 'false',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: path.join(scratch, 'test.sqlite'),
        DATABASE_URL: '',
        ADMIN_EMAIL: '', ADMIN_PASS: '',
        GROQ_API_KEY: '',
        AUTO_PRINT: 'false',
        SCHEDULE_JOBS: 'false',
        OAUTH_TOKEN_KEY
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
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'financials-'));
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

function csvFile(rows) {
    const fd = new FormData();
    fd.append('file', new Blob([rows], { type: 'text/csv' }), 'import.csv');
    return fd;
}

describe('financial corrections: spawned server', () => {
    let srv, admin, artist;
    const state = {};

    before(async () => {
        srv = await spawnServer(32193);
        admin = await login(srv.api, 'admin@pulsegrid.fm', 'admin123');
        artist = await login(srv.api, 'tours@novakin.band', 'novakin123');
    });

    after(async () => {
        if (srv && srv.child) {
            srv.child.kill('SIGTERM');
            await new Promise((r) => setTimeout(r, 1500));
        }
    });

    test('royalty import preserves exact source-decimal precision', async () => {
        const rec = await srv.api('POST', '/v3/catalog/recordings', admin,
            { title: 'Precision Track', isrc: 'ZZPRC2600001', artistId: 'art_novakin' });
        assert.strictEqual(rec.status, 201);
        const body = 'isrc_or_upc,amount,currency,period,source\nZZPRC2600001,0.003,USD,2026-09,distributor\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(body));
        assert.strictEqual(imp.status, 201, JSON.stringify(imp.json));
        assert.strictEqual(imp.json.imported, 1);
        // The stored line keeps the exact source amount, scale, and provenance.
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-09', admin);
        assert.strictEqual(lines.status, 200);
        const line = lines.json.find((l) => l.catalogKey === 'ZZPRC2600001');
        assert.ok(line, 'imported line retrievable');
        assert.strictEqual(line.sourceAmount, '0.003', 'original amount string preserved');
        assert.strictEqual(line.amountDecimal, '0.003', 'exact decimal preserved');
        assert.strictEqual(line.amountScale, 3, 'scale preserved');
        assert.strictEqual(line.amountCents, 0, 'boundary cents: 0.003 rounds to 0');
        assert.ok(line.sourceFileHash, 'SHA-256 source-file hash recorded');
        assert.ok(line.rowRef, 'row reference recorded');
        assert.ok(line.importVersion, 'import version recorded');
        assert.strictEqual(line.reviewState, 'reported', 'fresh imports start at reported');
        state.lineId = line.id;
    });

    test('legacy amount_cents import still works', async () => {
        const body = 'isrc_or_upc,amount_cents,currency,period,source\nZZPRC2600001,12500,USD,2026-10,distributor\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(body));
        assert.strictEqual(imp.status, 201);
        assert.strictEqual(imp.json.imported, 1);
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-10', admin);
        const line = lines.json.find((l) => l.catalogKey === 'ZZPRC2600001');
        assert.ok(line);
        assert.strictEqual(line.amountCents, 12500);
        assert.strictEqual(line.sourceAmount, '12500', 'original legacy string preserved');
        assert.strictEqual(line.amountDecimal, '125.00', 'legacy cents normalized to exact decimal');
        assert.strictEqual(line.amountScale, 2);
    });

    test('summary uses exact-decimal aggregation, not per-line cents', async () => {
        // 0.003 stays exactly 0.003 in the summary — it is never pre-rounded
        // to cents and zeroed at import.
        const { status, json } = await srv.api(
            'GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-09', admin);
        assert.strictEqual(status, 200);
        const usd = json.totals.find((t) => t.currency === 'USD');
        assert.ok(usd);
        assert.strictEqual(usd.totalExact, '0.003', 'exact sum preserved in the summary');
        assert.strictEqual(usd.totalCents, 0, 'boundary rounding applied once, at the boundary');
        assert.ok(usd.precision, 'precision rule documented in the response');
    });

    test('same-file re-upload never double-counts', async () => {
        const body = 'isrc_or_upc,amount,currency,period,source\nZZPRC2600001,0.003,USD,2026-09,distributor\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(body));
        assert.strictEqual(imp.status, 201);
        assert.strictEqual(imp.json.imported, 0, 'no new rows from the identical file');
        assert.strictEqual(imp.json.rejected.length, 1, 'row rejected as duplicate');
        assert.match(imp.json.rejected[0].reason, /duplicate/);
        // Totals unchanged: still exactly one 0.003 line for 2026-09.
        const { json } = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-09', admin);
        const usd = json.totals.find((t) => t.currency === 'USD');
        assert.strictEqual(usd.totalExact, '0.003');
        assert.strictEqual(usd.lineCount, 1, 'still exactly one active line');
    });

    test('revised file supersedes the prior line instead of duplicating', async () => {
        // Revised statement: same key, different file hash, corrected amount.
        const body = 'isrc_or_upc,amount,currency,period,source\nZZPRC2600001,0.005,USD,2026-09,distributor\n';
        const imp = await srv.api('POST', '/v3/royalties/import', admin, csvFile(body));
        assert.strictEqual(imp.status, 201);
        assert.strictEqual(imp.json.imported, 1);
        assert.strictEqual(imp.json.superseded, 1, 'prior line marked superseded');
        // Active totals reflect the REVISED amount only: 0.005 -> 1 cent.
        const { json } = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-09', admin);
        const usd = json.totals.find((t) => t.currency === 'USD');
        assert.strictEqual(usd.totalExact, '0.005', 'only the revised line counts');
        assert.strictEqual(usd.totalCents, 1, '0.005 rounds half-up to 1 cent');
        assert.strictEqual(usd.lineCount, 1, 'superseded line excluded from the count');
        // The superseded line still exists (audit trail) with the linkage.
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-09&reviewState=superseded', admin);
        assert.strictEqual(lines.status, 200);
        assert.ok(lines.json.length >= 1, 'superseded line retained for audit');
    });

    test('review transitions require valid path, reviewer, and evidence', async () => {
        // Use a fresh line: state.lineId was superseded by the revised import
        // and superseded records are terminal (cannot transition).
        const rec0 = await srv.api('POST', '/v3/catalog/recordings', admin,
            { title: 'Review Track', isrc: 'ZZREV2600001', artistId: 'art_novakin' });
        assert.strictEqual(rec0.status, 201);
        const body = 'isrc_or_upc,amount,currency,period,source\nZZREV2600001,7.50,USD,2026-09,distributor\n';
        await srv.api('POST', '/v3/royalties/import', admin, csvFile(body));
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-09', admin);
        const fresh = lines.json.find((l) => l.catalogKey === 'ZZREV2600001' && l.reviewState === 'reported');
        assert.ok(fresh, 'fresh reported line for review test');
        const id = fresh.id;
        // Invalid: skipping reconciled straight to approved.
        const skip = await srv.api('PATCH', `/v3/royalties/lines/${id}/review`, admin,
            { reviewState: 'approved', evidence: 'x' });
        assert.strictEqual(skip.status, 409, 'invalid transition rejected');
        // Valid: reported -> reconciled.
        const rec = await srv.api('PATCH', `/v3/royalties/lines/${id}/review`, admin,
            { reviewState: 'reconciled', evidence: 'matched distributor PDF page 3' });
        assert.strictEqual(rec.status, 200);
        assert.strictEqual(rec.json.reviewState, 'reconciled');
        assert.strictEqual(rec.json.reviewedBy, 'admin@pulsegrid.fm', 'reviewer identity recorded');
        assert.ok(rec.json.reviewedAt, 'review timestamp recorded');
        // Then reconciled -> approved.
        const appr = await srv.api('PATCH', `/v3/royalties/lines/${id}/review`, admin,
            { reviewState: 'approved', evidence: 'label sign-off' });
        assert.strictEqual(appr.status, 200);
        assert.strictEqual(appr.json.reviewState, 'approved');
        // Artist role cannot run review transitions.
        const denied = await srv.api('PATCH', `/v3/royalties/lines/${id}/review`, artist,
            { reviewState: 'disputed', evidence: 'x' });
        assert.strictEqual(denied.status, 403, 'review transitions are admin-only');
    });

    test('disputed and estimated lines are flagged and excluded from the trusted total', async () => {
        const rec = await srv.api('POST', '/v3/catalog/recordings', admin,
            { title: 'Dispute Track', isrc: 'ZZDSP2600001', artistId: 'art_novakin' });
        assert.strictEqual(rec.status, 201);
        const body = 'isrc_or_upc,amount,currency,period,source\nZZDSP2600001,10.00,USD,2026-09,distributor\n';
        await srv.api('POST', '/v3/royalties/import', admin, csvFile(body));
        const lines = await srv.api('GET', '/v3/royalties/lines?artistId=art_novakin&period=2026-09', admin);
        const line = lines.json.find((l) => l.catalogKey === 'ZZDSP2600001');
        assert.ok(line);
        const disp = await srv.api('PATCH', `/v3/royalties/lines/${line.id}/review`, admin,
            { reviewState: 'disputed', evidence: 'label claims 12.00; awaiting corrected statement' });
        assert.strictEqual(disp.status, 200);
        const { json } = await srv.api('GET', '/v3/royalties/summary?artistId=art_novakin&period=2026-09', admin);
        const usd = json.totals.find((t) => t.currency === 'USD');
        assert.ok(usd.disputedCount >= 1, 'disputed lines are flagged in the summary');
        // Trusted total excludes the disputed 10.00: only the revised 0.005 counts.
        assert.strictEqual(usd.totalExact, '0.005', 'disputed 10.00 is NOT in the trusted total');
        assert.strictEqual(usd.totalCents, 1);
        assert.strictEqual(usd.disputedExact, '10.00', 'disputed amount shown as a separate line');
        assert.strictEqual(usd.disputedCents, 1000);
    });

    test('reconciliation endpoint: named correctly, with coverage statement', async () => {
        const { status, json } = await srv.api('GET', '/v3/financials/reconciliation?artistId=art_novakin', admin);
        assert.strictEqual(status, 200);
        assert.strictEqual(json.type, 'income_and_cash_reconciliation');
        // The response must not present itself as a P&L anywhere.
        const flat = JSON.stringify(json).toLowerCase();
        assert.ok(!flat.includes('"pnl"'), 'no P&L naming in the response');
        assert.ok(!flat.includes('profit-and-loss statement') || flat.includes('not a profit-and-loss'),
            'P&L mentioned only to disclaim it');
        const cov = json.coverage;
        assert.ok(cov, 'coverage statement present');
        assert.deepStrictEqual(cov.trustedStates, ['reported', 'reconciled', 'approved']);
        assert.deepStrictEqual(cov.separatedStates, ['disputed', 'estimated']);
        assert.ok(cov.royalties && cov.merchSettlements && cov.directSales && cov.manualAdjustments,
            'per-category period filtering documented');
        assert.ok(cov.cash && /not income/i.test(cov.cash.note), 'cash documented as evidence, not income');
        const disclaimers = json.disclaimers.join(' ');
        assert.match(disclaimers, /not a credit rating/i, 'credit-rating disclaimer present');
        assert.match(disclaimers, /never added to income totals/i, 'no-double-counting stated');
        const novakin = json.artists.find((a) => a.artistId === 'art_novakin');
        assert.ok(novakin, 'artist bucket present');
        const usd = novakin.totals.USD;
        assert.ok(usd, 'USD bucket present');
        assert.ok(Number.isSafeInteger(usd.countedCents), 'totals are integer cents');
        assert.ok('disputedCents' in usd && 'estimatedCents' in usd, 'separated states exposed');
        // Cash section: evidence, never income.
        assert.ok(json.cash, 'cash section present');
        assert.ok(Array.isArray(json.cash.matched), 'matched pairs listed');
        assert.ok(Array.isArray(json.cash.unmatchedPayouts), 'unmatched payouts visible');
        assert.ok(Array.isArray(json.cash.unmatchedDeposits), 'unmatched deposits visible');
        assert.ok(Array.isArray(json.cash.gaps), 'cash gaps listed');
        assert.ok(Array.isArray(json.evidenceGaps), 'evidence gaps listed');
    });

    test('reconciliation totals: trusted only, exact decimals, disputed separate', async () => {
        // art_novakin USD for 2026-09:
        //   royalty 0.005 (revised; the 0.003 was superseded) -> 1 cent +
        //   royalty 7.50 (approved in the review test) -> 750 cents =
        //   trusted 751 cents.
        //   royalty 10.00 (disputed) -> 1000 cents, SEPARATE, not in trusted.
        const { json } = await srv.api(
            'GET', '/v3/financials/reconciliation?artistId=art_novakin&period=2026-09', admin);
        const novakin = json.artists.find((a) => a.artistId === 'art_novakin');
        const usd = novakin.totals.USD;
        assert.strictEqual(usd.countedCents, 751, 'trusted total: 0.005 + 7.50');
        assert.strictEqual(usd.disputedCents, 1000, 'disputed 10.00 is a separate line');
        assert.strictEqual(usd.estimatedCents, 0);
        assert.ok(usd.disputedCount >= 1, 'disputed line flagged');
        // Label-level totals agree with the artist bucket (single artist here).
        assert.strictEqual(json.totals.USD.countedCents, 751);
        assert.strictEqual(json.totals.USD.disputedCents, 1000);
    });

    test('direct-sale review endpoint: validation and admin gating', async () => {
        // No Stripe sales are seeded in this file (no PAYMENTS_STUB), so we
        // exercise the validation paths: 404 for unknown IDs, 400 for bad
        // states, 403 for non-admin. The happy-path transition is covered
        // by the royalty-line review tests (same state machine).
        const missing = await srv.api('PATCH', '/v3/direct-sales/999999/review', admin,
            { reviewState: 'reconciled', evidence: 'x' });
        assert.strictEqual(missing.status, 404);
        const badState = await srv.api('PATCH', '/v3/direct-sales/1/review', admin,
            { reviewState: 'bogus', evidence: 'x' });
        assert.strictEqual(badState.status, 400);
        const denied = await srv.api('PATCH', '/v3/direct-sales/1/review', artist,
            { reviewState: 'disputed', evidence: 'x' });
        assert.strictEqual(denied.status, 403, 'review transitions are admin-only');
    });

    test('export carries precision, provenance, review state, and coverage', async () => {
        const { status, text } = await srv.api('GET', '/v3/financials/export?format=csv', admin);
        assert.strictEqual(status, 200);
        const header = text.split('\r\n')[0] || text.split('\n')[0];
        for (const col of ['amount_decimal', 'amount_scale', 'source_amount',
            'source_file_hash', 'row_ref', 'import_version',
            'review_state', 'reviewed_by', 'review_evidence']) {
            assert.ok(header.includes(col), `export header includes ${col}`);
        }
        assert.ok(text.includes('reconciliation_summary'), 'reconciliation summary rows present');
        assert.ok(!text.match(/^pnl_summary,/m), 'no pnl_summary rows');
        assert.ok(text.includes('not_a_credit_rating=true'), 'credit disclaimer in the export');
        assert.ok(text.includes('0.005'), 'exact decimal amount in the export');
    });
});
