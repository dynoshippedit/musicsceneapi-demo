// integrations/ticketmaster.js
// Ticketmaster Discovery API Integration

const axios = require('axios');

class TicketmasterIntegration {
    constructor() {
        this.baseURL = 'https://app.ticketmaster.com/discovery/v2';
        this.apiKey = process.env.TICKETMASTER_API_KEY;
    }

    /**
     * Fetch upcoming events for an artist
     * @param {string} artistName - Artist name to search
     * @returns {Object} Touring data mapped to pulsegrid schema
     */
    async getArtistEvents(artistName) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Ticketmaster API key not configured');
            }

            const response = await axios.get(`${this.baseURL}/events.json`, {
                params: {
                    keyword: artistName,
                    classificationName: 'Music',
                    size: 50,
                    apikey: this.apiKey
                },
                timeout: 5000
            });

            const events = response.data._embedded?.events || [];

            // Map events to pulsegrid schema
            const shows = events.map(event => ({
                date: event.dates.start.localDate,
                venue: event._embedded?.venues?.[0]?.name || 'TBA',
                city: event._embedded?.venues?.[0]?.city?.name || 'TBA',
                country: event._embedded?.venues?.[0]?.country?.name || 'TBA',
                ticketsAvailable: event.dates.status.code === 'onsale',
                url: event.url
            }));

            // Calculate average ticket price if available
            const avgTicketPrice = this.calculateAvgTicketPrice(events);

            return {
                touring: {
                    upcomingShows: events.length,
                    shows: shows,
                    avgTicketPrice: avgTicketPrice || 75, // Default if not available
                    nextShow: shows[0] || null
                },
                meta: {
                    dataSource: 'ticketmaster_api',
                    lastUpdated: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error('Ticketmaster API Error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate average ticket price from events
     * @param {Array} events - Array of events
     * @returns {number|null} Average ticket price or null if unavailable
     */
    calculateAvgTicketPrice(events) {
        const pricesWithData = events
            .filter(event => event.priceRanges && event.priceRanges.length > 0)
            .map(event => {
                const priceRange = event.priceRanges[0];
                return (priceRange.min + priceRange.max) / 2;
            });

        if (pricesWithData.length === 0) return null;

        const sum = pricesWithData.reduce((acc, price) => acc + price, 0);
        return Math.round(sum / pricesWithData.length);
    }

    /**
     * Check if Ticketmaster API key is configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(
            this.apiKey &&
            this.apiKey !== 'your_ticketmaster_api_key_here'
        );
    }
}

module.exports = new TicketmasterIntegration();
