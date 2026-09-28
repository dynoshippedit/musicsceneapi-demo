// integrations/youtube.js
// YouTube Analytics API Integration

const { google } = require('googleapis');
const { withProvenance } = require('../src/services/provenance');

class YouTubeIntegration {
    constructor() {
        this.oauth2Client = null;
        this.youtube = null;
        this.youtubeAnalytics = null;

        this.initializeClient();
    }

    /**
     * Initialize YouTube API clients
     */
    initializeClient() {
        if (this.isConfigured()) {
            this.oauth2Client = new google.auth.OAuth2(
                process.env.YOUTUBE_CLIENT_ID,
                process.env.YOUTUBE_CLIENT_SECRET,
                'http://localhost:3000/auth/youtube/callback'
            );

            // Set refresh token
            this.oauth2Client.setCredentials({
                refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
            });

            this.youtube = google.youtube({
                version: 'v3',
                auth: this.oauth2Client
            });

            this.youtubeAnalytics = google.youtubeAnalytics({
                version: 'v2',
                auth: this.oauth2Client
            });
        }
    }

    /**
     * Fetch YouTube channel data by channel ID
     * @param {string} channelId - YouTube channel ID
     * @returns {Object} YouTube metrics mapped to pulsegrid schema
     */
    async getChannelData(channelId) {
        try {
            if (!this.isConfigured()) {
                throw new Error('YouTube credentials not configured');
            }

            // Fetch channel statistics
            const channelResponse = await this.youtube.channels.list({
                part: ['statistics', 'snippet', 'contentDetails'],
                id: [channelId]
            });

            if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
                throw new Error(`Channel ${channelId} not found`);
            }

            const channel = channelResponse.data.items[0];
            const stats = channel.statistics;

            // Fetch recent video performance (last 30 days)
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            let analyticsData = null;
            try {
                const analyticsResponse = await this.youtubeAnalytics.reports.query({
                    ids: `channel==${channelId}`,
                    startDate: startDate,
                    endDate: endDate,
                    metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained',
                    dimensions: 'day'
                });
                analyticsData = analyticsResponse.data;
            } catch (error) {
                console.warn('YouTube Analytics fetch failed (requires Analytics API access):', error.message);
            }

            // Calculate engagement rate (proxy: views per subscriber)
            const engagementRate = this.calculateEngagementRate(
                parseInt(stats.viewCount),
                parseInt(stats.subscriberCount),
                parseInt(stats.videoCount)
            );

            // Phase 1B: counts are verbatim; revenue is a disclosed estimate.
            return withProvenance({
                social: {
                    youtubeSubscribers: parseInt(stats.subscriberCount),
                    youtubeViews: parseInt(stats.viewCount),
                    youtubeVideos: parseInt(stats.videoCount),
                    youtubeEngagement: engagementRate
                },
                revenue: {
                    youtubeEstimated: this.estimateRevenue(stats.viewCount, analyticsData)
                },
                meta: {
                    dataSource: 'youtube_api',
                    lastUpdated: new Date().toISOString(),
                    youtubeChannelId: channelId,
                    youtubeChannelName: channel.snippet.title
                }
            }, {
                source: 'youtube_api',
                basis: 'measured',
                note: 'Subscriber/view/video counts are verbatim API fields. youtubeEstimated revenue uses a $3.50 CPM: (last-30-day views / 1000) * 3.5 when analytics are available, else (lifetime views * 0.1 / 12 / 1000) * 3.5. Rough approximation, not a measurement.'
            });
        } catch (error) {
            console.error('YouTube API Error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate engagement rate from YouTube metrics
     * @param {number} totalViews - Total channel views
     * @param {number} subscribers - Subscriber count
     * @param {number} videoCount - Total videos
     * @returns {number} Engagement rate percentage
     */
    calculateEngagementRate(totalViews, subscribers, videoCount) {
        if (!subscribers || !videoCount) return 0;

        // Average views per video
        const avgViewsPerVideo = totalViews / videoCount;

        // Engagement rate: avg views per video / subscribers * 100
        return Number(((avgViewsPerVideo / subscribers) * 100).toFixed(2));
    }

    /**
     * Estimate YouTube revenue (very rough approximation)
     * @param {number} totalViews - Total views
     * @param {Object} analyticsData - Analytics data if available
     * @returns {number} Estimated monthly revenue in USD
     */
    estimateRevenue(totalViews, analyticsData) {
        // YouTube pays roughly $2-5 per 1000 views (CPM)
        // This is a very rough estimate and varies widely
        const avgCPM = 3.5;

        if (analyticsData && analyticsData.rows) {
            // Use last 30 days of views if analytics available
            const recentViews = analyticsData.rows.reduce((sum, row) => sum + (row[0] || 0), 0);
            return Math.round((recentViews / 1000) * avgCPM);
        }

        // Fallback: estimate based on total views (not accurate for revenue)
        // Assume 10% of lifetime views happened in the last month (very rough)
        const estimatedMonthlyViews = totalViews * 0.1 / 12;
        return Math.round((estimatedMonthlyViews / 1000) * avgCPM);
    }

    /**
     * Check if YouTube credentials are configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(
            process.env.YOUTUBE_CLIENT_ID &&
            process.env.YOUTUBE_CLIENT_SECRET &&
            process.env.YOUTUBE_REFRESH_TOKEN &&
            process.env.YOUTUBE_CLIENT_ID !== 'your_youtube_client_id_here'
        );
    }
}

module.exports = new YouTubeIntegration();
