// integrations/spotify.js
// Spotify for Artists API Integration

const SpotifyWebApi = require('spotify-web-api-node');
const SafeStatsSchema = require('../modules/SafeStatsSchema');
const { withProvenance } = require('../src/services/provenance');

class SpotifyIntegration {
    constructor() {
        this.spotifyApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
        });
        this.tokenExpiresAt = null;
    }

    /**
     * Ensure we have a valid access token
     */
    async ensureToken() {
        const now = Date.now();
        if (!this.tokenExpiresAt || now >= this.tokenExpiresAt) {
            try {
                const data = await this.spotifyApi.refreshAccessToken();
                this.spotifyApi.setAccessToken(data.body['access_token']);
                // Token typically expires in 3600 seconds
                this.tokenExpiresAt = now + (data.body['expires_in'] * 1000);
            } catch (error) {
                throw new Error(`Spotify token refresh failed: ${error.message}`);
            }
        }
    }

    /**
     * Fetch artist data by Spotify Artist ID
     * @param {string} spotifyArtistId - Spotify artist ID (e.g., "2CIMQHirSU0MQqyYHq0eOx" for deadmau5)
     * @returns {Object} Artist data mapped to mau5trap schema
     */
    async getArtistData(spotifyArtistId) {
        try {
            await this.ensureToken();

            // Fetch artist profile
            const artistData = await this.spotifyApi.getArtist(spotifyArtistId);
            const artist = artistData.body;

            // Phase 1B: report Spotify fields verbatim. Spotify's Web API does
            // NOT expose monthly listeners or stream counts; the old code
            // fabricated them (followers relabeled as listeners, popularity x
            // 1M as streams). Those fabrications are deleted, not renamed.
            const observedAt = new Date().toISOString();
            const rawData = withProvenance({
                followers: artist.followers.total,
                popularity: artist.popularity,
                social: {
                    spotify: artist.followers.total
                },
                meta: {
                    dataSource: 'spotify_api',
                    lastUpdated: observedAt,
                    spotifyId: artist.id,
                    spotifyUrl: artist.external_urls.spotify
                }
            }, {
                source: 'spotify_api',
                observedAt,
                basis: 'measured',
                note: 'followers and popularity are verbatim Spotify API fields. Monthly listeners and stream counts are not exposed by this API and are not reported.'
            });

            return SafeStatsSchema.parse(rawData);
        } catch (error) {
            console.error('Spotify API Error:', error.message);
            // Re-throw or handle validation error
            throw error;
        }
    }

    /**
     * Search for artist by name (for initial setup)
     * @param {string} artistName - Artist name to search
     * @returns {Array} Array of matching artists with IDs
     */
    async searchArtist(artistName) {
        try {
            await this.ensureToken();
            const data = await this.spotifyApi.searchArtists(artistName, { limit: 5 });
            return data.body.artists.items.map(artist => ({
                id: artist.id,
                name: artist.name,
                followers: artist.followers.total,
                popularity: artist.popularity,
                genres: artist.genres,
                url: artist.external_urls.spotify
            }));
        } catch (error) {
            console.error('Spotify Search Error:', error.message);
            throw error;
        }
    }

    /**
     * Check if Spotify credentials are configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(
            process.env.SPOTIFY_CLIENT_ID &&
            process.env.SPOTIFY_CLIENT_SECRET &&
            process.env.SPOTIFY_REFRESH_TOKEN &&
            process.env.SPOTIFY_CLIENT_ID !== 'your_spotify_client_id_here'
        );
    }
}

module.exports = new SpotifyIntegration();
