const entityAudit = require('./modules/entityAudit');

async function verifyLabelAudit() {
    console.log('Verifying Label (Pulsegrid) Audit...');

    try {
        const result = await entityAudit.auditLabel();

        console.log('\n--- Pulsegrid Label Audit Results ---');
        console.log(`Label Name: ${result.labelName}`);
        console.log(`Health Score: ${result.healthScore}/100`);

        console.log('\n[Wikipedia]:');
        console.log(`Status: ${result.platforms.wikipedia.status}`);
        if (result.platforms.wikipedia.exists) {
            console.log(`URL: ${result.platforms.wikipedia.url}`);
            console.log(`Summary: ${result.platforms.wikipedia.summary?.substring(0, 50)}...`);
        }

        console.log('\n[Fandom (Wikia)]:');
        console.log(`Status: ${result.platforms.fandom.status}`);
        if (result.platforms.fandom.exists) {
            console.log(`Title: ${result.platforms.fandom.title}`);
            console.log(`Roster Size: ${result.platforms.fandom.rosterSize} artists`);
        }

        console.log('\n[Discogs (Static)]:');
        console.log(`Status: ${result.platforms.discogs.status}`);
        console.log(`URL: ${result.platforms.discogs.url}`);

        if (result.platforms.wikipedia.exists && result.platforms.fandom.exists) {
            console.log('\nSUCCESS: Label Entity Audit verified.');
        } else {
            console.error('\nFAILURE: Missing critical label data.');
        }

    } catch (error) {
        console.error('Verification Error:', error);
    }
}

verifyLabelAudit();
