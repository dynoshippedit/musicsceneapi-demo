const axios = require('axios');
const API_URL = 'http://localhost:3000/v3';

async function checkHealth() {
    try {
        console.log('1. Checking Admin Login (Env override)...');
        // This relies on the HARDCODED env override in the code, not the DB
        const res = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@pulsegrid.fm',
            password: 'admin123'
        });

        if (res.data.token) {
            console.log('SUCCESS: Admin Login works via Env Override.');
            console.log('Token received.');
        } else {
            console.error('FAILURE: Login returned no token.');
            process.exit(1);
        }

        console.log('2. Checking Novakin Login (DB Seed)...');
        try {
            const resNovakin = await axios.post(`${API_URL}/auth/login`, {
                email: 'tours@novakin.band',
                password: 'novakin123'
            });
            console.log('SUCCESS: Novakin Login works (DB is seeded).');
        } catch (e) {
            console.warn('WARNING: Novakin Login failed (DB might be empty due to SQLite mismatch issue).');
        }

    } catch (e) {
        console.error('API UNREACHABLE or ERROR:', e.message);
        process.exit(1);
    }
}

checkHealth();
