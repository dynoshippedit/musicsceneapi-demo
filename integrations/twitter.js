// integrations/twitter.js
// Twitter API v2 Integration

const axios = require('axios');
const { withProvenance } = require('../src/services/provenance');

class TwitterIntegration {
    constructor() {
        this.baseURL = 'https://api.twitter.com/2';
        this.bearerToken = process.env.TWITTER_BEARER_TOKEN;
    }

    /**
     * Fetch Twitter user data by username
     * @param {string} username - Twitter handle (without @)
     * @returns {Object} Twitter metrics mapped to mau5trap schema
     */
    async getUserData(username) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Twitter credentials not configured');
            }

            // Remove @ if provided
            const cleanUsername = username.replace('@', '');

            // Fetch user data with public metrics
            const userResponse = await axios.get(`${this.baseURL}/users/by/username/${cleanUsername}`, {
                params: {
                    'user.fields': 'public_metrics,created_at,description,verified'
                },
                headers: {
                    'Authorization': `Bearer ${this.bearerToken}`
                },
                timeout: 5000
            });

            const user = userResponse.data.data;

            // Fetch recent tweets for engagement calculation
            const tweetsResponse = await axios.get(`${this.baseURL}/users/${user.id}/tweets`, {
                params: {
                    'max_results': 10,
                    'tweet.fields': 'public_metrics,created_at'
                },
                headers: {
                    'Authorization': `Bearer ${this.bearerToken}`
                },
                timeout: 5000
            });

            const tweets = tweetsResponse.data.data || [];

            // Calculate average engagement rate
            const engagementRate = this.calculateEngagementRate(tweets, user.public_metrics.followers_count);

            // Phase 1B: counts are verbatim; engagement is derived —
            // the formula is disclosed in the provenance note, not hidden.
            return withProvenance({
                social: {
                    twitter: user.public_metrics.followers_count,
                    twitterPosts: user.public_metrics.tweet_count,
                    twitterEngagement: engagementRate,
                    twitterVerified: user.verified || false
                },
                meta: {
                    dataSource: 'twitter_api',
                    lastUpdated: new Date().toISOString(),
                    twitterUsername: username,
                    twitterId: user.id
                }
            }, {
                source: 'twitter_api',
                basis: 'measured',
                note: 'follower/tweet counts and verified flag are verbatim API fields. twitterEngagement is derived: avg(likes+replies+retweets per tweet) / followers over the last 10 tweets.'
            });
        } catch (error) {
            console.error('Twitter API Error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate engagement rate from recent tweets
     * @param {Array} tweets - Array of recent tweets
     * @param {number} followersCount - Total followers
     * @returns {number} Engagement rate percentage
     */
    calculateEngagementRate(tweets, followersCount) {
        if (!tweets.length || !followersCount) return 0;

        const totalEngagement = tweets.reduce((sum, tweet) => {
            const metrics = tweet.public_metrics || {};
            return sum + (metrics.like_count || 0) +
                (metrics.retweet_count || 0) +
                (metrics.reply_count || 0);
        }, 0);

        const avgEngagementPerTweet = totalEngagement / tweets.length;
        return Number(((avgEngagementPerTweet / followersCount) * 100).toFixed(2));
    }

    /**
     * Search for tweets mentioning an artist (optional - for sentiment analysis)
     * @param {string} query - Search query
     * @returns {Array} Array of tweets
     */
    async searchTweets(query) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Twitter credentials not configured');
            }

            const response = await axios.get(`${this.baseURL}/tweets/search/recent`, {
                params: {
                    'query': query,
                    'max_results': 10,
                    'tweet.fields': 'public_metrics,created_at,text'
                },
                headers: {
                    'Authorization': `Bearer ${this.bearerToken}`
                },
                timeout: 5000
            });

            return response.data.data || [];
        } catch (error) {
            console.error('Twitter Search Error:', error.message);
            throw error;
        }
    }

    /**
     * Check if Twitter credentials are configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(
            this.bearerToken &&
            this.bearerToken !== 'your_twitter_bearer_token_here'
        );
    }
}

module.exports = new TwitterIntegration();
