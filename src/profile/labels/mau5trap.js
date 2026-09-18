/**
 * mau5trap — default / reference Label Intelligence Profile.
 *
 * PHASE 4CF (Commercial Foundation): every value in this file was moved
 * VERBATIM out of generic backend code (routes, services, config, jobs).
 * Nothing mau5trap-specific was removed or diluted — the boundary exists so
 * that generic code reads `activeProfile.<field>` instead of a module-level
 * literal. A second label adds a new profile module and selects it via
 * LABEL_SLUG / ACTIVE_LABEL; generic source is never edited.
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
    slug: 'mau5trap',
    labelName: 'mau5trap',                     // human label identity (banner uses identity.bannerTitle)
    osName: 'mau5trap OS',
    osVersion: 'v5.0',
    serviceName: 'mau5trap-api',               // logger defaultMeta (was literal)

    // -------------------------------------------------------------------- db
    db: {
        // Preferred SQLite filename for this label. Operative default lives
        // in src/config (process.env.DB_STORAGE || 'mau5trap_v5.sqlite').
        sqliteFile: 'mau5trap_v5.sqlite'
    },

    // ---------------------------------------------- identity / authorization
    // Was a hardcoded authorization rule in src/routes/auth.js:173.
    rootAdminEmail: 'admin@mau5trap.com',

    identity: {
        // Startup banner (server.js). Verbatim, including the "Multi-Tenant
        // Access Control Enabled" line — see PHASE_4CF doc (marketing-claim
        // debt, preserved until a product decision changes the copy).
        bannerTitle: 'mau5trap Production API',
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
            email: 'admin@mau5trap.com',
            password: 'admin123',
            name: 'Admin User',
            role: 'admin',
            artistAccess: 'all',
            pageAccess: ['all'],
            integrationCount: 10,
            bannerLabel: 'Full access'
        },
        {
            email: 'tours@rezz.com',
            password: 'rezz123',
            name: 'Isabelle Rezazadeh',
            role: 'artist',
            artistAccess: 'art_rezz',
            pageAccess: ['overview', 'roster'],
            integrationCount: 5,
            bannerLabel: 'REZZ only'
        }
    ],

    // ----------------------------------------------------------------- email
    email: {
        from: '"mau5trap OS" <notify@mau5trap.com>',
        resetSubject: 'mau5trap OS - Password Reset Request',
        resetHeadingColor: '#00ff00',
        resetLinkColor: '#00ff00'
    },

    // -------------------------------------------------------------------- ai
    ai: {
        // src/ai/prompts.js system prompt (pinned byte-for-byte).
        systemContext: 'AI analyst for mau5trap. Concise, data-driven insights.',
        // src/ai/aiService.js + src/routes/ai.js dev fallback (single source now).
        devFallback: '[Dev Fallback] Growth is stable at 2.5%. Recommend increasing tour frequency in EU.',
        keywordInsights: {
            // Composed as `${bestRoi.name} has the highest ROI at ${bestRoi.roi}x. ${roiSecondPlace}`
            roiSecondPlace: 'Rezz is second at 6.5x.',
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
        // Google-KG contextual fallback prefix (was `mau5trap ${query}`).
        artistQueryPrefix: 'mau5trap ',
        // KG tertiary fallback in modules/entityAudit.js.
        tertiaryQueryPrefix: 'mau5trap artist '
    },

    // ----------------------------------------------------- knowledge sources
    knowledgeSources: {
        fandom: {
            host: 'https://deadmau5.fandom.com',
            rosterPage: 'Mau5trap',
            labelWikiPath: '/wiki/Mau5trap',
            labelWikiTitle: 'Mau5trap (Wiki)',
            // Section-detection keywords of the mau5trap Fandom roster parser.
            sectionKeywords: {
                current: 'Current',
                former: ['Former', 'Previous'],
                artists: 'Artists'
            }
        },
        wikipedia: {
            labelPage: 'Mau5trap',
            fallbackSummary: 'Mau5trap (stylized as mau5trap) is a Canadian independent record label founded by electronic music producer Deadmau5 in 2007. The label was formerly distributed by Ultra Records and is now a division of the Seven20 management group.',
            fallbackThumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Mau5trap_logo.png/220px-Mau5trap_logo.png',
            categoryKeywords: ['musician', 'DJ', 'electronic music', 'music producer']
        },
        discogs: {
            labelUrl: 'https://www.discogs.com/label/86878-Mau5trap-Recordings'
        },
        http: {
            wikiUserAgent: 'Mau5trapIntelligence/1.0 (admin@mau5trap.com)',
            discogsUserAgent: 'mau5trap-api/1.0',
            labelBotUserAgent: 'Mau5trapBot/1.0 (bot@mau5trap.com)'
        },
        defaultGenre: 'Electronic Music'
    },

    // --------------------------------------------------------- social mappings
    // Was ARTIST_MAPPINGS in integrations/index.js (2 of 29 artists covered;
    // the rest fall back to mock — documented residual).
    socialMappings: {
        art_deadmau5: {
            spotifyId: '2CIMQHirSU0MQqyYHq0eOx',
            instagramName: 'deadmau5',
            ticketmasterName: 'deadmau5',
            youtubeChannelId: 'UCJ6td3C9QlPO9O_J5dF4ZzA',
            twitterHandle: 'deadmau5',
            tiktokUsername: '@deadmau5'
        },
        art_rezz: {
            spotifyId: '6kBDZFXuGQQL0PnZF6P2R4',
            instagramName: 'officialrezz',
            ticketmasterName: 'REZZ',
            youtubeChannelId: 'UCq01irgbP5i1y7GI1S6GdTQ',
            twitterHandle: 'OfficialRezz',
            tiktokUsername: '@officialrezz'
        }
    },

    // -------------------------------------------------------------------- anr
    anr: {
        defaultGenre: 'Electronic',
        benchmarkArtist: 'deadmau5',
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
        pdfTitle: 'mau5trap Intelligence Report',             // src/routes/reports.js
        generatedBy: 'Generated by mau5trap OS v5.0',         // src/routes/reports.js
        monthlyHeader: 'mau5trap',                            // src/reports/monthlyReport.js
        monthlySubheader: 'INTELLIGENCE REPORT',
        accentColor: '#00FF00',
        confidentialLine: 'MAU5TRAP INTELLIGENCE • CONFIDENTIAL'
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
                    artist: 'Testpilot',
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
                    url: 'https://soundcloud.com/mau5trap/example-demo',
                    updatedBy: 'deadmau5',
                    timestamp: new Date().toISOString()
                },
                demos: [
                    { id: 'demo1', title: 'Analog Dreams', artist: 'Unknown Producer', ratings: [], submittedBy: 'admin', status: 'reviewing' },
                    { id: 'demo2', title: 'Cyberpunk Bass', artist: 'Neon Glitch', ratings: [], submittedBy: 'rezz', status: 'high-priority' },
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
                { id: 1, item: 'Mau5head Replica (Gen 4)', quantity: 150, status: 'In Transit', vendor: 'Fourthwall', tracking: 'FW123456789', eta: '2025-12-18', location: 'Los Angeles Warehouse' },
                { id: 2, item: 'Tour Tee (BlackGummy)', quantity: 800, status: 'Stocked', vendor: 'Printful', tracking: 'PF987654321', eta: null, location: 'EU Fulfillment Center' },
                { id: 3, item: 'REZZ Goggles Replica', quantity: 45, status: 'Low Stock', vendor: 'Merchbar', tracking: 'MB456789123', eta: null, location: 'Toronto Warehouse' }
            ],
            assets: [
                { id: 1, title: 'deadmau5 - Strobe (Master WAV)', type: 'Audio Master', artist: 'deadmau5', uploaded: '2024-03-15', size: '248 MB', status: 'Approved' },
                { id: 2, title: 'REZZ - Edge (Official Video)', type: 'Video', artist: 'REZZ', uploaded: '2025-01-10', size: '1.8 GB', status: 'Processing' },
                { id: 3, title: 'BlackGummy - Album Artwork Pack', type: 'Artwork', artist: 'BlackGummy', uploaded: '2025-02-20', size: '89 MB', status: 'Approved' }
            ],
            contracts: [
                { id: 1, artist: 'deadmau5', type: 'Master Recording', signedDate: '2018-06-01', term: 'Perpetuity', advance: '$0', recoupable: null, royaltyRate: '50%', status: 'Active', nextMilestone: null },
                { id: 2, artist: 'REZZ', type: 'Exclusive Recording', signedDate: '2022-11-15', term: '3 Albums', advance: '$150k', recoupable: '$120k remaining', royaltyRate: 'Standard', status: 'Active', nextMilestone: 'Album 3 Q2 2026' },
                { id: 3, artist: 'BlackGummy', type: 'Single Deal + Option', signedDate: '2024-08-20', term: '2+2', advance: '$40k', recoupable: 'Fully Recouped', royaltyRate: '18%', status: 'Active', nextMilestone: 'Option Mar 2026' }
            ]
        }
    }
};
