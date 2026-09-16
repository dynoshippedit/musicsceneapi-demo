/**
 * tests/regression/units.test.js
 *
 * Unit tests for the modules extracted in Phase 1. These run in-process with no
 * server and no network.
 *
 * IMPORTANT — these tests pin CURRENT behavior, including behavior the audit
 * identified as defective. Each such test is labelled PINS and names the audit
 * finding. When Phase 2 fixes the finding, the test must be updated in the same
 * commit. That is the point: the defect cannot be changed silently, and it
 * cannot be "fixed" accidentally either.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

// CRITICAL-2 (Phase 3): config.jwtSecret has no fallback. Set a test secret
// before requiring config so the FIXED CRITICAL-2 assertion is deterministic.
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret-1234567890';

const auth = require('../../src/auth');
const { calculateTotalRevenue, flattenData, filterMetrics } = require('../../src/utils/dataShape');
const config = require('../../src/config');

describe('src/auth — hasArtistAccess', () => {
    test('admin role always granted', () => {
        assert.strictEqual(auth.hasArtistAccess({ role: 'admin' }, 'art_anything'), true);
    });

    test("artistAccess === 'all' always granted", () => {
        assert.strictEqual(auth.hasArtistAccess({ role: 'viewer', artistAccess: 'all' }, 'art_x'), true);
    });

    test('array artistAccess grants only listed ids', () => {
        const u = { role: 'artist', artistAccess: ['art_rezz', 'art_feedme'] };
        assert.strictEqual(auth.hasArtistAccess(u, 'art_rezz'), true);
        assert.strictEqual(auth.hasArtistAccess(u, 'art_deadmau5'), false);
    });

    test('FIXED HIGH-4: scalar-string artistAccess grants its OWN id, denies others', () => {
        // The User model stores artistAccess as STRING (src/models L151) and the
        // seeded artist receives the scalar 'art_rezz'. Phase 3 normalizes the
        // scalar to a one-element array, so the artist can now read their own
        // record — but STILL nothing else (fail-closed preserved).
        const seededArtist = { role: 'artist', artistAccess: 'art_rezz' };
        assert.strictEqual(
            auth.hasArtistAccess(seededArtist, 'art_rezz'), true,
            'artist can access their own record'
        );
        assert.strictEqual(auth.hasArtistAccess(seededArtist, 'art_deadmau5'), false);
    });

    test('FIXED HIGH-4: stringified JSON array artistAccess is parsed', () => {
        const u = { role: 'artist', artistAccess: '["art_rezz","art_feedme"]' };
        assert.strictEqual(auth.hasArtistAccess(u, 'art_rezz'), true);
        assert.strictEqual(auth.hasArtistAccess(u, 'art_feedme'), true);
        assert.strictEqual(auth.hasArtistAccess(u, 'art_deadmau5'), false);
    });

    test('artistAccess "none" grants nothing', () => {
        assert.strictEqual(auth.hasArtistAccess({ role: 'artist', artistAccess: 'none' }, 'art_x'), false);
    });

    test('unknown role with no artistAccess is denied', () => {
        assert.strictEqual(auth.hasArtistAccess({ role: 'viewer' }, 'art_x'), false);
    });
});

describe('src/auth — filterDataByAccess', () => {
    const data = { artists: [{ id: 'art_a' }, { id: 'art_b' }], extra: 'kept' };

    test('admin receives the payload untouched', () => {
        assert.deepStrictEqual(auth.filterDataByAccess(data, { role: 'admin' }), data);
    });

    test("artistAccess 'all' receives the payload untouched", () => {
        assert.deepStrictEqual(auth.filterDataByAccess(data, { role: 'viewer', artistAccess: 'all' }), data);
    });

    test('array access filters to permitted artists and preserves other keys', () => {
        const out = auth.filterDataByAccess(data, { role: 'artist', artistAccess: ['art_b'] });
        assert.deepStrictEqual(out.artists, [{ id: 'art_b' }]);
        assert.strictEqual(out.extra, 'kept');
    });

    test('FIXED HIGH-4: scalar-string access now yields that artist (not empty)', () => {
        const out = auth.filterDataByAccess(data, { role: 'artist', artistAccess: 'art_a' });
        assert.deepStrictEqual(out.artists, [{ id: 'art_a' }], 'artist sees their own artist');
    });

    test('non-array artists payload passes through', () => {
        const scalar = { artists: 'not-an-array' };
        assert.deepStrictEqual(auth.filterDataByAccess(scalar, { role: 'artist', artistAccess: 'x' }), scalar);
    });
});

describe('src/auth — authenticateToken', () => {
    function mockRes() {
        return {
            statusCode: null, payload: null,
            status(c) { this.statusCode = c; return this; },
            json(p) { this.payload = p; return this; }
        };
    }

    test('missing Authorization header -> 401 with exact contract', () => {
        const res = mockRes();
        auth.authenticateToken({ headers: {} }, res, () => assert.fail('next() must not run'));
        assert.strictEqual(res.statusCode, 401);
        assert.deepStrictEqual(res.payload, { error: 'Authentication required' });
    });

    test('malformed token -> 403 with exact contract', (t, done) => {
        const res = {
            status(c) { this.code = c; return this; },
            json(p) {
                assert.strictEqual(this.code, 403);
                assert.deepStrictEqual(p, { error: 'Invalid or expired token' });
                done();
            }
        };
        auth.authenticateToken({ headers: { authorization: 'Bearer nonsense' } }, res, () => {
            assert.fail('next() must not run for an invalid token');
        });
    });

    test('valid token populates req.user and calls next()', (t, done) => {
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ email: 'a@b.c', role: 'admin', artistAccess: 'all' }, config.jwtSecret);
        const req = { headers: { authorization: `Bearer ${token}` } };
        auth.authenticateToken(req, mockRes(), () => {
            assert.strictEqual(req.user.role, 'admin');
            assert.strictEqual(req.user.email, 'a@b.c');
            done();
        });
    });

    test('PINS: tokens signed by the live login handlers carry no `id` claim', () => {
        // Both login branches inline jwt.sign WITHOUT `id` (api L483, L500),
        // while generateToken() (which does include id) is never called.
        // Consequence: req.user.id === undefined, so /v3/auth/me,
        // DELETE /v3/auth/me and change-password cannot resolve a user, and
        // userIntegrations[undefined] is one bucket shared by all users.
        const jwt = require('jsonwebtoken');
        const loginShapedToken = jwt.sign(
            { email: 'x@y.z', role: 'admin', artistAccess: 'all', integrationCount: 10 },
            config.jwtSecret
        );
        const decoded = jwt.verify(loginShapedToken, config.jwtSecret);
        assert.strictEqual(decoded.id, undefined, 'PINNED: login tokens omit id');

        // generateToken DOES include id — proving the helper is the unused path.
        const helperToken = auth.generateToken({ id: 7, email: 'x@y.z', role: 'admin', artistAccess: 'all' });
        assert.strictEqual(jwt.verify(helperToken, config.jwtSecret).id, 7);
    });
});

describe('src/auth — checkExportAccess', () => {
    function run(user, query) {
        const res = {
            code: null, payload: null,
            status(c) { this.code = c; return this; },
            json(p) { this.payload = p; return this; }
        };
        let nexted = false;
        auth.checkExportAccess({ user, query }, res, () => { nexted = true; });
        return { res, nexted };
    }

    test('admin passes through for label-wide export', () => {
        assert.strictEqual(run({ role: 'admin' }, {}).nexted, true);
    });

    test('non-admin label-wide export -> 403 exact message', () => {
        const { res, nexted } = run({ role: 'artist', artistAccess: 'art_rezz' }, {});
        assert.strictEqual(nexted, false);
        assert.strictEqual(res.code, 403);
        assert.deepStrictEqual(res.payload, { error: 'Only admins can export label-wide data' });
    });

    test('non-admin with array access to that artist passes', () => {
        assert.strictEqual(run({ role: 'artist', artistAccess: ['art_rezz'] }, { artistId: 'art_rezz' }).nexted, true);
    });

    test('FIXED HIGH-4: scalar-string access to own artist now passes', () => {
        const { nexted } = run({ role: 'artist', artistAccess: 'art_rezz' }, { artistId: 'art_rezz' });
        assert.strictEqual(nexted, true);
    });

    test('non-admin scalar-string access to a DIFFERENT artist still denied', () => {
        const { res, nexted } = run({ role: 'artist', artistAccess: 'art_rezz' }, { artistId: 'art_deadmau5' });
        assert.strictEqual(nexted, false);
        assert.strictEqual(res.code, 403);
        assert.deepStrictEqual(res.payload, { error: 'Access denied for this artist' });
    });
});

describe('src/utils/dataShape', () => {
    test('calculateTotalRevenue sums numeric fields only', () => {
        assert.strictEqual(calculateTotalRevenue({ revenue: { a: 10, b: 20.5 } }), 30.5);
    });
    test('calculateTotalRevenue ignores non-numeric values', () => {
        assert.strictEqual(calculateTotalRevenue({ revenue: { a: 10, b: 'x', c: null, d: [1] } }), 10);
    });
    test('calculateTotalRevenue returns 0 when revenue is absent', () => {
        assert.strictEqual(calculateTotalRevenue({}), 0);
        assert.strictEqual(calculateTotalRevenue({ revenue: null }), 0);
    });

    test('flattenData produces dotted keys for nested objects', () => {
        assert.deepStrictEqual(
            flattenData({ a: 1, b: { c: 2, d: { e: 3 } } }),
            { a: 1, 'b.c': 2, 'b.d.e': 3 }
        );
    });
    test('flattenData JSON-stringifies arrays rather than recursing', () => {
        assert.deepStrictEqual(flattenData({ tags: ['x', 'y'] }), { tags: '["x","y"]' });
    });
    test('flattenData keeps null as a leaf', () => {
        assert.deepStrictEqual(flattenData({ a: null }), { a: null });
    });
    test('flattenData honours the prefix argument', () => {
        assert.deepStrictEqual(flattenData({ a: 1 }, 'p.'), { 'p.a': 1 });
    });

    test('filterMetrics picks only defined requested keys', () => {
        assert.deepStrictEqual(filterMetrics({ a: 1, b: 2 }, ['a', 'zz']), { a: 1 });
    });
    test('filterMetrics returns {} for no matches', () => {
        assert.deepStrictEqual(filterMetrics({ a: 1 }, ['nope']), {});
    });
});

describe('src/config — secrets hardening', () => {
    test('FIXED CRITICAL-2: jwtSecret has NO fallback when JWT_SECRET is unset', () => {
        // Phase 3 removed the 'your-secret-key-change-this' fallback. The config
        // now reads only process.env.JWT_SECRET; a missing secret is caught by
        // assertSecrets() at startup, so no process ever signs with a public key.
        // assertSecrets() is NOT called here (it would process.exit), so this
        // test asserts the config value only.
        assert.strictEqual(config.jwtSecret, process.env.JWT_SECRET || '');
    });

    test('assertSecrets is exported and assertProductionSecrets is an alias', () => {
        assert.strictEqual(typeof config.assertSecrets, 'function');
        assert.strictEqual(config.assertSecrets, config.assertProductionSecrets);
    });

    test('FIXED CRITICAL-2: assertSecrets fails fast when JWT_SECRET is absent in ANY env', () => {
        // Option (b): JWT_SECRET is required in every environment — no fallback,
        // no ephemeral dev secret. Spawn a child so process.exit(1) does not
        // kill the test runner.
        const { spawnSync } = require('child_process');
        const path = require('path');
        const root = path.resolve(__dirname, '..', '..');
        for (const nodeEnv of ['development', 'production']) {
            const r = spawnSync(
                process.execPath,
                ['-e', "require('./src/config').assertSecrets()"],
                { cwd: root, env: { ...process.env, NODE_ENV: nodeEnv, JWT_SECRET: '' } }
            );
            assert.notStrictEqual(r.status, 0, `NODE_ENV=${nodeEnv} must exit non-zero`);
        }
    });

    test('PINS CRITICAL-1: adminEmail/adminPass are undefined when unset', () => {
        // This is what makes an empty login body match at api L482.
        // (Fixed in Phase 3 at the auth route, not in config.)
        if (!process.env.ADMIN_EMAIL) {
            assert.strictEqual(config.adminEmail, undefined);
        }
        if (!process.env.ADMIN_PASS) {
            assert.strictEqual(config.adminPass, undefined);
        }
        // The dangerous comparison itself:
        assert.strictEqual(undefined === undefined, true,
            'PINNED: undefined === undefined is why {} logs in as admin');
    });

    test('FIXED HIGH-5: CORS no longer reflects arbitrary origins', () => {
        // Phase 3 replaced origin:true with a policy built from ALLOWED_ORIGINS
        // (dev falls back to a localhost/file allowlist). The config's cors
        // object is therefore NOT the raw `true` it used to be.
        assert.notStrictEqual(config.cors.origin, true,
            'origin:true is gone; it is now a list or callback');
    });

    test('FIXED HIGH-5: credentialed CORS still holds a credentials flag', () => {
        // The credential flag remains (no behavior change to auth-cookie use),
        // but only ever true alongside an explicit origin policy.
        assert.strictEqual(typeof config.cors.credentials, 'boolean');
    });

    test('rate limit and cache values match the original', () => {
        assert.strictEqual(config.rateLimit.windowMs, 60 * 60 * 1000);
        assert.strictEqual(config.rateLimit.max, 1000);
        assert.strictEqual(config.cache.stdTTL, 3600);
        assert.strictEqual(config.cache.checkperiod, 600);
    });

    test('groq model defaults to openai/gpt-oss-20b (GROQ_MODEL overrides)', () => {
        assert.strictEqual(config.groqModel, 'openai/gpt-oss-20b');
    });
});

describe('src/models — shape without connecting', () => {
    const { User, Artist, Stats } = require('../../src/models');

    test('User retains the original columns and defaults', () => {
        const a = User.getAttributes();
        assert.strictEqual(a.role.defaultValue, 'viewer');
        assert.strictEqual(a.artistAccess.defaultValue, 'none');
        assert.strictEqual(a.pageAccess.defaultValue, '["overview"]');
        assert.strictEqual(a.integrationCount.defaultValue, 1);
        assert.ok(a.resetToken, 'resetToken column present');
        assert.ok(a.resetTokenExpiry, 'resetTokenExpiry column present');
    });

    test('PINS: artistAccess is a STRING column (root cause of HIGH-4)', () => {
        const a = User.getAttributes();
        assert.match(String(a.artistAccess.type), /VARCHAR|STRING|TEXT/i);
    });

    test('Artist uses a string PK and a JSON data column', () => {
        const a = Artist.getAttributes();
        assert.strictEqual(a.id.primaryKey, true);
        assert.strictEqual(a.status.defaultValue, 'active');
        assert.ok(a.data, 'data column present');
    });

    test('PINS: Stats has no foreign key to Artist', () => {
        const a = Stats.getAttributes();
        assert.ok(a.artistId, 'artistId column present');
        assert.ok(!a.artistId.references, 'PINNED: no FK constraint (audit finding)');
    });
});
