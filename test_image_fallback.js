require('dotenv').config();
const entityAudit = require('./modules/entityAudit');

async function testImageFallback() {
    console.log("=== Testing Image Fallback Logic ===");

    // 1. Test Fandom Image Fetch (e.g., using 'Novakin' who should have an image)
    try {
        console.log("\n[Test 1] Fandom Image Fetch for 'Novakin':");
        const fandomResult = await entityAudit.auditFandom('Novakin');
        if (fandomResult.image) {
            console.log("SUCCESS: Image found:", fandomResult.image);
        } else {
            console.log("WARNING: No image found (might be expected if page has none, but check logic).");
            console.log("Full Result:", fandomResult);
        }
    } catch (e) {
        console.error("Fandom Test Error:", e);
    }

    // 2. Test Google KG Fallback Logic (using a fake name to force all fallbacks)
    // We expect to see logs indicating the fallback search was attempted.
    try {
        console.log("\n[Test 2] Google KG Fallback Logic for 'NonExistentPulsegridArtist':");
        // This will likely fail to find anything, but we want to confirm the code path executes.
        // We look for console logs in the output.
        const kgResult = await entityAudit.auditGoogleKG('NonExistentPulsegridArtist');
        console.log("Final KG Result Status:", kgResult.status);
    } catch (e) {
        console.error("KG Test Error:", e);
    }

    // 3. Test Google KG with a real artist that might need fallback (Optional, difficult to predict)
    // trying 'No Mana' might trigger fallbacks if 'No Mana' is ambiguous.
    try {
        console.log("\n[Test 3] Google KG Search for 'No Mana' (may trigger fallbacks):");
        const kgResult = await entityAudit.auditGoogleKG('No Mana');
        console.log("Result Exists:", kgResult.exists);
        if (kgResult.exists) {
            console.log("Name Found:", kgResult.name);
            console.log("Image Found:", kgResult.image);
        }
    } catch (e) {
        console.error("KG Test Error:", e);
    }
}

testImageFallback();
