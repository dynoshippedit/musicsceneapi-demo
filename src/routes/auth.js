/**
 * src/routes/auth.js
 *
 * Authentication endpoints. PRESERVED CRITICAL-1: the admin-override branch in
 * POST /v3/auth/login compares undefined === undefined when ADMIN_EMAIL/ADMIN_PASS
 * are unset, so an empty JSON body yields an admin token. PRESERVED: no
 * POST /v3/auth/reset-password route exists, so the token minted by
 * forgot-password can never be redeemed.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (5):
 *   POST   /v3/auth/login
 *   POST   /v3/auth/forgot-password
 *   DELETE /v3/auth/me
 *   GET    /v3/auth/me
 *   POST   /v3/auth/change-password
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
        generateMonthlyReport, profile
    } = ctx;

    // pageAccess (pre-Phase-4C Decision 1): User.pageAccess is stringified
    // JSON in a STRING column (models L50; seeds: admin ["all"], artist
    // ["overview","roster"]). One parser shared by the DB login path and
    // GET /v3/auth/me so both carry the same array shape the admin-override
    // login already returns. Parsing/fallback is exactly the original inline
    // login expression. Frontend nav/UI visibility ONLY — backend route
    // authorization never consults this field.
    function parsePageAccess(raw) {
        try {
            const parsed = JSON.parse(raw || '["overview"]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    // Login Endpoint
    app.post('/v3/auth/login', async (req, res) => {
        const { email, password } = req.body || {};

        // CRITICAL-1 FIX (Phase 3): reject a missing/empty email/password up
        // front with 401. Previously an empty body reached User.findOne({email:
        // undefined}) and threw, or — worse — matched the unset admin override
        // and minted an admin token. Now it is a clean invalid-credentials.
        if (!email || !password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Admin Override
        // CRITICAL-1 FIX (Phase 3): the override is only considered when BOTH
        // ADMIN_EMAIL and ADMIN_PASS are non-empty.
        const adminEmail = config.adminEmail;
        const adminPass = config.adminPass;
        if (adminEmail && adminPass && email === adminEmail && password === adminPass) {
            const token = jwt.sign({ email, role: 'admin', artistAccess: 'all', integrationCount: 10 }, JWT_SECRET, { expiresIn: '24h' });
            return res.json({
                token,
                user: { name: 'Admin', email, role: 'admin', pageAccess: ['all'] }
            });
        }

        try {
            const user = await User.findOne({ where: { email } });
            if (!user) return res.status(401).json({ error: 'Invalid credentials' });

            const match = await bcrypt.compare(password, user.passwordHash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            // Parse pageAccess (shared parser; see parsePageAccess above)
            const parsedPageAccess = parsePageAccess(user.pageAccess);

            // JWT IDENTITY FIX (Phase 3): include the user's primary key `id`
            // claim. The previous payload omitted it, so req.user.id was
            // undefined and GET /v3/auth/me, GDPR delete, change-password and
            // per-user integration state were all broken.
            const token = jwt.sign({
                id: user.id,
                email: user.email,
                role: user.role,
                artistAccess: user.artistAccess,
                integrationCount: user.integrationCount
            }, JWT_SECRET, { expiresIn: '24h' });

            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    artistAccess: user.artistAccess,
                    pageAccess: parsedPageAccess
                }
            });
        } catch (e) {
            logger.error(e);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Forgot Password (Real Email)
    // MEDIUM-8 FIX (Phase 3): no user enumeration. Unknown emails now return the
    // SAME generic 200 as a valid request, instead of 404 "User not found".
    app.post('/v3/auth/forgot-password', async (req, res) => {
        try {
            const { email } = req.body;
            // Reject a missing email up front (MEDIUM-8 fix) rather than
            // querying User.findOne({email: undefined}) and throwing.
            if (!email) {
                return res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
            }
            const user = await User.findOne({ where: { email } });
            if (!user) {
                // Same response as the success path, so an attacker cannot
                // distinguish a registered address from an unregistered one.
                return res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
            }

            const resetToken = require('crypto').randomBytes(32).toString('hex');
            user.resetToken = resetToken;
            user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
            await user.save();

            const resetLink = `${config.email.resetLinkBase}?token=${resetToken}`;

            await sendEmail({
                to: email,
                // PHASE 4CF: reset-email identity from the Label Intelligence
                // Profile (values byte-identical for mau5trap).
                subject: profile.email.resetSubject,
                html: `
                    <div style="font-family: monospace; background: #000; color: #fff; padding: 20px;">
                        <h2 style="color: ${profile.email.resetHeadingColor};">PASSWORD RESET REQUIRED</h2>
                        <p>A request was received to reset the credentials for <strong>${email}</strong>.</p>
                        <p>Click the secure link below to proceed:</p>
                        <a href="${resetLink}" style="color: ${profile.email.resetLinkColor}; font-size: 16px;">${resetLink}</a>
                        <p style="margin-top: 20px; color: #666;">If you did not request this, ignore this transmission.</p>
                    </div>
                `
            });

            res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
        } catch (err) {
            logger.error('Forgot Password error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // GDPR: Delete Account
    app.delete('/v3/auth/me', authenticateToken, async (req, res) => {
        try {
            const user = await User.findByPk(req.user.id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            // Prevent deleting the main admin for safety in this demo.
            // PHASE 4CF: the root-admin email now comes from the Label
            // Intelligence Profile instead of a hardcoded literal.
            if (user.email === profile.rootAdminEmail) {
                return res.status(403).json({ error: 'Cannot delete root admin account.' });
            }

            await user.destroy();
            // In production, also cascade delete related data or anonymize logs

            res.json({ success: true, message: 'Account permanently deleted.' });
        } catch (err) {
            logger.error('GDPR Delete error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get current user info
    app.get('/v3/auth/me', authenticateToken, async (req, res) => {
        try {
            const user = await User.findByPk(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                artistAccess: user.artistAccess,
                pageAccess: parsePageAccess(user.pageAccess)
            });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Change password
    app.post('/v3/auth/change-password', authenticateToken, async (req, res) => {
        const { currentPassword, newPassword } = req.body || {};

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password required' });
        }

        try {
            const user = await User.findByPk(req.user.id);
            const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);

            if (!validPassword) {
                return res.status(401).json({ error: 'Current password incorrect' });
            }

            user.passwordHash = await bcrypt.hash(newPassword, 10);
            await user.save();
            res.json({ message: 'Password changed successfully' });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}

module.exports = { register };
