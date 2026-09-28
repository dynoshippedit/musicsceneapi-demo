'use strict';

/**
 * src/integrations/wikipedia.fixtures.js
 *
 * TEST-ONLY deterministic Wikipedia fixtures. Loaded ONLY when the
 * FIXTURE_WIKIPEDIA=1 environment variable is set (snapshot probe runs).
 * Never used in production, demo, or the visual gate.
 *
 * Why: the snapshot probe boots a real server and compares responses
 * byte-for-byte against a saved baseline. A live Wikipedia call makes that
 * comparison depend on network access and rate limits (HTTP 429 in CI
 * containers flips `wikipedia` to null and fails the suite). These fixtures
 * mirror the real auditWikipedia() return shape so the probe exercises the
 * enrichment plumbing deterministically, with zero network.
 *
 * The LUMEN VEIL entry mirrors the REAL bad match Wikipedia returns for the
 * fictional act (the mythology article "Veil of Isis", musicRelated=false),
 * so the probe verifies that the artist route REJECTS non-music matches
 * instead of attaching a bogus bio.
 */

module.exports = {
    'LUMEN VEIL': {
        status: 'verified',
        exists: true,
        pageId: 49872116,
        title: 'Veil of Isis',
        url: 'https://en.wikipedia.org/wiki/Veil_of_Isis',
        lastEdited: '2024-06-01T00:00:00Z',
        categories: ['Category:Egyptian mythology', 'Category:Metaphors referring to art'],
        musicRelated: false,
        externalLinks: 3,
        hasInfobox: false,
        bioShort: "The veil of Isis is a metaphor and allegorical artistic motif representing the inaccessibility of nature's secrets, personified as the goddess Isis shrouded by a veil or mantle.",
        thumbnail: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/Auguste_Puttemans_Isis_2.jpg/330px-Auguste_Puttemans_Isis_2.jpg'
    },
    'NOVAKIN': {
        status: 'not_found',
        exists: false,
        message: 'No Wikipedia page found for "NOVAKIN"'
    }
};
