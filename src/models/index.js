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
        const userCount = await User.count();
        if (userCount === 0) {
            if (logger) logger.info('Seeding initial users...');
            const adminHash = await bcrypt.hash('admin123', 10);
            const artistHash = await bcrypt.hash('rezz123', 10);

            await User.create({
                email: 'admin@mau5trap.com', passwordHash: adminHash, name: 'Admin User',
                role: 'admin', artistAccess: 'all',
                pageAccess: JSON.stringify(['all']), integrationCount: 10
            });
            await User.create({
                email: 'tours@rezz.com', passwordHash: artistHash, name: 'Isabelle Rezazadeh',
                role: 'artist', artistAccess: 'art_rezz',
                pageAccess: JSON.stringify(['overview', 'roster']), integrationCount: 5
            });
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

        return true;
    } catch (error) {
        // api L206-208 — error is logged and swallowed; boot continues.
        if (logger) logger.error('Unable to connect to the database:', error);
        return false;
    }
}

module.exports = { sequelize, User, Artist, Stats, initDB };
