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
     * @param {string} spotifyArtistId - Spotify artist ID (e.g., "2CIMQHirSU0MQqyYHq0eOx" for lumenveil)
     * @returns {Object} Artist data mapped to pulsegrid schema
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
     * Fetch an artist's albums/singles from Spotify (strategy doc 2026-09-28:
     * profile-integrity check). This endpoint is readable with a standard Web
     * API token -- no Spotify for Artists access required.
     *
     * NOTE: the simplified album objects returned here do NOT carry
     * external_ids. The full album endpoint (GET /v1/albums/{id}, or the
     * batch GET /v1/albums?ids= used by getAlbumUpcs below) DOES expose
     * external_ids.upc -- verified against Spotify's official API reference
     * 2026-09-28. The integrity check hydrates UPCs via the batch endpoint.
     *
     * @param {string} spotifyArtistId - Spotify artist ID
     * @returns {Object} { albums: [...], provenance }
     */
    async getArtistAlbums(spotifyArtistId) {
        await this.ensureToken();

        const albumsData = await this.spotifyApi.getArtistAlbums(spotifyArtistId, {
            include_groups: 'album,single',
            limit: 50
        });

        const observedAt = new Date().toISOString();
        const albums = (albumsData.body.items || []).map((a) => ({
            spotifyAlbumId: a.id,
            name: a.name,
            albumType: a.album_type,
            releaseDate: a.release_date || null,
            releaseDatePrecision: a.release_date_precision || null,
            totalTracks: a.total_tracks,
            spotifyUrl: (a.external_urls && a.external_urls.spotify) || null
        }));

        return {
            albums,
            provenance: {
                source: 'spotify_api',
                observedAt,
                basis: 'measured',
                note: 'Album list is verbatim from the Spotify Web API (simplified album objects; UPCs hydrated separately via the batch album endpoint).'
            }
        };
    }

    /**
     * Hydrate UPCs for a list of Spotify album IDs via the batch endpoint
     * GET /v1/albums?ids= (max 20 per call). The full album object exposes
     * external_ids.upc -- verified against Spotify's official API reference
     * 2026-09-28 (the simplified objects from getArtistAlbums do not).
     *
     * @param {string[]} albumIds - Spotify album IDs
     * @returns {Object} { upcs: { albumId: upc|null }, provenance }
     */
    async getAlbumUpcs(albumIds) {
        await this.ensureToken();

        const observedAt = new Date().toISOString();
        const upcs = {};
        const ids = [...new Set((albumIds || []).filter(Boolean))];
        for (let i = 0; i < ids.length; i += 20) {
            const batch = ids.slice(i, i + 20);
            const data = await this.spotifyApi.getAlbums(batch);
            for (const album of (data.body.albums || [])) {
                if (!album) continue;
                const upc = album.external_ids && (album.external_ids.upc || album.external_ids.ean);
                upcs[album.id] = upc ? String(upc).trim() : null;
            }
        }
        // Any requested ID the batch endpoint did not return stays null
        // (unverifiable), never invented.
        for (const id of ids) {
            if (!(id in upcs)) upcs[id] = null;
        }

        return {
            upcs,
            provenance: {
                source: 'spotify_api',
                observedAt,
                basis: 'measured',
                note: 'UPCs from the full album object external_ids (Spotify Web API). Null means Spotify exposed no UPC for that album -- unverifiable, not unknown.'
            }
        };
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
