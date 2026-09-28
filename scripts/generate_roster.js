const fs = require('fs');
const path = require('path');

const artistNames = [
    'NOVAKIN',
    'LUMEN VEIL',
    'GLASSWOLFE',
    'AURORA DRIFT',
    'STATIC BLOOM',
    'MIDNIGHT CIRCUIT',
    'ECHO HARBOR',
    'VIOLETPULSE'
];

// Helper to sanitize ID
const toId = (name) => `art_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

// Helper for random numbers
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max) => parseFloat((Math.random() * (max - min) + min).toFixed(1));

// Tier determination
const getTier = (name) => {
    if (['NOVAKIN', 'LUMEN VEIL', 'STATIC BLOOM'].includes(name)) return 'flagship';
    if (['GLASSWOLFE', 'AURORA DRIFT', 'MIDNIGHT CIRCUIT', 'ECHO HARBOR'].includes(name)) return 'core';
    return 'developing'; // broader category for mid/emerging
};

// Generate Artist Object
const generateArtist = (name) => {
    const tier = getTier(name);
    const isFlagship = tier === 'flagship';
    const isCore = tier === 'core';

    // Base Multipliers
    const mult = isFlagship ? 100 : (isCore ? 10 : 1);

    // Listeners
    const listeners = rand(10000 * mult, 100000 * mult);
    const growth = randFloat(-5, 25);

    // Revenue
    const streaming = rand(5000 * mult, 50000 * mult);
    const touring = rand(10000 * mult, 100000 * mult);
    const merch = rand(2000 * mult, 20000 * mult);

    // Social
    const ig = rand(10000 * mult, 1000000 * mult);

    return {
        id: toId(name),
        name: name,
        displayName: `${name} (${tier.charAt(0).toUpperCase() + tier.slice(1)})`,
        tier: tier,
        monthlyListeners: listeners,
        totalStreams: listeners * rand(50, 150),
        growthRate: growth,
        revenue: {
            streaming: streaming,
            streamingBreakdown: {
                total: streaming,
                byLocation: [
                    { region: "North America", value: Math.floor(streaming * 0.5), percent: 50 },
                    { region: "Europe", value: Math.floor(streaming * 0.3), percent: 30 },
                    { region: "Asia", value: Math.floor(streaming * 0.2), percent: 20 }
                ]
            },
            touring: touring,
            merch: merch,
            sync: Math.floor(streaming * 0.1),
            branding: Math.floor(touring * 0.2),
            youtube: Math.floor(streaming * 0.05)
        },
        meta: {
            dataSource: "generated_mock",
            lastUpdated: new Date().toISOString()
        },
        social: {
            instagram: ig,
            twitter: Math.floor(ig * 0.4),
            tiktok: Math.floor(ig * 0.8),
            engagementRate: randFloat(1.5, 8.5)
        },
        touring: {
            upcomingShows: rand(0, 20),
            avgTicketPrice: isFlagship ? rand(60, 100) : rand(20, 50),
            avgAttendance: isFlagship ? rand(5000, 15000) : rand(200, 1500),
            merchPerHead: randFloat(10, 35),
            carbonOffset: rand(1000, 50000),
            sustainabilityScore: isFlagship ? 'B' : 'A', // Smaller tours often greener per capita/less jet travel
            shows: [] // Keep simple for bulk
        },
        merch: {
            onlineSales: Math.floor(merch * 0.6),
            tourSales: Math.floor(merch * 0.4),
            topItems: ["T-Shirt", "Hoodie", "Stickers"],
            margin: 0.60
        },
        brandDeals: [],
        collaborations: [],
        influences: ["Pulsegrid Sound", "Techno", "Prog House"],
        genreHybrids: isFlagship ? "Electro House" : "Techno/Progressive",
        sustainability: {
            longevityScore: randFloat(5, 10),
            revenueStability: `${rand(60, 95)}%`,
            burnoutRisk: "Low",
            legacyImpact: rand(50, 90),
            progressionMilestones: [],
            diversificationRatio: {}
        },
        crm: {
            emailCount: rand(1000, 50000) * mult,
            smsCount: rand(100, 5000) * mult,
            presaleSignups: rand(500, 10000) * mult
        },
        forecast: {
            nextMonth: Math.floor((streaming + touring + merch) / 12),
            threeMonth: Math.floor((streaming + touring + merch) / 4),
            trend: growth > 0 ? 'up' : 'stable'
        },
        roi: randFloat(2.0, 10.0),
        priority: isFlagship ? 1 : (isCore ? 2 : 3)
    };
};

// Generate All
const artists = artistNames.map(generateArtist);

// Label Totals
const totalRev = artists.reduce((sum, a) => sum + a.revenue.streaming + a.revenue.touring + a.revenue.merch, 0);

const fileContent = `// mock/artistData.js
// Mock artist data (Generated)

const labelData = {
    artists: ${JSON.stringify(artists, null, 4)},
    labelTotals: {
        monthlyRevenue: ${Math.floor(totalRev / 12)},
        quarterlyProjection: ${Math.floor(totalRev / 4)},
        annualProjection: ${totalRev},
        activeArtists: ${artists.length},
        totalShows: ${artists.reduce((sum, a) => sum + a.touring.upcomingShows, 0)},
        avgROI: ${parseFloat((artists.reduce((sum, a) => sum + a.roi, 0) / artists.length).toFixed(1))}
    }
};

module.exports = labelData;
`;

// Write File
const targetPath = path.join(__dirname, '../mock/artistData.js');
fs.writeFileSync(targetPath, fileContent);

console.log(`Successfully generated ${artists.length} artist profiles.`);
console.log(`Written to ${targetPath}`);
