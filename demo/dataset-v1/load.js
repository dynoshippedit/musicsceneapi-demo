'use strict';

/**
 * demo/dataset-v1/load.js
 *
 * Deterministic, idempotent loader for the versioned demo dataset v1.
 *
 * What it does, in order, against a running API (DEMO_MODE=true required):
 *   1. Logs in as the demo admin.
 *   2. Verifies the fictional demo catalog is present (fails otherwise —
 *      the dataset's ISRCs only resolve against the demo seed).
 *   3. Imports statement-2026-07-initial.csv (3 matched, 1 unmatched row).
 *   4. Imports statement-2026-07-revised.csv (supersedes the initial July
 *      statement as a unit: 3 superseded, 3 imported).
 *   5. Imports statement-2026-08.csv (2 matched, 1 unmatched, 1 invalid).
 *   6. Reviews: disputes the revised July ZZAAA2600001 line (140.00 USD),
 *      reconciles + approves the two August lines.
 *   7. Pulls the income/cash reconciliation for 2026-08 (shows the income
 *      with no matching cash evidence — the "reconciliation difference").
 *   8. Exports the full financial CSV and saves it as evidence.
 *
 * Idempotency: imports are skipped when royalty lines already exist for the
 * marker source `demo-dataset-v1` (re-importing would supersede, not
 * duplicate — the loader never re-imports). Review transitions tolerate
 * HTTP 409 (already in the target state). Every run ends with the same
 * line counts, review states, and trusted totals; assertions against
 * expected.json fail the run on any deviation.
 *
 * Unmatched rows are REJECTED by the import workflow and never persisted —
 * they appear only in the import report's `rejected` list. The loader
 * asserts this explicitly.
 *
 * CLI:
 *   node demo/dataset-v1/load.js --base http://127.0.0.1:4000 \
 *       --email admin@pulsegrid.fm --password admin123 \
 *       [--evidence demo/dataset-v1/evidence] [--no-assert]
 *
 * Requireable: `const { load } = require('./load'); await load({...})`.
 */

const fs = require('fs');
const path = require('path');

const DATASET_DIR = __dirname;
const EXPECTED = JSON.parse(fs.readFileSync(path.join(DATASET_DIR, 'expected.json'), 'utf8'));
const MARKER_SOURCE = 'demo-dataset-v1';
const DISPUTE_EVIDENCE = 'demo-dataset-v1: distributor portal shows 138.50 for this line; under review';

