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

    // Get Submissions
    app.get('/v3/anr/submissions', authenticateToken, (req, res) => {
        res.json({ submissions: anrSubmissions });
    });

    // Submit Demos
    app.post('/v3/anr/submissions', authenticateToken, (req, res) => {
        const { artist, track, url, genre } = req.body;
        if (!artist || !track || !url) return res.status(400).json({ error: 'Missing fields' });

        const newSub = {
            id: `sub_${Date.now()}`,
            artist,
            track,
            genre: genre || 'Electronic',
            url,
            votes: 0,
            voters: {}, // Tracks userId -> direction
            status: 'pending',
            submittedAt: new Date().toISOString()
        };

        anrSubmissions.unshift(newSub);
        res.json({ success: true, submission: newSub });
    });

    // Vote on Submission
    // Vote on Submission (One Vote Per User Logic)
    app.post('/v3/anr/submissions/:id/vote', authenticateToken, (req, res) => {
        const { id } = req.params;
        const { direction } = req.body; // 'up' or 'down'
        const userId = req.user.id;

        const sub = anrSubmissions.find(s => s.id === id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });

        // Initialize voters map if missing (migration safety)
        if (!sub.voters) sub.voters = {};

        const previousVote = sub.voters[userId];

        if (previousVote === direction) {
            // Toggle off (remove vote)
            if (direction === 'up') sub.votes--;
            else sub.votes++;
            delete sub.voters[userId];
        } else {
            // Vote (or Switch)
            if (previousVote === 'up') sub.votes--; // Undo previous up
            if (previousVote === 'down') sub.votes++; // Undo previous down

            if (direction === 'up') sub.votes++;
            if (direction === 'down') sub.votes--;

            sub.voters[userId] = direction;
        }

        res.json({ success: true, votes: sub.votes, userVote: sub.voters[userId] || null });
    });

    // Delete Submission (Admin Only)
    app.delete('/v3/anr/submissions/:id', authenticateToken, (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        const { id } = req.params;
        const index = anrSubmissions.findIndex(s => s.id === id);
        if (index === -1) return res.status(404).json({ error: 'Submission not found' });

        anrSubmissions.splice(index, 1);
        res.json({ success: true });
    });

    // Get Detailed Stats (Aggregated/Privacy-Safe)
    // Get Demo Rating (Public/Aggregated)
    app.get('/v3/anr/demos/:demoId/rating', authenticateToken, async (req, res) => {
        const { demoId } = req.params;
        const includeTally = req.query.includeTally === 'true';

        // Look in active state
        let demo = anrState.demos.find(s => s.id === demoId);
        let votes = 0;

        if (demo) {
            votes = (demo.ratings || []).length;
        } else {
            // Fallback to legacy submissions
            const sub = anrSubmissions.find(s => s.id === demoId);
            if (!sub) return res.status(404).json({ error: 'Not found' });
            votes = sub.votes || 0;
        }

        // Logic: Calculate Stars & Ratio (Real User Count)
        const totalUsers = await User.count(); // Real Denominator

        let stars = 0;
        let ratio = 0;

        if (votes > 0 && totalUsers > 0) {
            ratio = votes / totalUsers;
            stars = Math.round(ratio * 5);
        }

        const response = { stars };

        if (includeTally) {
            response.artistVotes = votes;
            response.totalVotes = totalUsers;
            response.ratio = parseFloat(ratio.toFixed(4));
        }

        res.json(response);
    });

    // AI Competitive Evaluation
    app.post('/v3/anr/evaluate', authenticateToken, (req, res) => {
        const { prospectId } = req.body;
        const prospectName = prospectId === 'p1' ? 'Neon Horizon' : 'Unknown Artist';

        const report = {
            prospect: prospectName,
            benchmark: 'deadmau5',
            signabilityScore: Math.floor(Math.random() * (95 - 70) + 70),
            analysis: `AI analysis indicates ${prospectName} shares 82% sonic similarity with the benchmark.`,
            projectedRevenue: { y1: 150000, y2: 450000, y3: 1200000 },
            risks: ['High competition in genre', 'Limited touring history'],
            recommendedDeal: '360 Deal / 50-50 Split'
        };

        setTimeout(() => res.json(report), 1000);
    });

    // Get Full State (Sanitized)
    app.get('/v3/anr/state', authenticateToken, (req, res) => {
        // Deep copy to avoid mutating shared state
        const safeState = JSON.parse(JSON.stringify(anrState));

        // Sanitize demos: Remove raw ratings, add user context
        safeState.demos = safeState.demos.map(d => {
            const hasVoted = d.ratings ? d.ratings.some(r => r.user === req.user.email) : false;
            // aggregate counts are meant to be hidden until toggle, 
            // but we can send basic status or just strip ratings.
            // The user requirement says "Votes remain hidden by default", implies we shouldn't even send the count?
            // "When the current user clicks that icon it reveals... Sends a request to the API"
            // This implies the count is NOT present in the initial state load.

            const { ratings, ...demoData } = d; // Destructure to exclude ratings
            return {
                ...demoData,
                hasVoted
            };
        });

        res.json(safeState);
    });

    // Update Whiteboard
    app.post('/v3/anr/whiteboard', authenticateToken, (req, res) => {
        const { message } = req.body;
        if (typeof message === 'string') {
            anrState.whiteboard = message;
            res.json({ success: true, whiteboard: anrState.whiteboard });
        } else {
            res.status(400).json({ error: 'Invalid message format' });
        }
    });

    // Update Now Listening
    app.post('/v3/anr/listening', authenticateToken, (req, res) => {
        const { url } = req.body;
        if (url) {
            anrState.nowListening = {
                url,
                updatedBy: req.user.email.split('@')[0],
                timestamp: new Date().toISOString()
            };
            res.json({ success: true, nowListening: anrState.nowListening });
        } else {
            res.status(400).json({ error: 'URL is required' });
        }
    });

    // Vote on Demo (5-Star Rating)
    // Vote Toggle (Binary Support)
    // Vote on Demo (Explicit Action)
    app.post('/v3/anr/vote/:demoId', authenticateToken, async (req, res) => {
        const { demoId } = req.params;
        const { action } = req.body; // 'add' or 'remove'
        const userEmail = req.user.email;

        const demo = anrState.demos.find(d => d.id === demoId);
        if (!demo) return res.status(404).json({ error: 'Demo not found' });

        if (!demo.ratings) demo.ratings = [];

        const existingVoteIndex = demo.ratings.findIndex(r => r.user === userEmail);
        let hasVoted = existingVoteIndex >= 0;

        if (action === 'add') {
            if (existingVoteIndex >= 0) {
                // Already voted
                demo.ratings[existingVoteIndex].timestamp = new Date().toISOString();
            } else {
                demo.ratings.push({ user: userEmail, timestamp: new Date().toISOString() });
            }
            hasVoted = true; // Ensure hasVoted is true after adding/updating
        } else if (action === 'remove') {
            if (existingVoteIndex >= 0) {
                demo.ratings.splice(existingVoteIndex, 1);
            }
            hasVoted = false;
        } else {
            return res.status(400).json({ error: 'Invalid action. Use "add" or "remove".' });
        }

        // Calculate Aggregated Stats for Response (Real User Count)
        const votes = demo.ratings.length;
        const totalUsers = await User.count();

        let stars = 0;
        let ratio = 0;

        if (votes > 0 && totalUsers > 0) {
            ratio = votes / totalUsers;
            stars = Math.round(ratio * 5);
        }

        res.json({
            success: true,
            hasVoted,
            demo: {
                id: demo.id,
                artistVotes: votes,
                totalVotes: totalUsers,
                ratio: parseFloat(ratio.toFixed(4)),
                stars
            }
        });
    });

    // Get Vote Stats (Reveal)
    app.get('/v3/anr/stats/:demoId', authenticateToken, async (req, res) => {
        const { demoId } = req.params;
        const demo = anrState.demos.find(d => d.id === demoId);
        if (!demo) return res.status(404).json({ error: 'Demo not found' });

        const artistVotes = demo.ratings ? demo.ratings.length : 0;

        // Get total active users for ratio context
        let totalVotes = 10;
        try {
            const dbCount = await User.count();
            if (dbCount > 0) totalVotes = dbCount;
        } catch (e) { console.error('Error counting users:', e.message); }

        // Ratio and Stars Calculation
        const ratio = totalVotes > 0 ? (artistVotes / totalVotes) : 0;
        const stars = Math.min(5, parseFloat((ratio * 5).toFixed(1)));

        res.json({
            artistVotes,
            totalVotes,
            ratio: parseFloat(ratio.toFixed(2)),
            stars
        });
    });

    // Submit Demo (Mock)
    app.post('/v3/anr/demos', authenticateToken, (req, res) => {
        const { title, artist } = req.body;
        const newDemo = {
            id: `demo${Date.now()}`,
            title: title || 'Untitled',
            artist: artist || 'Unknown',
            ratings: [], // Initialize empty ratings
            submittedBy: req.user.email.split('@')[0],
            status: 'new'
        };
        anrState.demos.unshift(newDemo);
        res.json({ success: true, demos: anrState.demos });
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
            res.json(result);
        } catch (err) {
            console.error('Spotify Search Error:', err);
            res.status(500).json({ error: 'Failed to access Spotify Scouting Network' });
        }
    });

    // POST /v3/anr/shortlist
    app.post('/v3/anr/shortlist', authenticateToken, (req, res) => {
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

        // Persist to in-memory store
        // Check if duplicate
        const exists = anrSubmissions.find(s => s.artist === artist.name);
        if (!exists) {
            anrSubmissions.unshift(newEntry);
            console.log(`[A&R] Shortlisted and Persisted: ${artist.name}`);
            res.json({ success: true, message: `${artist.name} added to shortlist`, entry: newEntry });
        } else {
            res.json({ success: true, message: `${artist.name} is already in the shortlist` });
        }
    });
}

module.exports = { register };
