/**
 * src/integrations/scoutService.js
 *
 * A&R scouting data source behind GET /v3/anr/scout.
 *
 * ============================================================================
 * WHAT THIS REPLACES (audit INTEGRATION §3 — "rogue Spotify client")
 * ============================================================================
 * The monolith constructed a SECOND Spotify client at Phase 1 L2380-2386 with
 * literal placeholder credentials:
 *
 *     const spotifyApi = new SpotifyWebApi({
 *         clientId: 'your-client-id',
 *         clientSecret: 'your-client-secret'
 *     });
 *
 * duplicating and bypassing the properly env-configured singleton in
 * integrations/spotify.js.
 *
 * I verified by reading the handler that `spotifyApi` was NEVER INVOKED: the
 * endpoint's try block immediately logs "[Spotify] Mock Searching" and returns
 * a hardcoded array inside a 500ms setTimeout. The client was dead weight that
 * merely advertised fake credentials.
 *
 * This module therefore serves the same mock fixtures with no Spotify client at
 * all. The response body, the 500ms delay, and the filter semantics are
 * preserved exactly. When real scouting is implemented it should go through
 * integrations/spotify.js, which already handles auth and token refresh.
 */

'use strict';

/** Mock scout results. Verbatim from the original handler. */
const MOCK_SCOUTS = [
    {
        spotifyId: 's_k5',
        name: 'K5',
        image: 'https://i.scdn.co/image/ab67616d0000b273b5', // Placeholder
        followers: 12500,
        popularity: 45,
        genres: ['techno', 'dark ambient'],
        url: 'https://open.spotify.com/artist/k5'
    },
    {
        spotifyId: 's_neon',
        name: 'Neon Flux',
        image: null,
        followers: 48200,
        popularity: 62,
        genres: ['bass house', 'electro'],
        url: 'https://open.spotify.com/artist/neonflux'
    },
    {
        spotifyId: 's_cyber',
        name: 'Cyber Mode',
        image: null,
        followers: 8200,
        popularity: 38,
        genres: ['industrial', 'midtempo'],
        url: 'https://open.spotify.com/artist/cybermode'
    },
    {
        spotifyId: 's_analog',
        name: 'Analog Soul',
        image: null,
        followers: 22100,
        popularity: 55,
        genres: ['prog house', 'melodic techno'],
        url: 'https://open.spotify.com/artist/analogsoul'
    }
];

/** Simulated network latency from the original (setTimeout 500ms). */
const SIMULATED_DELAY_MS = 500;

/**
 * Filter semantics preserved verbatim: match on name substring OR any genre
 * substring, case-insensitive. Empty query returns everything.
 */
function filterScouts(query) {
    if (!query) return MOCK_SCOUTS;
    const q = String(query).toLowerCase();
    return MOCK_SCOUTS.filter(
        (s) => s.name.toLowerCase().includes(q) || s.genres.some((g) => g.includes(q))
    );
}

/**
 * @param {string} query
 * @param {{delayMs?: number}} [opts] tests pass delayMs: 0 to skip the wait
 * @returns {Promise<{scouts: object[]}>}
 */
async function search(query, { delayMs = SIMULATED_DELAY_MS } = {}) {
    console.log(`[Spotify] Mock Searching for: ${query}`);
    if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return { scouts: filterScouts(query) };
}

module.exports = { search, filterScouts, MOCK_SCOUTS, SIMULATED_DELAY_MS };
