/**
 * src/services/emailService.js
 *
 * Extracted verbatim from mau5trap-production-api.js (Phase 1 L257-299).
 *
 * PRESERVED DEFECT (audit R10): when no SMTP_HOST / SENDGRID_API_KEY is set,
 * nodemailer is configured with `jsonTransport: true`, which only logs the
 * message. sendEmail() still returns `true`, so every caller believes the mail
 * was delivered. That is the current behavior and is preserved — the password
 * reset flow depends on this returning truthy in local development.
 *
 * PRESERVED DEFECT: the reset link base is hardcoded to
 * http://localhost:8080/reset-password (original L583). It now comes from
 * config.email.resetLinkBase, which carries the same literal default.
 */

'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../config/logger');
const profile = require('../profile');

function createEmailService({ transport } = {}) {
    const transporter = transport || nodemailer.createTransport(
        config.email.enabled ? {
            host: config.email.host,
            port: config.email.port,
            secure: false,
            auth: {
                user: config.email.user,
                pass: config.email.pass
            }
        } : {
            jsonTransport: true // Logs to console if no keys provided
        }
    );

    /**
     * @returns {Promise<boolean>} true on send OR on simulated send; false only
     *          when the transport threw.
     */
    async function sendEmail({ to, subject, html }) {
        try {
            const info = await transporter.sendMail({
                // PHASE 4CF: brand default resolved from the Label
                // Intelligence Profile when EMAIL_FROM is unset.
                from: config.email.from || profile.email.from,
                to,
                subject,
                html
            });

            if (info.messageId) {
                logger.info(`[EMAIL SENT] MessageID: ${info.messageId} to ${to}`);
            } else {
                // JSON Transport Fallback — console output preserved verbatim.
                console.log('---------------------------------------------------');
                console.log(`[EMAIL SIMULATION] To: ${to} | Subject: ${subject}`);
                console.log('Body:', html);
                console.log('---------------------------------------------------');
            }
            return true;
        } catch (err) {
            logger.error('[EMAIL FAIL]', err);
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

    return { sendEmail, sendPasswordReset, transporter };
}

module.exports = createEmailService();
module.exports.createEmailService = createEmailService;
