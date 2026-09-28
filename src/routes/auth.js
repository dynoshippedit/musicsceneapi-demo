/**
 * src/routes/auth.js
 *
 * Authentication endpoints.
 *
 * STEP 7 (D7, signed off 2026-09-28): the password-reset flow is SHIPPED.
 * POST /v3/auth/reset-password redeems the token minted by forgot-password.
 * Reset tokens are stored as SHA-256 digests (never plaintext); invalid,
 * expired, and consumed tokens share one controlled 400 with no enumeration
 * oracle; redemption is single-winner under concurrency; a successful reset
 * bumps sessionVersion (revoking all existing sessions) and emits a
 * user.password_reset audit event.
 *
 * Routes (6):
 *   POST   /v3/auth/login
 *   POST   /v3/auth/forgot-password
 *   POST   /v3/auth/reset-password
 *   DELETE /v3/auth/me
 *   GET    /v3/auth/me
 *   POST   /v3/auth/change-password
 */

'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');

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
        cache, emailService, sendEmail, entityAuditService, auditService,
        artistRepo, labelData, getArtistData, getAllArtists,
        operationsRepo, operationsData,
        prospects, anrSubmissions, anrState, userIntegrations, salesData, apiCache,
        aiService, performLinearRegression, generateSyntheticHistory,
        integrationFacade, fetchArtistData, getIntegrationStatus, SERVICES, limiters,
        generateMonthlyReport, profile
    } = ctx;

    // -- STEP 7 helpers -----------------------------------------------------

    /** SHA-256 hex digest. Reset tokens are stored digested, never plaintext. */
    function sha256Hex(value) {
        return crypto.createHash('sha256').update(value).digest('hex');
    }

    /**
     * New-password policy: string, at least 8 characters, at most 72 bytes
     * (bcrypt's input limit — longer inputs would be silently truncated).
     */
    function validNewPassword(pw) {
        return typeof pw === 'string'
            && pw.length >= 8
            && Buffer.byteLength(pw, 'utf8') <= 72;
    }

    /** Fire-and-forget: an audit failure must never break the request. */
    function emitPasswordResetAudit(userId) {
        try {
            if (auditService && typeof auditService.emitAudit === 'function') {
                auditService.emitAudit({
                    action: 'user.password_reset',
                    resourceType: 'user',
                    resourceId: String(userId)
                });
            }
        } catch (_) { /* audit is advisory */ }
    }

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
            try {
                let user = await User.findOne({ where: { email } });
                if (!user) user = await User.create({ email, name: 'Admin', role: 'admin', artistAccess: 'all',
                    pageAccess: JSON.stringify(['all']), passwordHash: await bcrypt.hash(password, 10), integrationCount: 10 });
                if (user.role !== 'admin') return res.status(403).json({ error: 'Admin override is not allowed for this account' });
                // STEP 7: deactivated accounts cannot authenticate, even via override.
                if (!user.active) return res.status(401).json({ error: 'Invalid credentials' });
                // STEP 7: the bootstrap credential only opens the account while
                // it IS the account's password. Once the password has been
                // changed, the old bootstrap secret must not bypass it — fall
                // through to the normal credential check, which rejects it.
                if (await bcrypt.compare(adminPass, user.passwordHash)) {
                    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, artistAccess: user.artistAccess,
                        integrationCount: user.integrationCount, sessionVersion: user.sessionVersion || 0 }, JWT_SECRET, { expiresIn: '24h' });
                    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role,
                        artistAccess: user.artistAccess, pageAccess: parsePageAccess(user.pageAccess) } });
                }
                // Password was changed: the bootstrap secret no longer applies.
                // Fall through to the standard login path below.
            } catch (err) {
                logger.error('Admin login failed:', err);
                return res.status(503).json({ error: 'Login is temporarily unavailable' });
            }
        }

        try {
            const user = await User.findOne({ where: { email } });
            if (!user) return res.status(401).json({ error: 'Invalid credentials' });

            // STEP 7: deactivated accounts cannot log in. Same 401 as a bad
            // password, so deactivation is not enumerable.
            if (!user.active) return res.status(401).json({ error: 'Invalid credentials' });

            const match = await bcrypt.compare(password, user.passwordHash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            // Parse pageAccess (shared parser; see parsePageAccess above)
            const parsedPageAccess = parsePageAccess(user.pageAccess);

            // JWT IDENTITY FIX (Phase 3): include the user's primary key `id`
            // claim. The previous payload omitted it, so req.user.id was
            // undefined and GET /v3/auth/me, GDPR delete, change-password and
            // per-user integration state were all broken.
            //
            // STEP 7: the payload also carries sessionVersion so the auth
            // middleware can revoke every session on password reset/change.
            const token = jwt.sign({
                id: user.id,
                email: user.email,
                role: user.role,
                artistAccess: user.artistAccess,
                integrationCount: user.integrationCount,
                sessionVersion: user.sessionVersion || 0
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
    //
    // STEP 7: the token is stored as a SHA-256 digest (never plaintext), and a
    // failed email delivery clears the pending token so no unusable-but-live
    // token lingers. The response stays generic either way.
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

            const resetToken = crypto.randomBytes(32).toString('hex');
            user.resetToken = sha256Hex(resetToken);
            user.resetTokenExpiry = String(Date.now() + 3600000); // 1 hour
            await user.save();

            const resetLink = `${config.email.resetLinkBase}?token=${resetToken}`;

            const delivered = await sendEmail({
                to: email,
                // PHASE 4CF: reset-email identity from the Label Intelligence
                // Profile (values byte-identical for pulsegrid).
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

            if (!delivered) {
                // The token never reached the user; leave no live token behind.
                // The response stays generic (no enumeration oracle).
                user.resetToken = null;
                user.resetTokenExpiry = null;
                await user.save();
            }

            res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
        } catch (err) {
            logger.error('Forgot Password error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Password Reset Redemption (STEP 7 — D7 signed off 2026-09-28)
    //
    // Public route. The request carries the raw token from the email link; the
    // database holds only its SHA-256 digest. Invalid, expired, and consumed
    // tokens share ONE controlled 400 — there is no oracle distinguishing
    // them. Redemption is single-winner under concurrency: the UPDATE only
    // succeeds for the request that still sees the digest, so exactly one of
    // simultaneous redemptions gets a 200. Success bumps sessionVersion
    // (every existing session stops working) and emits user.password_reset.
    app.post('/v3/auth/reset-password', async (req, res) => {
        const { token, newPassword } = req.body || {};
        const fail = () => res.status(400).json({ error: 'Invalid or expired reset token' });

        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !validNewPassword(newPassword)) {
            return fail();
        }

        try {
            const digest = sha256Hex(token);
            const user = await User.findOne({ where: { resetToken: digest } });
            if (!user || !user.active || !(Number(user.resetTokenExpiry) > Date.now())) {
                return fail();
            }

            const passwordHash = await bcrypt.hash(newPassword, 10);
            const [affected] = await User.update({
                passwordHash,
                resetToken: null,
                resetTokenExpiry: null,
                sessionVersion: sequelize.literal('"sessionVersion" + 1'),
                version: sequelize.literal('"version" + 1')
            }, {
                where: {
                    id: user.id,
                    resetToken: digest,
                    resetTokenExpiry: { [Op.gt]: String(Date.now()) }
                }
            });

            // 0 rows: another request consumed the token first (or it expired
            // between the read and the write). Same controlled 400.
            if (affected !== 1) return fail();

            emitPasswordResetAudit(user.id);
            return res.json({ message: 'Password has been reset. Please sign in again.' });
        } catch (err) {
            logger.error('Reset password failed:', err);
            return res.status(503).json({ error: 'Password reset is temporarily unavailable' });
        }
    });

    // GDPR: Delete Account
    app.delete('/v3/auth/me', authenticateToken, async (req, res) => {
        try {
            const user = await User.findByPk(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

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
    //
    // STEP 7: the new password is validated (min 8 chars, max 72 bytes);
    // success bumps sessionVersion (all other sessions stop working),
    // invalidates any pending reset token, and bumps the version counter.
    app.post('/v3/auth/change-password', authenticateToken, async (req, res) => {
        const { currentPassword, newPassword } = req.body || {};

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password required' });
        }
        if (!validNewPassword(newPassword)) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        try {
            const user = await User.findByPk(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);

            if (!validPassword) {
                return res.status(401).json({ error: 'Current password incorrect' });
            }

            user.passwordHash = await bcrypt.hash(newPassword, 10);
            user.sessionVersion = (user.sessionVersion || 0) + 1;
            user.version = (user.version || 0) + 1;
            user.resetToken = null;
            user.resetTokenExpiry = null;
            await user.save();
            res.json({ message: 'Password changed successfully' });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}

module.exports = { register };
