const axios = require('axios');

async function testFandom() {
    try {
        console.log("Fetching Pulsegrid page from Fandom...");
        // Use MediaWiki API to get page content
        // https://lumenveil.fandom.com/api.php?action=parse&page=Pulsegrid&format=json
        const response = await axios.get('https://lumenveil.fandom.com/api.php', {
            params: {
                action: 'parse',
                page: 'Pulsegrid',
                format: 'json',
                prop: 'text' // Get HTML content to parse lists
            }
        });

        if (response.data.error) {
            console.error("API Error:", response.data.error);
            return;
        }

        const htmlContent = response.data.parse.text['*'];
        console.log("Page fetched. Parsing roster...");

        // Simple regex or cheerio parsing would be ideal here if we had it.
        // Since we might not want to add cheerio dependency unless necessary, let's look at the raw HTML structure.
        // Or we can use wikitext format instead of HTML for easier parsing if specific templates are used.
        // Let's try to see a snippet of the HTML first.

        // We really want to find lists of artists.
        // Let's assume standard <ul> or <li> lists under headers like "Artists" or "Former Artists"

        // Let's also try fetching wikitext
        const responseWiki = await axios.get('https://lumenveil.fandom.com/api.php', {
            params: {
                action: 'parse',
                page: 'Pulsegrid',
                format: 'json',
                prop: 'wikitext'
            }
        });
        const wikitext = responseWiki.data.parse.wikitext['*'];

        // Parsing Logic
        const lines = wikitext.split('\n');
        const roster = {
            current: [],
            former: []
        };

        let currentSection = null; // 'current' or 'former'

        lines.forEach(line => {
            const cleanLine = line.trim();

            // Debug Headers
            if (cleanLine.startsWith('=')) {
                console.log("Found Header:", cleanLine);
            }

            // Detect Section Headers
            if (cleanLine.includes("Current") && cleanLine.startsWith("=")) {
                currentSection = 'current';
            } else if ((cleanLine.includes("Former") || cleanLine.includes("Previous")) && cleanLine.startsWith("=")) {
                currentSection = 'former';
            } else if (cleanLine.startsWith("==") && !cleanLine.includes("Current") && !cleanLine.includes("Former") && !cleanLine.includes("Previous") && !cleanLine.includes("Artists")) {
                // Reset if we hit a new unrelated top-level header (e.g. ==Releases==)
                // But handle ==Artists== as a parent header, so don't reset on that.
                if (cleanLine !== "==Artists==") {
                    currentSection = null;
                }
            }

            // Extract Artist Names (Bullets *)
            if (currentSection && cleanLine.startsWith('*')) {
                // format usually: * [[Artist Name]] or * [[Artist Name|Display Name]]
                const match = cleanLine.match(/\[\[(.*?)(?:\|.*?)?\]\]/);
                if (match) {
                    const name = match[1];
                    // Filter out non-artist links if necessary, though usually lists are clean.
                    roster[currentSection].push(name);
                } else {
                    // Handle plain text bullets if any
                    const plainName = cleanLine.replace(/^\*\s*/, '');
                    if (plainName) roster[currentSection].push(plainName);
                }
            }
        });

        console.log("Parsed Roster:");
        console.log("Current Artists:", roster.current.length);
        console.log("Former Artists:", roster.former.length);
        console.log("Sample Current:", roster.current.slice(0, 5));
        console.log("Sample Former:", roster.former.slice(0, 5));

    } catch (error) {
        console.error("Error:", error.message);
    }
}

testFandom();
