/**
 * src/finance/reviewState.js
 *
 * Review state machine for financial records (2026-09-28, research
 * correction).
 *
 * States:
 *   reported    — imported/pulled, not yet reviewed (default)
 *   reconciled  — a reviewer matched it to supporting evidence
 *   approved    — an authorized reviewer signed it off
 *   disputed    — a reviewer flagged it; carries evidence of the dispute
 *   estimated   — amount is an estimate, not source-backed (flagged, never
 *                 silently treated as exact)
 *   superseded  — replaced by a revised record (terminal; set only by the
 *                 supersede mechanism, never by direct transition)
 *
 * Every transition records reviewer identity (reviewedBy), supporting
 * evidence (reviewEvidence), and a timestamp (reviewedAt). Deterministic
 * calculations and authorized human reviewers control final amounts —
 * nothing here auto-approves.
 */

'use strict';

const REVIEW_STATES = ['reported', 'reconciled', 'approved', 'disputed', 'estimated', 'superseded'];

// from -> allowed targets. 'superseded' is absent as a target on purpose:
// only the import supersede path may set it.
const ALLOWED_TRANSITIONS = {
    reported: ['reconciled', 'disputed', 'estimated'],
    reconciled: ['approved', 'disputed'],
    approved: ['disputed'],
    disputed: ['reconciled', 'reported'],
    estimated: ['reconciled', 'disputed'],
    superseded: []
};

function isReviewState(s) {
    return REVIEW_STATES.includes(s);
}

/** True if a record may move from `from` to `to` via the review API. */
function canTransition(from, to) {
    if (!isReviewState(from) || !isReviewState(to)) return false;
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

/**
 * Apply a review transition to a Sequelize record. Throws on invalid
 * transitions. Returns the record.
 */
function applyTransition(record, to, reviewer, evidence) {
    const from = record.reviewState || 'reported';
    if (!canTransition(from, to)) {
        throw new Error(`invalid review transition: ${from} -> ${to}`);
    }
    if (!reviewer || !String(reviewer).trim()) {
        throw new Error('reviewer identity is required');
    }
    record.reviewState = to;
    record.reviewedBy = String(reviewer).trim();
    record.reviewEvidence = evidence ? String(evidence) : null;
    record.reviewedAt = new Date();
    return record;
}

/** States whose records count toward reconciliation totals. */
const COUNTED_STATES = ['reported', 'reconciled', 'approved', 'disputed', 'estimated'];

function isCounted(reviewState) {
    return COUNTED_STATES.includes(reviewState || 'reported');
}

module.exports = {
    REVIEW_STATES,
    ALLOWED_TRANSITIONS,
    COUNTED_STATES,
    isReviewState,
    canTransition,
    applyTransition,
    isCounted
};
