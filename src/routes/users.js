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
        generateMonthlyReport, validateBody, profile, auditService, usageService
    } = ctx;

    // User.pageAccess is stringified JSON in a STRING column (src/models L50) — the same
    // representation GET /v3/users, POST /v3/auth/login and GET /v3/auth/me already read.
    // This is the write-side counterpart, so the admin editor round-trips.
    // pageAccess remains frontend nav/UI visibility only: no route authorizes against it.
    function serializePageAccess(value) {
        if (Array.isArray(value)) return JSON.stringify(value.filter((entry) => typeof entry === 'string'));
        if (typeof value === 'string') return value;   // already serialized by the caller
        return JSON.stringify([]);
    }

    // Create new user
    app.post('/v3/users', authenticateToken, validateBody('createUser'), async (req, res) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { email, password, name, role, artistAccess, pageAccess } = req.validatedBody;

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
                artistAccess: artistAccess || 'none',
                // PHASE 4C FIX: the `createUser` schema already accepts pageAccess, but this
                // handler destructured everything EXCEPT it, so an admin's page grants were
                // validated and then silently dropped and the row fell back to the column
                // default '["overview"]'. Stored with serializePageAccess for the same reason
                // as the PUT below: the column is a STRING holding stringified JSON.
                ...(pageAccess === undefined ? {} : { pageAccess: serializePageAccess(pageAccess) })
            });

            // PHASE 4CF: audit user creation.
            auditService.emitAudit({
                action: 'user.create',
                resourceType: 'user',
                resourceId: String(newUser.id),
                metadata: { email: newUser.email, role: newUser.role },
                req
            });

            // Response shape deliberately UNCHANGED (no pageAccess key): the stored grant is
            // read back through GET /v3/users, and echoing it here would be a response-contract
            // change requiring a snapshot re-baseline for no functional gain. The fix is the
            // persistence above, not the payload.
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
        // PHASE 4CF F-1 FIX: artistAccess joins the destructure. Previously it
        // was silently dropped while the handler still returned success:true —
        // the one artist-scoping permission could not be changed through the
        // product (Admin › Team › edit). The shadowed duplicate below has
        // always handled it; the reachable handler now persists it too.
        const { email, role, pageAccess, name, password, artistAccess } = req.body || {};

        // PHASE 4C FIX. Two defects, both reachable from the admin permission editor:
        //   1. `user.pageAccess = pageAccess` assigned a raw ARRAY to a STRING column, which
        //      Sequelize rejects with "string violation: pageAccess cannot be an array or an
        //      object". pageAccess is stringified JSON (src/models L50) and must be serialized.
        //   2. The handler had no try/catch, so that rejection escaped as an unhandled
        //      promise rejection and the process-level handler SHUT THE SERVER DOWN. Editing
        //      one user's permissions took the whole API offline.
        // The try/catch is the durable half of the fix: no future bad value can take the
        // process down, it becomes a 400 like every other write failure in this file.
        try {
            const user = await User.findByPk(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (email) user.email = email;
            if (name) user.name = name;
            if (role) user.role = role;
            if (pageAccess !== undefined) user.pageAccess = serializePageAccess(pageAccess);
            if (artistAccess !== undefined) user.artistAccess = artistAccess;
            if (password) user.passwordHash = await bcrypt.hash(password, 10);

            await user.save();
            // PHASE 4CF: audit permission/user changes (actor = requesting admin).
            auditService.emitAudit({
                action: 'user.update',
                resourceType: 'user',
                resourceId: String(user.id),
                metadata: { email: user.email, role: user.role },
                req
            });
            res.json({ success: true });
        } catch (e) {
            logger.error('Update user failed:', e);
            res.status(400).json({ error: 'User update failed' });
        }
    });

    // Delete User
    // PHASE 4CF F-2 FIX: the reachable handler previously destroyed ANY user
    // row unguarded — an admin could delete the root admin or itself (both
    // live-reproduced in the commercial recheck). The self-delete and
    // root-admin guards existed only in the SHADOWED duplicate below, which
    // Express never binds. Guards now live on the reachable handler:
    //   - nonexistent id           → 404 (matches PUT and the shadowed DELETE)
    //   - self-delete (by id)      → 400
    //   - root admin (profile)     → 403 (same message as DELETE /v3/auth/me)
    // Session revocation for a deleted user is handled by the PHASE 4CF
    // composite authenticateToken (DB revalidation), not by this handler.
    app.delete('/v3/users/:id', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        const { id } = req.params;

        try {
            const user = await User.findByPk(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            // Absolute guard first: the root admin is never deletable through
            // this route, regardless of who asks (including the root itself).
            if (user.email === profile.rootAdminEmail) {
                return res.status(403).json({ error: 'Cannot delete root admin account.' });
            }
            if (user.id === req.user.id) {
                return res.status(400).json({ error: 'Cannot delete yourself' });
            }

            await user.destroy();
            // PHASE 4CF: audit user deletion.
            auditService.emitAudit({
                action: 'user.delete',
                resourceType: 'user',
                resourceId: String(user.id),
                metadata: { email: user.email },
                req
            });
            res.json({ success: true });
        } catch (e) {
            logger.error('Delete user failed:', e);
            res.status(400).json({ error: 'User delete failed' });
        }
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
