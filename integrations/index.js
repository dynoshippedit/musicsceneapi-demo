// integrations/index.js
// Integration Aggregator - Combines data from all sources

const spotifyIntegration = require('./spotify');
const instagramIntegration = require('./instagram');
const ticketmasterIntegration = require('./ticketmaster');
const youtubeIntegration = require('./youtube');
const twitterIntegration = require('./twitter');
const tiktokIntegration = require('./tiktok');

// PHASE 4CF: artist mappings moved VERBATIM to the Label Intelligence Profile
// (profile.socialMappings). Covers only art_lumenveil and art_novakin; the other
// roster artists fall back to mock data (documented residual).
const profile = require('../src/profile');

// Artist mapping: Internal ID -> External IDs
const ARTIST_MAPPINGS = profile.socialMappings;

/**
 * Fetch real-time data for an artist from all configured APIs
 * @param {string} artistId - Internal artist ID (e.g., 'art_lumenveil')
 * @param {Object} mockData - Fallback mock data
 * @returns {Promise<Object>} Merged artist data
 */
async function fetchArtistData(artistId, mockData) {
    const mapping = ARTIST_MAPPINGS[artistId];

    if (!mapping) {
        console.warn(`No API mapping found for ${artistId}, using mock data`);
        return mockData;
    }

    const results = {
        spotify: null,
        instagram: null,
        ticketmaster: null,
        youtube: null,
        twitter: null,
        tiktok: null
    };

    // Fetch Spotify data
    if (spotifyIntegration.isConfigured()) {
        try {
            results.spotify = await spotifyIntegration.getArtistData(mapping.spotifyId);
            console.log(`✓ Fetched Spotify data for ${artistId}`);
        } catch (error) {
            console.warn(`✗ Spotify fetch failed for ${artistId}: `, error.message);
        }
    }

    // Fetch Instagram data -- fail-closed attribution (strategy 2026-09-28):
    // the single configured business account is only merged when its live
    // username matches the artist's mapped handle. getAccountData() returns
    // null on mismatch / unmapped handle; the merge below skips null.
    if (instagramIntegration.isConfigured() && mapping.instagramName) {
        try {
            results.instagram = await instagramIntegration.getAccountData(mapping.instagramName);
            if (results.instagram) {
                console.log(`✓ Fetched Instagram data for ${artistId}`);
            } else {
                console.warn(`○ Instagram attribution refused for ${artistId}: not merged`);
            }
        } catch (error) {
            console.warn(`✗ Instagram fetch failed for ${artistId}: `, error.message);
        }
    }

    // Fetch Ticketmaster data
    if (ticketmasterIntegration.isConfigured()) {
        try {
            results.ticketmaster = await ticketmasterIntegration.getArtistEvents(mapping.ticketmasterName);
            console.log(`✓ Fetched Ticketmaster data for ${artistId}`);
        } catch (error) {
            console.warn(`✗ Ticketmaster fetch failed for ${artistId}:`, error.message);
        }
    }

    // Fetch YouTube data (Phase 2)
    if (youtubeIntegration.isConfigured()) {
        try {
            results.youtube = await youtubeIntegration.getChannelData(mapping.youtubeChannelId);
            console.log(`✓ Fetched YouTube data for ${artistId}`);
        } catch (error) {
            console.warn(`✗ YouTube fetch failed for ${artistId}:`, error.message);
        }
    }

    // Fetch Twitter data (Phase 3)
    if (twitterIntegration.isConfigured()) {
        try {
            results.twitter = await twitterIntegration.getUserData(mapping.twitterHandle);
            console.log(`✓ Fetched Twitter data for ${artistId}`);
        } catch (error) {
            console.warn(`✗ Twitter fetch failed for ${artistId}: `, error.message);
        }
    }

    // Fetch TikTok data (Phase 3) -- fail-closed attribution (strategy
    // 2026-09-28): /user/info/ returns the token owner, so getUserData()
    // verifies the token owner's live username against the mapped handle and
    // returns null on mismatch. The merge below skips null.
    if (tiktokIntegration.isConfigured() && mapping.tiktokUsername) {
        try {
            results.tiktok = await tiktokIntegration.getUserData(mapping.tiktokUsername);
            if (results.tiktok) {
                console.log(`✓ Fetched TikTok data for ${artistId}`);
            } else {
                console.warn(`○ TikTok attribution refused for ${artistId}: not merged`);
            }
        } catch (error) {
            console.warn(`✗ TikTok fetch failed for ${artistId}: `, error.message);
        }
    }

    // Merge API data with mock data (API data takes precedence)
    return mergeData(mockData, results);
}