async function load({ base, email, password, evidenceDir = null, assertExpected = true }) {
    base = String(base).replace(/\/+$/, '');
    const summary = { dataset: 'demo/dataset-v1', version: EXPECTED.version, steps: [] };
    const step = (name, detail) => summary.steps.push({ name, ...detail });

    async function req(method, p, { body, form } = {}) {
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        let payload;
        if (form) {
            payload = form; // FormData sets its own content-type
        } else if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            payload = JSON.stringify(body);
        }
        const res = await fetch(base + p, { method, headers, body: payload });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* non-JSON (CSV export) */ }
        return { status: res.status, json, text };
    }

    // 1. Login.
    let token = null;
    {
        const r = await req('POST', '/v3/auth/login', { body: { email, password } });
        if (r.status !== 200 || !r.json?.token) {
            throw new Error(`demo login failed (HTTP ${r.status}): ${r.text.slice(0, 200)}`);
        }
        token = r.json.token;
        step('login', { email });
    }

    // 2. Demo catalog must be present.
    {
        const r = await req('GET', '/v3/artists');
        const artists = r.json?.artists ?? [];
        if (!artists.some((a) => a.id === 'art_novakin')) {
            throw new Error('demo catalog not found: boot the server with DEMO_MODE=true before loading dataset v1');
        }
        step('catalog-check', { found: artists.length });
    }

    // 3. Idempotency gate: lines already exist for the marker source.
    let importsSkipped = false;
    {
        const r = await req('GET', `/v3/royalties/lines?source=${MARKER_SOURCE}`);
        if (r.status === 200 && Array.isArray(r.json) && r.json.length > 0) {
            importsSkipped = true;
            step('imports', { skipped: true, reason: 'lines already exist for source demo-dataset-v1' });
        }
    }

    async function importCsv(filename) {
        const csv = fs.readFileSync(path.join(DATASET_DIR, 'statements', filename), 'utf8');
        const form = new FormData();
        form.append('file', new Blob([csv], { type: 'text/csv' }), filename);
        const r = await req('POST', '/v3/royalties/import', { form });
        if (r.status !== 201) {
            throw new Error(`import of ${filename} failed (HTTP ${r.status}): ${r.text.slice(0, 300)}`);
        }
        return r.json;
    }

    if (!importsSkipped) {
        const july1 = await importCsv('statement-2026-07-initial.csv');
        step('import', { file: 'statement-2026-07-initial.csv', received: july1.received, imported: july1.imported, rejected: july1.rejected });
        const july2 = await importCsv('statement-2026-07-revised.csv');
        step('import', { file: 'statement-2026-07-revised.csv', received: july2.received, imported: july2.imported, superseded: july2.superseded });
        const aug = await importCsv('statement-2026-08.csv');
        step('import', { file: 'statement-2026-08.csv', received: aug.received, imported: aug.imported, rejected: aug.rejected });
        summary.imports = { july1, july2, aug };
    }

    // 4. Current lines for the marker source.
    const linesRes = await req('GET', `/v3/royalties/lines?source=${MARKER_SOURCE}`);
    if (linesRes.status !== 200 || !Array.isArray(linesRes.json)) {
        throw new Error(`could not list dataset lines (HTTP ${linesRes.status})`);
    }
    const lines = linesRes.json;
    const active = lines.filter((l) => l.reviewState !== 'superseded');
    const byPeriod = {};
    for (const l of active) {
        byPeriod[l.period] = byPeriod[l.period] || [];
        byPeriod[l.period].push(l);
    }
    step('lines', {
        total: lines.length,
        active: active.length,
        perPeriod: Object.fromEntries(Object.entries(byPeriod).map(([p, ls]) => [p, ls.length]))
    });

    // 5. Reviews (409-tolerant: a re-run finds lines already reviewed).
    async function transition(lineId, to, evidence) {
        const r = await req('PATCH', `/v3/royalties/lines/${lineId}/review`, { body: { reviewState: to, evidence } });
        if (r.status === 409) return { already: true, to };
        if (r.status !== 200) throw new Error(`review transition ${to} failed (HTTP ${r.status}): ${r.text.slice(0, 200)}`);
        return r.json;
    }
    async function ensureState(line, target, evidence) {
        let current = line.reviewState || 'reported';
        const chain = target === 'approved' ? ['reconciled', 'approved'] : [target];
        for (const next of chain) {
            if (current === target) break;
            const r = await transition(line.id, next, evidence);
            current = r.already ? target : next;
            if (r.already) break;
        }
        return current;
    }

    const disputeTarget = active.find((l) => l.catalogKey === 'ZZAAA2600001' && l.period === '2026-07');
    if (!disputeTarget) throw new Error('expected the revised July ZZAAA2600001 line for dispute');
    await ensureState(disputeTarget, 'disputed', DISPUTE_EVIDENCE);
    const approveTargets = active.filter((l) => l.period === '2026-08');
    for (const l of approveTargets) {
        await ensureState(l, 'approved', 'demo-dataset-v1: reviewer sign-off');
    }
    step('reviews', {
        disputed: 'ZZAAA2600001/2026-07',
        approved: approveTargets.map((l) => `${l.catalogKey}/${l.period}`)
    });

    // 6. Reconciliation for 2026-08 (income present, no cash evidence —
    //    the report records the difference explicitly).
    const reconRes = await req('GET', '/v3/financials/reconciliation?period=2026-08');
    if (reconRes.status !== 200) throw new Error(`reconciliation failed (HTTP ${reconRes.status})`);
    const recon = reconRes.json;
    const reconAug = recon?.totals?.USD;
    step('reconciliation', {
        period: '2026-08',
        countedCents: reconAug?.countedCents ?? null,
        approvedCents: reconAug?.approvedCents ?? null,
        cashNote: recon?.coverage?.cash?.note ? 'present' : 'missing'
    });

    const reconJulRes = await req('GET', '/v3/financials/reconciliation?period=2026-07');
    const reconJul = reconJulRes.json?.totals?.USD;

    // 7. Approved financial export (CSV) — saved as evidence.
    const exportRes = await req('GET', '/v3/financials/export?format=csv');
    if (exportRes.status !== 200) throw new Error(`financial export failed (HTTP ${exportRes.status})`);
    if (evidenceDir) {
        fs.mkdirSync(evidenceDir, { recursive: true });
        fs.writeFileSync(path.join(evidenceDir, 'approved-export.csv'), exportRes.text);
        fs.writeFileSync(path.join(evidenceDir, 'reconciliation-2026-08.json'), JSON.stringify(recon, null, 2));
        fs.writeFileSync(path.join(evidenceDir, 'import-reports.json'), JSON.stringify(summary.imports || { skipped: true }, null, 2));
        step('evidence', { dir: evidenceDir, files: ['approved-export.csv', 'reconciliation-2026-08.json', 'import-reports.json'] });
    }

    // 8. Deterministic assertions against expected.json.
    if (assertExpected) {
        const problems = [];
        const eq = (label, actual, expected) => {
            if (actual !== expected) problems.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        };
        const exp = EXPECTED.imports;
        if (!importsSkipped) {
            eq('july-initial.received', summary.imports.july1.received, exp['statement-2026-07-initial.csv'].received);
            eq('july-initial.imported', summary.imports.july1.imported, exp['statement-2026-07-initial.csv'].imported);
            eq('july-initial.rejected', summary.imports.july1.rejected.length, exp['statement-2026-07-initial.csv'].rejected);
            eq('july-revised.imported', summary.imports.july2.imported, exp['statement-2026-07-revised.csv'].imported);
            eq('july-revised.superseded', summary.imports.july2.superseded, exp['statement-2026-07-revised.csv'].superseded);
            eq('august.received', summary.imports.aug.received, exp['statement-2026-08.csv'].received);
            eq('august.imported', summary.imports.aug.imported, exp['statement-2026-08.csv'].imported);
            eq('august.rejected', summary.imports.aug.rejected.length, exp['statement-2026-08.csv'].rejected);
            const codes = new Set();
            for (const r of [...summary.imports.july1.rejected, ...summary.imports.aug.rejected]) {
                if (r.code) codes.add(r.code);
                else if (/amount/i.test(r.reason || '')) codes.add('amount');
            }
            for (const want of ['unmatched_catalog', 'amount']) {
                if (!codes.has(want)) problems.push(`rejected codes missing ${want} (have: ${[...codes].join(',')})`);
            }
        }
        eq('active 2026-07 lines', byPeriod['2026-07']?.length || 0, EXPECTED.activeLines['2026-07']);
        eq('active 2026-08 lines', byPeriod['2026-08']?.length || 0, EXPECTED.activeLines['2026-08']);
        // Unmatched rows are never persisted.
        const unmatched = lines.find((l) => l.catalogKey === EXPECTED.unmatchedIsrc);
        if (unmatched) problems.push(`unmatched ISRC ${EXPECTED.unmatchedIsrc} was persisted (line ${unmatched.id})`);
        // Trusted reconciliation totals (disputed amounts excluded).
        eq('trusted 2026-08 countedCents', reconAug?.countedCents, EXPECTED.trustedTotalsCents['2026-08'].USD);
        eq('trusted 2026-07 countedCents', reconJul?.countedCents, EXPECTED.trustedTotalsCents['2026-07'].USD);
        eq('disputed 2026-07 disputedCents', reconJul?.disputedCents, EXPECTED.review.disputed[0].amountCents);
        if (problems.length) {
            throw new Error('dataset v1 assertions failed:\n - ' + problems.join('\n - '));
        }
        step('assertions', { result: 'pass', against: 'expected.json' });
    }

    summary.result = 'ok';
    return summary;
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const k = argv[i].slice(2);
            out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
        }
    }
    return out;
}

if (require.main === module) {
    (async () => {
        const args = parseArgs(process.argv.slice(2));
        if (!args.base || !args.email || !args.password) {
            console.error('usage: node demo/dataset-v1/load.js --base <url> --email <e> --password <p> [--evidence <dir>] [--no-assert]');
            process.exit(2);
        }
        try {
            const summary = await load({
                base: args.base,
                email: args.email,
                password: args.password,
                evidenceDir: args.evidence === true ? path.join(DATASET_DIR, 'evidence') : (args.evidence || null),
                assertExpected: args['no-assert'] ? false : true
            });
            console.log(JSON.stringify(summary, null, 2));
        } catch (err) {
            console.error('dataset v1 load failed:', err.message);
            process.exit(1);
        }
    })();
}

module.exports = { load, EXPECTED, MARKER_SOURCE, DATASET_DIR };
