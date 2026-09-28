
const masterSyncLoop = require('./sync/masterLoop');

// Mock Dependencies
const mockDb = {
    Artist: {
        findAll: async () => [
            { id: 'art_lumenveil', name: 'lumenveil', data: { meta: { spotifyId: '2CIMQHirSU0MQqyYHq0eOx' } } },
            { id: 'art_novakin', name: 'Novakin', data: { meta: { spotifyId: '4aKdmOXdUKX07HVd3sGgzw' } } },
            // Missing ID, should be skipped
            { id: 'art_unknown', name: 'NoSpotify', data: {} }
        ]
    },
    Stats: {
        create: async (data) => {
            console.log(`[MockDB] Inserted Stats for ${data.artistId}: Listeners=${data.listeners}, Streams=${data.streams}, Platform=${data.platform}`);
            return data;
        }
    }
};

const mockSpotify = {
    getArtistData: async (id) => {
        return {
            monthlyListeners: 123456,
            totalStreams: 9999999,
            growthRate: 1.5,
            social: { spotify: 50000 },
            meta: { dataSource: 'spotify', lastUpdated: new Date().toISOString(), spotifyId: id, spotifyUrl: `https://open.spotify.com/artist/${id}` }
        };
    }
};

// Run Verification
(async () => {
    console.log('--- STARTING SYNC LOOP TEST ---');
    await masterSyncLoop(mockDb, mockSpotify);
    console.log('--- TEST COMPLETE ---');
})();
