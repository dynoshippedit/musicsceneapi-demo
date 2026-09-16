# INTEGRATION_INVENTORY.md

Two separate integration systems exist that do not know about each other:

- **`integrations/`** — 6 social/streaming providers behind a clean aggregator
  (`integrations/index.js`), gated by `USE_REAL_DATA`.
- **`modules/entityAudit.js`** — 5 metadata/identity providers called directly from
  route handlers, **not** gated by `USE_REAL_DATA`.

Plus a third, rogue Spotify client with hardcoded placeholder credentials at
`mau5trap-production-api.js:2692`.

---

## 1. `integrations/` — social & streaming (6 providers)

Entered only via `fetchArtistData(artistId, mockData)` (`integrations/index.js:38`),
itself called only from `getArtistData()` (api L308) and `getAllArtists()` (api L332),
both of which **return mock immediately unless `USE_REAL_DATA === 'true'`** (api L280,
L302, L325).

| Provider | File | Lines | Transport | Real calls | Timeout | `isConfigured()` guard |
|---|---|---|---|---|---|---|
| Spotify | `spotify.js` | 136 | `spotify-web-api-node` SDK | yes (L44, L48, L107) | SDK default | ID+secret+refresh, rejects `your_spotify_client_id_here` |
| Instagram | `instagram.js` | 98 | `axios` → graph.facebook.com | yes (L24, L35) | 5000ms | token+businessAccountId+placeholder check |
| Ticketmaster | `ticketmaster.js` | 97 | `axios` → Discovery API | yes (L23) | 5000ms | apiKey+placeholder check |
| YouTube | `youtube.js` | 169 | `googleapis` SDK | yes (L55) | **none** | clientId+secret+refresh+placeholder check |
| Twitter/X | `twitter.js` | 138 | `axios` → api.twitter.com/2 | yes (L27, L40, L107) | 5000ms | bearerToken+placeholder check |
| TikTok | `tiktok.js` | 137 | `axios` | partial — L28 comment: *"For now, we'll use a placeholder structure"*; *"full implementation needs OAuth"* | 5000ms | key+secret+token+placeholder check |

Correction to an earlier informal read: Spotify and YouTube **do** make real network
calls; they use vendor SDKs rather than `axios`, which is why an `axios` grep misses them.

### Artist coverage is 2 of 29

`ARTIST_MAPPINGS` (`integrations/index.js:12-30`) maps external IDs for exactly two
artists: `art_deadmau5` and `art_rezz`. The mock roster has 29. For the other 27,
`fetchArtistData` hits L41-44:

```js
if (!mapping) {
    console.warn(`No API mapping found for ${artistId}, using mock data`);
    return mockData;
}
```

So even with every credential configured and `USE_REAL_DATA=true`, **93% of the roster
is permanently mock**, and the only signal is a `console.warn`.

### Silent degradation is the default everywhere

Each provider is wrapped in `try/catch` that logs and continues
(`index.js:60-62, 70-72, 80-82, 90-92, 100-102, 110-112`). `getArtistData` has an outer
catch that returns mock (api L314-317). Net effect: a fully-failing integration layer
produces a `200 OK` with fabricated numbers and no error field.

### Partial provenance metadata exists but is not exposed

`mergeData()` sets `meta.realDataSources` and `meta.lastUpdated` **only when at least one
provider succeeded** (`index.js:178-182`). When everything falls back to mock, no field
marks the response as mock. And `getArtistData`'s catch path (L316) returns the bare
`mockArtist` with no meta at all. There is no top-level `source: live|mock` on any
response, so no consumer — dashboard or artist — can tell real revenue from invented
revenue.

### Cross-artist data leak in the Instagram path

`index.js:68` calls `instagramIntegration.getAccountData()` with **no artist argument**.
The client is constructed from a single `INSTAGRAM_BUSINESS_ACCOUNT_ID` env var
(`instagram.js`), so whichever artist is being fetched receives the *same* Instagram
account's metrics, merged into their record at `index.js:139-142`. With one label-level
IG account configured, every artist's `social.engagementRate` becomes the label's.

### Schema validation is applied to exactly one provider

`spotify.js:77` runs `SafeStatsSchema.parse(rawData)` before returning. The other five
providers return unvalidated shapes that are spread directly into the merged artist
object. And `SafeStatsSchema` (`modules/SafeStatsSchema.js`) is `.strict()` on a
5-field shape — any extra key Spotify's mapper adds later throws rather than warns.

---

## 2. `modules/entityAudit.js` — identity/metadata (5 providers, 752 lines)

Called directly from route handlers, bypassing `USE_REAL_DATA` entirely.

