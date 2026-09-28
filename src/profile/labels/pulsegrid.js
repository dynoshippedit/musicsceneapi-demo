/** BRAND SPLIT (strategy 2026-09-28): the PRODUCT is "The Music Scene"; "Pulsegrid" is the fictional demo label whose roster ships with the demo. Product-facing strings (osName, serviceName, banner, email, AI) use the product name; label-facing strings (slug, labelName, domain, seed emails, search context) stay Pulsegrid.
 * Pulsegrid profile — the fictional demo label. See BRAND SPLIT note above.
 *
 * PHASE 4CF (Commercial Foundation): every value in this file was moved
 * VERBATIM out of generic backend code (routes, services, config, jobs).
 * Nothing label-specific was removed or diluted — the boundary exists so
 * that generic code reads `activeProfile.<field>` instead of a module-level
 * literal. A second label adds a new profile module and selects it via
 * LABEL_PROFILE / LABEL_SLUG / ACTIVE_LABEL; generic source is never edited.
 *
 * Rule: this module is DATA ONLY. It may require datasets and dotenv, but
 * must never require config, logger, models, services, routes, or jobs
 * (config → profile would be a load-order cycle).
 */

'use strict';

require('dotenv').config();

// The roster dataset. Required synchronously so that artistRepository,
// initDB seeding and the route context bundle keep their current
// module-load semantics (see src/repositories/artistRepository.js:34).
const roster = require('../../../mock/artistData');

