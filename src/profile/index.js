/**
 * src/profile/index.js
 *
 * PHASE 4CF: Active Label Intelligence Profile resolution.
 *
 * The commercial model is DEDICATED DEPLOYMENT PER LABEL: one process, one
 * database, one active profile. Full shared multi-tenancy is deliberately NOT
 * implemented — the profile is the ownership root, not a tenant registry.
 *
 * Selection: LABEL_SLUG (or ACTIVE_LABEL) env → src/profile/labels/<slug>.js.
 * Unset or unknown falls back to 'mau5trap' (the reference profile) — the
 * fallback preserves every existing default and test.
 *
 * Load-order rule (see labels/mau5trap.js): profiles are DATA ONLY. They may
 * require dotenv and datasets; they must never require config, logger, models,
 * services or routes.
 */

'use strict';

const path = require('path');

function resolveProfile() {
    // Lowercased so labels/mau5trap.js resolves for MAU5TRAP-style env values.
    const raw = (process.env.LABEL_SLUG || process.env.ACTIVE_LABEL || 'mau5trap').trim().toLowerCase();
    // Sanitize: slugs are the filename of a data module in labels/. Anything
    // outside [a-z0-9-] cannot name a real profile AND could not escape the
    // directory via path traversal once validated.
    const slug = /^[a-zA-Z0-9-]{1,64}$/.test(raw) ? raw : 'mau5trap';
    const profilePath = path.join(__dirname, 'labels', `${slug}.js`);

    try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const profile = require(profilePath);
        if (!profile || typeof profile !== 'object') {
            throw new Error(`Profile ${slug} did not export an object`);
        }
        return profile;
    } catch (err) {
        // eslint-disable-next-line global-require
        const fallback = require('./labels/mau5trap');
        // eslint-disable-next-line no-console
        console.error(`[profile] label profile '${slug}' unavailable (${err.message}); falling back to 'mau5trap'`);
        return fallback;
    }
}

const activeProfile = resolveProfile();

module.exports = activeProfile;
module.exports.resolveProfile = resolveProfile;
module.exports.ACTIVE_LABEL_SLUG = activeProfile.slug;
