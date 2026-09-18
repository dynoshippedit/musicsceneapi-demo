/**
 * src/routes/artists.js
 *
 * Artist roster and per-artist reads. Data access goes through
 * src/repositories/artistRepository.js (DB + roster hybrid union).
 *
 * PHASE 4CF — canonical source of truth (Objective 3): every handler in this
 * file now resolves artists through the repository's DB-first read, so list,
 * detail, archive, restore, image and entity-audit all agree on ONE source.
 * Previously list read DB∪memory while detail/archive/restore/image read
 * memory only — API-created artists 404'd after any restart, and seeded
 * artists' archive state diverged between list and detail (live-reproduced in
 * the commercial recheck).
 *
 * Response bodies, status codes and authorization behavior are unchanged for
 * the seeded roster. Deliberate changes: duplicate create → 409 (was 200 +
 * "memory only" warning); DB create failure → 500 (was the same lying 200).
 *
 * Routes (9):
 *   GET    /v3/artists
 *   POST   /v3/artists
 *   POST   /v3/artists/:id/archive
 *   POST   /v3/artists/:id/restore
 *   PUT    /v3/artists/:id/image
 *   GET    /v3/artists/:id
 *   GET    /v3/artists/:id/entity-audit
 *   GET    /v3/artists/:id/monthly-sales
 *   GET    /v3/artists/:id/development
 */

'use strict';

/**
 * @param {object} app Express application
 * @param {object} ctx dependency bundle from src/routes/context.js
 */