/**
 * Merge API results with mock data
 * @param {Object} mockData - Base mock data
 * @param {Object} apiResults - Results from API calls
 * @returns {Object} Merged data object
 */
function mergeData(mockData, apiResults) {
    const merged = { ...mockData };

    // Merge Spotify data — Phase 1B: the integration reports measured fields
    // only (followers, popularity). The old fabricated monthlyListeners /
    // totalStreams / growthRate no longer exist and are not merged.
    if (apiResults.spotify) {
        merged.social = { ...merged.social, ...apiResults.spotify.social };
        merged.meta = { ...merged.meta, ...apiResults.spotify.meta };
    }

    // Merge Instagram data
    if (apiResults.instagram) {
        merged.social = { ...merged.social, ...apiResults.instagram.social };
        if (apiResults.instagram.social.instagramEngagement) {
            merged.social.engagementRate = apiResults.instagram.social.instagramEngagement;
        }
    }

    // Merge Ticketmaster data
    if (apiResults.ticketmaster) {
        merged.touring = { ...merged.touring, ...apiResults.ticketmaster.touring };
    }

    // Merge YouTube data (Phase 2)
    if (apiResults.youtube) {
        merged.social = { ...merged.social, ...apiResults.youtube.social };
        merged.revenue = { ...merged.revenue, youtube: apiResults.youtube.revenue.youtubeEstimated };
        merged.meta = { ...merged.meta, ...apiResults.youtube.meta };
    }

    // Merge Twitter data (Phase 3)
    if (apiResults.twitter) {
        merged.social = { ...merged.social, ...apiResults.twitter.social };
        merged.meta = { ...merged.meta, ...apiResults.twitter.meta };
    }

    // Merge TikTok data (Phase 3)
    if (apiResults.tiktok) {
        merged.social = { ...merged.social, ...apiResults.tiktok.social };
        merged.meta = { ...merged.meta, ...apiResults.tiktok.meta };
    }

    // Phase 1B: propagate per-provider provenance blocks (data honesty).
    for (const svc of ['spotify', 'instagram', 'tiktok', 'youtube', 'twitter', 'ticketmaster']) {
        if (apiResults[svc] && apiResults[svc].provenance) {
            merged.provenance = { ...(merged.provenance || {}), [svc]: apiResults[svc].provenance };
        }
    }

    // Mark data source
    const sources = [];
    if (apiResults.spotify) sources.push('spotify');
    if (apiResults.instagram) sources.push('instagram');
    if (apiResults.ticketmaster) sources.push('ticketmaster');
    if (apiResults.youtube) sources.push('youtube');
    if (apiResults.twitter) sources.push('twitter');
    if (apiResults.tiktok) sources.push('tiktok');

    if (sources.length > 0) {
        merged.meta = merged.meta || {};
        merged.meta.realDataSources = sources;
        merged.meta.lastUpdated = new Date().toISOString();
    }

    return merged;
}

/**
 * Check which integrations are configured
 * @returns {Object} Status of each integration
 */
function getIntegrationStatus() {
    return {
        spotify: spotifyIntegration.isConfigured(),
        instagram: instagramIntegration.isConfigured(),
        ticketmaster: ticketmasterIntegration.isConfigured(),
        youtube: youtubeIntegration.isConfigured(),
        twitter: twitterIntegration.isConfigured(),
        tiktok: tiktokIntegration.isConfigured(),
        anyConfigured: spotifyIntegration.isConfigured() ||
            instagramIntegration.isConfigured() ||
            ticketmasterIntegration.isConfigured() ||
            youtubeIntegration.isConfigured() ||
            twitterIntegration.isConfigured() ||
            tiktokIntegration.isConfigured()
    };
}

module.exports = {
    fetchArtistData,
    getIntegrationStatus,
    ARTIST_MAPPINGS
};
