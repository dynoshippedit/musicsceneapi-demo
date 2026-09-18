'use strict';
const { randomUUID } = require('node:crypto');
const strategies = {
    'playlist-push': ['Submit to editorial playlists', 'Contact independent curators', 'Plan marquee ads'],
    'social-growth': ['Post short clips daily', 'Plan influencer collaborations', 'Host an AMA'],
    'tour-promo': ['Plan geo-targeted ads', 'Prepare presale emails', 'Plan ticket giveaways']
};
const allowedPlatforms = ['spotify', 'tiktok', 'instagram', 'youtube', 'email'];
function register(app, { authenticateToken, Campaign, artistRepo, hasArtistAccess, logger }) {
    const canRead = (user, campaign) => campaign.artistId ? hasArtistAccess(user, campaign.artistId) : user.role === 'admin' || campaign.userId === user.id;
    app.post('/v3/marketing/campaigns', authenticateToken, async (req, res) => {
        try {
            const { name, artistId = '', type, platforms } = req.body;
            if (typeof name !== 'string' || !name.trim() || name.length > 255 || !Object.hasOwn(strategies, type) || !Array.isArray(platforms) || !platforms.length || platforms.some(p => !allowedPlatforms.includes(p))) {
                return res.status(400).json({ error: 'A campaign name, supported strategy and platforms are required' });
            }
            if (artistId) {
                if (!hasArtistAccess(req.user, artistId)) return res.status(403).json({ error: 'Access denied for this artist' });
                if (!await artistRepo.findById(artistId)) return res.status(404).json({ error: 'Artist not found' });
            } else if (req.user.role !== 'admin') return res.status(403).json({ error: 'Choose an artist you can access' });
            const plan = strategies[type].map((action, i) => ({ step: i + 1, action, platform: platforms[i % platforms.length] }));
            const campaign = await Campaign.create({ id: `cmp_${randomUUID()}`, userId: req.user.id, name: name.trim(), artistId: artistId || null, type, platforms, plan, status: 'draft' });
            res.status(201).json({ ...campaign.toJSON(), campaignId: campaign.id, budget: 'Pending approval', message: 'Draft plan saved. No ads or messages have been sent.' });
        } catch (err) { logger.error('Campaign create failed:', err); res.status(500).json({ error: 'Campaign could not be saved' }); }
    });
    app.get('/v3/marketing/campaigns', authenticateToken, async (req, res) => {
        try { res.json({ campaigns: (await Campaign.findAll({ order: [['createdAt', 'DESC']] })).filter(c => canRead(req.user, c)) }); }
        catch (err) { logger.error('Campaign list failed:', err); res.status(500).json({ error: 'Campaigns could not be loaded' }); }
    });
    app.get('/v3/campaigns/stats', authenticateToken, async (req, res) => {
        try {
            const roster = (await artistRepo.findAllHybrid()).filter(a => hasArtistAccess(req.user, a.id));
            const stats = roster.reduce((sum, a) => ({ totalEmails: sum.totalEmails + (a.crm?.emailCount || 0), totalSMS: sum.totalSMS + (a.crm?.smsCount || 0), presaleSignups: sum.presaleSignups + (a.crm?.presaleSignups || 0) }), { totalEmails: 0, totalSMS: 0, presaleSignups: 0 });
            res.json({ stats, history: [], source: 'roster_reference', note: 'Reference CRM counts. No historical campaign performance has been recorded.' });
        } catch (err) { logger.error('Campaign statistics failed:', err); res.status(500).json({ error: 'Campaign statistics could not be loaded' }); }
    });
}
module.exports = { register };