function register(app, ctx) {
    const {
        config, logger, JWT_SECRET, bcrypt, jwt, fs, path,
        sequelize, User, Artist, Stats,
        authenticateToken, hasArtistAccess, filterDataByAccess, checkExportAccess, generateToken,
        calculateTotalRevenue, flattenData, filterMetrics,
        generatePieChart, generateBarChart, generateLineChart, generateDonutChart,
        cache, emailService, sendEmail, entityAuditService,
        artistRepo, labelData, getArtistData, getAllArtists,
        operationsRepo, operationsData,
        prospects, anrSubmissions, anrState, userIntegrations, salesData, apiCache,
        aiService, performLinearRegression, generateSyntheticHistory,
        integrationFacade, fetchArtistData, getIntegrationStatus, SERVICES, limiters,
        generateMonthlyReport, profile, auditService
    } = ctx;

    // Get all artists (with pagination/search)
    app.get('/v3/artists', authenticateToken, async (req, res) => {
        const { search, limit = 50, offset = 0 } = req.query;

        try {
            // PHASE 4CF: the list now goes through the repository's canonical
            // hybrid read instead of re-implementing the union inline.
            let fullList = await artistRepo.findAllHybrid();

            // Filter by Search
            if (search) {
                fullList = fullList.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
            }

            // Access Control
            const wrapper = filterDataByAccess({ artists: fullList }, req.user);
            fullList = wrapper.artists || [];

            // Pagination
            const paginated = fullList.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

            res.json({
                artists: paginated,
                total: fullList.length,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } catch (err) {
            logger.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Create new artist (Admin only)
    // PHASE 4CF F-4: duplicate names now 409; the memory-only fallback that
    // reported success for a failed DB write is gone.
    app.post('/v3/artists', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { name, tier } = req.body;
        if (typeof name !== 'string' || !name.trim() || typeof tier !== 'string' || !tier.trim()) return res.status(400).json({ error: 'Name/Tier required' });

        const outcome = await artistRepo.createArtist({ name, tier });

        if (outcome.conflict) {
            return res.status(409).json({ error: 'Artist already exists', id: outcome.id });
        }
        if (outcome.error) {
            logger.error('Artist create failed:', outcome.error);
            return res.status(500).json({ error: 'Failed to create artist' });
        }

        auditService.emitAudit({
            action: 'artist.create',
            resourceType: 'artist',
            resourceId: outcome.created.id,
            metadata: { name: outcome.created.name, tier: outcome.created.tier },
            req
        });

        res.json({ success: true, artist: outcome.created });
    });

    // Archive Artist
    app.post('/v3/artists/:id/archive', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { id } = req.params;

        const outcome = await artistRepo.archiveArtist(id);
        if (!outcome) return res.status(404).json({ error: 'Artist not found' });
        if (outcome.error) {
            logger.error('Artist archive persist failed:', outcome.error);
            return res.status(500).json({ error: 'Failed to archive artist' });
        }
        const artist = outcome.artist;

        auditService.emitAudit({
            action: 'artist.archive',
            resourceType: 'artist',
            resourceId: id,
            metadata: { name: artist.name },
            req
        });

        res.json({ success: true, message: `${artist.name} archived` });
    });

    // Restore Artist
    app.post('/v3/artists/:id/restore', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { id } = req.params;

        const outcome = await artistRepo.restoreArtist(id);
        if (!outcome) return res.status(404).json({ error: 'Artist not found' });
        if (outcome.error) {
            logger.error('Artist restore persist failed:', outcome.error);
            return res.status(500).json({ error: 'Failed to restore artist' });
        }
        const artist = outcome.artist;

        auditService.emitAudit({
            action: 'artist.restore',
            resourceType: 'artist',
            resourceId: id,
            metadata: { name: artist.name },
            req
        });

        res.json({ success: true, message: `${artist.name} restored` });
    });

    // Update Artist Image (Manual Override)
    app.put('/v3/artists/:id/image', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { id } = req.params;
        const { imageUrl } = req.body;

        const outcome = await artistRepo.setArtistImage(id, imageUrl);
        if (!outcome) return res.status(404).json({ error: 'Artist not found' });
        if (outcome.error) {
            logger.error('Artist image persist failed:', outcome.error);
            return res.status(500).json({ error: 'Failed to update artist image' });
        }
        const artist = outcome.artist;

        auditService.emitAudit({
            action: 'artist.image',
            resourceType: 'artist',
            resourceId: id,
            metadata: { name: artist.name },
            req
        });

        res.json({ success: true, manualImage: artist.manualImage });
    });

    // Get single artist (with access check)
    app.get('/v3/artists/:id', authenticateToken, async (req, res) => {
        if (!hasArtistAccess(req.user, req.params.id)) {
            return res.status(403).json({ error: 'Access denied to this artist' });
        }

        // PHASE 4CF: canonical DB-first read (survives restarts).
        const artist = await artistRepo.findById(req.params.id);

        if (!artist) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        // Enhance with Wikipedia Data (Cached)
        let wikiData = null;
        try {
            const cacheKey = `wiki_bio_${artist.id}`;
            const cachedWiki = cache.get(cacheKey);

            if (cachedWiki) {
                wikiData = cachedWiki;
            } else {
                // Use entityAudit module to fetch summary
                const wikiAudit = await integrationFacade.auditWikipedia(artist.name);
                if (wikiAudit.exists && wikiAudit.bioShort) {
                    wikiData = {
                        summary: wikiAudit.bioShort,
                        thumbnail: wikiAudit.thumbnail,
                        wikiUrl: wikiAudit.url
                    };
                    cache.set(cacheKey, wikiData, 3600 * 24); // Cache for 24 hours
                }
            }
        } catch (err) {
            console.warn('Wikipedia enrichment failed:', err.message);
        }

        res.json({
            ...artist,
            wikipedia: wikiData,
            totalRevenue: calculateTotalRevenue(artist),
            projectedAnnual: calculateTotalRevenue(artist) * 12
        });
    });

    app.get('/v3/artists/:id/entity-audit', authenticateToken, async (req, res) => {
        // PHASE 2: orchestration (2-tier caching, 5 providers, AI analysis, issue
        // mapping) moved to src/services/entityAuditService.js. Status codes and
        // response bodies are unchanged, including `cached: true|false`.
        try {
            const artistId = req.params.id;
            const forceRefresh = req.query.refresh === 'true';

            // PHASE 4CF: pass the requesting principal through for usage
            // attribution (additive; service behavior otherwise unchanged).
            const outcome = await entityAuditService.audit(artistId, forceRefresh, req.user);

            if (outcome.kind === 'not_found') {
                return res.status(404).json({ error: 'Artist not found' });
            }

            res.json(outcome.result);
        } catch (error) {
            logger.error('Entity audit failed:', error);
            res.status(500).json({ error: 'Entity audit failed' });
        }
    });

    // Get monthly sales (with access check)
    app.get('/v3/artists/:id/monthly-sales', authenticateToken, async (req, res) => {
        if (!hasArtistAccess(req.user, req.params.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // PHASE 4CF: canonical DB-first read.
        const artist = await artistRepo.findById(req.params.id);
        if (!artist) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        res.json({
            artistId: artist.id,
            artistName: artist.name,
            merchSales: artist.merch?.monthlySales,
            tourRevenue: (artist.touring?.shows ?? []).map(show => ({
                date: show.date,
                venue: show.venue,
                revenue: show.revenue
            }))
        });
    });

    // Development Report (AI) - Legacy Endpoint (Keep for compatibility)
    app.get('/v3/artists/:id/development', authenticateToken, async (req, res) => {
        // PHASE 4CF: canonical DB-first read + profile-owned canned insights
        // (mau5trap values byte-identical).
        const artist = await artistRepo.findById(req.params.id);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });

        res.json({
            artist: artist.name,
            projection: 'Positive',
            insights: profile.ai.developmentInsights.map((tpl) => tpl.replace('{artist}', artist.name)),
            focusAreas: [...profile.ai.developmentFocusAreas]
        });
    });
}

module.exports = { register };
