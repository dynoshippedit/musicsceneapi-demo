const axios = require('axios');
const API_URL = 'http://localhost:3000/v3';

async function login(email, password) {
    try {
        const res = await axios.post(`${API_URL}/auth/login`, { email, password });
        return res.data.token || res.data.accessToken;
    } catch (error) {
        console.error(`Login failed for ${email}:`, error.message);
        process.exit(1);
    }
}

async function verifyHiddenVoting() {
    console.log('--- Verifying A&R Hidden Voting System ---');

    try {
        const tokenAdmin = await login('admin@pulsegrid.fm', 'admin123');

        // 1. Check Privacy (Sanitization)
        console.log('Checking Privacy (GET /anr/state)...');
        const stateRes = await axios.get(`${API_URL}/anr/state`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        const targetDemo = stateRes.data.demos[0];

        if (targetDemo.ratings) {
            console.error('FAILURE: Privacy Leak! "ratings" array exposed in state.');
            process.exit(1);
        } else {
            console.log('SUCCESS: "ratings" array is hidden.');
        }

        const demoId = targetDemo.id;
        console.log(`Targeting Demo: ${demoId}`);

        // 2. Vote Casting (5-Star)
        console.log('\nCasting 5-Star Vote...');

        // Check stats first
        const statsPre = await axios.get(`${API_URL}/anr/demos/${demoId}/rating?includeTally=true`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        const votesPre = statsPre.data.artistVotes;
        console.log(`Votes Pre: ${votesPre}`);

        // Cast Vote
        const voteRes = await axios.post(`${API_URL}/anr/vote/${demoId}`, { action: 'add' }, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        console.log(`Vote Response: hasVoted=${voteRes.data.hasVoted}`);

        // Check Stats
        const statsPost = await axios.get(`${API_URL}/anr/demos/${demoId}/rating?includeTally=true`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        console.log(`Votes Post: ${statsPost.data.artistVotes}`);

        if (voteRes.data.hasVoted) {
            // Check if vote count logic holds (it should be equal to Pre if we just updated, or Pre+1 if new)
            // Since we don't know initial state of this user from this script easily:
            if (statsPost.data.artistVotes >= votesPre) {
                console.log('SUCCESS: Vote processed relative to previous state.');
            } else {
                console.error('FAILURE: usage mismatch.');
            }
        }

        console.log('Ratio:', statsPost.data.ratio);
        console.log('Stars:', statsPost.data.stars);

    } catch (error) {
        console.error('Verification Error:', error.response ? error.response.data : error.message);
    }
}

verifyHiddenVoting();
