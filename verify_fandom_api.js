const axios = require('axios');

async function verify() {
    try {
        console.log("Logging in...");
        const login = await axios.post('http://localhost:3000/v3/auth/login', {
            email: 'admin@pulsegrid.fm',
            password: 'admin123'
        });
        const token = login.data.token;
        console.log("Logged in. Token acquired.");

        console.log("Fetching Fandom Roster...");
        const rosterRes = await axios.get('http://localhost:3000/v3/integrations/fandom/roster', {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log("Roster Status:", rosterRes.status);
        console.log("Roster Data:", JSON.stringify(rosterRes.data, null, 2));

    } catch (err) {
        console.error("Verification Failed:", err.message);
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        }
    }
}

verify();
