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
// Provider sync executions (2026-09-28, audit gap 5): durable history for
// every provider synchronization run — idempotency key (unique),
// duplicate-execution protection, per-attempt history, bounded retries,
// terminal status (running|succeeded|failed|blocked|fixture), timestamps,
// and a SANITIZED error summary (sanitizeErrorSummary in
// src/jobs/providerSync.js strips credential-shaped text before
// persistence; tokens must never land in this table).
// ---------------------------------------------------------------------------
const ProviderSyncExecution = sequelize.define('ProviderSyncExecution', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    idempotencyKey: { type: DataTypes.STRING, allowNull: false, unique: true },
    provider: { type: DataTypes.STRING, allowNull: false }, // spotify|stripe
    kind: { type: DataTypes.STRING, allowNull: false }, // artist-stats|sales-pull
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'running' },
    attempt: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
    triggeredBy: { type: DataTypes.STRING, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    finishedAt: { type: DataTypes.DATE, allowNull: true },
    errorSummary: { type: DataTypes.TEXT, allowNull: true },
    attempts: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    fixture: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    resultSummary: { type: DataTypes.JSON, allowNull: true }
}, {
    indexes: [
        { fields: ['provider', 'status'] },
        { fields: ['startedAt'] }
    ]
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

// Merch settlements (atVenu nightly-settlement style exports). Money is
// integer cents + ISO currency, same discipline as RoyaltyLine. One row =
// one settled show for one artist. Idempotency key:
// (artistId, showDate, venue, source) -- re-importing a settlement file can
// never double-count a show.
const MerchSettlement = sequelize.define('MerchSettlement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    showDate: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM-DD
    venue: { type: DataTypes.STRING, allowNull: false },
    grossCents: { type: DataTypes.INTEGER, allowNull: false }, // integer cents, NEVER float
    feesCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    taxesCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    netCents: { type: DataTypes.INTEGER, allowNull: false }, // integer cents, NEVER float
    currency: { type: DataTypes.STRING, allowNull: false }, // 3-letter ISO, uppercase
    attendance: { type: DataTypes.INTEGER, allowNull: true },
    source: { type: DataTypes.STRING, allowNull: false, defaultValue: 'atvenu' },
    importedBy: { type: DataTypes.STRING, allowNull: true },
    // Provenance + review state machine (research correction 2026-09-28).
    // atVenu's contract is integer cents, so the source precision IS cents;
    // the hash/row/version prove WHICH file the row came from.
    sourceFileHash: { type: DataTypes.STRING, allowNull: true },
    rowRef: { type: DataTypes.STRING, allowNull: true },
    importVersion: { type: DataTypes.STRING, allowNull: true },
    reviewState: { type: DataTypes.STRING, allowNull: false, defaultValue: 'reported' },
    reviewedBy: { type: DataTypes.STRING, allowNull: true },
    reviewEvidence: { type: DataTypes.TEXT, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    supersedesId: { type: DataTypes.INTEGER, allowNull: true }
}, {
    // Idempotency + supersede: same dedup key plus the source file hash.
    // Same file -> duplicate rejection; revised file -> supersede.
    indexes: [
        { unique: true, name: 'merch_settlements_artist_show_venue_hash', fields: ['artistId', 'showDate', 'venue', 'source', 'sourceFileHash'] }
    ]
});

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
 * @param {boolean} deps.demoMode when true, seed the fictional Pulsegrid
 *                                demo data (users, artists, catalog, A&R,
 *                                room demos). When false/omitted, a fresh
 *                                database boots with ZERO fictional records
 *                                and no known demo logins — the operator
 *                                bootstraps the first admin via
 *                                ADMIN_EMAIL/ADMIN_PASS. (2026-09-28, audit
 *                                gap 2: customer/demo mode separation.)
 * @returns {Promise<boolean>} true if init completed, false if it errored
 *                             (original swallowed the error and continued)
 */
async function initDB({ logger, labelData, demoMode = false } = {}) {
    try {
        await sequelize.authenticate();
        if (logger) logger.info('Database connection established.');
        await require('./migrations').repairSalesSchema(sequelize);
        await require('./migrations').addUserSecurityColumns(sequelize);
        await require('./migrations').addRoyaltyDedupColumns(sequelize);
        await require('./migrations').addMonthlyCloseColumns(sequelize);
        await sequelize.sync(); // Create absent tables; existing schema changes use explicit migrations.

        // ------------------------------------------------------------------
        // DEMO SEEDING GATE (2026-09-28, audit gap 2). Everything below this
        // line is FICTIONAL demo content (Pulsegrid users, artists, catalog,
        // A&R seeds, room demos). It runs ONLY when demoMode is explicitly
        // true (DEMO_MODE=true). A customer boot (demoMode false) leaves a
        // fresh database completely empty: no fictional users, artists, or
        // catalog rows, and no known demo logins. The operator's first admin
        // is bootstrapped via ADMIN_EMAIL/ADMIN_PASS at first login
        // (src/routes/auth.js), not via seeded credentials.
        // ------------------------------------------------------------------
        if (demoMode) {
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
                artistId: 'art_novakin', catalogKey: 'ZZAAA2600001', recordingId: rec1.id, amountCents: 12500,
                amountDecimal: '125.00', amountScale: 2, sourceAmount: '12500',
                currency: 'USD', period: '2026-08', source: 'demo seed', importedBy: 'seed',
                sourceFileHash: 'seed', rowRef: 'seed row 1', importVersion: 'seed-v1'
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
        } // end demoMode seeding gate

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
    catalogKey: { type: DataTypes.STRING, allowNull: false }, // uppercased ISRC or UPC — dedup key
    recordingId: { type: DataTypes.INTEGER, allowNull: true },
    releaseId: { type: DataTypes.INTEGER, allowNull: true },
    // Money: source precision is preserved EXACTLY (research correction
    // 2026-09-28). amountDecimal/amountScale hold the source amount as a
    // scaled integer (never float); sourceAmount is the original string.
    // amountCents is the settlement/payment BOUNDARY value only:
    // round-half-up(amountDecimal, 2), applied once per aggregate, never
    // per line. (DDEX DSR uses decimal fields; 1M lines x $0.003 = $3,000
    // that line-level cent rounding would zero.)
    amountDecimal: { type: DataTypes.STRING, allowNull: true },
    amountScale: { type: DataTypes.INTEGER, allowNull: true },
    sourceAmount: { type: DataTypes.STRING, allowNull: true },
    amountCents: { type: DataTypes.INTEGER, allowNull: false }, // boundary value ONLY — see above
    currency: { type: DataTypes.STRING, allowNull: false }, // 3-letter ISO, uppercase
    period: { type: DataTypes.STRING, allowNull: false }, // e.g. '2026-09'
    source: { type: DataTypes.STRING, allowNull: true }, // '' when the CSV left it blank (never NULL from imports)
    importedBy: { type: DataTypes.STRING, allowNull: true },
    // Provenance (research correction 2026-09-28): every imported line
    // carries its source file hash, row reference, and import version.
    sourceFileHash: { type: DataTypes.STRING, allowNull: true }, // SHA-256 hex of the source file
    rowRef: { type: DataTypes.STRING, allowNull: true }, // e.g. 'line 2'
    importVersion: { type: DataTypes.STRING, allowNull: true }, // import batch id
    // Review state machine (research correction 2026-09-28): reported ->
    // reconciled -> approved, plus disputed / estimated / superseded.
    // Every transition records reviewer identity + evidence.
    reviewState: { type: DataTypes.STRING, allowNull: false, defaultValue: 'reported' },
    reviewedBy: { type: DataTypes.STRING, allowNull: true },
    reviewEvidence: { type: DataTypes.TEXT, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    supersedesId: { type: DataTypes.INTEGER, allowNull: true }, // the record this one supersedes
    // Statement identity (2026-09-28 fix 1): every imported line belongs to
    // the statement (source file) it arrived in. Unit-level supersede works
    // on statements, not rows — a revised file supersedes the prior
    // statement AND every active line in it, as one unit.
    statementId: { type: DataTypes.INTEGER, allowNull: true },
    // Row-content hash: SHA-256 over the canonicalized row values
    // (catalogKey, exact amount, currency, period, source). Only
    // byte/content-identical rows within one statement are duplicates —
    // a second legitimate line for the same recording/period/source
    // (territory, rights-type, or rate-tier split) imports normally.
    rowHash: { type: DataTypes.STRING, allowNull: true }
}, {
    // Statement + row identity (2026-09-28 fix 1). The OLD unique index on
    // (catalogKey, period, source, sourceFileHash) was the defect: it made
    // the database itself reject legitimate second lines for the same
    // recording/period/source. Dedup now lives on the full row-content
    // hash inside the import transaction; this index is a plain lookup.
    indexes: [
        { name: 'royalty_lines_statement', fields: ['statementId'] },
        { name: 'royalty_lines_artist_period', fields: ['artistId', 'period'] }
    ]
});

// ---------------------------------------------------------------------------
// Direct sales (2026-09-28): the LABEL's own payment accounts (Stripe
// Connect, test mode) + label-managed product/price -> artist mappings.
// sync() creates absent tables; no explicit migration needed (new tables).
//
// This is NOT the platform's subscription billing (Subscription model
// above, src/billing/stripeClient.js). These tables read the LABEL's OWN
// sales so the label sees its direct sales per managed artist.
// ---------------------------------------------------------------------------
const PaymentConnection = sequelize.define('PaymentConnection', {
    provider: { type: DataTypes.STRING, primaryKey: true }, // 'stripe'
    accountId: { type: DataTypes.STRING, allowNull: false }, // provider's account id
    displayName: { type: DataTypes.STRING, allowNull: true },
    accessTokenEnc: { type: DataTypes.TEXT, allowNull: false }, // AES-256-GCM, see src/oauth/tokenCrypto.js
    refreshTokenEnc: { type: DataTypes.TEXT, allowNull: true },
    livemode: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // always false: TEST MODE ONLY
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'connected' }, // connected|error
    connectedBy: { type: DataTypes.STRING, allowNull: true },
    connectedAt: { type: DataTypes.DATE, allowNull: true },
    lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    lastSyncError: { type: DataTypes.STRING, allowNull: true }
});

// One row = one provider sale, normalized to integer cents + ISO currency.
// Idempotency key: (provider, providerSaleId) — re-pulling can never
// double-count; refunds update the original row in place.
// Stripe's API reports integer cents natively, so the source precision IS
// cents here. Review state tracks reconciliation against payouts.
const DirectSale = sequelize.define('DirectSale', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider: { type: DataTypes.STRING, allowNull: false, defaultValue: 'stripe' },
    providerSaleId: { type: DataTypes.STRING, allowNull: false }, // e.g. Stripe charge id
    artistId: { type: DataTypes.STRING, allowNull: true }, // null = unattributed (reported, never guessed)
    amountCents: { type: DataTypes.INTEGER, allowNull: false }, // gross, integer cents, NEVER float
    amountRefundedCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    netCents: { type: DataTypes.INTEGER, allowNull: false }, // amountCents - amountRefundedCents
    currency: { type: DataTypes.STRING, allowNull: false }, // 3-letter ISO, uppercase
    status: { type: DataTypes.STRING, allowNull: false }, // succeeded|refunded|partially_refunded
    occurredAt: { type: DataTypes.DATE, allowNull: true },
    productIds: { type: DataTypes.JSON, allowNull: true },
    priceIds: { type: DataTypes.JSON, allowNull: true },
    description: { type: DataTypes.STRING, allowNull: true },
    rawMetadata: { type: DataTypes.JSON, allowNull: true }, // provider record snapshot (provenance)
    importedBy: { type: DataTypes.STRING, allowNull: true },
    reviewState: { type: DataTypes.STRING, allowNull: false, defaultValue: 'reported' },
    reviewedBy: { type: DataTypes.STRING, allowNull: true },
    reviewEvidence: { type: DataTypes.TEXT, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true }
}, {
    indexes: [
        { unique: true, name: 'direct_sales_provider_sale', fields: ['provider', 'providerSaleId'] },
        { name: 'direct_sales_artist', fields: ['artistId'] }
    ]
});