| Provider | Host | Function | Auth |
|---|---|---|---|
| Google Knowledge Graph | `kgsearch.googleapis.com` | `auditGoogleKG` (L11) | `GOOGLE_KG_API_KEY` |
| Wikipedia | `en.wikipedia.org`, `upload.wikimedia.org` | `auditWikipedia` (L166) | none/optional |
| Discogs | `api.discogs.com` | `auditDiscogs` (L268) | `DISCOGS_API_KEY`/`SECRET` |
| Genius | `api.genius.com` | `auditGenius` (L329) | `GENIUS_API_TOKEN` |
| Fandom | `deadmau5.fandom.com` | `auditFandom` (L681), `getFandomRoster` (L544) | none |

Exposed via: `GET /v3/artists/:id/entity-audit` (L1037, calls 5 providers +
Groq in one request), `GET /v3/integrations/google-kg` (L967),
`GET /v3/integrations/fandom/roster` (L1011), `GET /v3/integrations/fandom/audit` (L1022).

`auditLabel()` (module L611) is exported but **has no route** — and the workstation calls
`GET /v3/label/entity-audit` (FE L3241), which 404s. The capability exists and is
unreachable.

Positive note: this module follows null-over-guess discipline correctly —
`|| null` at L86-89, `return null` at L111/L158, explicit `null` initialisers at
L223-224, L233, L310. This is the best-behaved data code in the repo.

### Caching / cost control on the audit path

`GET /v3/artists/:id/entity-audit` caches the composite result for 2 weeks
(L1135, `1209600`s) and Genius indefinitely (L1069, TTL `0`). `?refresh=true` (L1040)
bypasses the composite cache, triggering 5 external calls + 1 Groq completion per
request. There is **no per-user rate limit or quota on the refresh path** — only the
global 1000 req/hour/IP limiter (L259-263). An authenticated viewer can burn the
operator's Google KG, Discogs, Genius, and Groq quotas by looping `?refresh=true`.

---

## 3. Rogue Spotify client (api L2689-2695)

```js
const SpotifyWebApi = require('spotify-web-api-node');
// Init Spotify API (Env vars would be implemented here)
const spotifyApi = new SpotifyWebApi({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret'
});
```

A second, unauthenticated Spotify client with literal placeholder credentials, used by
`GET /v3/anr/scout` (L2698) — an endpoint the workstation actively calls. It duplicates
and bypasses the correctly env-configured singleton in `integrations/spotify.js:9-13`.
This is a violated module boundary, not just dead code.

---

## 4. Other external surfaces

| Surface | Location | Notes |
|---|---|---|
| Groq LLM | api L24, calls at L1110, L1261, L2139 | see ARCHITECTURE_AUDIT §5 |
| SMTP / SendGrid | api L528-543 | falls back to `jsonTransport` (console) when unconfigured; `sendEmail` returns `true` on simulated send (L564) so callers cannot distinguish |
| Shell (`lp`/`lpr`/powershell) | api L2505-2528 | unescaped interpolation; see SECURITY_AUDIT |
| Google OAuth redirect | `integrations/youtube.js:23` | hardcoded `http://localhost:3000/auth/youtube/callback`; **no route implements this callback** |

---

## 5. Rate-limiting: two systems, one unused

`SERVICES` (api L383-393) defines per-provider rate limits for 9 services — including
`shopify`, `bandsintown`, `chartmetric`, `revelator`, which **have no integration module
at all** — and instantiates a `RateLimiter` token bucket per service (L396-399).

`limiters` is referenced only by `GET /v3/integrations/test-limit/:service` (L1592), a
diagnostic endpoint with no frontend caller. **No actual integration call passes through
a limiter.** The real HTTP calls in `integrations/*.js` are unthrottled; the only
throttle in the live path is the 1-second `setTimeout` in the unregistered
`sync/masterLoop.js:70`.

---

## 6. Configuration matrix

`.env.example` declares 20 integration variables across 3 "phases". `.env.prod.template`
declares a **different, conflicting** set — including `OPENAI_API_KEY` (L14), which no
code reads, while omitting `GROQ_API_KEY`, which the AI layer requires. It also documents
`ALLOWED_ORIGINS` (L4), which no code reads.

Variables read by code but absent from both templates:

| Variable | Read at | Effect if unset |
|---|---|---|
| `ADMIN_EMAIL` | api L482 | login override compares `undefined === undefined` → see SECURITY_AUDIT #1 |
| `ADMIN_PASS` | api L482 | same |
| `DB_DIALECT` | api L128 | defaults to sqlite |
| `DATABASE_URL` | api L132 | only read when `DB_DIALECT=postgres` |
| `AUTO_PRINT` | api L2493 | printing disabled |
| `SMTP_HOST/PORT/USER/PASS`, `SENDGRID_API_KEY`, `EMAIL_FROM` | api L530-549 | email silently simulated |
| `USE_REAL_DATA` | api L280 | all integrations bypassed, mock returned |

No config schema, no startup validation beyond the single `JWT_SECRET`-in-production
check (api L215-218).
