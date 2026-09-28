const axios = require('axios');

const API_URL = 'http://localhost:3000/v3';

async function login(email, password) {
    try {
        const res = await axios.post(`${API_URL}/auth/login`, { email, password });
        console.log(`[DEBUG] Login Response for ${email}:`, JSON.stringify(res.data));
        const token = res.data.token || res.data.accessToken;
        if (!token) throw new Error('No access token in response');
        return token;
    } catch (error) {
        console.error(`Login failed for ${email}:`, error.message);
        process.exit(1);
    }
}

async function verifyRatings() {
    console.log('--- Verifying A&R Weighted Voting System ---');

    try {
        // 1. Authenticate Users
        console.log('Authenticating users...');
        const tokenAdmin = await login('admin@pulsegrid.fm', 'admin123'); // Weight 10
        const tokenNovakin = await login('tours@novakin.band', 'novakin123');       // Weight 5

        // 2. Create Fresh Demo
        const demoTitle = `Test Demo ${Date.now()}`;
        const createRes = await axios.post(`${API_URL}/anr/demos`, { title: demoTitle, artist: 'Tester' }, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        const targetDemoId = createRes.data.demos[0].id;
        console.log(`Created Fresh Demo: ${targetDemoId} (${demoTitle})`);

        // 3. Admin Vote (Unitary)
        console.log('\nUser 1 (Admin) adding vote...');
        const res1 = await axios.post(`${API_URL}/anr/vote/${targetDemoId}`, { action: 'add' }, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        console.log(`Vote 1 Result: hasVoted=${res1.data.hasVoted}, Count=${res1.data.demo.artistVotes} / ${res1.data.demo.totalVotes}`);

        if (res1.data.demo.artistVotes !== 1) throw new Error(`Unitary Vote Incorrect: Got ${res1.data.demo.artistVotes}, Expected 1`);
        if (res1.data.demo.totalVotes !== 2) throw new Error(`Total Users Incorrect: Got ${res1.data.demo.totalVotes}, Expected 2`);

        // 4. Idempotency Check
        console.log('User 1 (Admin) adding vote AGAIN...');
        await axios.post(`${API_URL}/anr/vote/${targetDemoId}`, { action: 'add' }, { headers: { Authorization: `Bearer ${tokenAdmin}` } });

        // 5. Novakin Vote (Unitary)
        console.log('\nUser 2 (Novakin) adding vote...');
        const res2 = await axios.post(`${API_URL}/anr/vote/${targetDemoId}`, { action: 'add' }, { headers: { Authorization: `Bearer ${tokenNovakin}` } });
        console.log(`Vote 2 Result: hasVoted=${res2.data.hasVoted}, Count=${res2.data.demo.artistVotes} / ${res2.data.demo.totalVotes}`);

        if (res2.data.demo.artistVotes !== 2) throw new Error(`Unitary Vote Incorrect: Got ${res2.data.demo.artistVotes}, Expected 2`);

        // 6. Remove Vote
        console.log('\nUser 1 (Admin) removing vote...');
        const res3 = await axios.post(`${API_URL}/anr/vote/${targetDemoId}`, { action: 'remove' }, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        console.log(`Vote 3 Result: hasVoted=${res3.data.hasVoted}, Count=${res3.data.demo.artistVotes} / ${res3.data.demo.totalVotes}`);

        // Remove Admin from 2 should leave 1 (Novakin)
        if (res3.data.demo.artistVotes !== 1) throw new Error(`Unitary Vote Removal Incorrect: Got ${res3.data.demo.artistVotes}, Expected 1`);

        console.log('\nSUCCESS: Explicit Action (Add/Remove) Voting logic verified.');

    } catch (error) {
        console.error('Verification Error:', error.response ? error.response.data : error.message);
        process.exit(1);
    }
}

verifyRatings();
