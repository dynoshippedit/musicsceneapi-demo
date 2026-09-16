/**
 * src/routes/users.js
 *
 * Admin-only user management. PRESERVED NEW-1: the bound POST /v3/users assigns
 * a STRING id into an INTEGER autoincrement PK, so creation always fails with
 * SQLITE_MISMATCH -> 500. Two later duplicate registrations of POST/PUT/DELETE
 * are SHADOWED and unreachable; they are kept for parity.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (8):
 *   POST   /v3/users
 *   POST   /v3/users
 *   PUT    /v3/users/:id
 *   DELETE /v3/users/:id
 *   GET    /v3/users
 *   POST   /v3/users
 *   PUT    /v3/users/:id
 *   DELETE /v3/users/:id
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
        generateMonthlyReport, validateBody
    } = ctx;

    // Create new user
    app.post('/v3/users', authenticateToken, validateBody('createUser'), async (req, res) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { email, password, name, role, artistAccess } = req.validatedBody;

        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                return res.status(400).json({ error: 'User already exists' });
            }

            const newUser = await User.create({
                // NEW-1 FIX (Phase 3): removed `id: \`user_${Date.now()}\``.
                // User.id is INTEGER autoincrement (src/models); writing a
                // string here caused SQLITE_MISMATCH -> always 500. Let the
                // database assign the primary key.
                email,
                passwordHash: await bcrypt.hash(password, 10),
                name,
                role,
                artistAccess: artistAccess || 'none'
            });

            res.json({
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role,
                artistAccess: newUser.artistAccess
            });
        } catch (err) {
            logger.error(err);
            res.status(500).json({ error: 'Failed to create user' });
        }
    });

    // Create User
    app.post('/v3/users', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        const { email, password, name, role, pageAccess } = req.body;

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await User.create({
                email,
                passwordHash: hashedPassword,
                name,
                role: role || 'viewer',
                pageAccess: pageAccess || []
            });
            res.json({ success: true, user: { id: newUser.id, email: newUser.email, name: newUser.name } });
        } catch (err) {
            res.status(400).json({ error: 'User creation failed (Email likely exists)' });
        }
    });

    // Update User
    app.put('/v3/users/:id', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        const { id } = req.params;
        const { email, role, pageAccess, name, password } = req.body;

        const user = await User.findByPk(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (email) user.email = email;
        if (name) user.name = name;
        if (role) user.role = role;
        if (pageAccess) user.pageAccess = pageAccess;
        if (password) user.passwordHash = await bcrypt.hash(password, 10);

        await user.save();
        res.json({ success: true });
    });

    // Delete User
    app.delete('/v3/users/:id', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        await User.destroy({ where: { id: req.params.id } });
        res.json({ success: true });
    });

    // List Users (Admin Only)
    app.get('/v3/users', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        try {
            const users = await User.findAll({ attributes: { exclude: ['passwordHash', 'resetToken', 'resetTokenExpiry'] } });
            // Parse pageAccess for frontend
            const parsedUsers = users.map(u => ({ ...u.toJSON(), pageAccess: JSON.parse(u.pageAccess || '[]') }));
            res.json(parsedUsers);
        } catch (e) { logger.error('List users failed:', e); res.status(500).json({ error: 'Failed to list users' }); }
    });

    // Create User (Admin Only)
    app.post('/v3/users', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { email, password, name, role, artistAccess, pageAccess } = req.body;
        try {
            const passwordHash = await bcrypt.hash(password, 10);
            const newUser = await User.create({
                email, passwordHash, name, role, artistAccess,
                pageAccess: JSON.stringify(pageAccess || ['overview'])
            });
            res.json({ success: true, user: { id: newUser.id, email: newUser.email } });
        } catch (e) { logger.error('Create user failed:', e); res.status(400).json({ error: 'User creation failed (Email likely exists)' }); }
    });

    // Update User (Admin Only)
    app.put('/v3/users/:id', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { id } = req.params;
        const { name, role, artistAccess, pageAccess, password } = req.body;
        try {
            const user = await User.findByPk(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (name) user.name = name;
            if (role) user.role = role;
            if (artistAccess) user.artistAccess = artistAccess;
            if (pageAccess) user.pageAccess = JSON.stringify(pageAccess);
            if (password) user.passwordHash = await bcrypt.hash(password, 10);

            await user.save();
            res.json({ success: true, user: { id: user.id, email: user.email } });
        } catch (e) { logger.error('Update user failed:', e); res.status(400).json({ error: 'User update failed' }); }
    });

    // Delete User (Admin Only)
    app.delete('/v3/users/:id', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        const { id } = req.params;
        try {
            const user = await User.findByPk(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            // Prevent deleting self (simple safety)
            if (user.email === req.user.email) return res.status(400).json({ error: 'Cannot delete yourself' });

            await user.destroy();
            res.json({ success: true });
        } catch (e) { logger.error('Delete user failed:', e); res.status(400).json({ error: 'User delete failed' }); }
    });
}

module.exports = { register };
