'use strict';

const { randomUUID } = require('node:crypto');
const { Op } = require('sequelize');
const { RoomDemo, RoomVote, RoomSetting, User, AnrSubmission } = require('../models');
const validUrl = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };

function register(app, { authenticateToken, logger }) {
    const handle = fn => async (req, res) => {
        try { await fn(req, res); } catch (err) { logger.error('A&R room failed:', err); res.status(500).json({ error: 'Unable to save or load the A&R room' }); }
    };
    async function demos(userId) {
        const [rows, votes] = await Promise.all([RoomDemo.findAll({ order: [['createdAt', 'DESC'], ['id', 'DESC']] }), RoomVote.findAll({ where: { userId } })]);
        const voted = new Set(votes.map(v => v.demoId));
        return rows.map(row => ({ ...row.toJSON(), hasVoted: voted.has(row.id) }));
    }
    async function tally(id) {
        const demo = await RoomDemo.findByPk(id);
        if (!demo) return null;
        const users = await User.findAll({ attributes: ['id'] });
        const votes = users.length ? await RoomVote.count({ where: { demoId: id, userId: { [Op.in]: users.map(u => u.id) } } }) : 0;
        const ratio = users.length ? votes / users.length : 0;
        return { artistVotes: votes, totalVotes: users.length, ratio: Number(ratio.toFixed(4)), stars: Math.min(5, Math.round(ratio * 5)) };
    }
    app.get('/v3/anr/state', authenticateToken, handle(async (req, res) => {
        const settings = Object.fromEntries((await RoomSetting.findAll()).map(row => [row.key, row.value]));
        res.json({ whiteboard: settings.whiteboard || '', nowListening: settings.nowListening || {}, demos: await demos(req.user.id) });
    }));
    app.post('/v3/anr/whiteboard', authenticateToken, handle(async (req, res) => {
        const { message } = req.body;
        if (typeof message !== 'string' || message.length > 10000) return res.status(400).json({ error: 'Whiteboard must be text under 10000 characters' });
        await RoomSetting.upsert({ key: 'whiteboard', value: message });
        res.json({ success: true, whiteboard: message });
    }));
    app.post('/v3/anr/listening', authenticateToken, handle(async (req, res) => {
        const { url } = req.body;
        if (!validUrl(url)) return res.status(400).json({ error: 'An HTTP or HTTPS listening URL is required' });
        const value = { url, updatedBy: req.user.email.split('@')[0], timestamp: new Date().toISOString() };
        await RoomSetting.upsert({ key: 'nowListening', value });
        res.json({ success: true, nowListening: value });
    }));
    app.post('/v3/anr/demos', authenticateToken, handle(async (req, res) => {
        const { title, artist, url, genre = '' } = req.body;
        if (typeof title !== 'string' || !title.trim() || title.length > 255 || typeof artist !== 'string' || !artist.trim() || artist.length > 255 || !validUrl(url) || typeof genre !== 'string' || genre.length > 255) {
            return res.status(400).json({ error: 'Artist, title and an HTTP or HTTPS demo URL are required' });
        }
        const demo = await RoomDemo.create({ id: `demo_${randomUUID()}`, title: title.trim(), artist: artist.trim(), genre, url,
            submittedBy: req.user.email.split('@')[0], status: 'new' });
        res.status(201).json({ success: true, demo: demo.toJSON(), demos: await demos(req.user.id) });
    }));
    app.post('/v3/anr/vote/:demoId', authenticateToken, handle(async (req, res) => {
        const { demoId } = req.params;
        const { action } = req.body;
        if (!['add', 'remove'].includes(action)) return res.status(400).json({ error: 'Invalid action. Use "add" or "remove".' });
        if (!await RoomDemo.findByPk(demoId)) return res.status(404).json({ error: 'Demo not found' });
        if (action === 'add') await RoomVote.upsert({ demoId, userId: req.user.id });
        else await RoomVote.destroy({ where: { demoId, userId: req.user.id } });
        res.json({ success: true, hasVoted: action === 'add', demo: { id: demoId, ...await tally(demoId) } });
    }));
    app.get('/v3/anr/stats/:demoId', authenticateToken, handle(async (req, res) => {
        const result = await tally(req.params.demoId);
        if (!result) return res.status(404).json({ error: 'Demo not found' });
        res.json(result);
    }));
    app.get('/v3/anr/demos/:demoId/rating', authenticateToken, handle(async (req, res) => {
        let result = await tally(req.params.demoId);
        if (!result) {
            const submission = await AnrSubmission.findByPk(req.params.demoId);
            if (!submission) return res.status(404).json({ error: 'Not found' });
            const totalVotes = await User.count();
            const ratio = totalVotes ? submission.votes / totalVotes : 0;
            result = { stars: Math.min(5, Math.max(0, Math.round(ratio * 5))), artistVotes: submission.votes, totalVotes, ratio: Number(ratio.toFixed(4)) };
        }
        res.json(req.query.includeTally === 'true' ? result : { stars: result.stars });
    }));
}
module.exports = { register };