module.exports = {
    // ------------------------------------------------------------------ meta
    slug: 'pulsegrid',
    labelName: 'Pulsegrid',                     // human label identity (banner uses identity.bannerTitle)
    productName: 'The Music Scene',          // PRODUCT brand; the demo label above is fictional
    osName: 'The Music Scene',
    osVersion: 'v5.0',
    serviceName: 'the-music-scene-api',               // logger defaultMeta (was literal)

    // -------------------------------------------------------------------- db
    db: {
        // Preferred SQLite filename for this label. Operative default lives
        // in src/config (process.env.DB_STORAGE || 'pulsegrid_v5.sqlite').
        sqliteFile: 'pulsegrid_v5.sqlite'
    },

    // ---------------------------------------------- identity / authorization
    // Was a hardcoded authorization rule in src/routes/auth.js:173.
    rootAdminEmail: 'admin@pulsegrid.fm',

    identity: {
        // Startup banner (server.js). Verbatim, including the "Multi-Tenant
        // Access Control Enabled" line — see PHASE_4CF doc (marketing-claim
        // debt, preserved until a product decision changes the copy).
        bannerTitle: 'The Music Scene API',
        bannerSubtitle: 'Multi-Tenant Access Control Enabled',
        bannerFeatures: [
            'User Authentication (JWT)',
            'Role-Based Access Control',
            'Monthly Report Generation',
            'Auto-Printing Enabled'
        ]
    },

    // ------------------------------------------------------------- seed users
    // Seeded by src/models/index.js when the User table is empty. Passwords
    // are demo credentials (documented commercial debt; rotation is a
    // before-pilot item).
    seedUsers: [
        {
            email: 'admin@pulsegrid.fm',
            password: 'admin123',
            name: 'Admin User',
            role: 'admin',
            artistAccess: 'all',
            pageAccess: ['all'],
            integrationCount: 10,
            bannerLabel: 'Full access'
        },
        {
            email: 'tours@novakin.band',
            password: 'novakin123',
            name: 'Vera Kessler',
            role: 'artist',
            artistAccess: 'art_novakin',
            pageAccess: ['overview', 'roster'],
            integrationCount: 5,
            bannerLabel: 'NOVAKIN only'
        }
    ],

    // ----------------------------------------------------------------- email
    email: {
        from: '"The Music Scene" <notify@pulsegrid.fm>',
        resetSubject: 'The Music Scene - Password Reset Request',
        resetHeadingColor: '#00ff00',
        resetLinkColor: '#00ff00'
    },

    // -------------------------------------------------------------------- ai
    ai: {
        // src/ai/prompts.js system prompt (pinned byte-for-byte).
        systemContext: 'AI analyst for The Music Scene. Concise, data-driven insights.',
        // src/ai/aiService.js + src/routes/ai.js dev fallback (single source now).
        devFallback: '[Dev Fallback] Growth is stable at 2.5%. Recommend increasing tour frequency in EU.',
        keywordInsights: {
            // Composed as `${bestRoi.name} has the highest ROI at ${bestRoi.roi}x. ${roiSecondPlace}`
            roiSecondPlace: 'NOVAKIN is second at 8.7x.',
            // {artist} is the roster-order-dependent artists[1] read — semantics preserved.
            touringAdvice: 'Suggest increasing ticket prices for {artist} to match demand.',
            growthContext: 'This aligns with the viral TikTok trend observed last week.',
            defaultInsight: "I've analyzed the label metrics. Overall revenue is up 15% YoY. Would you like a breakdown by genre?"
        },
        // GET /v3/artists/:id/development canned insights ({artist} interpolated).
        developmentInsights: [
            "{artist}'s streaming growth is outpacing the genre average by 15%.",
            'Strong engagement in South America suggests potential for a Q3 tour leg.',
            'Merch sales per listener are lower than expected; strictly limit supply for next drop.'
        ],
        developmentFocusAreas: ['TikTok Content', 'LATAM Tour', 'Limited Merch']
    },

    // --------------------------------------------------------- search context
    searchContext: {
        // Google-KG contextual fallback prefix.
        artistQueryPrefix: 'pulsegrid ',
        // KG tertiary fallback in modules/entityAudit.js.
        tertiaryQueryPrefix: 'pulsegrid artist '
    },

    // ----------------------------------------------------- knowledge sources
    knowledgeSources: {
        fandom: {
            host: 'https://pulsegrid.fandom.com',
            rosterPage: 'Pulsegrid',
            labelWikiPath: '/wiki/Pulsegrid',
            labelWikiTitle: 'Pulsegrid (Wiki)',
            // Section-detection keywords of the Pulsegrid Fandom roster parser.
            sectionKeywords: {
                current: 'Current',
                former: ['Former', 'Previous'],
                artists: 'Artists'
            }
        },
        wikipedia: {
            labelPage: 'Pulsegrid',
            fallbackSummary: 'Pulsegrid is a fictional independent electronic music label used as a demo dataset for label operations software. All artists, releases and figures are invented.',
            fallbackThumbnail: 'https://example.com/pulsegrid-logo.png',
            categoryKeywords: ['musician', 'DJ', 'electronic music', 'music producer']
        },
        discogs: {
            labelUrl: 'https://www.discogs.com/label/000000-Pulsegrid-Records'
        },
        http: {
            wikiUserAgent: 'PulsegridIntelligence/1.0 (admin@pulsegrid.fm)',
            discogsUserAgent: 'pulsegrid-api/1.0',
            labelBotUserAgent: 'PulsegridBot/1.0 (bot@pulsegrid.fm)',
            musicbrainzUserAgent: 'TheMusicScene/1.0 (admin@pulsegrid.fm)',
            wikidataUserAgent: 'TheMusicScene/1.0 (admin@pulsegrid.fm)'
        },
        defaultGenre: 'Electronic Music'
    },

    // --------------------------------------------------------- social mappings
    // Was ARTIST_MAPPINGS in integrations/index.js (2 of 8 artists covered;
    // the rest fall back to mock — documented residual).
    socialMappings: {
        art_lumenveil: {
            spotifyId: '0000000000000000000001',
            instagramName: 'lumenveil',
            ticketmasterName: 'LUMEN VEIL',
            youtubeChannelId: 'UC0000000000000000000001',
            twitterHandle: 'lumenveil',
            tiktokUsername: '@lumenveil'
        },
        art_novakin: {
            spotifyId: '0000000000000000000002',
            instagramName: 'novakinmusic',
            ticketmasterName: 'NOVAKIN',
            youtubeChannelId: 'UC0000000000000000000002',
            twitterHandle: 'novakinmusic',
            tiktokUsername: '@novakinmusic'
        }
    },

    // -------------------------------------------------------------------- anr
    anr: {
        defaultGenre: 'Electronic',
        benchmarkArtist: 'LUMEN VEIL',
        evaluate: {
            prospectNames: { p1: 'Neon Horizon' },
            unknownProspectName: 'Unknown Artist',
            similarityCopy: 'AI analysis indicates {prospect} shares 82% sonic similarity with the benchmark.',
            projectedRevenue: { y1: 150000, y2: 450000, y3: 1200000 },
            risks: ['High competition in genre', 'Limited touring history'],
            recommendedDeal: '360 Deal / 50-50 Split'
        }
    },

    // --------------------------------------------------------------- reports
    reports: {
        pdfTitle: 'Pulsegrid Intelligence Report',             // src/routes/reports.js
        generatedBy: 'Generated by Pulsegrid OS v5.0',         // src/routes/reports.js
        monthlyHeader: 'Pulsegrid',                            // src/reports/monthlyReport.js
        monthlySubheader: 'INTELLIGENCE REPORT',
        accentColor: '#00FF00',
        confidentialLine: 'PULSEGRID INTELLIGENCE • CONFIDENTIAL'
    },

    // ---------------------------------------------------------------- charts
    charts: {
        accent: '#00FF00',
        accentSoft: 'rgba(0, 255, 0, 0.2)',
        piePalette: ['#00FF00', '#1a1a1a', '#666666', '#999999', '#cccccc', '#333333'],
        donutPalette: ['#00FF00', '#333333'],
        projectionAccent: '#00FF5F'                           // analytics.js borderColor
    },

    // --------------------------------------------------------------- datasets
    datasets: {
        roster,
        // Fan demographics fixture (was inline in src/routes/label.js).
        demographics: {
            age: [
                { range: '18-24', value: 35 },
                { range: '25-34', value: 45 },
                { range: '35-44', value: 15 },
                { range: '45+', value: 5 }
            ],
            gender: [
                { label: 'Male', value: 55 },
                { label: 'Female', value: 42 },
                { label: 'Other', value: 3 }
            ],
            locations: [
                { city: 'Los Angeles', country: 'USA', value: 120000 },
                { city: 'London', country: 'UK', value: 85000 },
                { city: 'Toronto', country: 'Canada', value: 60000 },
                { city: 'Berlin', country: 'Germany', value: 45000 },
                { city: 'Sydney', country: 'Australia', value: 30000 }
            ],
            platformGrowth: [
                { platform: 'Spotify', growth: 12.5 },
                { platform: 'TikTok', growth: 28.4 },
                { platform: 'Instagram', growth: 5.2 },
                { platform: 'YouTube', growth: 8.1 }
            ]
        },
        // A&R demo seeds (was inline in src/repositories/inMemoryStores.js).
        anr: {
            prospects: [
                { id: 'p1', name: 'Neon Horizon', genre: 'Progressive House', listeners: 12000, engagement: 15000, matchScore: 95, socialGrowth: '+15%' },
                { id: 'p2', name: 'Glitch Protocol', genre: 'Techno', listeners: 8500, engagement: 9000, matchScore: 88, socialGrowth: '+22%' },
                { id: 'p3', name: 'Analog Soul', genre: 'Deep House', listeners: 45000, engagement: 55000, matchScore: 72, socialGrowth: '+5%' },
                { id: 'p4', name: 'Cyber Breath', genre: 'Progressive House', listeners: 15000, engagement: 18000, matchScore: 91, socialGrowth: '+12%' },
                { id: 'p5', name: 'System 404', genre: 'Techno', listeners: 2000, engagement: 2500, matchScore: 60, socialGrowth: '+8%' },
                { id: 'p6', name: 'Velvet Coding', genre: 'Electronica', listeners: 32000, engagement: 40000, matchScore: 85, socialGrowth: '+30%' }
            ],
            anrSubmissions: [
                {
                    id: 'sub_1',
                    artist: 'Ghost Data',
                    track: 'Void Walker',
                    genre: 'Synthwave',
                    url: 'https://soundcloud.com/ghost-data/void-walker',
                    votes: 15,
                    status: 'pending',
                    submittedAt: new Date().toISOString()
                },
                {
                    id: 'sub_2',
                    artist: 'Neon Relay',
                    track: 'Sunspot',
                    genre: 'Techno',
                    url: 'https://open.spotify.com/track/0abcdef123456',
                    votes: 42,
                    status: 'shortlisted',
                    submittedAt: new Date().toISOString()
                }
            ],
            anrState: {
                whiteboard: 'Currently Reviewing: Q1 2026 Compilation Submissions.\nFocus: Tech House / Minimal.',
                nowListening: {
                    url: 'https://soundcloud.com/pulsegrid/example-demo',
                    updatedBy: 'novakin',
                    timestamp: new Date().toISOString()
                },
                demos: [
                    { id: 'demo1', title: 'Analog Dreams', artist: 'Unknown Producer', ratings: [], submittedBy: 'admin', status: 'reviewing' },
                    { id: 'demo2', title: 'Cyberpunk Bass', artist: 'Neon Glitch', ratings: [], submittedBy: 'novakin', status: 'high-priority' },
                    { id: 'demo3', title: 'Deep Space', artist: 'Void Walker', ratings: [], submittedBy: 'admin', status: 'new' }
                ]
            }
        },
        // A&R scout fixtures (was inline in src/integrations/scoutService.js).
        scouts: [
            { spotifyId: 's_k5', name: 'K5', image: 'https://i.scdn.co/image/ab67616d0000b273b5', followers: 12500, popularity: 45, genres: ['techno', 'dark ambient'], url: 'https://open.spotify.com/artist/k5' },
            { spotifyId: 's_neon', name: 'Neon Flux', image: null, followers: 48200, popularity: 62, genres: ['bass house', 'electro'], url: 'https://open.spotify.com/artist/neonflux' },
            { spotifyId: 's_cyber', name: 'Cyber Mode', image: null, followers: 8200, popularity: 38, genres: ['industrial', 'midtempo'], url: 'https://open.spotify.com/artist/cybermode' },
            { spotifyId: 's_analog', name: 'Analog Soul', image: null, followers: 22100, popularity: 55, genres: ['prog house', 'melodic techno'], url: 'https://open.spotify.com/artist/analogsoul' }
        ],
        // Operations fixtures (was inline in src/repositories/operationsRepository.js).
        operations: {
            logistics: [
                { id: 1, item: 'Pulsegrid Helmet Replica (Gen 4)', quantity: 150, status: 'In Transit', vendor: 'Fourthwall', tracking: 'FW123456789', eta: '2025-12-18', location: 'Los Angeles Warehouse' },
                { id: 2, item: 'Tour Tee (GLASSWOLFE)', quantity: 800, status: 'Stocked', vendor: 'Printful', tracking: 'PF987654321', eta: null, location: 'EU Fulfillment Center' },
                { id: 3, item: 'NOVAKIN Visor Replica', quantity: 45, status: 'Low Stock', vendor: 'Merchbar', tracking: 'MB456789123', eta: null, location: 'Toronto Warehouse' }
            ],
            assets: [
                { id: 1, title: 'LUMEN VEIL - Halide (Master WAV)', type: 'Audio Master', artist: 'LUMEN VEIL', uploaded: '2024-03-15', size: '248 MB', status: 'Approved' },
                { id: 2, title: 'NOVAKIN - Surge (Official Video)', type: 'Video', artist: 'NOVAKIN', uploaded: '2025-01-10', size: '1.8 GB', status: 'Processing' },
                { id: 3, title: 'GLASSWOLFE - Album Artwork Pack', type: 'Artwork', artist: 'GLASSWOLFE', uploaded: '2025-02-20', size: '89 MB', status: 'Approved' }
            ],
            contracts: [
                { id: 1, artist: 'LUMEN VEIL', type: 'Master Recording', signedDate: '2018-06-01', term: 'Perpetuity', advance: '$0', recoupable: null, royaltyRate: '50%', status: 'Active', nextMilestone: null },
                { id: 2, artist: 'NOVAKIN', type: 'Exclusive Recording', signedDate: '2022-11-15', term: '3 Albums', advance: '$150k', recoupable: '$120k remaining', royaltyRate: 'Standard', status: 'Active', nextMilestone: 'Album 3 Q2 2026' },
                { id: 3, artist: 'GLASSWOLFE', type: 'Single Deal + Option', signedDate: '2024-08-20', term: '2+2', advance: '$40k', recoupable: 'Fully Recouped', royaltyRate: '18%', status: 'Active', nextMilestone: 'Option Mar 2026' }
            ]
        }
    }
};
