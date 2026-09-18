/**
 * src/services/auditService.js
 *
 * PHASE 4CF: minimal audit-event seam (Objective 6).
 *
 * NOT an event bus, NOT event sourcing. One append-only table (AuditEvent)
 * and one emit call used by a representative set of write handlers.
 * Every record carries the active label slug so the first owned table
 * establishes the ownership convention for future tables.
 *
 * emitAudit is FIRE-AND-FORGET: an audit failure must never turn a
 * successful business write into a 500.
 */

'use strict';

const { AuditEvent } = require('../models');
const profile = require('../profile');
const logger = require('../config/logger');

function createAuditService({ model = AuditEvent, activeProfile = profile, log = logger } = {}) {
    /**
     * @param {object} args
     * @param {string} args.action          verb, e.g. 'user.create'
     * @param {string|null} [args.resourceType]
     * @param {string|null} [args.resourceId]
     * @param {object} [args.metadata]
     * @param {object|null} [args.req]      Express request; supplies actor + requestId
     */
    function emitAudit({ action, resourceType = null, resourceId = null, metadata = {}, req = null }) {
        const record = {
            labelSlug: activeProfile.slug,
            actorId: req?.user?.id ?? null,
            actorEmail: req?.user?.email ?? null,
            action,
            resourceType,
            resourceId,
            metadata,
            requestId: req?.requestId ?? null
        };
        model.create(record).catch((err) => {
            log.error('[AUDIT] failed to persist audit event:', err);
        });
    }

    return { emitAudit };
}

module.exports = createAuditService();
module.exports.createAuditService = createAuditService;