// Label-managed attribution: provider product/price metadata -> artist.
// matchType: charge_metadata ("key:value" against the sale's metadata),
// price_id, product_id.
const ArtistPaymentMapping = sequelize.define('ArtistPaymentMapping', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider: { type: DataTypes.STRING, allowNull: false, defaultValue: 'stripe' },
    matchType: { type: DataTypes.STRING, allowNull: false },
    matchValue: { type: DataTypes.STRING, allowNull: false },
    artistId: { type: DataTypes.STRING, allowNull: false },
    note: { type: DataTypes.STRING, allowNull: true },
    createdBy: { type: DataTypes.STRING, allowNull: true }
}, {
    indexes: [
        { unique: true, name: 'payment_mappings_provider_match', fields: ['provider', 'matchType', 'matchValue'] }
    ]
});

// ---------------------------------------------------------------------------
// Monthly close (2026-09-28): statement identity, manual adjustments, cash
// evidence, commission contracts, expected reports, mapping history.
// sync() creates absent tables; existing DBs are upgraded by the explicit
// migration addMonthlyCloseColumns in src/models/migrations.js.
// ---------------------------------------------------------------------------

// RoyaltyStatement: one row per imported statement file. Identity is
// (source, period, sourceFileHash): the same file re-uploaded is rejected
// as a duplicate; a revised file for the same (source, period) supersedes
// the prior statement AND every active line in it, as one unit. Lines carry
// statementId; the statement links back via supersedesId.
const RoyaltyStatement = sequelize.define('RoyaltyStatement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
    period: { type: DataTypes.STRING, allowNull: false }, // e.g. '2026-09'
    sourceFileHash: { type: DataTypes.STRING, allowNull: false }, // SHA-256 hex of the uploaded file
    originalFilename: { type: DataTypes.STRING, allowNull: true },
    formatHash: { type: DataTypes.STRING, allowNull: true }, // SHA-256 of normalized header (mapping history)
    rowCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // lines imported with this statement
    mappingVersion: { type: DataTypes.INTEGER, allowNull: true }, // SourceMapping version used for this import
    importVersion: { type: DataTypes.STRING, allowNull: false },
    importedBy: { type: DataTypes.STRING, allowNull: true },
    importedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' }, // active | superseded
    supersedesId: { type: DataTypes.INTEGER, allowNull: true } // the statement this one replaced
}, {
    indexes: [
        { unique: true, name: 'royalty_statements_source_period_hash', fields: ['source', 'period', 'sourceFileHash'] },
        { name: 'royalty_statements_source_period', fields: ['source', 'period', 'status'] }
    ]
});
RoyaltyStatement.hasMany(RoyaltyLine, { as: 'lines', foreignKey: 'statementId' });
RoyaltyLine.belongsTo(RoyaltyStatement, { as: 'statement', foreignKey: 'statementId' });

