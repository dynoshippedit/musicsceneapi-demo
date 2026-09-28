// Persistent models. Startup runs explicit migrations, then creates missing tables.
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
    resetTokenExpiry: { type: DataTypes.STRING }, // SQLite date handling is strict, use String for safety
    // STEP 7 (D7): bumped on password reset/change to revoke every session
    sessionVersion: { type: DataTypes.INTEGER, defaultValue: 0 },
    // STEP 7 (D7): credential-change counter
    version: { type: DataTypes.INTEGER, defaultValue: 0 },
    // STEP 7 (D7): deactivated accounts cannot authenticate
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
});

// api L158-163
const Artist = sequelize.define('Artist', {
    id: { type: DataTypes.STRING, primaryKey: true }, // e.g., 'art_lumenveil'
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

// Room and Scouting have separate durable models and vote semantics.
const RoomDemo = sequelize.define('RoomDemo', {
    id: { type: DataTypes.STRING, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    artist: { type: DataTypes.STRING, allowNull: false },
    url: { type: DataTypes.TEXT, allowNull: true },
    genre: { type: DataTypes.STRING, allowNull: true },
    submittedBy: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'new' }
});
const RoomVote = sequelize.define('RoomVote', {
    demoId: { type: DataTypes.STRING, primaryKey: true },
    userId: { type: DataTypes.INTEGER, primaryKey: true }
}, { timestamps: false });
const RoomSetting = sequelize.define('RoomSetting', {
    key: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.JSON, allowNull: false }
}, { timestamps: false });
const Campaign = sequelize.define('Campaign', {
    id: { type: DataTypes.STRING, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    artistId: { type: DataTypes.STRING, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    platforms: { type: DataTypes.JSON, allowNull: false },
    plan: { type: DataTypes.JSON, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'draft' }
});

// ---------------------------------------------------------------------------
// PHASE 4CF: append-only audit event table (Objective 6 — minimal audit seam).
// Fields follow the accepted minimal design: actor identity, action, resource,
// metadata, request correlation, and the ACTIVE LABEL SLUG so that the first
// owned table establishes the ownership convention for all future tables
// (owner column from day one — see COMMERCIAL_FOUNDATION_RECHECK.md §10).
// No UI, no webhooks, no event bus. sync() creates an absent table.
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
        await require('./migrations').repairSalesSchema(sequelize);
        await require('./migrations').addUserSecurityColumns(sequelize);
        await sequelize.sync(); // Create absent tables; existing schema changes use explicit migrations.

        // SEED USERS IF EMPTY — api L182-190
        // PHASE 4CF: seed identities moved to the Label Intelligence Profile
        // (profile.seedUsers). Values for the pulsegrid profile are verbatim
        // (admin@pulsegrid.fm / tours@novakin.band with their original grants).
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

        // Phase 2 (2026-09-28): seed a small FICTIONAL demo catalog so the
        // royalty import has keys to match. Demo ISRCs use the unassigned
        // "ZZ" country code; demo UPCs use an 88888 prefix. artistId is a
        // plain string (no FK) so seed order never matters.
        const recordingCount = await Recording.count();
        if (recordingCount === 0) {
            if (logger) logger.info('Seeding demo catalog...');
            const rec1 = await Recording.create({
                artistId: 'art_novakin', title: 'Neon Skyline',
                isrc: 'ZZAAA2600001', durationMs: 214000, releaseDate: '2026-06-01'
            });
            await Recording.create({
                artistId: 'art_novakin', title: 'Glass Horizon',
                isrc: 'ZZAAA2600002', durationMs: 187000, releaseDate: '2026-06-01'
            });
            await Recording.create({
                artistId: 'art_lumenveil', title: 'Violet Static',
                isrc: 'ZZBAA2600001', durationMs: 203000, releaseDate: '2026-08-15'
            });
            await Release.create({
                artistId: 'art_novakin', title: 'Neon Skyline EP',
                upc: '888880000001', releaseDate: '2026-06-01', type: 'ep'
            });
            const work1 = await Work.create({
                artistId: 'art_novakin', title: 'Neon Skyline (composition)',
                credits: [{ name: 'Mara Voss', role: 'songwriter' }, { name: 'Juno Park', role: 'producer' }]
            });
            await WorkRecording.create({ workId: work1.id, recordingId: rec1.id });
            await RoyaltyLine.create({
                artistId: 'art_novakin', recordingId: rec1.id, amountCents: 12500,
                currency: 'USD', period: '2026-08', source: 'demo seed', importedBy: 'seed'
            });
        }

        // PHASE 4CF: seed A&R submissions from the active profile when empty
        // (mirrors artist seeding; values for pulsegrid are the two original
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

        // The marker prevents deleted room records from being reseeded on restart.
        if (!await RoomSetting.findByPk('initialized')) {
            await sequelize.transaction(async transaction => {
                const room = profile.datasets.anr?.anrState || {};
                for (const demo of room.demos || []) {
                    const { ratings, ...data } = demo;
                    await RoomDemo.findOrCreate({ where: { id: data.id }, defaults: data, transaction });
                    for (const rating of ratings || []) {
                        const voter = await User.findOne({ where: { email: rating.user }, transaction });
                        if (voter) await RoomVote.findOrCreate({ where: { demoId: data.id, userId: voter.id }, transaction });
                    }
                }
                await RoomSetting.upsert({ key: 'whiteboard', value: room.whiteboard || '' }, { transaction });
                await RoomSetting.upsert({ key: 'nowListening', value: room.nowListening || {} }, { transaction });
                await RoomSetting.create({ key: 'initialized', value: true }, { transaction });
            });
        }

        return true;
    } catch (error) {
        // Return failure; the entrypoint refuses to listen after a failed initialization.
        if (logger) logger.error('Unable to connect to the database:', error);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Stripe billing (2026-09-28): per-label subscription state. One row per label
// slug (dedicated-instance deployment seam — each label instance points at
// its own database, so the row is keyed by the active profile slug). Tracks
// the Stripe customer id, the subscription id, its lifecycle status, the end
// of the current billing period, and whether the one-time setup fee was paid.
// The checkout session id supports per-label checkout idempotency: an open
// session is reused instead of opening a second one. sync() creates an
// absent table; no explicit migration needed (new table, no column changes).
// ---------------------------------------------------------------------------
const Subscription = sequelize.define('Subscription', {
    labelSlug: { type: DataTypes.STRING, primaryKey: true },
    stripeCustomerId: { type: DataTypes.STRING, allowNull: true },
    stripeSubscriptionId: { type: DataTypes.STRING, allowNull: true },
    checkoutSessionId: { type: DataTypes.STRING, allowNull: true },
    // none | incomplete | trialing | active | past_due | canceled
    status: { type: DataTypes.STRING, defaultValue: 'none' },
    setupFeePaid: { type: DataTypes.BOOLEAN, defaultValue: false },
    currentPeriodEnd: { type: DataTypes.DATE, allowNull: true }
});


// ---------------------------------------------------------------------------
// Phase 2 (2026-09-28): per-artist OAuth, catalog entities, royalty lines.
// sync() creates absent tables; no explicit migration needed (new tables).
// ---------------------------------------------------------------------------
const ArtistOAuth = sequelize.define('ArtistOAuth', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    provider: { type: DataTypes.STRING, allowNull: false }, // spotify|instagram|tiktok|youtube|twitter
    accessTokenEnc: { type: DataTypes.TEXT, allowNull: false }, // AES-256-GCM, see src/oauth/tokenCrypto.js
    refreshTokenEnc: { type: DataTypes.TEXT, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    scopes: { type: DataTypes.STRING, allowNull: true },
    providerUserId: { type: DataTypes.STRING, allowNull: true }
}, { indexes: [{ unique: true, fields: ['artistId', 'provider'] }] });

const Recording = sequelize.define('Recording', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    isrc: { type: DataTypes.STRING, allowNull: false, unique: true }, // 12 chars, uppercase
    durationMs: { type: DataTypes.INTEGER, allowNull: true },
    releaseDate: { type: DataTypes.STRING, allowNull: true } // SQLite date handling is strict, use String
});

const Release = sequelize.define('Release', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    upc: { type: DataTypes.STRING, allowNull: false, unique: true }, // 12 digits
    releaseDate: { type: DataTypes.STRING, allowNull: true },
    type: { type: DataTypes.STRING, defaultValue: 'single' } // single|ep|album
});

const Work = sequelize.define('Work', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    credits: { type: DataTypes.JSON, allowNull: true } // [{ name, role }]
});

const WorkRecording = sequelize.define('WorkRecording', {
    workId: { type: DataTypes.INTEGER, primaryKey: true },
    recordingId: { type: DataTypes.INTEGER, primaryKey: true }
});

const RoyaltyLine = sequelize.define('RoyaltyLine', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    recordingId: { type: DataTypes.INTEGER, allowNull: true },
    releaseId: { type: DataTypes.INTEGER, allowNull: true },
    amountCents: { type: DataTypes.INTEGER, allowNull: false }, // integer cents, NEVER float
    currency: { type: DataTypes.STRING, allowNull: false }, // 3-letter ISO, uppercase
    period: { type: DataTypes.STRING, allowNull: false }, // e.g. '2026-09'
    source: { type: DataTypes.STRING, allowNull: true },
    importedBy: { type: DataTypes.STRING, allowNull: true }
});

module.exports = { sequelize, User, Artist, Stats, AuditEvent, AnrSubmission, SalesEntry, RoomDemo, RoomVote, RoomSetting, Campaign, Subscription, ArtistOAuth, Recording, Release, Work, WorkRecording, RoyaltyLine, initDB };
