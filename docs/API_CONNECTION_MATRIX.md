# API CONNECTION MATRIX — React `web/` vs reachable `src/routes` (HEAD `9101746`)

Status: CONNECTED | PARTIALLY CONNECTED | CONTRACT MISMATCH | DEAD | MOCKED | SIMULATED | UNTESTED EXTERNAL | BROKEN

Reachable handler = **first** Express registration. Shadowed duplicates omitted.

| Surface | UI action | FE | Helper | HTTP | Endpoint | Handler | Service / store | Persists? | FE uses | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth | Login | LoginPage | `login` | POST | `/v3/auth/login` | auth.js | User SQLite | session JWT | token,user | CONNECTED |
| Auth | `/me` | AuthContext | `getMe` | GET | `/v3/auth/me` | auth.js | User | n/a | merge user | PARTIALLY CONNECTED (override JWT has no id) |
| Auth | Forgot | LoginPage disabled | — | — | `/v3/auth/forgot-password` unused | auth.js | User.resetToken | token yes, redeem **no** | — | DEAD |
| Auth | Reset | none | — | POST | `/v3/auth/reset-password` | **none** | — | — | — | DEAD |
| Auth | Logout | Sidebar | localStorage | — | `DELETE /v3/auth/me` unused | auth.js | — | — | — | DEAD |
| Auth | Change password | none | — | POST | `/v3/auth/change-password` | auth.js | User | yes | — | DEAD (no UI) |
| Dashboard | KPIs | DashboardPage | `getLabelOverview` | GET | `/v3/label/overview` | label.js | roster hybrid | derived | 4 cards | CONNECTED |
| Dashboard | Forecast | DashboardPage | `getProjections` | GET | `/v3/analytics/projections` | analytics.js | SalesEntry or synthetic | if ≥3 sales else **synthetic** | chartData | PARTIALLY CONNECTED |
| Dashboard | Log sale | LogSaleForm | `postSales` | POST | `/v3/analytics/sales` | analytics.js | SalesEntry | **yes** | refetch | CONNECTED |
| Dashboard | Heatmap | DashboardPage | `getGeography` | GET | `/v3/analytics/geography` | analytics.js | memory roster | no | regions | CONNECTED (derived) |
| Dashboard | Export | ExportControls | `exportPath` | GET | `/v3/exports?format=` | reports.js | PDFKit/csv | file download | blob | CONNECTED |
| Console | archive/restore/sign | CommandConsole | artist helpers | POST | `/v3/artists` `/archive` `/restore` | artists.js | Artist SQLite | yes | message | CONNECTED |
| Console | free text | CommandConsole | `aiQuery` | POST | `/v3/ai/query` | ai.js → aiService → Groq | Groq or **dev fallback 200** | cache memory | `answer` | PARTIALLY CONNECTED |
| AI | providers | useAiProviders | apiFetch | GET | `/v3/ai/providers` | **missing** | — | — | 404 degrade | DEAD |
| AI | SET DEFAULT | AiSettingsView | — | — | — | — | — | — | disabled | DEAD |
| AI | keyword | none | — | POST | `/v3/ai/analyze` | ai.js keyword | mock | no | unused | SIMULATED / FE DEAD |
| Artists | list | ArtistsPage | `getArtists` | GET | `/v3/artists` | artists.js | hybrid | yes | table | CONNECTED |
| Artists | create | ArtistsPage | `createArtist` | POST | `/v3/artists` | artists.js | Artist | yes | refetch | CONNECTED |
| Artists | archive/restore | ArtistsPage | archive/restore | POST | `.../archive\|restore` | artists.js | Artist | yes | refetch | CONNECTED |
| Artists | detail | ArtistDetailPage | `getArtist` | GET | `/v3/artists/:id` | artists.js | findById | yes | tabs | CONNECTED |
| Artists | image | OverviewTab | `updateArtistImage` | PUT | `.../image` | artists.js | Artist.data | yes | refetch | CONNECTED |
| Artists | KG line | ArtistDetailPage | `getGoogleKg` | GET | `/v3/integrations/google-kg` | integrations.js | Google or unconfigured 200 | no | name/desc | UNTESTED EXTERNAL |
| Artists | entity audit | EntityAuditTab | `getEntityAudit` | GET | `.../entity-audit` | artists.js → entityAuditService | KG/Wiki/Discogs/Fandom/Genius/Groq | cache | **score only** | PARTIALLY CONNECTED |
| Artists | monthly-sales / development | none | — | GET | those routes | artists.js | — | — | unused | DEAD UI |
| A&R | room state | AnrRoomView | `getAnrState` | GET | `/v3/anr/state` | anr.js | **memory anrState** | **no** | demos, whiteboard | CONNECTED read / MOCKED durability |
| A&R | rate demo | AnrRoomView | `voteDemo` | POST | `/v3/anr/vote/:id` | anr.js | memory ratings[] | **no** | hasVoted | SIMULATED persist |
| A&R | tally | AnrRoomView | `getDemoRating` | GET | `/v3/anr/demos/:id/rating` | anr.js | memory or DB fallback | mixed | stars | PARTIALLY CONNECTED |
| A&R | submit demo | AnrRoomView | `createSubmission` | POST | `/v3/anr/submissions` | anr.js | AnrSubmission **DB** | yes **other tab** | notice | PARTIALLY CONNECTED |
| A&R | whiteboard write | none | — | POST | `/v3/anr/whiteboard` | anr.js | memory | no | unused | DEAD UI |
| A&R | listening write | none | — | POST | `/v3/anr/listening` | anr.js | memory | no | unused | DEAD UI |
| A&R | scout | AnrScoutingView | `getScouts` | GET | `/v3/anr/scout` | scoutService | **fixtures** | no | scouts[] | MOCKED |
| A&R | shortlist | AnrScoutingView | `shortlistScout` | POST | `/v3/anr/shortlist` | anr.js | AnrSubmission | yes | message | CONNECTED |
| A&R | inbox vote | AnrScoutingView | `voteSubmission` | POST | `/v3/anr/submissions/:id/vote` | anr.js | AnrSubmission IMMEDIATE txn | yes (SQLite) | refetch | CONNECTED |
| A&R | delete | AnrScoutingView | `deleteSubmission` | DELETE | `/v3/anr/submissions/:id` | anr.js | AnrSubmission | yes | refetch | CONNECTED |
| A&R | evaluate | none | — | POST | `/v3/anr/evaluate` | anr.js | Math.random | no | unused | MOCKED / FE DEAD |
| Marketing | stats | MarketingPage | `getCampaignStats` | GET | `/v3/campaigns/stats` | marketing.js | roster + canned history | no | cards | MOCKED |
| Marketing | launch | MarketingPage | `createCampaign` | POST | `/v3/marketing/campaigns` | marketing.js | **nothing stored** | **no** | plan, id | BROKEN (lying 200) |
| Marketing | update | none | — | — | **no route** | — | — | — | — | DEAD |
| Fans | page | FansPage | `getFanDemographics` | GET | `/v3/fans/demographics` | label.js | profile fixtures | no | tables | MOCKED |
| Ops | logistics/assets/contracts | OperationsPage | get* | GET | `/v3/operations/*` | operations.js | profile fixtures | no | tables | MOCKED |
| Ops | writes | none | — | — | none | — | — | — | — | DEAD |
| Settings | status | IntegrationsView | `getIntegrationStatus` | GET | `/v3/integrations/status` | integrations.js | memory map | no | connected flags | CONNECTED shape / SIMULATED data |
| Settings | connect | IntegrationsView | `connectIntegration` | GET | `/v3/integrations/auth/:service` | integrations.js | mock_token | **no** | Connected | SIMULATED |
| Settings | disconnect | IntegrationsView | `disconnectIntegration` | POST | `/v3/integrations/disconnect` | integrations.js | memory | no | refetch | SIMULATED |
| Admin | list/create/update/delete | AdminPage | users helpers | * | `/v3/users` | users.js first regs | User SQLite | yes | table | CONNECTED |
| Intelligence | graph | IntelligencePage | `getArtists` | GET | `/v3/artists` | artists.js | roster | yes | nodes | CONNECTED data / empty collabs |
| Reports | generate-all / monthly PDF | none | — | * | those routes | reports.js | disk files | files | unused | DEAD UI |
| Finance | royalties / rights | none | — | * | those routes | finance.js | compute / fake URL | no | unused | DEAD UI + BROKEN rights |
| Health | — | none | — | GET | `/health` | system.js | — | — | unused | CONNECTED (API) |

**React-invented path:** `GET /v3/ai/providers` only.

**Backend with no React caller (selected):** forgot-password, GDPR delete, change-password, tours, ai/analyze, monthly-sales, development, fandom/*, test-limit, royalties, rights/contracts, anr/evaluate, whiteboard, listening, anr/stats, anr/demos POST, reports monthly, generate-all.
