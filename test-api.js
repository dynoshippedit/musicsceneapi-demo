// test-api.js
// Quick test script to verify your API is working

const API_BASE = 'http://localhost:3000';
const API_KEY = 'your_api_key_here'; // Replace with your actual key

async function testAPI() {
    console.log('ðŸ§ª Testing pulsegrid API...\n');

    const tests = [
        {
            name: 'Health Check',
            method: 'GET',
            endpoint: '/health',
            requiresAuth: false
        },
        {
            name: 'Get All Artists',
            method: 'GET',
            endpoint: '/v3/artists?limit=5',
            requiresAuth: true
        },
        {
            name: 'Get lumenveil Details',
            method: 'GET',
            endpoint: '/v3/artists/art_lumenveil',
            requiresAuth: true
        },
        {
            name: 'Get lumenveil Revenue',
            method: 'GET',
            endpoint: '/v3/artists/art_lumenveil/revenue?timeframe=30d',
            requiresAuth: true
        },
        {
            name: 'Label Overview',
            method: 'GET',
            endpoint: '/v3/label/overview',
            requiresAuth: true
        },
        {
            name: 'Rotation Status',
            method: 'GET',
            endpoint: '/v3/rotation/status',
            requiresAuth: true
        },
        {
            name: 'Compare Artists',
            method: 'GET',
            endpoint: '/v3/analytics/compare?artist_ids=art_lumenveil,art_novakin&metrics=revenue,roi',
            requiresAuth: true
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            const headers = test.requiresAuth 
                ? { 'Authorization': `Bearer ${API_KEY}` }
                : {};

            const response = await fetch(`${API_BASE}${test.endpoint}`, {
                method: test.method,
                headers
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`âœ… ${test.name}`);
                console.log(`   Status: ${response.status}`);
                console.log(`   Response: ${JSON.stringify(data).substring(0, 100)}...`);
                passed++;
            } else {
                console.log(`âŒ ${test.name}`);
                console.log(`   Status: ${response.status}`);
                console.log(`   Error: ${await response.text()}`);
                failed++;
            }
        } catch (error) {
            console.log(`âŒ ${test.name}`);
            console.log(`   Error: ${error.message}`);
            failed++;
        }
        console.log('');
    }

    console.log('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('ðŸŽ‰ All tests passed! Your API is working perfectly.');
    } else {
        console.log('âš ï¸  Some tests failed. Check your configuration.');
    }
}

// Run tests
testAPI().catch(console.error);