// ManualAdjustment: the old manual LogSaleForm entry, rebuilt as a labeled
// manual adjustment inside the common financial pipeline. Integer cents —
// NEVER float — with provenance (enteredBy, enteredAt) and the same review
// state machine as every other income category. Feeds reconciliation and
// the dashboard KPIs; nothing float-based touches the KPI path.
const ManualAdjustment = sequelize.define('ManualAdjustment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    month: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM, the period this adjustment belongs to
    amountCents: { type: DataTypes.INTEGER, allowNull: false }, // integer cents, may be negative; NEVER float
    currency: { type: DataTypes.STRING, allowNull: false }, // 3-letter ISO, uppercase
    note: { type: DataTypes.STRING, allowNull: true },
    source: { type: DataTypes.STRING, allowNull: false, defaultValue: 'manual' },
    enteredBy: { type: DataTypes.STRING, allowNull: true },
    enteredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reviewState: { type: DataTypes.STRING, allowNull: false, defaultValue: 'reported' },
    reviewedBy: { type: DataTypes.STRING, allowNull: true },
    reviewEvidence: { type: DataTypes.TEXT, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true }
}, {
    indexes: [
        { name: 'manual_adjustments_artist_month', fields: ['artistId', 'month'] }
    ]
});

// Payout: money the provider sent to the label's bank. Persisted by the
// direct-sales sync (idempotent on provider+providerPayoutId). CASH EVIDENCE
// of income already reported in statements — never additional income.
// Matched to a BankDeposit by a human reviewer (matchedBy/At/Note);
// matching never auto-approves. Unmatched payouts stay visible as
// unresolved cash items.
const Payout = sequelize.define('Payout', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider: { type: DataTypes.STRING, allowNull: false, defaultValue: 'stripe' },
    providerPayoutId: { type: DataTypes.STRING, allowNull: false }, // e.g. Stripe payout id
    amountCents: { type: DataTypes.INTEGER, allowNull: false }, // integer cents, NEVER float
    currency: { type: DataTypes.STRING, allowNull: false }, // 3-letter ISO, uppercase
    arrivalAt: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: true }, // provider status (paid, pending, failed, ...)
    payoutType: { type: DataTypes.STRING, allowNull: true },
    syncedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    syncedBy: { type: DataTypes.STRING, allowNull: true },
    matchedDepositId: { type: DataTypes.INTEGER, allowNull: true },
    matchedAt: { type: DataTypes.DATE, allowNull: true },
    matchedBy: { type: DataTypes.STRING, allowNull: true },
    matchNote: { type: DataTypes.TEXT, allowNull: true }
}, {
    indexes: [
        { unique: true, name: 'payouts_provider_payout', fields: ['provider', 'providerPayoutId'] }
    ]
});

