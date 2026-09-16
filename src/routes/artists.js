/**
 * src/routes/artists.js
 *
 * Artist roster and per-artist reads. Data access goes through
 * src/repositories/artistRepository.js (DB + mock hybrid union).
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
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
        generateMonthlyReport
    } = ctx;

    // Get all artists (with pagination/search)
    app.get('/v3/artists', authenticateToken, async (req, res) => {
        const { search, limit = 50, offset = 0 } = req.query;

        try {
            const dbArtists = await Artist.findAll();
            // Merge DB schema with the JSON data
            let fullList = dbArtists.map(a => ({ ...a.data, id: a.id, name: a.name }));

            // HYBRID MERGE: Add memory-only artists (e.g. from failed DB writes or mock mode)
            const dbIds = new Set(fullList.map(a => a.id));
            const memoryArtists = labelData.artists.filter(a => !dbIds.has(a.id));
            fullList = [...fullList, ...memoryArtists];

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
    app.post('/v3/artists', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { name, tier } = req.body;
        if (!name || !tier) return res.status(400).json({ error: 'Name/Tier required' });

        const id = `art_${name.toLowerCase().replace(/\s+/g, '')}`;
        const newArtist = {
            id, name, displayName: name, tier,
            status: 'active',
            monthlyListeners: 0,
            totalStreams: 0,
            growthRate: 0,
            revenue: { streaming: 0, touring: 0, merch: 0, sync: 0, branding: 0, youtube: 0 },
            touring: { upcomingShows: 0, avgTicketPrice: 0, avgAttendance: 0, merchPerHead: 0, shows: [] },
            social: { instagram: 0, twitter: 0, tiktok: 0, engagementRate: 0 },
            merch: { onlineSales: 0, tourSales: 0, monthlySales: [] },
            brandDeals: [],
            collaborations: [],
            meta: { dataSource: 'manual_entry', lastUpdated: new Date().toISOString() }
        };

        try {
            await Artist.create({ id, name, data: newArtist });
            // Sync to memory
            const exists = labelData.artists.find(a => a.id === id);
            if (!exists) labelData.artists.push(newArtist);
            res.json({ success: true, artist: newArtist });
        } catch (err) {
            // Fallback to memory if DB fails (for prototype robustness)
            labelData.artists.push(newArtist);
            res.json({ success: true, artist: newArtist, warning: 'Persisted to memory only' });
        }
    });

    // Archive Artist
    app.post('/v3/artists/:id/archive', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { id } = req.params;

        const artist = labelData.artists.find(a => a.id === id);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });

        artist.tier = 'archived';
        artist.status = 'archived';

        // Attempt DB update
        try {
            await Artist.update({ data: artist }, { where: { id } });
        } catch (e) { console.error('DB Update failed, using memory'); }

        res.json({ success: true, message: `${artist.name} archived` });
    });

    // Restore Artist
    app.post('/v3/artists/:id/restore', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { id } = req.params;

        const artist = labelData.artists.find(a => a.id === id);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });

        artist.tier = 'developing'; // Default back to developing
        artist.status = 'active';

        // Attempt DB update
        try {
            await Artist.update({ data: artist }, { where: { id } });
        } catch (e) { console.error('DB Update failed, using memory'); }

        res.json({ success: true, message: `${artist.name} restored` });
    });

    // Update Artist Image (Manual Override)
    app.put('/v3/artists/:id/image', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { id } = req.params;
        const { imageUrl } = req.body;

        const artist = labelData.artists.find(a => a.id === id);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });

        // Update in-memory data
        artist.manualImage = imageUrl;

        // In a real app with DB, we'd save this to the 'data' JSON column or a specific column
        // For this session's hybrid mock approach:
        try {
            const dbArtist = await Artist.findByPk(id);
            if (dbArtist) {
                const newData = { ...dbArtist.data, manualImage: imageUrl };
                dbArtist.data = newData;
                await dbArtist.save();
            }
        } catch (e) { console.error('Failed to persist manual image:', e); }

        res.json({ success: true, manualImage: imageUrl });
    });

    // Get single artist (with access check)
    app.get('/v3/artists/:id', authenticateToken, async (req, res) => {
        if (!hasArtistAccess(req.user, req.params.id)) {
            return res.status(403).json({ error: 'Access denied to this artist' });
        }

        const artist = labelData.artists.find(a => a.id === req.params.id);

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

            const outcome = await entityAuditService.audit(artistId, forceRefresh);

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
    app.get('/v3/artists/:id/monthly-sales', authenticateToken, (req, res) => {
        if (!hasArtistAccess(req.user, req.params.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const artist = labelData.artists.find(a => a.id === req.params.id);
        if (!artist) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        res.json({
            artistId: artist.id,
            artistName: artist.name,
            merchSales: artist.merch.monthlySales,
            tourRevenue: artist.touring.shows.map(show => ({
                date: show.date,
                venue: show.venue,
                revenue: show.revenue
            }))
        });
    });

    // Development Report (AI) - Legacy Endpoint (Keep for compatibility)
    app.get('/v3/artists/:id/development', authenticateToken, (req, res) => {
        const artist = labelData.artists.find(a => a.id === req.params.id);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });

        res.json({
            artist: artist.name,
            projection: 'Positive',
            insights: [
                `${artist.name}'s streaming growth is outpacing the genre average by 15%.`,
                "Strong engagement in South America suggests potential for a Q3 tour leg.",
                "Merch sales per listener are lower than expected; strictly limit supply for next drop."
            ],
            focusAreas: ['TikTok Content', 'LATAM Tour', 'Limited Merch']
        });
    });
}

module.exports = { register };
