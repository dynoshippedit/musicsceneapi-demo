/**
 * src/models/index.js
 *
 * Sequelize instance + model definitions extracted verbatim from
 * mau5trap-production-api.js L128-172, plus initDB() from L175-209.
 *
 * Preserved exactly, including:
 *   - sync({ alter: true }) on every boot (audit R4) — Phase 2 concern
 *   - pageAccess stored as stringified JSON in a STRING column (L152)
 *   - resetTokenExpiry as STRING (L155)
 *   - no associations between Artist and Stats (audit: no FK)
 *   - seeded users admin@mau5trap.com / tours@rezz.com (L188-189)
 *
 * ONE ordering bug fixed (audit R2): the original called initDB() at L212,
 * before `logger` (L221) and `labelData` (L343) were initialized. It only
 * worked because the first `await` deferred the body past module evaluation.
 * Here initDB takes its dependencies as arguments, so the latent
 * ReferenceError trap is removed without changing observable behavior.
 */

'use strict';

const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const config = require('../config');
const profile = require('../profile');

// api L128-142
let sequelize;
if (config.db.dialect === 'postgres') {
    sequelize = new Sequelize(config.db.url, {
        dialect: 'postgres',
        logging: config.db.logging
    });
} else {
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: config.db.storage,
        logging: config.db.logging
    });
}

// api L145-156
const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'viewer' }, // admin, artist, viewer
    artistAccess: { type: DataTypes.STRING, defaultValue: 'none' }, // 'all', 'none', or 'art_id'
    pageAccess: { type: DataTypes.STRING, defaultValue: '["overview"]' }, // Store as stringified JSON manually
    integrationCount: { type: DataTypes.INTEGER, defaultValue: 1 },
    resetToken: { type: DataTypes.STRING },
    resetTokenExpiry: { type: DataTypes.STRING } // SQLite date handling is strict, use String for safety
});

// api L158-163
const Artist = sequelize.define('Artist', {
    id: { type: DataTypes.STRING, primaryKey: true }, // e.g., 'art_deadmau5'
    name: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'active' }, // active, archived, developing
    data: { type: DataTypes.JSON, allowNull: false } // Stores the entire complex object
});

// api L165-172
const Stats = sequelize.define('Stats', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    platform: { type: DataTypes.STRING, allowNull: false },
    listeners: { type: DataTypes.INTEGER, defaultValue: 0 },
    streams: { type: DataTypes.BIGINT, defaultValue: 0 },
    recordedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

// ---------------------------------------------------------------------------
// PHASE 4CF — persist-or-demo contract (Objective 4): A&R submissions (store
// #1, incl. shortlist entries) and sales entries become DURABLE PRODUCT STATE.
// They were process-memory arrays that silently lost every customer write on
// restart (live-reproduced in the commercial recheck). voters is the
// per-user {userId: direction} map, stored as JSON like Artist.data.
// ---------------------------------------------------------------------------
const AnrSubmission = sequelize.define('AnrSubmission', {
    id: { type: DataTypes.STRING, primaryKey: true }, // sub_<ts> | scout_<ts> | sub_1 | sub_2
    artist: { type: DataTypes.STRING, allowNull: true },
    track: { type: DataTypes.STRING, allowNull: true },
    genre: { type: DataTypes.STRING, allowNull: true },
    url: { type: DataTypes.STRING, allowNull: true },
    imageUrl: { type: DataTypes.STRING, allowNull: true },
    followers: { type: DataTypes.INTEGER, allowNull: true },
    votes: { type: DataTypes.INTEGER, defaultValue: 0 },
    voters: { type: DataTypes.JSON, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: true },
    submittedAt: { type: DataTypes.STRING, allowNull: true }
}, { timestamps: false });

const SalesEntry = sequelize.define('SalesEntry', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    month: { type: DataTypes.STRING, allowNull: false },
    revenue: { type: DataTypes.FLOAT, allowNull: false }
}, { timestamps: false, indexes: [{ unique: true, fields: ['artistId', 'month'] }] });