// BankDeposit: money the label recorded as received in its bank account.
// Recorded by a human with provenance (enteredBy). A deposit MATCHED to a
// payout is cash evidence of the same income — never additional income
// (no double-counting). An UNMATCHED deposit is an unresolved item, never
// silently added to income.
const BankDeposit = sequelize.define('BankDeposit', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    amountCents: { type: DataTypes.INTEGER, allowNull: false }, // integer cents, NEVER float
    currency: { type: DataTypes.STRING, allowNull: false }, // 3-letter ISO, uppercase
    bankRef: { type: DataTypes.STRING, allowNull: false }, // bank statement reference
    description: { type: DataTypes.STRING, allowNull: true },
    depositAt: { type: DataTypes.DATE, allowNull: true },
    enteredBy: { type: DataTypes.STRING, allowNull: true },
    matchedPayoutId: { type: DataTypes.INTEGER, allowNull: true },
    matchedAt: { type: DataTypes.DATE, allowNull: true },
    matchedBy: { type: DataTypes.STRING, allowNull: true },
    matchNote: { type: DataTypes.TEXT, allowNull: true }
}, {
    indexes: [
        { name: 'bank_deposits_bank_ref', fields: ['bankRef'] }
    ]
});

// CashGapAnnotation: human-owned follow-up on a computed cash difference
// (reported income vs cash received, per period+currency). The numbers are
// always computed deterministically; the annotation carries who owns the
// gap and what happens next. AI never approves or closes gaps.
const CashGapAnnotation = sequelize.define('CashGapAnnotation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    gapKey: { type: DataTypes.STRING, allowNull: false }, // e.g. '2026-09|USD'
    period: { type: DataTypes.STRING, allowNull: false },
    currency: { type: DataTypes.STRING, allowNull: false },
    owner: { type: DataTypes.STRING, allowNull: true },
    nextAction: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'open' }, // open | resolved
    updatedBy: { type: DataTypes.STRING, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true }
}, {
    indexes: [
        { unique: true, name: 'cash_gap_annotations_key', fields: ['gapKey'] }
    ]
});

