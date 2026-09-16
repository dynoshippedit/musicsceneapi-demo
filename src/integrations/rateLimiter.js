/**
 * src/integrations/rateLimiter.js
 *
 * Token-bucket limiter and the external-service registry, extracted verbatim
 * from mau5trap-production-api.js (Phase 1 L~140-200).
 *
 * ============================================================================
 * PRESERVED DEFECT (audit INTEGRATION §5): THESE LIMITERS ARE NOT USED
 * ============================================================================
 * `limiters` is referenced by exactly one route — GET /v3/integrations/
 * test-limit/:service, a diagnostic with no frontend caller. No real outbound
 * HTTP call in integrations/*.js passes through a limiter, so the advertised
 * per-service rate limiting does not happen.
 *
 * The registry also lists four services with NO integration module at all:
 * shopify, bandsintown, chartmetric, revelator.
 *
 * Both preserved as-is; wiring the limiters into the real call path would
 * change outbound timing and is out of scope for a behavior-preserving phase.
 */

'use strict';

class RateLimiter {
    constructor(requestsPerSecond, burst) {
        this.tokens = burst;
        this.maxTokens = burst;
        this.fillRate = requestsPerSecond;
        this.lastRefill = Date.now();
    }

    async throttle() {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }
        // Queue logic would go here for stricter enforcement.
        const waitTime = (1 / this.fillRate) * 1000;
        return new Promise((resolve) => setTimeout(() => {
            this.tokens -= 1; // Take debt
            resolve(true);
        }, waitTime));
    }

    refill() {
        const now = Date.now();
        const delta = (now - this.lastRefill) / 1000;
        this.tokens = Math.min(this.maxTokens, this.tokens + (delta * this.fillRate));
        this.lastRefill = now;
    }
}

/**
 * Service configuration map. Values verbatim from the original.
 * NOTE: shopify / bandsintown / chartmetric / revelator have no integration
 * module — they exist only so the registry and /integrations/status list them.
 */
const SERVICES = {
    spotify: { name: 'Spotify Web API', rateLimit: 10, burst: 50 },
    youtube: { name: 'YouTube Analytics', rateLimit: 5, burst: 20 },
    tiktok: { name: 'TikTok API', rateLimit: 5, burst: 20 },
    instagram: { name: 'Instagram Graph', rateLimit: 2, burst: 10 },
    shopify: { name: 'Shopify API', rateLimit: 2, burst: 4 }, // Leaky bucket standard
    ticketmaster: { name: 'Ticketmaster Discovery', rateLimit: 5, burst: 10 },
    bandsintown: { name: 'Bandsintown API', rateLimit: 10, burst: 20 },
    chartmetric: { name: 'Chartmetric API', rateLimit: 2, burst: 10 },
    revelator: { name: 'Revelator API', rateLimit: 5, burst: 20 }
};

/** One limiter per service, built at module load exactly as before. */
const limiters = {};
Object.keys(SERVICES).forEach((key) => {
    limiters[key] = new RateLimiter(SERVICES[key].rateLimit, SERVICES[key].burst);
});

module.exports = { RateLimiter, SERVICES, limiters };
