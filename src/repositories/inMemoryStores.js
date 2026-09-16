/**
 * src/repositories/inMemoryStores.js
 *
 * Single owner of every process-memory store the monolith kept at module
 * scope. Extracted verbatim; initial seed values are byte-identical.
 *
 * ============================================================================
 * THIS FILE EXISTS TO MAKE A PROBLEM VISIBLE, NOT TO SOLVE IT
 * ============================================================================
 * Everything here is lost on restart and is NOT shared between PM2 cluster
 * workers (ecosystem.config.js runs `instances: 'max'`). The audit lists this
 * as architectural risk #4. Phase 2 does not change persistence behavior — it
 * only stops eight separate globals from being reachable at arbitrary points
 * in a 2900-line file.
 *
 * ============================================================================
 * SPLIT-BRAIN A&R (audit §7) — PRESERVED
 * ============================================================================
 * There are TWO unrelated demo stores, both live, both written by the same
 * workstation UI:
 *
 *   anrSubmissions  -> GET/POST /v3/anr/submissions, /vote, DELETE
 *                      vote model: scalar `votes` counter
 *   anrState.demos  -> /v3/anr/state, /whiteboard, /listening,
 *                      /vote/:demoId, /stats/:demoId, /demos
 *                      vote model: `ratings[]` array of per-user entries
 *
 * They are never reconciled. A demo voted through one path is invisible to the
 * other. Both are preserved exactly as-is; unifying them is a product decision
 * about vote semantics, not a refactor.
 */

'use strict';

/**
 * A&R prospects. NOTE: declared `let` in the original and referenced by exactly
 * ONE site — the deprecated scout endpoints at original L1394-1395 are
 * commented out, so this is effectively dead data retained for parity.
 */
const prospects = [
    { id: 'p1', name: 'Neon Horizon', genre: 'Progressive House', listeners: 12000, engagement: 15000, matchScore: 95, socialGrowth: '+15%' },
    { id: 'p2', name: 'Glitch Protocol', genre: 'Techno', listeners: 8500, engagement: 9000, matchScore: 88, socialGrowth: '+22%' },
    { id: 'p3', name: 'Analog Soul', genre: 'Deep House', listeners: 45000, engagement: 55000, matchScore: 72, socialGrowth: '+5%' },
    { id: 'p4', name: 'Cyber Breath', genre: 'Progressive House', listeners: 15000, engagement: 18000, matchScore: 91, socialGrowth: '+12%' },
    { id: 'p5', name: 'System 404', genre: 'Techno', listeners: 2000, engagement: 2500, matchScore: 60, socialGrowth: '+8%' },
    { id: 'p6', name: 'Velvet Coding', genre: 'Electronica', listeners: 32000, engagement: 40000, matchScore: 85, socialGrowth: '+30%' }
];

/** A&R demo store #1. Scalar vote counter. */
const anrSubmissions = [
    {
        id: 'sub_1',
        artist: 'Ghost Data',
        track: 'Void Walker',
        genre: 'Synthwave',
        url: 'https://soundcloud.com/ghost-data/void-walker',
        votes: 15,
        status: 'pending',
        submittedAt: new Date().toISOString()
    },
    {
        id: 'sub_2',
        artist: 'Testpilot',
        track: 'Sunspot',
        genre: 'Techno',
        url: 'https://open.spotify.com/track/0abcdef123456',
        votes: 42,
        status: 'shortlisted',
        submittedAt: new Date().toISOString()
    }
];

/** A&R demo store #2. Per-user `ratings[]`. Also holds collaboration state. */
const anrState = {
    whiteboard: 'Currently Reviewing: Q1 2026 Compilation Submissions.\nFocus: Tech House / Minimal.',
    nowListening: {
        url: 'https://soundcloud.com/mau5trap/example-demo',
        updatedBy: 'deadmau5',
        timestamp: new Date().toISOString()
    },
    demos: [
        { id: 'demo1', title: 'Analog Dreams', artist: 'Unknown Producer', ratings: [], submittedBy: 'admin', status: 'reviewing' },
        { id: 'demo2', title: 'Cyberpunk Bass', artist: 'Neon Glitch', ratings: [], submittedBy: 'rezz', status: 'high-priority' },
        { id: 'demo3', title: 'Deep Space', artist: 'Void Walker', ratings: [], submittedBy: 'admin', status: 'new' }
    ]
};

/**
 * Per-user integration connection state.
 *
 * PRESERVED DEFECT: keyed by `req.user.id`, which is ALWAYS undefined because
 * neither login branch puts an `id` claim in the JWT. Every user therefore
 * shares the single key `undefined`. See SECURITY_AUDIT.md.
 */
const userIntegrations = {
    // userId -> { serviceId: { connected: bool, token: string, lastSync: date } }
};

/** Sales entries logged via POST /v3/analytics/sales. artistId -> [{month, revenue}] */
const salesData = {};

/**
 * Dead cache object: declared in the original and never read or written.
 * PRODUCTION_DEPLOYMENT.md advertises a "5-minute TTL" cache on /v3/artists
 * based on this. Retained only so the claim can be traced.
 */
const apiCache = {
    artists: { data: null, timestamp: 0 }
};

module.exports = {
    prospects,
    anrSubmissions,
    anrState,
    userIntegrations,
    salesData,
    apiCache
};