// CommissionContract: the contract basis for a commission worksheet,
// stored as DATA on the artist/team — never inferred by AI. rateBps is
// integer basis points (1500 = 15.00%) so the calculation is exact.
// basis names a deterministic base (see src/finance/commission.js:
// counted_net_income | counted_gross_income | cash_receipts); exclusions is
// a JSON object of category/source keys excluded from the base.
// sourceDescription records WHERE the contract terms came from.
const CommissionContract = sequelize.define('CommissionContract', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artistId: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: true },
    rateBps: { type: DataTypes.INTEGER, allowNull: false }, // basis points, exact
    basis: { type: DataTypes.STRING, allowNull: false }, // counted_net_income | counted_gross_income | cash_receipts
    effectiveFrom: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM-DD
    effectiveTo: { type: DataTypes.STRING, allowNull: true }, // YYYY-MM-DD, null = open-ended
    exclusions: { type: DataTypes.JSON, allowNull: true }, // { categories: [...], royaltySources: [...] }
    sourceDescription: { type: DataTypes.TEXT, allowNull: true }, // where the terms came from
    enteredBy: { type: DataTypes.STRING, allowNull: true }
}, {
    indexes: [
        { name: 'commission_contracts_artist', fields: ['artistId'] }
    ]
});

// ExpectedReport: the expected-report calendar. Per customer/label, which
// statements are expected (source, period, expected-by date). The
// reconciliation flags an expected report with no matching active statement
// as an EVIDENCE GAP — shown, never auto-filled. A changed schema hash or
// unexplained variance is flagged the same way.
const ExpectedReport = sequelize.define('ExpectedReport', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customer: { type: DataTypes.STRING, allowNull: false },
    labelName: { type: DataTypes.STRING, allowNull: true },
    period: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM the report is expected for
    expectedBy: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM-DD
    source: { type: DataTypes.STRING, allowNull: false, defaultValue: 'royalty' },
    expectedSchemaHash: { type: DataTypes.STRING, allowNull: true }, // expected column-layout hash
    notes: { type: DataTypes.STRING, allowNull: true },
    enteredBy: { type: DataTypes.STRING, allowNull: true }
}, {
    indexes: [
        { unique: true, name: 'expected_reports_customer_source_period', fields: ['customer', 'source', 'period'] }
    ]
});

