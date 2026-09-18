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

// PHASE 4CF: A&R demo seeds moved VERBATIM into the Label Intelligence
// Profile (profile.datasets.anr). The stores themselves remain process
// memory — their persistence status is classified in the persist-or-demo
// contract (PHASE_4CF_COMMERCIAL_FOUNDATION.md): submissions/shortlist became
// durable DB state in this phase; demos/whiteboard/nowListening remain
// EPHEMERAL demo workspace; prospects are DEMO fixtures.
const profile = require('../profile');

/**
 * A&R prospects. NOTE: declared `let` in the original and referenced by exactly
 * ONE site — the deprecated scout endpoints at original L1394-1395 are
 * commented out, so this is effectively dead data retained for parity.
 */
const prospects = profile.datasets.anr.prospects;

/** A&R demo store #1. Scalar vote counter. Seed rows also seed the AnrSubmission table. */
const anrSubmissions = profile.datasets.anr.anrSubmissions;

/** A&R demo store #2. Per-user `ratings[]`. Also holds collaboration state. */
const anrState = profile.datasets.anr.anrState;

/**
 * Per-user integration connection state.
 *
 * PRESERVED DEFECT (partially fixed Phase 3/4CF): keyed by `req.user.id`.
 * The DB-login branch now SIGNS `id` (Phase 3) and the 4CF composite auth
 * re-sources id/role/artistAccess from the row, so normal logins get real
 * keys. ADMIN_EMAIL/ADMIN_PASS OVERRIDE tokens still omit `id` — those
 * requests share the single key `undefined`. See SECURITY_AUDIT.md.
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
