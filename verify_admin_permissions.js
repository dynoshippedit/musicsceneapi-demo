const axios = require('axios');
const API_URL = 'http://localhost:3000/v3';

async function login(email, password) {
    try {
        const res = await axios.post(`${API_URL}/auth/login`, { email, password });
        return res.data;
    } catch (error) {
        console.error(`Login failed for ${email}:`, error.response ? error.response.data : error.message);
        process.exit(1);
    }
}

async function verifyAdminPermissions() {
    console.log('--- Verifying Admin User Management & Permissions ---');

    try {
        // 1. Admin Login
        console.log('Logging in as Admin...');
        const adminAuth = await login('admin@pulsegrid.fm', 'admin123');
        const tokenAdmin = adminAuth.accessToken || adminAuth.token;

        // 2. Create Restricted User
        const randomId = Math.floor(Math.random() * 1000);
        const restrictedUserEmail = `restricted${randomId}@test.com`;
        console.log(`Creating restricted user: ${restrictedUserEmail} (Access: [anr_room])`);

        try {
            await axios.post(`${API_URL}/users`, {
                email: restrictedUserEmail,
                password: 'password123',
                name: 'Restricted User',
                role: 'viewer',
                pageAccess: ['anr_room']
            }, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        } catch (e) {
            console.error('Failed to create user:', e.response?.data);
            process.exit(1);
        }

        // 3. Login as Restricted User
        console.log('Logging in as Restricted User...');
        const userAuth = await login(restrictedUserEmail, 'password123');
        const tokenUser = userAuth.accessToken || userAuth.token;

        // 4. Test Access (Should Fail for Admin/Users endpoint)
        console.log('Test 1: Accessing Admin Endpoint (GET /users)...');
        try {
            await axios.get(`${API_URL}/users`, { headers: { Authorization: `Bearer ${tokenUser}` } });
            console.error('FAILURE: Restricted user accessed admin endpoint!');
        } catch (error) {
            if (error.response && error.response.status === 403) {
                console.log('SUCCESS: Admin endpoint denied (403).');
            } else {
                console.error(`FAILURE: Unexpected status ${error.response?.status}`);
            }
        }

        // 5. Test Access (Should Succeed for A&R endpoint)
        console.log('Test 2: Accessing Allowed Endpoint (GET /anr/state)...');
        try {
            await axios.get(`${API_URL}/anr/state`, { headers: { Authorization: `Bearer ${tokenUser}` } });
            console.log('SUCCESS: Allowed endpoint accessed.');
        } catch (error) {
            console.error('FAILURE: Allowed endpoint denied!', error.message);
        }

        // 6. Cleanup (Admin deletes user)
        console.log('Cleaning up...');
        const usersList = await axios.get(`${API_URL}/users`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
        const targetUser = usersList.data.find(u => u.email === restrictedUserEmail);
        if (targetUser) {
            await axios.delete(`${API_URL}/users/${targetUser.id}`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
            console.log('UserId deleted.');
        }

    } catch (error) {
        console.error('Verification Error:', error.message);
    }
}

verifyAdminPermissions();