// SourceMapping: mapping history for messy source files. When a reviewer
// approves the field mapping for a source's column layout, the mapping is
// persisted with a version + evidence. A repeat import with the same column
// signature (headerHash) reuses the approved mapping; a changed column
// layout never silently inherits it — the import is flagged for re-review.
const SourceMapping = sequelize.define('SourceMapping', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source: { type: DataTypes.STRING, allowNull: false },
    mappingVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    formatHash: { type: DataTypes.STRING, allowNull: true }, // SHA-256 of normalized header (mapping identity)
    headerHash: { type: DataTypes.STRING, allowNull: false }, // dedup identity for the column layout
    columnMapping: { type: DataTypes.JSON, allowNull: true }, // logical field -> actual column name
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'seen' }, // seen | approved
    approvedBy: { type: DataTypes.STRING, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    evidence: { type: DataTypes.TEXT, allowNull: true },
    supersededBy: { type: DataTypes.INTEGER, allowNull: true },
    importedBy: { type: DataTypes.STRING, allowNull: true }
}, {
    indexes: [
        { unique: true, name: 'source_mappings_source_header', fields: ['source', 'headerHash'] }
    ]
});

module.exports = { sequelize, User, Artist, Stats, ProviderSyncExecution, AuditEvent, AnrSubmission, SalesEntry, RoomDemo, RoomVote, RoomSetting, Campaign, Subscription, ArtistOAuth, Recording, Release, Work, WorkRecording, RoyaltyLine, RoyaltyStatement, MerchSettlement, PaymentConnection, DirectSale, ArtistPaymentMapping, ManualAdjustment, Payout, BankDeposit, CashGapAnnotation, CommissionContract, ExpectedReport, SourceMapping, initDB };
