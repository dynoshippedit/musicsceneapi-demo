/**
 * src/services/emailService.js
 *
 * Extracted verbatim from mau5trap-production-api.js (Phase 1 L257-299).
 *
 * STEP 7 (D7, 2026-09-28) — delivery acknowledgement contract:
 * sendEmail() returns true ONLY on real delivery acknowledgement: the
 * transport must resolve AND the recipient must appear in info.accepted.
 * A transport that throws, or resolves without accepting the recipient,
 * yields false. When email is not configured at all (no SMTP keys and no
 * injected transport), isConfigured() is false and sendEmail() returns
 * false without attempting delivery. The old "jsonTransport simulation
 * counts as success" behavior was retired by D7 (audit R10).
 *
 * The reset link base comes from config.email.resetLinkBase.
 */

'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../config/logger');
const profile = require('../profile');

/**
 * @param {object} [opts]
 * @param {object} [opts.transport] injected nodemailer-compatible transport (tests)
 * @param {object} [opts.emailConfig] overrides config.email ({ enabled, host, port, user, pass, from })
 * @param {object} [opts.log] injected logger (tests)
 */
function createEmailService({ transport, emailConfig, log: logFn } = {}) {
    const log = logFn || logger;
    const emailCfg = emailConfig || config.email;
    const transporter = transport || nodemailer.createTransport(
        emailCfg.enabled ? {
            host: emailCfg.host,
            port: emailCfg.port,
            secure: false,
            auth: {
                user: emailCfg.user,
                pass: emailCfg.pass
            }
        } : {
            jsonTransport: true // retained for direct transporter use; sendEmail() will not use it unconfigured
        }
    );

    /** Whether this instance can attempt delivery at all. */
    function isConfigured() {
        return !!transport || !!emailCfg.enabled;
    }

    /**
     * @returns {Promise<boolean>} true only when the transport resolved and
     *          acknowledged the recipient in info.accepted; false when
     *          unconfigured, when the transport threw, or when the
     *          recipient was not accepted.
     */
    async function sendEmail({ to, subject, html }) {
        if (!isConfigured()) {
            log.warn('[EMAIL SKIP] email not configured; delivery not attempted');
            return false;
        }
        try {
            const info = await transporter.sendMail({
                // PHASE 4CF: brand default resolved from the Label
                // Intelligence Profile when EMAIL_FROM is unset.
                from: emailCfg.from || profile.email.from,
                to,
                subject,
                html
            });

            if (info.messageId) {
                log.info(`[EMAIL SENT] MessageID: ${info.messageId} to ${to}`);
            }

            const accepted = Array.isArray(info.accepted) ? info.accepted : [];
            if (!accepted.includes(to)) {
                log.warn(`[EMAIL NOT ACCEPTED] to ${to}`);
                return false;
            }
            return true;
        } catch (err) {
            log.error('[EMAIL FAIL]', err);
            return false;
        }
    }

    /**
     * Password-reset email. HTML is byte-identical to the original template
     * (original L588-596) so recipients see no change.
     */
    async function sendPasswordReset({ to, resetToken }) {
        const resetLink = `${config.email.resetLinkBase}?token=${resetToken}`;
        return sendEmail({
            to,
            // PHASE 4CF: reset-email identity from the profile. Values for
            // mau5trap are byte-identical to the previous literals.
            subject: profile.email.resetSubject,
            html: `
                <div style="font-family: monospace; background: #000; color: #fff; padding: 20px;">
                    <h2 style="color: ${profile.email.resetHeadingColor};">PASSWORD RESET REQUIRED</h2>
                    <p>A request was received to reset the credentials for <strong>${to}</strong>.</p>
                    <p>Click the secure link below to proceed:</p>
                    <a href="${resetLink}" style="color: ${profile.email.resetLinkColor}; font-size: 16px;">${resetLink}</a>
                    <p style="margin-top: 20px; color: #666;">If you did not request this, ignore this transmission.</p>
                </div>
            `
        });
    }

    return { sendEmail, sendPasswordReset, transporter, isConfigured };
}

module.exports = createEmailService();
module.exports.createEmailService = createEmailService;
