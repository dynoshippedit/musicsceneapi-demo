// pulsegrid Authority Server v5.0
// Features: Multi-User, A&R Voting, Asset AI, Persistent DB

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pulsegrid-secure-secret';
const DB_FILE = path.join(__dirname, 'pulsegrid_db.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public')); // Serves the frontend
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 })); // Rate limit

// --- PERSISTENT DATABASE ---
let db = {
    users: [
        { id: 'u1', email: 'admin@pulsegrid.fm', password: 'admin', role: 'admin', name: 'Ari' },
        { id: 'u2', email: 'a_and_r@pulsegrid.fm', password: 'demo', role: 'scout', name: 'Scout' }
    ],
    demos: [
        { id: 1, artist: "Neon Rat", track: "Cheese Trap", genre: "Electro", bpm: 128, status: "Inbox", votes: 2, hype: 35 },
        { id: 2, artist: "Unknown", track: "Deep Space", genre: "Techno", bpm: 130, status: "Shortlist", votes: 8, hype: 85 }
    ]
};

// Load DB on startup
if (fs.existsSync(DB_FILE)) { try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e) {} }
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- AUTH MIDDLEWARE ---
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

// --- ROUTES ---

// 1. Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email && u.password === password);
    if (user) {
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET);
        res.json({ token, user: { name: user.name, role: user.role } });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// 2. Get Dashboard Data
app.get('/api/data', auth, (req, res) => {
    res.json({
        stats: { revenue: '$5.2M', activeArtists: 36, growth: '+12%', pendingDemos: db.demos.length },
        demos: db.demos
    });
});

// 3. Vote on Demo
app.post('/api/demos/:id/vote', auth, (req, res) => {
    const demo = db.demos.find(d => d.id == req.params.id);
    if (!demo) return res.status(404).json({ error: 'Not found' });
    
    if (req.body.type === 'up') { demo.votes++; demo.hype = Math.min(100, demo.hype + 10); }
    else { demo.votes--; demo.hype = Math.max(0, demo.hype - 10); }
    
    saveDB(); // Save to disk
    res.json(demo);
});

// 4. AI Asset Decoder
app.post('/api/analyze', auth, async (req, res) => {
    const { fileName, context } = req.body;
    await new Promise(r => setTimeout(r, 2000)); // Simulate processing
    
    let analysis = `### 🤖 SYSTEM ANALYSIS: ${fileName}\n`;
    if (context === 'demo') {
        analysis += `**Sonic Profile:** Tech House / Minimal\n**BPM:** 126\n**Key:** A Minor\n\n**Commercial Viability:** HIGH (88%)\n**Similar Artists:** Getter, Novakin.\n**Recommendation:** Shortlist for 'We Are Friends' Vol. 12.`;
    } else {
        analysis += `**Doc Type:** Contract\n**Risk:** MEDIUM\n**Flags:** Clause 4.2 (Perpetuity) detected.\n**Action:** Flag for legal review before signing.`;
    }
    res.json({ analysis });
});

// SPA Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`pulsegrid OS online on port ${PORT}`));