const z = require('zod');

// Phase 1B: the Spotify integration reports measured fields only. The old
// fabricated monthlyListeners / totalStreams / growthRate are gone; every
// payload carries a provenance block (source, observedAt, basis, note?).
const SafeStatsSchema = z
    .object({
        followers: z.number(),
        popularity: z.number(),
        social: z
            .object({
                spotify: z.number(),
            })
            .strict(),
        meta: z
            .object({
                dataSource: z.string(),
                lastUpdated: z.string(),
                spotifyId: z.string(),
                spotifyUrl: z.string(),
            })
            .strict(),
        provenance: z
            .object({
                source: z.string(),
                observedAt: z.string(),
                basis: z.enum(['measured', 'estimated']),
                note: z.string().optional(),
            })
            .strict(),
    })
    .strict();

module.exports = SafeStatsSchema;
