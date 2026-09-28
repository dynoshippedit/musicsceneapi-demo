/**
 * tests/support/cases.js
 *
 * Shared request-case catalogue used by both the snapshot probe and the
 * regression suite. Kept in one place so the baseline and the assertions can
 * never drift apart.
 *
 * Cases run IN ORDER against a single server process. Some are deliberately
 * sequenced (create -> read -> mutate -> read) to characterize the in-memory
 * stores that Phase 2 moves into services. Order changes invalidate baselines.
 *
 * `useToken` values are resolved at runtime: 'admin' | 'artist'.
 */

'use strict';

const CASES = [
    // ---------- unauthenticated surface ----------
    { name: 'health', method: 'GET', path: '/health' },
    { name: 'unknown_route_404', method: 'GET', path: '/v3/definitely-not-a-route' },
    { name: 'artists_no_token', method: 'GET', path: '/v3/artists' },
    { name: 'artists_bad_token', method: 'GET', path: '/v3/artists', token: 'garbage.token.value' },

    // ---------- login branches (CRITICAL-1 is pinned here) ----------
    { name: 'login_empty_body', method: 'POST', path: '/v3/auth/login', body: {} },
    { name: 'login_nulls', method: 'POST', path: '/v3/auth/login', body: { email: null, password: null } },
    { name: 'login_bad_creds', method: 'POST', path: '/v3/auth/login', body: { email: 'nope@example.com', password: 'wrong' } },
    { name: 'login_admin_seeded', method: 'POST', path: '/v3/auth/login', body: { email: 'admin@pulsegrid.fm', password: 'admin123' } },
    { name: 'login_artist_seeded', method: 'POST', path: '/v3/auth/login', body: { email: 'tours@novakin.band', password: 'novakin123' } },
    { name: 'forgot_password_unknown', method: 'POST', path: '/v3/auth/forgot-password', body: { email: 'nobody@example.com' } },
    { name: 'forgot_password_known', method: 'POST', path: '/v3/auth/forgot-password', body: { email: 'tours@novakin.band' } },

    // ---------- auth/me family (broken by missing `id` claim) ----------
    { name: 'auth_me_admin', method: 'GET', path: '/v3/auth/me', useToken: 'admin' },
    { name: 'auth_me_artist_role', method: 'GET', path: '/v3/auth/me', useToken: 'artist' },
    { name: 'change_password_missing_fields', method: 'POST', path: '/v3/auth/change-password', body: {}, useToken: 'admin' },
    { name: 'change_password_wrong_current', method: 'POST', path: '/v3/auth/change-password', body: { currentPassword: 'nope', newPassword: 'x' }, useToken: 'admin' },

    // ---------- artists: reads ----------
    { name: 'artists_admin', method: 'GET', path: '/v3/artists?limit=3', useToken: 'admin' },
    { name: 'artists_admin_search', method: 'GET', path: '/v3/artists?search=novakin', useToken: 'admin' },
    { name: 'artists_admin_offset', method: 'GET', path: '/v3/artists?limit=2&offset=5', useToken: 'admin' },
    { name: 'artist_detail_admin', method: 'GET', path: '/v3/artists/art_lumenveil', useToken: 'admin' },
    { name: 'artist_detail_missing', method: 'GET', path: '/v3/artists/art_nonexistent', useToken: 'admin' },
    { name: 'artist_development', method: 'GET', path: '/v3/artists/art_lumenveil/development', useToken: 'admin' },
    { name: 'monthly_sales_admin', method: 'GET', path: '/v3/artists/art_lumenveil/monthly-sales', useToken: 'admin' },

    // ---------- artists: admin-only mutations ----------
    { name: 'create_artist_missing_fields', method: 'POST', path: '/v3/artists', body: {}, useToken: 'admin' },
    { name: 'create_artist_artist_role', method: 'POST', path: '/v3/artists', body: { id: 'art_x', name: 'X' }, useToken: 'artist' },
    { name: 'archive_artist_missing', method: 'POST', path: '/v3/artists/art_nonexistent/archive', useToken: 'admin' },
    { name: 'restore_artist_missing', method: 'POST', path: '/v3/artists/art_nonexistent/restore', useToken: 'admin' },
    { name: 'image_artist_missing', method: 'PUT', path: '/v3/artists/art_nonexistent/image', body: { imageUrl: 'http://x/y.png' }, useToken: 'admin' },
    { name: 'image_artist_role_denied', method: 'PUT', path: '/v3/artists/art_lumenveil/image', body: { imageUrl: 'http://x/y.png' }, useToken: 'artist' },

    // ---------- label / ops / misc reads ----------
    { name: 'label_overview_admin', method: 'GET', path: '/v3/label/overview', useToken: 'admin' },
    { name: 'label_overview_artist_role', method: 'GET', path: '/v3/label/overview', useToken: 'artist' },
    { name: 'tours_admin', method: 'GET', path: '/v3/tours', useToken: 'admin' },
    { name: 'fans_demographics_admin', method: 'GET', path: '/v3/fans/demographics', useToken: 'admin' },
    { name: 'campaigns_stats_admin', method: 'GET', path: '/v3/campaigns/stats', useToken: 'admin' },
    { name: 'ops_logistics_admin', method: 'GET', path: '/v3/operations/logistics', useToken: 'admin' },
    { name: 'ops_assets_admin', method: 'GET', path: '/v3/operations/assets', useToken: 'admin' },
    { name: 'ops_contracts_admin', method: 'GET', path: '/v3/operations/contracts', useToken: 'admin' },
    { name: 'rights_contracts_admin', method: 'GET', path: '/v3/rights/contracts?artistId=art_lumenveil', useToken: 'admin' },
    { name: 'rights_contracts_no_artist', method: 'GET', path: '/v3/rights/contracts', useToken: 'admin' },

    // ---------- royalties (money maths) ----------
    { name: 'royalties_calc', method: 'POST', path: '/v3/royalties/calculate', body: { artistId: 'art_lumenveil', grossRevenue: 100000 }, useToken: 'admin' },
    { name: 'royalties_calc_missing_artist', method: 'POST', path: '/v3/royalties/calculate', body: { grossRevenue: 100000 }, useToken: 'admin' },
    { name: 'royalties_calc_zero', method: 'POST', path: '/v3/royalties/calculate', body: { artistId: 'art_lumenveil', grossRevenue: 0 }, useToken: 'admin' },

    // ---------- AI: keyword-chain endpoint (no LLM) ----------
    { name: 'ai_analyze_roi', method: 'POST', path: '/v3/ai/analyze', body: { query: 'who has the best roi' }, useToken: 'admin' },
    { name: 'ai_analyze_tour', method: 'POST', path: '/v3/ai/analyze', body: { query: 'tour revenue' }, useToken: 'admin' },
    { name: 'ai_analyze_growth', method: 'POST', path: '/v3/ai/analyze', body: { query: 'growth trend' }, useToken: 'admin' },
    { name: 'ai_analyze_other', method: 'POST', path: '/v3/ai/analyze', body: { query: 'something unrelated' }, useToken: 'admin' },
    { name: 'ai_analyze_no_query', method: 'POST', path: '/v3/ai/analyze', body: {}, useToken: 'admin' },
    // AI query with no GROQ key configured -> exercises the failure path.
    { name: 'ai_query_no_prompt', method: 'POST', path: '/v3/ai/query', body: {}, useToken: 'admin' },

    // ---------- A&R store #1: anrSubmissions ----------
    { name: 'anr_submissions_initial', method: 'GET', path: '/v3/anr/submissions', useToken: 'admin' },
    { name: 'anr_submission_create_missing', method: 'POST', path: '/v3/anr/submissions', body: { artist: 'OnlyArtist' }, useToken: 'admin' },
    { name: 'anr_submission_create', method: 'POST', path: '/v3/anr/submissions', body: { artist: 'Probe Artist', track: 'Probe Track', url: 'https://example.com/t', genre: 'Techno' }, useToken: 'admin' },
    { name: 'anr_submissions_after_create', method: 'GET', path: '/v3/anr/submissions', useToken: 'admin' },
    { name: 'anr_submission_vote_sub1', method: 'POST', path: '/v3/anr/submissions/sub_1/vote', body: {}, useToken: 'admin' },
    { name: 'anr_submission_vote_missing', method: 'POST', path: '/v3/anr/submissions/sub_nope/vote', body: {}, useToken: 'admin' },
    { name: 'anr_submission_delete_artist_role', method: 'DELETE', path: '/v3/anr/submissions/sub_1', useToken: 'artist' },

    // ---------- A&R store #2: anrState ----------
    { name: 'anr_state_initial', method: 'GET', path: '/v3/anr/state', useToken: 'admin' },
    { name: 'anr_whiteboard_set', method: 'POST', path: '/v3/anr/whiteboard', body: { message: 'probe whiteboard' }, useToken: 'admin' },
    { name: 'anr_listening_set', method: 'POST', path: '/v3/anr/listening', body: { url: 'https://example.com/demo' }, useToken: 'admin' },
    { name: 'anr_state_after_writes', method: 'GET', path: '/v3/anr/state', useToken: 'admin' },
    { name: 'anr_demo_rating_demo1', method: 'GET', path: '/v3/anr/demos/demo1/rating', useToken: 'admin' },
    { name: 'anr_vote_demo1', method: 'POST', path: '/v3/anr/vote/demo1', body: { rating: 4 }, useToken: 'admin' },
    { name: 'anr_stats_demo1', method: 'GET', path: '/v3/anr/stats/demo1', useToken: 'admin' },
    { name: 'anr_vote_missing_demo', method: 'POST', path: '/v3/anr/vote/demo_nope', body: { rating: 4 }, useToken: 'admin' },
    { name: 'anr_evaluate', method: 'POST', path: '/v3/anr/evaluate', body: { artistName: 'Probe', genre: 'Techno' }, useToken: 'admin' },
    { name: 'anr_shortlist', method: 'POST', path: '/v3/anr/shortlist', body: { artistName: 'Probe', spotifyId: 'x' }, useToken: 'admin' },

    // ---------- marketing / analytics writes ----------
    { name: 'marketing_campaign_create', method: 'POST', path: '/v3/marketing/campaigns', body: { artistId: 'art_lumenveil', type: 'Playlist Push', budget: 5000 }, useToken: 'admin' },
    { name: 'analytics_sales_post', method: 'POST', path: '/v3/analytics/sales', body: { artistId: 'art_lumenveil', month: '2026-01', amount: 1234 }, useToken: 'admin' },

    // ---------- integrations ----------
    { name: 'integrations_status_admin', method: 'GET', path: '/v3/integrations/status', useToken: 'admin' },
    { name: 'integrations_auth_spotify', method: 'GET', path: '/v3/integrations/auth/spotify', useToken: 'admin' },
    { name: 'integrations_disconnect', method: 'POST', path: '/v3/integrations/disconnect', body: { service: 'spotify' }, useToken: 'admin' },
    { name: 'integrations_test_limit', method: 'GET', path: '/v3/integrations/test-limit/spotify', useToken: 'admin' },

    // ---------- users (admin-only; creation is broken pre-existing) ----------
    { name: 'users_list_admin', method: 'GET', path: '/v3/users', useToken: 'admin' },
    { name: 'users_list_artist_role', method: 'GET', path: '/v3/users', useToken: 'artist' },
    { name: 'users_create_missing_fields', method: 'POST', path: '/v3/users', body: { email: 'a@b.c' }, useToken: 'admin' },
    // Pre-existing NEW-1 bug: string id into INTEGER PK -> 500.
    { name: 'users_create_valid_shape', method: 'POST', path: '/v3/users', body: { email: 'probe-user@example.com', password: 'pw123456', name: 'Probe User', role: 'viewer' }, useToken: 'admin' },
    { name: 'users_update_nonexistent', method: 'PUT', path: '/v3/users/999999', body: { name: 'Nope' }, useToken: 'admin' },
    { name: 'users_delete_nonexistent', method: 'DELETE', path: '/v3/users/999999', useToken: 'admin' },

    // ---------- artist-role authorization (HIGH-4 fail-closed) ----------
    { name: 'artists_artist_role', method: 'GET', path: '/v3/artists', useToken: 'artist' },
    { name: 'artist_own_detail_artist_role', method: 'GET', path: '/v3/artists/art_novakin', useToken: 'artist' },
    { name: 'artist_other_detail_artist_role', method: 'GET', path: '/v3/artists/art_lumenveil', useToken: 'artist' },
    { name: 'monthly_sales_artist_role', method: 'GET', path: '/v3/artists/art_novakin/monthly-sales', useToken: 'artist' },
    { name: 'exports_artist_role_labelwide', method: 'GET', path: '/v3/exports?format=csv', useToken: 'artist' },
    { name: 'exports_artist_role_own', method: 'GET', path: '/v3/exports?format=csv&artistId=art_novakin', useToken: 'artist' },
    { name: 'reports_monthly_artist_role', method: 'GET', path: '/v3/reports/monthly/art_novakin/2026-01', useToken: 'artist' },
    { name: 'reports_generate_all_artist_role', method: 'POST', path: '/v3/reports/generate-all', body: { month: '2026-01' }, useToken: 'artist' },
    { name: 'reports_generate_all_no_month', method: 'POST', path: '/v3/reports/generate-all', body: {}, useToken: 'admin' },

    // ---------- exports (admin, CSV only: PDF needs native canvas) ----------
    { name: 'exports_admin_csv_artist', method: 'GET', path: '/v3/exports?format=csv&artistId=art_lumenveil', useToken: 'admin' },
    { name: 'exports_admin_csv_label', method: 'GET', path: '/v3/exports?format=csv', useToken: 'admin' },

    // ---------- analytics reads (nondeterministic bodies; status/shape only) ----------
    { name: 'analytics_geography', method: 'GET', path: '/v3/analytics/geography', useToken: 'admin' },
    { name: 'analytics_projections', method: 'GET', path: '/v3/analytics/projections', useToken: 'admin' },

    // ---------- known-missing routes the frontend calls ----------
    // STEP 7 (D7): reset-password shipped — deterministic 400 cases
    { name: 'reset_password_bad_token', method: 'POST', path: '/v3/auth/reset-password', body: { token: 'x', newPassword: 'valid-password-123' } },
    { name: 'reset_password_short_password', method: 'POST', path: '/v3/auth/reset-password', body: { token: 'a'.repeat(64), newPassword: 'short' } },
    { name: 'label_entity_audit_missing', method: 'GET', path: '/v3/label/entity-audit', useToken: 'admin' }
];

/**
 * Cases whose response bodies are nondeterministic in the ORIGINAL code and
 * therefore cannot be snapshot-compared. Verified by diffing two consecutive
 * runs of unmodified source. Status code and top-level shape are still checked.
 */
const NONDETERMINISTIC = new Set([
    'analytics_projections',      // generateSyntheticHistory() Math.random()
    'integrations_status_admin',  // quotaUsed: Math.random()
    'integrations_test_limit',    // timing-dependent token bucket
    'anr_evaluate',               // signabilityScore: Math.random()
    'anr_shortlist',              // Math.random()-derived scoring
    'anr_submission_create',      // id derived from Date.now()
    'anr_submissions_after_create',
    'anr_listening_set',          // timestamp echoed in body
    'anr_state_after_writes',
    'marketing_campaign_create',  // id derived from Date.now()
    'integrations_auth_spotify',  // lastSync timestamp / random state
    'anr_demo_rating_demo1',      // tally recomputed after votes
    'anr_vote_demo1',
    'anr_stats_demo1',
    'reports_monthly_artist_role' // PDF embeds a generation timestamp; size varies
]);

module.exports = { CASES, NONDETERMINISTIC };
