/**
 * tests/regression/services.test.js
 *
 * Unit tests for the Phase 2 layers: repositories, cache, AI, analytics,
 * integrations facade and jobs.
 *
 * All of these run in-process with NO network and NO server. External
 * providers and the Groq transport are injected, which is the point of the
 * factory functions each module exports.
 *
 * Tests labelled PINS assert behavior the audit identified as defective and
 * which Phase 2 deliberately preserved. A Phase 3 fix must update them.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

if (process.env.GROQ_API_KEY === undefined) process.env.GROQ_API_KEY = '';

// ---------------------------------------------------------------------------
// AI: prompts
// ---------------------------------------------------------------------------
describe('src/ai/prompts', () => {
    const prompts = require('../../src/ai/prompts');

    test('query messages keep the exact system prompt', () => {
        const msgs = prompts.buildQueryMessages({ userPrompt: 'hi', contextData: {} });
        assert.strictEqual(msgs.length, 2);
        assert.strictEqual(msgs[0].role, 'system');
        assert.strictEqual(msgs[0].content, 'AI analyst for The Music Scene. Concise, data-driven insights.');
    });

    test('user prompt is truncated to 500 characters', () => {
        const long = 'x'.repeat(900);
        const msgs = prompts.buildQueryMessages({ userPrompt: long, contextData: {} });
        const sent = msgs[1].content.split('\nData:')[0];
        assert.strictEqual(sent.length, 500);
    });

    test('artist context carries name, stats and revenue summary', () => {
        const ctx = prompts.buildArtistContext({
            name: 'Test', monthlyListeners: 10, totalStreams: 20, growthRate: 3,
            revenue: { streaming: 100, touring: 50 }
        });
        assert.strictEqual(ctx.name, 'Test');
        assert.match(ctx.stats, /Listeners: 10, Streams: 20, Growth: 3%/);
        assert.match(ctx.revenue, /Total: \$150/);
        assert.match(ctx.revenue, /Top: streaming/);
    });

    test('PINS: the entity-audit prompt still only asks for JSON in prose', () => {
        // This is the root cause of the JSON.parse fragility. A real fix would
        // set response_format and a schema; documented, not changed.
        const p = prompts.buildEntityAuditPrompt({
            artistName: 'A', googleKgStatus: 'OK', wikipediaStatus: 'OK', healthScore: 50
        });
        assert.match(p, /Format as JSON\.$/);
    });
});

// ---------------------------------------------------------------------------
// AI: response parsing / validation
// ---------------------------------------------------------------------------
describe('src/ai/responseParser', () => {
    const parser = require('../../src/ai/responseParser');

    test('strict JSON parses via the original path', () => {
        const r = parser.parseJsonLoose('{"a":1}');
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.strategy, 'strict');
        assert.deepStrictEqual(r.value, { a: 1 });
    });

    test('empty content yields {} exactly as the original did', () => {
        const r = parser.parseJsonLoose('');
        assert.strictEqual(r.ok, true);
        assert.deepStrictEqual(r.value, {});
    });

    test('recovers JSON from a fenced code block (previously a hard failure)', () => {
        const r = parser.parseJsonLoose('Here you go:\n```json\n{"summary":"ok"}\n```');
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.strategy, 'extracted');
        assert.strictEqual(r.value.summary, 'ok');
    });

    test('recovers JSON from a prose preamble', () => {
        const r = parser.parseJsonLoose('Sure! {"x": 2} hope that helps');
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.value.x, 2);
    });

    test('reports failure when there is no JSON at all', () => {
        const r = parser.parseJsonLoose('I cannot help with that.');
        assert.strictEqual(r.ok, false);
    });

    test('validateEntityAudit returns the VERBATIM original fallback on garbage', () => {
        const out = parser.validateEntityAudit('no json here');
        assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), {
            summary: 'AI analysis unavailable',
            criticalActions: [],
            correlationInsight: 'Manual review needed'
        });
    });

    test('diagnostic _meta is NOT serializable, so it cannot leak into a response', () => {
        const out = parser.validateEntityAudit('{"summary":"fine"}');
        assert.ok(out._meta, 'meta is readable in-process');
        assert.ok(!Object.keys(out).includes('_meta'), 'meta is non-enumerable');
        assert.ok(!JSON.stringify(out).includes('_meta'), 'meta never reaches JSON');
    });
});

// ---------------------------------------------------------------------------
// AI: service (injected transport, no network)
// ---------------------------------------------------------------------------
describe('src/ai/aiService', () => {
    const { createAiService } = require('../../src/ai/aiService');
    const { createCacheService } = require('../../src/services/cacheService');

    function fakeClient(content, shouldThrow = false) {
        return {
            isConfigured: () => true,
            complete: async () => {
                if (shouldThrow) throw new Error('boom');
                return { content, usage: { total_tokens: 1 }, model: 'test-model' };
            }
        };
    }

    test('query returns kind=ok with the model answer', async () => {
        const svc = createAiService({ client: fakeClient('insight text'), cacheService: createCacheService() });
        const out = await svc.query({ prompt: 'p', user: { role: 'admin' } });
        assert.strictEqual(out.kind, 'ok');
        assert.strictEqual(out.answer, 'insight text');
    });

    test('query treats empty provider content as a failure', async () => {
        const svc = createAiService({ client: fakeClient(''), cacheService: createCacheService() });
        const out = await svc.query({ prompt: 'p', user: { role: 'admin' } });
        assert.strictEqual(out.kind, 'error');
        assert.strictEqual(out.answer, undefined);
    });

    test('second identical query is served from cache', async () => {
        const cacheSvc = createCacheService();
        const svc = createAiService({ client: fakeClient('first'), cacheService: cacheSvc });
        await svc.query({ prompt: 'same', user: { role: 'admin' } });
        const out = await svc.query({ prompt: 'same', user: { role: 'admin' } });
        assert.strictEqual(out.kind, 'cached');
        assert.strictEqual(out.answer, 'first');
    });

    test('forceRefresh bypasses the cache', async () => {
        const cacheSvc = createCacheService();
        const svc = createAiService({ client: fakeClient('fresh'), cacheService: cacheSvc });
        await svc.query({ prompt: 'k', user: { role: 'admin' } });
        const out = await svc.query({ prompt: 'k', user: { role: 'admin' }, forceRefresh: true });
        assert.strictEqual(out.kind, 'ok');
    });

    test('analyzeEntityHealth never throws when the transport fails', async () => {
        const svc = createAiService({ client: fakeClient('', true), cacheService: createCacheService() });
        const out = await svc.analyzeEntityHealth({ artistName: 'A', healthScore: 1 });
        assert.strictEqual(out.summary, 'AI analysis unavailable');
    });

    test('PINS: analyzeByKeyword is NOT AI and keeps its hardcoded strings', () => {
        const svc = createAiService({ client: fakeClient('unused'), cacheService: createCacheService() });
        assert.match(svc.analyzeByKeyword('what about roi').response, /highest ROI at .*NOVAKIN is second at 8\.7x\./);
        assert.match(svc.analyzeByKeyword('growth please').response, /fastest growing artist/);
        assert.match(svc.analyzeByKeyword('nothing relevant').response, /Overall revenue is up 15% YoY/);
    });
});

// ---------------------------------------------------------------------------
// AI: groq client construction
// ---------------------------------------------------------------------------
describe('src/ai/groqClient', () => {
    const { createGroqClient, AiTimeoutError } = require('../../src/ai/groqClient');

    test('construction does NOT throw when the API key is missing (Phase 2 fix)', () => {
        // The monolith built the SDK client at module load, so an unset
        // GROQ_API_KEY made the entire application fail to load. Now lazy.
        assert.doesNotThrow(() => createGroqClient({ apiKey: undefined }));
    });

    test('isConfigured reflects whether a key or transport is present', () => {
        assert.strictEqual(createGroqClient({ apiKey: '' }).isConfigured(), false);
        assert.strictEqual(createGroqClient({ apiKey: 'k' }).isConfigured(), true);
        assert.strictEqual(createGroqClient({ transport: {} }).isConfigured(), true);
    });

    test('a hung model call is bounded by the timeout', async () => {
        const hang = { chat: { completions: { create: () => new Promise(() => {}) } } };
        const client = createGroqClient({ transport: hang, timeoutMs: 40 });
        await assert.rejects(
            () => client.complete({ messages: [] }),
            (err) => err instanceof AiTimeoutError
        );
    });
});

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------
describe('src/repositories/artistRepository', () => {
    const repo = require('../../src/repositories/artistRepository');

    test('exposes the 8-artist fictional mock roster and label totals', () => {
        assert.strictEqual(repo.getMockArtists().length, 8);
        assert.ok(repo.getLabelTotals(), 'labelTotals present');
    });

    test('findMockById resolves a known artist and misses cleanly', () => {
        assert.strictEqual(repo.findMockById('art_lumenveil').name, 'LUMEN VEIL');
        assert.strictEqual(repo.findMockById('art_nope'), undefined);
    });

    test('getArtistData returns null for an unknown id without touching cache', async () => {
        assert.strictEqual(await repo.getArtistData('art_does_not_exist'), null);
    });

    test('getArtistData returns the mock object when USE_REAL_DATA is off', async () => {
        const a = await repo.getArtistData('art_novakin');
        assert.strictEqual(a.id, 'art_novakin');
    });

    test('ranking helpers select the correct top artist', () => {
        const artists = repo.getMockArtists();
        const maxRoi = Math.max(...artists.map((a) => a.roi));
        assert.strictEqual(repo.topByRoi().roi, maxRoi);
        const maxGrowth = Math.max(...artists.map((a) => a.growthRate));
        assert.strictEqual(repo.topByGrowthRate().growthRate, maxGrowth);
        const maxListeners = Math.max(...artists.map((a) => a.monthlyListeners));
        assert.strictEqual(repo.topByMonthlyListeners().monthlyListeners, maxListeners);
    });

    test('PINS: ranking helpers sort the SHARED array in place', () => {
        // Deliberate fidelity decision — the /v3/ai/analyze "tour" branch reads
        // artists[1] AFTER sorting, so copy-first would change its output.
        // Verified not observable through any endpoint. See the repository header.
        const arr = repo.getMockArtists();
        repo.topByGrowthRate();
        const growthOrder = arr.map((a) => a.growthRate);
        const sortedDesc = [...growthOrder].sort((a, b) => b - a);
        assert.deepStrictEqual(growthOrder, sortedDesc,
            'PINNED: shared roster is left sorted by the helper');
    });
});

describe('src/repositories/inMemoryStores', () => {
    const stores = require('../../src/repositories/inMemoryStores');

    test('PINS SPLIT-BRAIN: two independent A&R demo stores exist', () => {
        assert.ok(Array.isArray(stores.anrSubmissions), 'store #1 is an array');
        assert.ok(Array.isArray(stores.anrState.demos), 'store #2 is an array');
        // Different vote models.
        assert.strictEqual(typeof stores.anrSubmissions[0].votes, 'number');
        assert.ok(Array.isArray(stores.anrState.demos[0].ratings));
        // No shared identifiers -> nothing reconciles them.
        const subIds = new Set(stores.anrSubmissions.map((s) => s.id));
        const demoIds = stores.anrState.demos.map((d) => d.id);
        assert.ok(demoIds.every((id) => !subIds.has(id)), 'PINNED: id spaces are disjoint');
    });

    test('PINS: apiCache is dead (never read or written by the app)', () => {
        assert.deepStrictEqual(stores.apiCache, { artists: { data: null, timestamp: 0 } });
    });
});

describe('src/repositories/operationsRepository', () => {
    const ops = require('../../src/repositories/operationsRepository');

    test('fixtures keep their original counts and explicit nulls', () => {
        assert.strictEqual(ops.getLogistics().length, 3);
        assert.strictEqual(ops.getAssets().length, 3);
        assert.strictEqual(ops.getContracts().length, 3);
        assert.strictEqual(ops.getLogistics()[1].eta, null);
        assert.strictEqual(ops.getContracts()[0].recoupable, null);
    });
});

// ---------------------------------------------------------------------------
// Cache service
// ---------------------------------------------------------------------------
describe('src/services/cacheService', () => {
    const { createCacheService, keys } = require('../../src/services/cacheService');

    test('key builders reproduce the original inline key strings', () => {
        assert.strictEqual(keys.artistData('art_x'), 'artist_data_art_x');
        assert.strictEqual(keys.entityAudit('art_x'), 'entity_audit_art_x');
        assert.strictEqual(keys.auditGenius('art_x'), 'audit_genius_art_x');
        assert.strictEqual(keys.aiQuery('  hello  ', 'art_x'), 'hello_art_x');
        assert.strictEqual(keys.aiQuery('hello', undefined), 'hello_label');
    });

    test('get/set/del round-trip', () => {
        const c = createCacheService();
        c.set('k', { v: 1 });
        assert.deepStrictEqual(c.get('k'), { v: 1 });
        c.del('k');
        assert.strictEqual(c.get('k'), undefined);
    });

    test('TTL constants match the original per-call overrides', () => {
        const c = createCacheService();
        assert.strictEqual(c.TTL.ARTIST_DATA, 86400);
        assert.strictEqual(c.TTL.ENTITY_AUDIT, 1209600);
        assert.strictEqual(c.TTL.NEVER_EXPIRE, 0);
    });
});

// ---------------------------------------------------------------------------
// Entity audit orchestration (all providers mocked)
// ---------------------------------------------------------------------------
describe('src/services/entityAuditService', () => {
    const { createEntityAuditService } = require('../../src/services/entityAuditService');
    const { createCacheService } = require('../../src/services/cacheService');

    function fakeFacade(calls = {}) {
        const record = { genius: 0, kg: 0 };
        return {
            record,
            auditGenius: async () => { record.genius++; return { status: 'OK' }; },
            auditGoogleKG: async () => { record.kg++; return { status: 'OK', schemaValid: true }; },
            auditWikipedia: async () => ({ status: 'OK' }),
            auditDiscogs: async () => ({ status: 'OK' }),
            auditMusicBrainz: async () => ({ status: 'verified', exists: true, mbid: 'mbid-test' }),
            auditWikidata: async () => ({ status: 'verified', exists: true, qid: 'Q1' }),
            auditFandom: async () => ({ status: 'OK' }),
            calculateHealthScore: () => 77,
            detectInconsistencies: () => [{ type: 'mismatch' }],
            generateSchemaLD: () => ({ '@type': 'MusicGroup' }),
            ...calls
        };
    }
    const fakeAi = { analyzeEntityHealth: async () => ({ summary: 'stub' }) };
    const fakeRepo = { getArtistData: async (id) => (id === 'art_missing' ? null : { id, name: 'Test Artist' }) };

    test('returns not_found for an unknown artist', async () => {
        const svc = createEntityAuditService({
            cacheService: createCacheService(), integrationFacade: fakeFacade(), ai: fakeAi, repo: fakeRepo
        });
        assert.strictEqual((await svc.audit('art_missing', false)).kind, 'not_found');
    });

    test('fresh audit composes providers, score, issues and cached:false', async () => {
        const svc = createEntityAuditService({
            cacheService: createCacheService(), integrationFacade: fakeFacade(), ai: fakeAi, repo: fakeRepo
        });
        const { kind, result } = await svc.audit('art_x', false);
        assert.strictEqual(kind, 'ok');
        assert.strictEqual(result.healthScore, 77);
        assert.strictEqual(result.cached, false);
        assert.strictEqual(result.schemaLD['@type'], 'MusicGroup');
        assert.deepStrictEqual(result.issues, [{
            severity: 'medium', platform: 'multiple', issue: 'mismatch',
            recommendation: 'Review entity data'
        }]);
    });

    test('second call is served from cache with cached:true', async () => {
        const cacheSvc = createCacheService();
        const facade = fakeFacade();
        const svc = createEntityAuditService({
            cacheService: cacheSvc, integrationFacade: facade, ai: fakeAi, repo: fakeRepo
        });
        await svc.audit('art_x', false);
        const kgAfterFirst = facade.record.kg;
        const second = await svc.audit('art_x', false);
        assert.strictEqual(second.result.cached, true);
        assert.strictEqual(facade.record.kg, kgAfterFirst, 'no extra provider calls');
    });

    test('PINS: Genius is NOT re-fetched on refresh (deliberate cost choice)', async () => {
        const cacheSvc = createCacheService();
        const facade = fakeFacade();
        const svc = createEntityAuditService({
            cacheService: cacheSvc, integrationFacade: facade, ai: fakeAi, repo: fakeRepo
        });
        await svc.audit('art_x', false);
        assert.strictEqual(facade.record.genius, 1);
        await svc.audit('art_x', true); // forceRefresh
        assert.strictEqual(facade.record.genius, 1, 'PINNED: genius stays cached across refresh');
        assert.strictEqual(facade.record.kg, 2, 'other providers DO re-run on refresh');
    });
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
describe('src/analytics/regression', () => {
    const { performLinearRegression, generateSyntheticHistory } = require('../../src/analytics/regression');

    test('recovers an exact linear relationship', () => {
        const r = performLinearRegression([1, 2, 3, 4], [3, 5, 7, 9]); // y = 2x + 1
        assert.ok(Math.abs(r.slope - 2) < 1e-9, `slope ${r.slope}`);
        assert.ok(Math.abs(r.intercept - 1) < 1e-9, `intercept ${r.intercept}`);
        assert.ok(Math.abs(r.predict(5) - 11) < 1e-9);
    });

    test('degenerate input falls back to a zero predictor instead of throwing', () => {
        const r = performLinearRegression([1, 1], [2, 2]); // singular matrix
        assert.strictEqual(r.slope, 0);
        assert.strictEqual(r.intercept, 0);
        assert.strictEqual(r.predict(99), 0);
    });

    test('synthetic history returns 12 points within the +/-5% noise band', () => {
        const h = generateSyntheticHistory(1000, 12);
        assert.strictEqual(h.length, 12);
        assert.ok(h.every((v) => Number.isFinite(v) && v > 0));
        // Final point is the current value with up to 5% noise.
        assert.ok(h[11] >= 940 && h[11] <= 1060, `last=${h[11]}`);
    });

    test('PINS: synthetic history is random, which is why projections cannot be snapshotted', () => {
        const a = generateSyntheticHistory(1000, 12);
        const b = generateSyntheticHistory(1000, 12);
        assert.notDeepStrictEqual(a, b, 'PINNED: Math.random() makes this nondeterministic');
    });
});

// ---------------------------------------------------------------------------
// Integrations facade + scout
// ---------------------------------------------------------------------------
describe('src/integrations (facade)', () => {
    const { createIntegrationFacade } = require('../../src/integrations');

    test('facade delegates to injected providers (fully mockable)', async () => {
        const facade = createIntegrationFacade({
            integrations: {
                fetchArtistData: async (id, mock) => ({ ...mock, injected: true }),
                getIntegrationStatus: () => ({ spotify: true }),
                ARTIST_MAPPINGS: { art_x: {} }
            },
            audit: { auditGoogleKG: async () => ({ status: 'INJECTED' }) },
            scout: { search: async () => ({ scouts: [] }) }
        });
        assert.strictEqual((await facade.fetchArtistData('art_x', {})).injected, true);
        assert.strictEqual((await facade.auditGoogleKG('n')).status, 'INJECTED');
        assert.deepStrictEqual(facade.getIntegrationStatus(), { spotify: true });
    });

    test('real facade exposes integration status without network calls', () => {
        const facade = require('../../src/integrations');
        const status = facade.getIntegrationStatus();
        assert.strictEqual(typeof status.anyConfigured, 'boolean');
    });

    test('PINS: only two artists have external id mappings', () => {
        const facade = require('../../src/integrations');
        assert.deepStrictEqual(Object.keys(facade.artistMappings).sort(), ['art_lumenveil', 'art_novakin']);
    });
});

describe('src/integrations/scoutService', () => {
    const scout = require('../../src/integrations/scoutService');

    test('empty query returns every mock scout', async () => {
        const { scouts } = await scout.search('', { delayMs: 0 });
        assert.strictEqual(scouts.length, 4);
    });

    test('filters by name substring', async () => {
        const { scouts } = await scout.search('neon', { delayMs: 0 });
        assert.deepStrictEqual(scouts.map((s) => s.name), ['Neon Flux']);
    });

    test('filters by genre substring', async () => {
        const { scouts } = await scout.search('techno', { delayMs: 0 });
        assert.ok(scouts.length >= 2, 'techno and melodic techno both match');
    });
});

describe('src/integrations/rateLimiter', () => {
    const { RateLimiter, SERVICES, limiters } = require('../../src/integrations/rateLimiter');

    test('token bucket consumes and refills', async () => {
        const rl = new RateLimiter(10, 2);
        assert.strictEqual(await rl.throttle(), true);
        assert.strictEqual(await rl.throttle(), true);
        assert.ok(rl.tokens < 1);
    });

    test('PINS: the registry lists services with no integration module', () => {
        for (const orphan of ['shopify', 'bandsintown', 'chartmetric', 'revelator']) {
            assert.ok(SERVICES[orphan], `${orphan} is still registered`);
        }
        assert.strictEqual(Object.keys(limiters).length, Object.keys(SERVICES).length);
    });
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
describe('src/jobs', () => {
    const { registerJobs, monthlyReportJob } = require('../../src/jobs');

    test('scheduling can be disabled, and does nothing when disabled', () => {
        assert.deepStrictEqual(registerJobs({ enabled: false }), []);
    });

    test('monthly schedule expression is unchanged', () => {
        assert.strictEqual(monthlyReportJob.SCHEDULE, '0 3 1 * *');
    });

    test('previousMonth yields YYYY-MM', () => {
        assert.match(monthlyReportJob.previousMonth(), /^\d{4}-\d{2}$/);
    });

    test('FIXED HIGH-6: autoPrintReport uses execFile with an arguments array', () => {
        // Phase 3 replaced the shell-string exec() (command injection via
        // client-controllable artist.name -> filepath) with execFile(args[]),
        // so no shell ever interprets the path.
        const fs = require('fs');
        const path = require('path');
        const src = fs.readFileSync(
            path.resolve(__dirname, '..', '..', 'src', 'jobs', 'monthlyReportJob.js'), 'utf8'
        );
        assert.ok(src.includes('execFile(command, args'), 'uses execFile with an args array');
        assert.ok(!src.includes('exec(printCommand'), 'no shell-string exec() remains');
    });
});

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
describe('src/services/emailService', () => {
    const { createEmailService } = require('../../src/services/emailService');

    test('reports success and records the message', async () => {
        const sent = [];
        const svc = createEmailService({
            // STEP 7 (D7): real delivery acknowledgement = recipient in accepted.
            transport: { sendMail: async (m) => { sent.push(m); return { messageId: 'abc', accepted: [m.to] }; } }
        });
        assert.strictEqual(await svc.sendEmail({ to: 'a@b.c', subject: 's', html: 'h' }), true);
        assert.strictEqual(sent[0].to, 'a@b.c');
    });

    test('returns false when the transport throws', async () => {
        const svc = createEmailService({
            transport: { sendMail: async () => { throw new Error('smtp down'); } }
        });
        assert.strictEqual(await svc.sendEmail({ to: 'a@b.c', subject: 's', html: 'h' }), false);
    });

    test('PINS: a transport that resolves without accepting the recipient reports failure', () => {
        // STEP 7 (D7): the old "jsonTransport simulation counts as success"
        // contract was retired (audit R10). A transport that resolves with no
        // acceptance info is NOT a delivered email.
        return createEmailService({ transport: { sendMail: async () => ({}) } })
            .sendEmail({ to: 'x@y.z', subject: 's', html: 'h' })
            .then((ok) => assert.strictEqual(ok, false, 'PINNED: unacknowledged send looks like failure'));
    });

    test('password reset link uses the configured base and carries the token', async () => {
        let captured;
        const svc = createEmailService({
            transport: { sendMail: async (m) => { captured = m; return { messageId: 'x' }; } }
        });
        await svc.sendPasswordReset({ to: 'a@b.c', resetToken: 'TOK123' });
        assert.match(captured.html, /reset-password\?token=TOK123/);
        assert.strictEqual(captured.subject, 'The Music Scene - Password Reset Request');
    });
});

// ---------------------------------------------------------------------------
// Reports — PDF generation (NEW-2 was fixed in Phase 3)
// ---------------------------------------------------------------------------
describe('src/reports/monthlyReport', () => {
    const { generateMonthlyReport } = require('../../src/reports/monthlyReport');
    const artistRepo = require('../../src/repositories/artistRepository');

    test('generateMonthlyReport is exported and callable', () => {
        assert.strictEqual(typeof generateMonthlyReport, 'function');
    });

    test('FIXED NEW-2: generates a valid PDF without throwing', async () => {
        // Phase 3 fixed two pre-existing crashes:
        //   1. addBackground() called with 4 positional args instead of a rect
        //      object -> "unsupported number: undefined"
        //   2. the footer walked switchToPage(i) over FLUSHED pages ->
        //      "switchToPage(0) out of bounds"
        // Both threw inside pdfkit-table's async loop and killed the process.
        // Now generateMonthlyReport resolves to a real PDF buffer.
        const artist = artistRepo.findMockById('art_lumenveil');
        const buf = await generateMonthlyReport(artist, '2026-01');

        assert.ok(Buffer.isBuffer(buf), 'returns a Buffer');
        assert.ok(buf.length > 1000, `non-trivial size (${buf.length})`);
        // PDF magic bytes.
        assert.strictEqual(buf.slice(0, 4).toString('latin1'), '%PDF');
    });

    test('generated PDF embeds the confidential footer', async () => {
        const artist = artistRepo.findMockById('art_lumenveil');
        const buf = await generateMonthlyReport(artist, '2026-01');

        // Extract text via pdftotext when available (most reliable); skip the
        // assertion on machines without it rather than false-fail on flaky
        // hand-rolled stream parsing.
        const { spawnSync } = require('child_process');
        const os = require('os');
        const tmp = require('path').join(os.tmpdir(), `r_${Date.now()}.pdf`);
        require('fs').writeFileSync(tmp, buf);

        const hasPdftotext = spawnSync('which', ['pdftotext']).status === 0;
        if (!hasPdftotext) {
            require('fs').unlinkSync(tmp);
            // Validated manually during Phase 3 with pdftotext; skip if absent.
            return;
        }
        const out = spawnSync('pdftotext', [tmp, '-'], { encoding: 'utf8' });
        require('fs').unlinkSync(tmp);
        assert.ok(out.stdout.includes('CONFIDENTIAL'), 'footer text is present in the PDF');
    });
});
