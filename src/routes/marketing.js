/**
 * src/routes/marketing.js
 *
 * Campaign creation and stats. Campaigns live in process memory only.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (2):
 *   POST   /v3/marketing/campaigns
 *   GET    /v3/campaigns/stats
 */

'use strict';

/**
 * @param {object} app Express application
 * @param {object} ctx dependency bundle from src/routes/context.js
 */
function register(app, ctx) {
    const {
        config, logger, JWT_SECRET, bcrypt, jwt, fs, path,
        sequelize, User, Artist, Stats,
        authenticateToken, hasArtistAccess, filterDataByAccess, checkExportAccess, generateToken,
        calculateTotalRevenue, flattenData, filterMetrics,
        generatePieChart, generateBarChart, generateLineChart, generateDonutChart,
        cache, emailService, sendEmail, entityAuditService,
        artistRepo, labelData, getArtistData, getAllArtists,
        operationsRepo, operationsData,
        prospects, anrSubmissions, anrState, userIntegrations, salesData, apiCache,
        aiService, performLinearRegression, generateSyntheticHistory,
        integrationFacade, fetchArtistData, getIntegrationStatus, SERVICES, limiters,
        generateMonthlyReport
    } = ctx;

    app.post('/v3/marketing/campaigns', authenticateToken, (req, res) => {
        const { artistId, type, platforms } = req.body;

        const strategies = {
            'playlist-push': ['Submit to Spotify Editorial', 'Hire independent curators', 'Run marquee ads'],
            'social-growth': ['Post 15s clips daily', 'Collaborate with influencers', 'Host AMA'],
            'tour-promo': ['Run geo-targeted ads', 'Email presale codes', 'Ticket giveaways']
        };

        const plan = strategies[type] || ['General brand awareness ads'];

        res.json({
            campaignId: `cmp_${Date.now()}`,
            status: 'created',
            plan: plan.map((step, i) => ({ step: i + 1, action: step, platform: platforms ? platforms[i % platforms.length] : 'all' })),
            budget: 'Pending Approval'
        });
    });

    app.get('/v3/campaigns/stats', authenticateToken, (req, res) => {
        // Aggregate global CRM stats
        const stats = labelData.artists.reduce((acc, artist) => {
            if (artist.crm) {
                acc.totalEmails += artist.crm.emailCount;
                acc.totalSMS += artist.crm.smsCount;
                acc.presaleSignups += artist.crm.presaleSignups;
            }
            return acc;
        }, { totalEmails: 0, totalSMS: 0, presaleSignups: 0 });

        // Mock Database Health History (last 6 months)
        const history = [
            { month: 'Jul', email: Math.floor(stats.totalEmails * 0.7), sms: Math.floor(stats.totalSMS * 0.6) },
            { month: 'Aug', email: Math.floor(stats.totalEmails * 0.75), sms: Math.floor(stats.totalSMS * 0.7) },
            { month: 'Sep', email: Math.floor(stats.totalEmails * 0.8), sms: Math.floor(stats.totalSMS * 0.8) },
            { month: 'Oct', email: Math.floor(stats.totalEmails * 0.85), sms: Math.floor(stats.totalSMS * 0.85) },
            { month: 'Nov', email: Math.floor(stats.totalEmails * 0.9), sms: Math.floor(stats.totalSMS * 0.9) },
            { month: 'Dec', email: stats.totalEmails, sms: stats.totalSMS }
        ];

        res.json({ stats, history });
    });
}

module.exports = { register };
