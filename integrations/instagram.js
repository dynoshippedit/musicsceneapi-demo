// integrations/instagram.js
// Instagram Graph API Integration
//
// ATTRIBUTION MODEL (strategy doc 2026-09-28, fail-closed): this integration
// talks to ONE configured Instagram business account
// (INSTAGRAM_BUSINESS_ACCOUNT_ID). That account's metrics may only be merged
// into an artist's social figures when the account's LIVE username matches the
// artist's mapped instagramName. A mismatch -- or no mapped handle at all --
// returns null and the caller must NOT merge. One account can never populate
// two artists' figures.

const axios = require('axios');
const { withProvenance } = require('../src/services/provenance');

function normalizeHandle(handle) {
    return String(handle || '').trim().replace(/^@+/, '').toLowerCase();
}

class InstagramIntegration {
    constructor() {
        this.baseURL = 'https://graph.instagram.com';
        this.accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
        this.businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }

    /**
     * Fetch Instagram business account data, attributed only when the live
     * account username matches the expected handle from the artist mapping.
     * @param {string} [expectedUsername] - handle from the artist's social mapping
     * @returns {Object|null} metrics with provenance, or null when the
     *   configured account cannot be attributed to this artist (fail closed)
     */
    async getAccountData(expectedUsername) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Instagram credentials not configured');
            }

            const expected = normalizeHandle(expectedUsername);
            if (!expected) {
                console.warn('Instagram attribution refused: no mapped instagram handle for this artist');
                return null;
            }

            // Fetch account info
            const accountResponse = await axios.get(`${this.baseURL}/${this.businessAccountId}`, {
                params: {
                    fields: 'followers_count,media_count,username,profile_picture_url',
                    access_token: this.accessToken
                },
                timeout: 5000
            });

            const account = accountResponse.data;
            const liveUsername = normalizeHandle(account.username);

            // FAIL CLOSED: the single configured account must not be attributed
            // to an artist whose mapped handle does not match the live account.
            if (liveUsername !== expected) {
                console.warn(
                    `Instagram attribution refused: configured account @${account.username} ` +
                    `does not match mapped handle @${expectedUsername}`
                );
                return null;
            }

            // Fetch recent media for engagement calculation
            const mediaResponse = await axios.get(`${this.baseURL}/${this.businessAccountId}/media`, {
                params: {
                    fields: 'like_count,comments_count,timestamp',
                    limit: 20,
                    access_token: this.accessToken
                },
                timeout: 5000
            });

            const media = mediaResponse.data.data || [];

            // Calculate engagement rate
            const engagementRate = this.calculateEngagementRate(media, account.followers_count);

            // Phase 1B: followers_count is verbatim; engagement is derived —
            // the formula is disclosed in the provenance note, not hidden.
            // Attribution is verified: live username matched the mapped handle.
            return withProvenance({
                social: {
                    instagram: account.followers_count,
                    instagramEngagement: engagementRate
                },
                meta: {
                    dataSource: 'instagram_api',
                    lastUpdated: new Date().toISOString(),
                    instagramUsername: account.username,
                    instagramAttribution: 'verified'
                }
            }, {
                source: 'instagram_api',
                basis: 'measured',
                note: `Attributed: the configured account's live username @${account.username} matches the artist's mapped Instagram handle. ` +
                    'followers_count is a verbatim API field. instagramEngagement is derived: avg(likes+comments per post) / followers_count over the last 20 posts.'
            });
        } catch (error) {
            console.error('Instagram API Error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate engagement rate from recent posts
     * @param {Array} media - Array of recent media posts
     * @param {number} followersCount - Total followers
     * @returns {number} Engagement rate percentage
     */
    calculateEngagementRate(media, followersCount) {
        if (!media.length || !followersCount) return 0;

        const totalEngagement = media.reduce((sum, post) => {
            const likes = post.like_count || 0;
            const comments = post.comments_count || 0;
            return sum + likes + comments;
        }, 0);

        const avgEngagementPerPost = totalEngagement / media.length;
        return Number(((avgEngagementPerPost / followersCount) * 100).toFixed(2));
    }

    /**
     * Check if Instagram credentials are configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(
            this.accessToken &&
            this.businessAccountId &&
            this.accessToken !== 'your_instagram_access_token_here'
        );
    }
}

module.exports = new InstagramIntegration();
