/**
 * src/routes/anr.js
 *
 * A&R endpoints. PRESERVED SPLIT-BRAIN: two unrelated demo stores are both live
 * (anrSubmissions with a scalar vote counter, anrState.demos with ratings[]).
 * The workstation UI writes to both. See src/repositories/inMemoryStores.js.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (14):
 *   GET    /v3/anr/submissions
 *   POST   /v3/anr/submissions
 *   POST   /v3/anr/submissions/:id/vote
 *   DELETE /v3/anr/submissions/:id
 *   GET    /v3/anr/demos/:demoId/rating
 *   POST   /v3/anr/evaluate
 *   GET    /v3/anr/state
 *   POST   /v3/anr/whiteboard
 *   POST   /v3/anr/listening
 *   POST   /v3/anr/vote/:demoId
 *   GET    /v3/anr/stats/:demoId
 *   POST   /v3/anr/demos
 *   GET    /v3/anr/scout
 *   POST   /v3/anr/shortlist
 */

'use strict';

const { Transaction } = require('sequelize');

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
        generateMonthlyReport, profile, AnrSubmission
    } = ctx;

    // PHASE 4CF: store #1 (submissions + shortlist) is now DURABLE DB state
    // (AnrSubmission table). Row → response mapping reproduces the original
    // memory-object shapes exactly: keys whose value was `undefined` in the
    // original objects are omitted (JSON drops undefined but keeps null).
    function submissionToShape(row) {
        const shape = {
            id: row.id,
            artist: row.artist ?? undefined,
            track: row.track ?? undefined,
            genre: row.genre ?? undefined,
            url: row.url ?? undefined,
            votes: row.votes,
            status: row.status ?? undefined,
            submittedAt: row.submittedAt ?? undefined
        };
        if (row.imageUrl != null) shape.imageUrl = row.imageUrl;
        if (row.followers != null) shape.followers = row.followers;
        if (row.voters != null) shape.voters = row.voters;
        return shape;
    }

    // Get Submissions
    app.get('/v3/anr/submissions', authenticateToken, async (req, res) => {
        try {
            const rows = await AnrSubmission.findAll({ order: [['id', 'ASC']] });
            res.json({ submissions: rows.map(submissionToShape) });
        } catch (e) {
            logger.error('A&R list failed:', e);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // Submit Demos
    app.post('/v3/anr/submissions', authenticateToken, async (req, res) => {
        const { artist, track, url, genre } = req.body;
        if (!artist || !track || !url) return res.status(400).json({ error: 'Missing fields' });

        const newSub = {
            id: `sub_${Date.now()}`,
            artist,
            track,
            genre: genre || profile.anr.defaultGenre,
            url,
            votes: 0,
            voters: {}, // Tracks userId -> direction
            status: 'pending',
            submittedAt: new Date().toISOString()
        };

        try {
            await AnrSubmission.create({
                id: newSub.id,
                artist: newSub.artist,
                track: newSub.track,
                genre: newSub.genre,
                url: newSub.url,
                votes: newSub.votes,
                voters: newSub.voters,
                status: newSub.status,
                submittedAt: newSub.submittedAt
            });
            res.json({ success: true, submission: newSub });
        } catch (err) {
            if (err && err.name === 'SequelizeUniqueConstraintError') {
                // Two submissions in the same millisecond: mint a fresh id once.
                newSub.id = `sub_${Date.now() + 1}${Math.floor(Math.random() * 1000)}`;
                newSub.submittedAt = new Date().toISOString();
                try {
                    await AnrSubmission.create({
                        id: newSub.id, artist: newSub.artist, track: newSub.track,
                        genre: newSub.genre, url: newSub.url, votes: newSub.votes,
                        voters: newSub.voters, status: newSub.status, submittedAt: newSub.submittedAt
                    });
                    return res.json({ success: true, submission: newSub });
                } catch (err2) {
                    logger.error('A&R submission create failed (retry):', err2);
                    return res.status(500).json({ error: 'Failed to create submission' });
                }
            }
            logger.error('A&R submission create failed:', err);
            res.status(500).json({ error: 'Failed to create submission' });
        }
    });

    // Vote on Submission
    // Vote on Submission (One Vote Per User Logic)
    app.post('/v3/anr/submissions/:id/vote', authenticateToken, async (req, res) => {
        const { id } = req.params;
        const { direction } = req.body || {}; // 'up' or 'down'
        if (direction !== 'up' && direction !== 'down') {
            // Omitted direction used to fall through, ++votes, and store
            // `undefined` as the voter mark (A-VOTEDIR). Require an explicit
            // vote. Unknown ids still 404 so the missing-submission pin holds.
            try {
                const exists = await AnrSubmission.findByPk(id);
                if (!exists) return res.status(404).json({ error: 'Submission not found' });
            } catch (e) {
                logger.error('A&R vote lookup failed:', e);
                return res.status(500).json({ error: 'Database error' });
            }
            return res.status(400).json({ error: 'Direction must be "up" or "down"' });
        }
        const userId = req.user.id;

        const isRetryable = (err) => {
            const nested = err && err.parent;
            const msg = String((err && err.message) || (nested && nested.message) || '');
            const name = (err && err.name) || (nested && nested.name) || '';
            return name === 'SequelizeTimeoutError'
                || /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(msg);
        };

        const applyVote = async () => sequelize.transaction(
            { type: Transaction.TYPES.IMMEDIATE },
            async (t) => {
                const sub = await AnrSubmission.findByPk(id, { transaction: t });
                if (!sub) return { missing: true };

                // Initialize voters map if missing (migration safety)
                const voters = { ...(sub.voters || {}) };
                const votes = sub.votes || 0;
                const previousVote = voters[userId];

                let newVotes = votes;
                if (previousVote === direction) {
                    // Toggle off (remove vote)
                    if (direction === 'up') newVotes--;
                    else newVotes++;
                    delete voters[userId];
                } else {
                    // Vote (or Switch)
                    if (previousVote === 'up') newVotes--; // Undo previous up
                    if (previousVote === 'down') newVotes++; // Undo previous down

                    if (direction === 'up') newVotes++;
                    if (direction === 'down') newVotes--;

                    voters[userId] = direction;
                }

                // Fresh object so Sequelize detects the JSON change.
                sub.voters = voters;
                sub.votes = newVotes;
                await sub.save({ transaction: t });
                return { sub };
            }
        );

        let outcome;
        try {
            const maxAttempts = 8;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    outcome = await applyVote();
                    break;
                } catch (e) {
                    if (!isRetryable(e) || attempt === maxAttempts - 1) throw e;
                    await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
                }
            }
        } catch (e) {
            logger.error('A&R vote failed:', e);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!outcome || outcome.missing) return res.status(404).json({ error: 'Submission not found' });

        res.json({ success: true, votes: outcome.sub.votes, userVote: outcome.sub.voters[userId] || null });
    });

    // Delete Submission (Admin Only)
    app.delete('/v3/anr/submissions/:id', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        const { id } = req.params;

        let sub;
        try {
            sub = await AnrSubmission.findByPk(id);
        } catch (e) {
            logger.error('A&R delete lookup failed:', e);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!sub) return res.status(404).json({ error: 'Submission not found' });

        try {
            await sub.destroy();
        } catch (e) {
            logger.error('A&R delete failed:', e);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true });
    });

    require('./anrRoom').register(app, ctx);

    // AI Competitive Evaluation
    app.post('/v3/anr/evaluate', authenticateToken, (req, res) => {
        const { prospectId } = req.body;
        // PHASE 4CF: evaluation copy and benchmark are label intelligence,
        // now sourced from the profile (mau5trap values byte-identical).
        const prospectName = prospectId === 'p1'
            ? profile.anr.evaluate.prospectNames.p1
            : profile.anr.evaluate.unknownProspectName;

        const report = {
            source: 'fixture',
            prospect: prospectName,
            benchmark: profile.anr.benchmarkArtist,
            signabilityScore: Math.floor(Math.random() * (95 - 70) + 70),
            analysis: profile.anr.evaluate.similarityCopy.replace('{prospect}', prospectName),
            projectedRevenue: { ...profile.anr.evaluate.projectedRevenue },
            risks: [...profile.anr.evaluate.risks],
            recommendedDeal: profile.anr.evaluate.recommendedDeal
        };

        setTimeout(() => res.json(report), 1000);
    });

    // GET /v3/anr/scout
    app.get('/v3/anr/scout', authenticateToken, async (req, res) => {
        // PHASE 2: mock fixtures, the 500ms simulated latency and the filter moved
        // to src/integrations/scoutService.js. The dead placeholder-credential
        // SpotifyWebApi client that used to sit above this handler is gone; it was
        // never invoked. Response body { scouts: [...] } is unchanged.
        const query = req.query.query || '';

        try {
            const result = await integrationFacade.searchScouts(query);
            res.json({ ...result, source: 'fixture' });
        } catch (err) {
            console.error('Spotify Search Error:', err);
            res.status(500).json({ error: 'Failed to access Spotify Scouting Network' });
        }
    });

    // POST /v3/anr/shortlist
    app.post('/v3/anr/shortlist', authenticateToken, async (req, res) => {
        const artist = req.body;

        // Create a new submission/prospect entry
        const newEntry = {
            id: `scout_${artist.spotifyId || Date.now()}`,
            artist: artist.name,
            track: '—', // Placeholder for scouted artists
            genre: artist.genres ? artist.genres[0] : 'Unknown',
            imageUrl: artist.image,
            followers: artist.followers,
            url: artist.url,
            status: 'shortlisted', // Special status
            submittedAt: new Date().toISOString(),
            votes: 0
        };

        // PHASE 4CF: durable persistence (AnrSubmission row).
        try {
            const duplicate = artist.name != null
                ? await AnrSubmission.findOne({ where: { artist: artist.name } })
                : null;
            if (!duplicate) {
                await AnrSubmission.create({
                    id: newEntry.id,
                    artist: newEntry.artist ?? null,
                    track: newEntry.track,
                    genre: newEntry.genre,
                    imageUrl: newEntry.imageUrl ?? null,
                    followers: newEntry.followers ?? null,
                    url: newEntry.url ?? null,
                    status: newEntry.status,
                    submittedAt: newEntry.submittedAt,
                    votes: newEntry.votes
                });
                console.log(`[A&R] Shortlisted and Persisted: ${artist.name}`);
                res.json({ success: true, message: `${artist.name} added to shortlist`, entry: newEntry });
            } else {
                res.json({ success: true, message: `${artist.name} is already in the shortlist` });
            }
        } catch (err) {
            logger.error('A&R shortlist persist failed:', err);
            res.status(500).json({ error: 'Failed to shortlist artist' });
        }
    });
}

module.exports = { register };
