// integrations/tiktok.js
// TikTok Display API Integration
//
// ATTRIBUTION MODEL (strategy doc 2026-09-28, fail-closed): the /user/info/
// endpoint returns the TOKEN OWNER's data -- it cannot look up an arbitrary
// username. The requested handle is therefore verified against the token
// owner's live username; a mismatch -- or no mapped handle at all -- returns
// null and the caller must NOT merge. One token owner can never populate two
// artists' figures.

const axios = require('axios');
const { withProvenance } = require('../src/services/provenance');

function normalizeHandle(handle) {
    return String(handle || '').trim().replace(/^@+/, '').toLowerCase();
}

class TikTokIntegration {
    constructor() {
        this.baseURL = 'https://open.tiktokapis.com/v2';
        this.clientKey = process.env.TIKTOK_CLIENT_KEY;
        this.clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        this.accessToken = process.env.TIKTOK_ACCESS_TOKEN; // Long-lived user token
    }

    /**
     * Fetch TikTok user profile data for the token owner, attributed only
     * when the token owner's live username matches the expected handle.
     * @param {string} [expectedUsername] - TikTok handle from the artist's social mapping (with or without @)
     * @returns {Object|null} TikTok metrics with provenance, or null when the
     *   token owner cannot be attributed to this artist (fail closed)
     */
    async getUserData(expectedUsername) {
        try {
            if (!this.isConfigured()) {
                throw new Error('TikTok credentials not configured');
            }

            const expected = normalizeHandle(expectedUsername);
            if (!expected) {
                console.warn('TikTok attribution refused: no mapped TikTok handle for this artist');
                return null;
            }

            // Note: TikTok API requires OAuth flow for user-specific data.
            // /user/info/ returns the TOKEN OWNER's profile -- it cannot look
            // up an arbitrary username, so the returned username is verified
            // against the mapped handle below.

            const response = await axios.get(`${this.baseURL}/user/info/`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    fields: 'follower_count,video_count,likes_count,bio_description,display_name,username'
                },
                timeout: 5000
            });

            const userData = response.data.data.user;
            const liveUsername = normalizeHandle(userData.username);

            // FAIL CLOSED: the token owner's metrics must not be labeled with
            // a different artist's handle.
            if (liveUsername !== expected) {
                console.warn(
                    `TikTok attribution refused: token owner @${userData.username} ` +
                    `does not match mapped handle @${expectedUsername}`
                );
                return null;
            }

            // Calculate engagement rate (proxy: likes per follower)
            const engagementRate = this.calculateEngagementRate(
                userData.likes_count,
                userData.follower_count,
                userData.video_count
            );

            // Phase 1B: counts are verbatim; engagement is derived —
            // the formula is disclosed in the provenance note, not hidden.
            // Attribution is verified: token owner matched the mapped handle.
            return withProvenance({
                social: {
                    tiktok: userData.follower_count,
                    tiktokVideos: userData.video_count,
                    tiktokLikes: userData.likes_count,
                    tiktokEngagement: engagementRate
                },
                meta: {
                    dataSource: 'tiktok_api',
                    lastUpdated: new Date().toISOString(),
                    tiktokUsername: userData.username,
                    tiktokAttribution: 'verified'
                }
            }, {
                source: 'tiktok_api',
                basis: 'measured',
                note: `Attributed: the access token owner's live username @${userData.username} matches the artist's mapped TikTok handle. ` +
                    'follower_count, video_count and likes_count are verbatim API fields. tiktokEngagement is derived: (avg likes per video) / follower_count.'
            });
        } catch (error) {
            // TikTok API errors are often due to OAuth requirements
            if (error.response?.status === 401) {
                console.error('TikTok Auth Error: Access token expired or invalid');
            } else {
                console.error('TikTok API Error:', error.message);
            }
            throw error;
        }
    }

    /**
     * Calculate engagement rate from TikTok metrics
     * @param {number} totalLikes - Total likes across all videos
     * @param {number} followers - Follower count
     * @param {number} videoCount - Total videos
     * @returns {number} Engagement rate percentage
     */
    calculateEngagementRate(totalLikes, followers, videoCount) {
        if (!followers || !videoCount) return 0;

        // Average likes per video
        const avgLikesPerVideo = totalLikes / videoCount;

        // Engagement rate: avg likes per video / followers * 100
        return Number(((avgLikesPerVideo / followers) * 100).toFixed(2));
    }

    /**
     * Fetch video statistics (requires video IDs)
     * @param {Array} videoIds - Array of TikTok video IDs
     * @returns {Array} Video stats
     */
    async getVideoStats(videoIds) {
        try {
            if (!this.isConfigured()) {
                throw new Error('TikTok credentials not configured');
            }

            const response = await axios.post(`${this.baseURL}/video/query/`, {
                filters: {
                    video_ids: videoIds
                },
                fields: ['like_count', 'comment_count', 'share_count', 'view_count']
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            return response.data.data.videos || [];
        } catch (error) {
            console.error('TikTok Video Stats Error:', error.message);
            throw error;
        }
    }

    /**
     * Check if TikTok credentials are configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(
            this.clientKey &&
            this.clientSecret &&
            this.accessToken &&
            this.clientKey !== 'your_tiktok_client_key_here'
        );
    }
}

module.exports = new TikTokIntegration();