// ---------------------------------------------------------------------------
// PHASE 4CF: append-only audit event table (Objective 6 — minimal audit seam).
// Fields follow the accepted minimal design: actor identity, action, resource,
// metadata, request correlation, and the ACTIVE LABEL SLUG so that the first
// owned table establishes the ownership convention for all future tables
// (owner column from day one — see COMMERCIAL_FOUNDATION_RECHECK.md §10).
// No UI, no webhooks, no event bus. sync({alter:true}) creates the table.
// ---------------------------------------------------------------------------
const AuditEvent = sequelize.define('AuditEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    labelSlug: { type: DataTypes.STRING, allowNull: false },
    actorId: { type: DataTypes.INTEGER, allowNull: true },
    actorEmail: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false },
    resourceType: { type: DataTypes.STRING, allowNull: true },
    resourceId: { type: DataTypes.STRING, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    requestId: { type: DataTypes.STRING, allowNull: true }
}, { updatedAt: false });

/**
 * Initialization and seeding — api L175-209.
 *
 * @param {object} deps
 * @param {object} deps.logger    winston logger (was a module-scope TDZ read)
 * @param {object} deps.labelData mock label data used for artist seeding
 *                                (was a module-scope TDZ read at L194-196)
 * @returns {Promise<boolean>} true if init completed, false if it errored
 *                             (original swallowed the error and continued)
 */
async function initDB({ logger, labelData } = {}) {
    try {
        await sequelize.authenticate();
        if (logger) logger.info('Database connection established.');
        await sequelize.sync({ alter: true }); // Ensure schema updates are applied

        // SEED USERS IF EMPTY — api L182-190
        // PHASE 4CF: seed identities moved to the Label Intelligence Profile
        // (profile.seedUsers). Values for the mau5trap profile are verbatim
        // (admin@mau5trap.com / tours@rezz.com with their original grants).
        const userCount = await User.count();
        if (userCount === 0) {
            if (logger) logger.info('Seeding initial users...');
            for (const seed of profile.seedUsers) {
                const passwordHash = await bcrypt.hash(seed.password, 10);
                await User.create({
                    email: seed.email,
                    passwordHash,
                    name: seed.name,
                    role: seed.role,
                    artistAccess: seed.artistAccess,
                    pageAccess: JSON.stringify(seed.pageAccess || ['overview']),
                    integrationCount: seed.integrationCount || 1
                });
            }
        }

        // SEED ARTISTS IF EMPTY — api L193-204
        // Original guarded on `typeof labelData !== 'undefined'`; that guard is
        // now an explicit argument check with identical effect.
        const artistCount = await Artist.count();
        if (artistCount === 0 && labelData && Array.isArray(labelData.artists)) {
            if (logger) logger.info('Seeding initial artists...');
            for (const artist of labelData.artists) {
                await Artist.create({
                    id: artist.id,
                    name: artist.name,
                    data: artist
                });
            }
        }

        // PHASE 4CF: seed A&R submissions from the active profile when empty
        // (mirrors artist seeding; values for mau5trap are the two original
        // seeds — sub_1 votes:15, sub_2 votes:42).
        const anrCount = await AnrSubmission.count();
        if (anrCount === 0 && profile.datasets.anr && Array.isArray(profile.datasets.anr.anrSubmissions)) {
            if (logger) logger.info('Seeding initial A&R submissions...');
            for (const seed of profile.datasets.anr.anrSubmissions) {
                await AnrSubmission.create({
                    id: seed.id,
                    artist: seed.artist,
                    track: seed.track,
                    genre: seed.genre,
                    url: seed.url,
                    votes: seed.votes,
                    status: seed.status,
                    submittedAt: seed.submittedAt,
                    voters: null
                });
            }
        }

        return true;
    } catch (error) {
        // api L206-208 — error is logged and swallowed; boot continues.
        if (logger) logger.error('Unable to connect to the database:', error);
        return false;
    }
}

module.exports = { sequelize, User, Artist, Stats, AuditEvent, AnrSubmission, SalesEntry, initDB };
