const entityAudit = require('./modules/entityAudit');

async function verifyIntegration() {
    console.log('Verifying Entity Audit Integration...');
    try {
        const artistName = "Lumen Veil"; // Known to have data

        console.log(`Auditing: ${artistName}`);

        const [googleKG, wikipedia, discogs, genius, fandom] = await Promise.all([
            entityAudit.auditGoogleKG(artistName),
            entityAudit.auditWikipedia(artistName),
            entityAudit.auditDiscogs(artistName),
            entityAudit.auditGenius(artistName),
            entityAudit.auditFandom(artistName)
        ]);

        console.log('\n--- Results ---');
        console.log('Google KG:', googleKG.status);
        console.log('Wikipedia:', wikipedia.status);
        console.log('Discogs:', discogs.status);
        console.log('Genius:', genius.status);
        console.log('Fandom:', fandom);

        if (fandom && fandom.exists) {
            console.log('\nSUCCESS: Fandom data retrieved and integrated.');
        } else {
            console.error('\nFAILURE: Fandom data missing or failed.');
        }

    } catch (error) {
        console.error('Verification Error:', error);
    }
}

verifyIntegration();
