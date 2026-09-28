# Gap Analysis — "API that tells pulsegrid artists what is going on at the label"

Read against commit as cloned. 65 routes in `production-api.js` (~3150 lines).

## A. Blockers — it does not run as shipped

| # | Gap | Evidence |
|---|-----|----------|
| A1 | `npm start` points at a file that does not exist | `package.json` → `"start": "node server.js"`; no `server.js` in repo (entry is `production-api.js`) |
| A2 | No `.env` | only `.env.example` / `.env.prod.template`. `ADMIN_EMAIL`/`ADMIN_PASS` unset → the admin-override branch at L482 compares `undefined === undefined` |
| A3 | Four competing manifests | `package.json`, `package1.json`, `package-production.json`, `package-lock.json` — unclear which is authoritative |
| A4 | No test script | `scripts` has only `start`; 20+ `test_*.js` / `verify_*.js` files are orphan runners, nothing invokes them |
| A5 | 5 duplicate route definitions — later ones are dead code | `POST /v3/users` (×3), `PUT /v3/users/:id` (×2), `DELETE /v3/users/:id` (×2), `POST /v3/ai/analyze` (×2), `GET /v3/anr/scout` (×2, one commented block at L1394) |

## B. The actual functional hole: there is no artist-facing surface

The stated goal is artist-inbound ("what is going on at the label"). The API is built
admin-outbound. Concretely:

- **No label activity/news feed.** Nothing like `GET /v3/label/feed`. `GET /v3/label/overview` (L2895) exists but is an aggregate exec view.
- **No announcements/notifications domain at all.** No model, no route, no read-state.
- **No release calendar.** No upcoming-releases, no schedule, no deadlines — the thing
  an artist most needs to see.
- **No per-artist royalty statement.** `POST /v3/royalties/calculate` (L1323) is a
  label-side calculator. An artist cannot pull "my statement for period X".
- **Artist role can read almost nothing.** `hasArtistAccess` gates only 6 routes
  (L922, L1144, L1250, L2006, L2549, L2898). Everything else is
  `if (req.user.role !== 'admin') return 403`. A logged-in artist sees their own
  artist record, monthly sales, one report, and the AI query — nothing about the label.
- **No self-serve identity.** Artists exist only if an admin creates the user
  (L677). No invite flow, no signup, no artist→user linkage table (`artistAccess`
  is a single string column, L151).

## C. Data is mock, not live

- `mock/artistData.js` — 29 artists, rich shape (revenue, touring, merch, brandDeals,
  forecast, roi…). Used at 5 call sites.
- `integrations/index.js` `fetchArtistData(artistId, mockData)` returns `mockData`
  whenever no API mapping exists (L42-43) and merges mock under live otherwise.
- `integrations/spotify.js` and `youtube.js` contain no `axios` calls at all —
  instagram / twitter / tiktok / ticketmaster do.
- `integrations/tiktok.js` L28: "For now, we'll use a placeholder structure".
- No credentials present, so every integration degrades to mock silently. There is no
  flag on the response telling a consumer the number is fake.

## D. Persistence is only one-third wired

Sequelize models defined: **`User`, `Artist`, `Stats`** (L145/158/165) on sqlite
(`pulsegrid_v5.sqlite`).

Everything else is module-scope memory and dies on restart:
- A&R submissions, votes, whiteboard, listening sessions, demos (L1422-1974)
- Marketing campaigns (L1572) and campaign stats (L1974)
- `salesData = {}` (L3041), `limiters = {}` (L396)
- Contracts / logistics / assets (L2878-2888) read from mock

## E. The sync loop is written but never runs

`sync/masterLoop.js` exports `masterSyncLoop(db, spotifyClient)` and is the intended
live-data path. `node-cron` is imported at L9 but the loop is not registered anywhere in
`production-api.js`. So `Stats` is never populated → no history → the
`GET /v3/analytics/projections` regression (L3058) has nothing real to regress on.

## F. To make it do the stated job — minimum build

1. Fix A1–A5 (entry point, `.env`, collapse manifests, delete shadowed routes).
2. Add models + migrations: `Announcement`, `Release`, `Statement`, `NotificationRead`,
   `ArtistUser` (join). Move A&R/campaigns out of memory into tables.
3. Add the artist read surface:
   - `GET /v3/me/feed` — merged announcements + releases + statements, scoped to caller
   - `GET /v3/me/releases` — my upcoming/past schedule
   - `GET /v3/me/statements` / `:period` — my royalties, artist-readable
   - `GET /v3/label/announcements` — label-wide, artist-readable
   - `POST /v3/me/feed/:id/read` — read state
4. Invert RBAC: replace scattered `role !== 'admin'` with a policy layer that grants
   artists read on their own + label-public scope by default.
5. Register `masterSyncLoop` on cron; add a `source: "live" | "mock"` +
   `fetchedAt` field on every stat so artists are never shown fake numbers as real.
6. Wire the `test_*` / `verify_*` files into `npm test` so the above is provable.
