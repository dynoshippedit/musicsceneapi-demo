# Brand portability audit — current repository state

## 1. Executive conclusion

**IS THE APPLICATION CURRENTLY BRAND-SWITCHABLE WITHOUT REWRITING GENERIC APPLICATION CODE? NO.**

This is a source audit of the files on disk, including the four untracked Phase 4A documents. The baseline Git check showed those four documents as untracked and no tracked diff. No Phase 4B web application, BrandProfile, BrandContext, brand registry, VITE_BRAND_PROFILE consumer, LABEL_SLUG resolver, or backend activeLabel object exists yet. The Phase 4A frontend brand layer is a specification, not an implemented capability. The two browser frontends remain standalone HTML applications.

The current pulsegrid data and intelligence are valuable and should remain the default. The defect is that generic execution paths import or embed those values directly. Switching only configuration to Example Records would leave the pulsegrid roster, social mappings, search context, AI prompt, knowledge sources, PDFs, email, styling, and root-admin rule in use. Static source tracing supports this conclusion; this audit did not run the server, tests, integrations, or PDFs.

Severity: **BLOCKER** means the new label cannot work correctly without a generic-source edit; **MAJOR** means it can run but leaks identity, intelligence, styling, or misleading label data; **MINOR** means maintenance or naming only. Classifications are **A** legitimate label/demo data, **B** brand configuration, **C** platform or business-logic coupling, **D** test/documentation/comment, and **E** evidence insufficient. In the tables, an A value inside a C site must be *moved*, not deleted.

### Actual configuration flow

| Concern | Current authoritative path | Bypass or missing seam |
|---|---|---|
| Active label / profile | None. src/config/index.js:60-120 has operational settings only. | src/repositories/artistRepository.js:34-49 imports the pulsegrid mock directly; src/routes/context.js:77-85 distributes it. |
| Frontend brand / theme | pulsegrid-frontend-connected.html:7,29-70,3042,3429-3446; terminal page:6,23-39,130-131. | No web/ tree or BrandContext. The theme changes by clock, not active label, at workstation:3147-3159. |
| Search context / knowledge | src/routes/integrations.js:65-70 and modules/entityAudit.js:63-64,546-732. | The configured label cannot change either fallback prefix or source domain. |
| AI label context / provider | src/ai/prompts.js:34-41; src/ai/aiService.js:27-31,69-79; src/ai/groqClient.js:50-96. | The service imports the Groq adapter and uses a pulsegrid system prompt. GROQ_MODEL changes a model within Groq; it is not provider selection. |
| Reports / email / locale | src/reports/monthlyReport.js:43-57; src/routes/reports.js:149-175; src/config/index.js:109-117. | PDFs and email duplicate fixed identity. Dollar signs and host-local dates bypass any label locale. |
| Auth / administration | src/models/index.js:94-105; src/routes/auth.js:161. | ADMIN_EMAIL/PASS can add an override login but do not change the fixed root-admin deletion guard. |

The intended future web/src/brand/ design in FRONTEND_ARCHITECTURE.md §14 has a sensible registry and active-profile path, but it has not been built. Even if built exactly as specified, the backend would still return pulsegrid-specific results. The Phase 4B Example Records check covers login/dashboard display with the same backend numbers; it cannot prove end-to-end intelligence or report portability.

## 2. Runtime coupling findings

Each row identifies the smallest useful source location, the value or assumption, its effect, and the smallest appropriate remediation. Rows are grouped by path rather than by every repetition of the same literal.

### Backend, knowledge, AI, and output paths

| ID | Severity / class | Exact source | Value or assumption; portability effect | Smallest remediation |
|---|---|---|---|---|
| R01 | BLOCKER / C | src/config/index.js:60-120; src/routes/context.js:43-85 | No active label is resolved or passed through the dependency bundle. Operational env settings do not form a label profile, so independent services cannot obtain one authoritative label. | Resolve one active backend label at boot (pulsegrid default), expose it through config/context, and validate profile identity. |
| R02 | BLOCKER / C | src/repositories/artistRepository.js:34-49; production-api.js:75-81 | A fixed require of ../../mock/artistData supplies all artist reads, label totals, and database artist seeding. A second roster cannot be selected by configuration. The mock itself is class A. | Load the selected label's roster/totals through activeLabel.datasets; keep today's mock values as the pulsegrid dataset. |
| R03 | BLOCKER / C | integrations/index.js:12-29,39-45 | ARTIST_MAPPINGS hardcodes art_lumenveil and art_novakin with Spotify, Instagram, Ticketmaster, YouTube, Twitter, and TikTok identities. Other label artists use mock fallback even with credentials. The mappings are useful class A intelligence at the wrong boundary. | Resolve mappings from active label data or each artist record; preserve every pulsegrid mapping. |
| R04 | MAJOR / C | src/routes/integrations.js:54-78 | The generic Google KG route always tries Fandom and then the literal query prefix “pulsegrid ”. Another label receives the wrong image/search context. | Read activeLabel.search.searchContext and enabled knowledge fallback sources; keep the pulsegrid prefix and Fandom fallback in its profile. |
| R05 | MAJOR / C | modules/entityAudit.js:49-66 | “DJ” and “Music” are broad music fallbacks, but the tertiary “pulsegrid artist ” query is fixed in the generic auditor. | Use activeLabel.search.artistQueryPrefix for the tertiary search; retain “pulsegrid artist” for this profile. |
| R06 | MAJOR / C | modules/entityAudit.js:546-556,612-661 | getFandomRoster and auditLabel select Pulsegrid Wikipedia/Fandom/Discogs pages and a pulsegrid summary. auditLabel is exported through src/integrations/index.js:45-52 but currently has no HTTP route; the roster endpoint is live at src/routes/integrations.js:90-96. | Put source URLs, page titles, summary, image, and optional-source rules in activeLabel.knowledge; retain the current values. |
| R07 | MAJOR / C | modules/entityAudit.js:684-732; src/services/entityAuditService.js:56-69 | Per-artist audit always searches lumenveil.fandom.com and the orchestrator always requests the same five sources. A different label's source list cannot be selected. | Resolve enabled sources/host from active label intelligence; skip unavailable sources without changing pulsegrid's current five-source behavior. |
| R08 | MAJOR / C | modules/entityAudit.js:447-458 | JSON-LD invents www.<lowercased artist name>.com and matching Instagram/Twitter handles from artist names when numeric social metrics exist. Artist identity/aliases cannot safely be inferred this way, including for current artists. | Read explicit artist website and social aliases from label/artist data; omit an unknown link. |
| R09 | MAJOR / C | modules/entityAudit.js:573-590 | The Fandom roster parser assumes the current wiki's English “Current”, “Former”, “Previous”, and “Artists” sections. A different knowledge source may have a different structure. | Keep this parser as the pulsegrid Fandom adapter; select a source-specific parser or no roster source per active label. |
| R10 | MAJOR / B | modules/entityAudit.js:180,206,228,287,621 | PulsegridIntelligence, pulsegrid-api, and PulsegridBot User-Agent identities are emitted by generic audits. | Obtain all three HTTP identities from activeLabel.http, preserving their current strings. |
| R11 | BLOCKER / C | src/routes/anr.js:165-176 | Generic A&R evaluation maps only prospectId p1 to “Neon Horizon”, fixes the benchmark to lumenveil, and returns a canned 82% similarity and fixed deal/revenue assumptions. The prospect and benchmark cannot switch with a new label. | Look up prospect by ID in selected scouting data and read the benchmark and any reference evaluation copy/values from activeLabel.anr; keep today's demo response for pulsegrid. |
| R12 | MAJOR / C | src/ai/prompts.js:25,34-41,65 | The system message is “AI analyst for pulsegrid…”; artist context and report prompt embed “$”. A new label's AI context and currency are ignored. | Inject activeLabel.ai.systemContext and format monetary prompt context with activeLabel.locale.currency/numberLocale. |
| R13 | MAJOR / C | src/ai/aiService.js:127-143 | Keyword “AI” appends “Novakin is second at 6.5x”, chooses artists[1] as a touring comparison, and asserts a TikTok trend and 15% YoY growth without label data. The array index is semantic artist coupling with no brand literal. | Read any label-authored canned insight from activeLabel.ai; derive comparison artists and factual metrics from current data or suppress unsupported claims. Preserve current pulsegrid text only as explicit profile/demo intelligence. |
| R14 | MAJOR / C | src/ai/aiService.js:27-31,39,69-79,107-112,167-178; src/ai/groqClient.js:50-96; src/config/index.js:90-95 | Runtime AI has one selected transport: Groq. aiService imports it directly and uses config.groqModel for every call. Transport injection exists for tests, but no provider registry, selected provider, or provider/model metadata API exists. This is a provider-neutrality defect separate from label selection. | Keep groqClient as an adapter; have aiService consume a provider-neutral client selected by config/request when provider choice is implemented. A full second provider is not needed to establish the boundary. |
| R15 | MAJOR / B | src/config/index.js:82 | SQLite storage is pulsegrid_v5.sqlite, with no DB_STORAGE read. A second label on the same deployment would open the pulsegrid database. | Use activeLabel.db.sqliteFile with an explicit environment override; retain the pulsegrid filename as its default. |
| R16 | MAJOR / B | src/config/index.js:109-117 | EMAIL_FROM defaults to pulsegrid OS/notify@pulsegrid.fm and resetLinkBase is fixed localhost:8080. EMAIL_FROM can be overridden, but reset links cannot be configured and neither field comes from one label identity. | Resolve default sender and public reset URL from active label/deployment config; keep EMAIL_FROM as override. |
| R17 | BLOCKER / C | src/routes/auth.js:157-163 | The root-admin deletion guard compares only admin@pulsegrid.fm. A new label's root admin would not be protected, while a migrated pulsegrid address remains special. | Compare to activeLabel.rootAdminEmail or a stored root role/flag; retain today's address in the pulsegrid profile. |
| R18 | MAJOR / B | src/routes/auth.js:131-143; src/services/emailService.js:71-84 | Two password-reset paths duplicate “pulsegrid OS - Password Reset Request” and green HTML links/headings. Changing EMAIL_FROM alone still sends a pulsegrid subject/theme. | Use one email identity/template from active label configuration in both callers or one shared reset sender. Preserve current pulsegrid rendering. |
| R19 | MAJOR / B | src/reports/monthlyReport.js:43-55,437-449 | Monthly PDF hardcodes #00FF00, “pulsegrid” header, and “PULSEGRID INTELLIGENCE • CONFIDENTIAL” footer. | Read report accent/header/footer from activeLabel.reports; keep the current profile's exact values. |
| R20 | MAJOR / B | src/routes/reports.js:149-175 | Export PDF hardcodes “pulsegrid Intelligence Report” and “Generated by pulsegrid OS v5.0”. It bypasses the monthly PDF builder, so fixing only R19 is insufficient. | Read the same activeLabel.reports identity in the export route. |
| R21 | MAJOR / B | src/reports/monthlyReport.js:57,82,142-150,347,419,432-433; src/routes/reports.js:153; src/ai/prompts.js:25,65 | PDF and AI values use dollar signs and host-local toLocaleString dates/numbers. A label with GBP/Europe-London cannot obtain correct display by switching profile alone. | Centralize currency, locale, and time-zone formatters from the active label; do not treat changing display currency as conversion. |
| R22 | MAJOR / B | src/utils/charts.js:30,52,78-79,106; src/routes/analytics.js:162-166 | Generated chart images and the projection JSON payload use #00FF00/#00FF5F green even if a future frontend theme changes. This styling path was absent from the Phase 4A backend inventory. | Supply report/chart colors from activeLabel.theme/reports while preserving current green for pulsegrid. |
| R23 | MAJOR / B | src/config/logger.js:27-34; server.js:60-79; ecosystem.config.js:1-4 | Logger metadata, boot banner, seeded-account banner, and PM2 app name still say pulsegrid. The server banner also advertises demo@novakin.band, which src/models/index.js:94-105 does not seed. These leak identity or stale demo information, though normal API responses still run. | Resolve service/display names from active label or deployment config; derive the account list from selected seed data or omit credentials. Keep pulsegrid as the default. |
| R24 | MAJOR / C | src/models/index.js:94-105 | The generic initDB function creates fixed pulsegrid and Novakin users, passwords, access scopes, and artist ID on an empty database. These accounts are legitimate class A demo data but the seeder directly owns them. | Seed from activeLabel.datasets.users; retain the same two accounts for the pulsegrid installation. |
| R25 | MAJOR / C | src/repositories/operationsRepository.js:21-97 | Generic repository exports the old label-mark-named, NOVAKIN, lumenveil, GLASSWOLFE, and USD-denominated operations fixtures for every deployment. The records are class A demo data; their unconditional selection is class C. | Move the fixture under pulsegrid data and have the repository load the selected label's operations dataset. |
| R26 | MAJOR / C | src/repositories/inMemoryStores.js:39-83 | Generic process stores start with pulsegrid A&R examples: Neon Relay, a pulsegrid SoundCloud URL, lumenveil/Novakin submitters, and a Tech House/Minimal brief. These are class A seed values returned by live endpoints regardless of active label. | Initialize stores from activeLabel.datasets.anrSeeds/prospects; preserve the pulsegrid values. |
| R27 | MAJOR / C | src/integrations/scoutService.js:33-70 | The generic scouting service always returns four fixed electronic-music candidates/genres, even for another label's scouting context. The fixtures are class A data but remain embedded in the service. | Supply candidate fixtures from the selected label dataset; leave filtering logic generic. |
| R28 | MAJOR / C | src/routes/label.js:77-105 | The fan endpoint publishes fixed ages, genders, Los Angeles/Toronto and other locations, and platform growth as “Global Demographics (Mock Aggregation)”. Another label receives the same purported audience intelligence. | Derive from active artist data or load an explicit selected-label demo fixture and label it as such. |
| R29 | MAJOR / C | src/routes/artists.js:271-285 | The generic development endpoint asserts 15% genre outperformance, South America touring demand, and merch advice for every artist. It has no label/artist evidence. | Derive from artist data or make the text an explicit selected-label demo insight; retain existing reference output only under pulsegrid demo data. |
| R30 | MAJOR / C | src/routes/marketing.js:57-79 | The Jul–Dec mock CRM history is returned as label stats for every deployment, regardless of actual label history. It is reference/demo data embedded in a generic route. | Load selected-label demo history or calculate it from recorded CRM history; retain current output for the pulsegrid reference data. |
| R31 | MINOR / D | production-api.js:1,35-81; server.js:33 | The assembler filename is brand-named, but it holds no label business logic. A second label could run through this path; a rename is cleanup, not a portability prerequisite. | Rename mechanically only when convenient, updating imports/tests together. |
| R32 | MINOR / E | src/routes/marketing.js:41-47 | Campaign strategy presets such as “Submit to Spotify Editorial” are fixed in a generic route. The source does not establish whether they are intentionally platform-wide examples or current-label playbooks. | Decide ownership; if label playbooks, load them from activeLabel.marketing, otherwise document them as generic presets. |
| R33 | MAJOR / C | src/ai/aiService.js:35-37,87-94; src/routes/ai.js:110-120 | Development AI failures return a fixed “Growth is stable at 2.5%” and “tour frequency in EU” claim, with a duplicate fallback in the route. A second label receives invented geographic/strategy advice outside its AI context. | Keep any desired pulsegrid demo fallback as selected-label data, or return an honest unavailable state; make both fallback paths use one source. |

### Current browser frontends

| ID | Severity / class | Exact source | Value or assumption; portability effect | Smallest remediation |
|---|---|---|---|---|
| W01 | BLOCKER / C | pulsegrid-frontend-connected.html:7,3042-3085,3372,3429-3446,3572-3585 | Title, login wordmark/domain, export filename, sidebar mark/name, and label-audit prose are embedded in generic view code. The banner is conditional on a route that currently 404s, but its text would leak if enabled. | In the planned React app, read display text/assets/filename prefix from useBrand and source-driven audit copy; keep the pulsegrid mark/profile intact. |
| W02 | MAJOR / B | pulsegrid-frontend-connected.html:29-70,200-227,3429-3443,3147-3159 | Green/red palette, the old mark CSS/SVG, and a clock-selected white/red day theme are in the page rather than an active theme. Switching a label requires editing component/CSS source. | Implement the specified theme/mark registry and semantic tokens; use pulsegrid-console as default. |
| W03 | MAJOR / B | pulsegrid-frontend-connected.html:342,423,1043,1118,1198,1493,2269,2311,2352,2384,2492,3542 | Extra chart/map/status greens, SoundCloud embed color, and dollar signs sit outside the main CSS variables. A new theme/locale would still show green/USD. | Route visuals through semantic tokens and values through profile formatters, including embed options. |
| W04 | MAJOR / C | pulsegrid-frontend-connected.html:983-1011; FRONTEND_ARCHITECTURE.md:193-196; PHASE_4A_HANDOFF.md:127 | The map has a verbatim table of current roster cities and venues, including Guvernment, Toronto. The proposed 4C geoCenters.js copies it into generic component code. A second label's new venue strings would need source edits or disappear from the map. | Treat generic geography separately from selected-label venue aliases/coordinates; load the latter as label data or geocode/API coordinates. |
| W05 | MAJOR / C | pulsegrid-frontend-connected.html:2281,3720-3729 | The visible intelligence panel calls itself “Groq Intelligence” and an artist view says “GROK FORECAST”. There is no frontend provider/model selector; the Phase 4A aiClient/AiProviderContext design is still unimplemented. | Render provider/model from normalized AI state in the planned frontend, with Groq as today's selected provider. |
| W06 | MAJOR / C | pulsegrid-terminal-dashboard.html:6,23-39,91,130-131,244,250,264,485,542 | The second advertised frontend hardcodes title, old-brand Tailwind classes/palette, wordmark, Grok prompt identity, and export filename. The Phase 4B plan consolidates it later but does not make the current file switchable. | Migrate its retained features through the same brand layer, or explicitly retire the page when consolidation is complete. |
| W07 | MAJOR / C | pulsegrid-terminal-dashboard.html:503-512,565-579 | Error fallbacks invent Novakin/lumenveil AI claims, and preview fallback ships a pulsegrid artist roster. They execute when the API is unavailable/previewed; this is not merely documentation. | Put reference fallback data under the pulsegrid demo profile or use an explicitly labeled generic unavailable state. |
| W08 | MAJOR / B | pulsegrid-terminal-dashboard.html:420-422 | The terminal chart says “Revenue (USD)”, so a second label's currency setting would be ignored. | Use the active profile currency/locale for chart labels and values. |
| W09 | MAJOR / B | pulsegrid-frontend-connected.html:236; pulsegrid-terminal-dashboard.html:95-96 | Both browser apps fix the API origin to localhost:3000. A differently hosted label deployment requires an HTML source edit independent of brand selection. | Read a deployment API base URL from configuration in the new frontend; retain local development as its default. |
| W10 | MAJOR / B | README.md:13-18,86-87; pulsegrid-frontend-connected.html and pulsegrid-terminal-dashboard.html (filenames) | The advertised URLs to both current frontends contain pulsegrid in the path. A new label could run the files, but its public URL would leak the old identity. | Serve the selected frontend from a label-neutral route/path when the new app replaces the legacy pages; retain these filenames as reference artifacts. |

## 3. Frontend findings

The Phase 4A claim of a brand-neutral **architecture** is a plan. The current working UI is pulsegrid-frontend-connected.html, and README.md:11-18 also advertises pulsegrid-terminal-dashboard.html. There is no web/ source tree or VITE_BRAND_PROFILE consumer. W01–W10 identify the actual edits a second label would require today.

The proposed BrandProfile, registry/defaultSlug, BrandContext, BrandMark, BrandLoader, semantic tokens, title/favicon switch, locale formatters, and platform.* storage convention would address much of W01–W03 if implemented exactly as specified. Navigation names such as Dashboard and Artists are generic; the fixed five-item navigation at workstation:3450-3456 is a product structure, not a pulsegrid value. The fixed venue table proposed for web/src/components/maps/geoCenters.js (W04) is a remaining design-level bypass of the profile/data boundary. The planned example-records profile is a test fixture in documentation, not an existing profile.

No explicit pulsegrid localStorage key was found. The existing authToken/userData keys at pulsegrid-frontend-connected.html:3135-3136,3220-3228 and pulsegrid-terminal-dashboard.html:98-99,308-309 are platform keys. Their values should be reconciled if a deployment changes label on the same origin. There is no favicon link in either current HTML page; the planned favicon path exists only in the Phase 4A specification.

## 4. Backend findings

R01–R03 establish the missing active-label and dataset path. R04–R11, R17, and R24–R30 show service and route bypasses. The current config module centralizes many environment values but not brand intelligence; modules/entityAudit.js:10-11,168-169,271-272,330-335 also reads integration credentials directly. Those credential reads are an operational-config duplication, not by themselves pulsegrid coupling. The root-admin deletion rule is coupled despite the separate ADMIN_EMAIL login override.

The active API's /health response at src/routes/system.js:38-45 contains no label identity. The fixed assembler name and source comments mentioning the original file are D-level maintenance references, not reasons to strip pulsegrid data. The older Server v5.js:14-100 is an orphan alternate server per BACKEND_ARCHITECTURE.md; its pulsegrid users/AI copy are legacy reference behavior, not part of server.js runtime. If it is deployed independently, it requires its own profile boundary.

## 5. Knowledge and intelligence findings

Search quality depends on the pulsegrid prefixes in R04–R05. They must remain as current profile values. The Fandom host, label Wikipedia/Discogs pages, fallback summary/image, User-Agents, social IDs/handles, benchmark artist, prospect seeds, and A&R examples are also useful pulsegrid intelligence. R03, R06–R11, and R26–R27 show where generic services consume them directly.

R08 is a semantic alias defect with no obvious label literal: generating social links from a name ignores real handles. R09 is another: a parser specialized for one wiki is treated as universal. W04 would carry the same mistake into the future React map. These are absent from FRONTEND_ARCHITECTURE.md §15.

## 6. AI findings

**Provider neutrality: NO. Label neutrality: NO.** R14 traces the Groq-only runtime path; R12–R13 trace the pulsegrid prompt and canned response path. The Groq adapter is separately packaged and test-injectable, but aiService selects it directly and every production call uses config.groqModel. The backend has no provider metadata endpoint or provider/model request selection. The Phase 4A frontend selector architecture (FRONTEND_ARCHITECTURE.md §8; PHASE_4A_HANDOFF.md §12–13) is a future contract, not live code. The “Grok”/“Groq” names in the two old frontends (W05, W07) also bypass that future contract.

The model fallback in src/ai/responseParser.js:49-54 (“AI analysis unavailable”) is neutral and can remain. R33 covers the two development fallback paths that make unsupported EU/tour-growth claims. The keyword endpoint's fixed 0.98 confidence at src/routes/ai.js:48-60 is a separate accuracy defect; it does not encode pulsegrid identity.

## 7. Branding and theme findings

W01–W03 and W06 cover browser branding. R19–R23 cover server-rendered branding and generated chart output. FRONTEND_ARCHITECTURE.md §14.4 deliberately uses pulsegrid green as the *default reference theme* and permits per-profile overrides; that is sound as a design. Its implementation does not exist. The reference contract and the PULSEGRID_VISUAL_DESIGN_CONTRACT.md filename are D: they describe the current theme and should remain legible as such.

The static pulsegrid name in ecosystem.config.js:3 is deployment configuration (B), while its script points to the brand-named assembler at line 4. The latter is a maintenance issue separate from profile resolution. .env.prod.template:4,11 and .env.example:21,31 contain example pulsegrid domains/database/sender; those are D/B examples, not runtime defaults except where R15–R16 confirm matching code literals.

## 8. Email, report, and PDF findings

Changing EMAIL_FROM does not change the reset subject or HTML (R16–R18). The reset URL remains localhost. Both monthly report and export PDF paths have their own hardcoded title/footer (R19–R20); generated chart buffers and projection JSON preserve green independently (R22). Currency/date formatting in report and AI context bypasses the planned frontend-only locale profile (R21). Current pulsegrid strings, colors, dollar values, and PDF identity should be copied into the pulsegrid backend profile before consumers are redirected to it.

## 9. Auth and admin findings

The seed accounts are valid pulsegrid demo content, but generic initDB currently creates them unconditionally (R24). R17 is a live authorization rule tied to a specific address. ADMIN_EMAIL/PASS in src/config/index.js:76-77 and the override login in src/routes/auth.js:49-69 can configure an extra admin login, but do not make the root-admin rule portable. The user data and artistAccess authorization helpers use IDs supplied in requests/JWTs and do not themselves hardcode lumenveil/Novakin.

## 10. Seed, demo, and test findings

| Class / severity | Exact source | Why it is allowed or where isolation fails | Smallest action |
|---|---|---|---|
| A / none | mock/artistData.js:1-35,435-516,2140-2208,2704-2711 | The pulsegrid roster, artist names, influences, metrics, and labelTotals are intended active reference data. The file's contents are allowed. R02 flags only the generic repository's fixed import. | Preserve intact; make dataset selection profile-driven. |
| A / none | scripts/generate_roster.js:10-45,122 | lumenveil/NOVAKIN/STATIC BLOOM flagship rule and “Pulsegrid Sound” are reference roster-generation inputs, not generic runtime service logic. | Keep with pulsegrid tools/data if generalized. |
| A value / C selection | src/repositories/operationsRepository.js:21-97; src/repositories/inMemoryStores.js:39-83; src/integrations/scoutService.js:33-70 | These are legitimate demo records but generic modules return them for every label (R25–R27). | Externalize datasets; do not remove examples. |
| D / none | tests/support/cases.js:28-54,125-134; tests/regression/services.test.js:32,172,218,454,563; tests/regression/units.test.js:37-59; tests/snapshots/baseline.json:61-1250 and phase2_baseline.json:61-2400 | Tests and frozen snapshots intentionally assert the pulsegrid reference fixture. They expose the current coupling but do not cause it. | Preserve reference tests; add a separate second-profile contract test when runtime resolution exists. |
| D / none | tests/support/probe.js:137,163-164; tests/regression/snapshot.test.js:61-83,147-203 | The harness assumes current seed accounts and sqlite filename. This is appropriate for pulsegrid regression, though a future generic portability harness must parameterize the fixture. | Keep baseline; add profile-aware harness later. |
| D / none | lumenveil-api-docs.html:1-47; artist-analytics-api-docs.html:1-47; README.md:1-18; PULSEGRID_VISUAL_DESIGN_CONTRACT.md:1-20; committed PDF/JPEG report and prototype assets | Reference documentation and generated demo artifacts are allowed to name the current fan project. They are not application logic. | Retain; label them reference/demo in future shared docs. |
| D / none | src/auth/index.js:13,73-86; integrations/spotify.js:36-37,61; integrations/ticketmaster.js:15,35; extraction comments across src/ | Names/IDs in comments do not drive authorization or integration behavior. | No portability fix required. |

## 11. Findings absent from the Phase 4A backend inventory

FRONTEND_ARCHITECTURE.md §15 covers many literal sites but is not complete. The additional source findings are: R08 inferred social URLs; R09 wiki-section parser; R11 p1-to-Neon-Horizon branch and canned A&R numbers beyond the benchmark; R13 artists[1] comparison and unsupported trend/YoY claims; R14 the actual Groq-only runtime boundary; R16 non-configurable reset URL; R21 dollars and host locale in prompts/PDFs; R22 chart buffers and projection JSON green; R27 scouting fixtures in a generic service; R28 fixed fan demographics; R29 fixed artist development insights; R30 mock CRM history; R32 ambiguous campaign presets; and R33 duplicated factual AI fallback. The two old browser frontends and their semantic venue mapping are covered by W01–W10, not by the backend inventory. The proposed verbatim geoCenters.js transfer (W04) would introduce a generic-source portability defect during 4C if followed without a data boundary.

The inventory also calls src/models/index.js seeds class A and mock/artistData.js class A. That is correct for the **values**; R02 and R24 identify the separate problem that generic runtime code selects them unconditionally. Its logger/banner inventory omits ecosystem.config.js:3-4 and its report-color inventory omits src/utils/charts.js and src/routes/analytics.js:165.

## 12. Portability thought experiment: Example Records

Assume only a new profile/theme/assets/data and configuration are added, with different artists, domains, knowledge sources, benchmark, AI context, currency, and non-green theme. **Today that is insufficient.** The following files outside a label/profile/theme/data directory need a generic-source edit to make all current runtime surfaces actually switch. This is the complete set of identified direct edits for the specified switch; entries with related changes are grouped only for readability:

| Surface | Generic source files needing an edit today | Reason |
|---|---|---|
| Configuration and selection | src/config/index.js; src/routes/context.js; src/repositories/artistRepository.js; src/models/index.js | Resolve and distribute one selected label, roster, DB filename, mail identity, and seeds. |
| Auth/email/logging/start | src/routes/auth.js; src/services/emailService.js; src/config/logger.js; server.js; ecosystem.config.js | Root rule, reset identity/link, service metadata, banners, deployment name. |
| Knowledge/integrations | integrations/index.js; modules/entityAudit.js; src/routes/integrations.js; src/services/entityAuditService.js; src/integrations/scoutService.js | Artist mappings, searches, aliases, source list/host/parser, scouting dataset. |
| Intelligence and demo endpoints | src/routes/anr.js; src/ai/prompts.js; src/ai/aiService.js; src/routes/ai.js; src/routes/label.js; src/routes/artists.js; src/routes/marketing.js; src/repositories/operationsRepository.js; src/repositories/inMemoryStores.js | Benchmark/prospect, AI context/comparisons/fallback, demographics, development advice, CRM history, operations/A&R seeds. |
| Reports and visuals | src/reports/monthlyReport.js; src/routes/reports.js; src/utils/charts.js; src/routes/analytics.js | PDF identity/currency and green chart outputs. |
| Existing browser UIs | pulsegrid-frontend-connected.html; pulsegrid-terminal-dashboard.html | Display, title, mark, theme, currency, provider copy, fallbacks, exports. |

R32's strategy presets are the one unresolved ownership decision; they may need a further edit to src/routes/marketing.js if they are label playbooks. src/ai/groqClient.js needs an edit for runtime provider selection, but changing only the label while keeping Groq does not require changing that adapter. The brand-named production-api.js filename can remain functional under Example Records; renaming it is optional maintenance. Test fixtures and historical documentation are excluded from the generic-runtime edit list.

The proposed Phase 4B React skeleton, if built exactly as described, should require no component edits for Example Records on its **login and dashboard slice**. That is a planned frontend-only result. It would still consume backend values selected by R01–R30, so it cannot establish application-wide portability. The Phase 4B portability gate's same backend KPI numbers and absence of pulsegrid text on two screens are useful but too narrow for the product requirement.

## 13. False positives and intentionally allowed pulsegrid references

- The pulsegrid profile/theme/mark/favicon **specified** in FRONTEND_ARCHITECTURE.md §14 and PHASE_4A_HANDOFF.md §15 are the desired default. They are not implemented yet; their future files should retain the pulsegrid values.
- mock/artistData.js and scripts/generate_roster.js contain the current label's artists, influences, totals, flagship logic, and source-specific data. Their contents are class A. The fixed import/selection path is R02.
- The social IDs/handles, lumenveil Fandom pages, knowledge URLs, search prefixes, benchmark, AI context, green report palette, and reset sender/subject are *not* candidates for deletion. Their location/consumption causes R03–R22.
- src/models/index.js pulsegrid/Novakin credentials, operations records, scouting candidates, A&R demos, and current snapshots are valid reference data. The generic initializer/service placement causes R24–R27.
- Tests, historical architecture/API docs, source extraction comments, lumenveil-api-docs.html, PULSEGRID_VISUAL_DESIGN_CONTRACT.md, PDF/JPEG demos, and fan-project disclaimer are class D or A, not runtime portability failures.
- authToken/userData storage keys, /v3/label routes, the word “artist”, generic music-provider names, and current artist IDs *passed as variables* are not brand coupling. No pulsegrid-prefixed storage key was found.
- The orphan Server v5.js and obsolete package1.json/package-production.json are historical alternate artifacts, not the canonical server.js runtime. They should be reviewed if activated, but do not change this runtime verdict.

## 14. Minimum remediation set

### MUST FIX BEFORE 4B

1. Make the Phase 4B portability gate's scope explicit in the execution decision: its Example Records login/dashboard check is **frontend display portability only** until backend active-label resolution exists. Do not certify the application brand-switchable from that check.
2. Set the cross-stack identity contract before code is created: one active slug per deployment; matching frontend/backend name/domain/locale/search context; the pulsegrid profile as default; brand-specific intelligence/data owned by the profile or selected data. The backend has no current resolver (R01), so an end-to-end portability gate cannot pass today.
3. Keep W04's current venue aliases out of future generic geoCenters.js. The Phase 4A file map explicitly calls for a verbatim table, which would create a new portability regression in 4C.

If 4B is required to demonstrate an **end-to-end** second-label switch rather than its documented frontend slice, R01–R05, R11–R13, R17, and R24 are prerequisites to beginning that gate. They can be implemented as a separate backend profile pass; they should not be silently treated as already done.

### CAN FIX DURING 4B

1. Implement the specified web/src/brand/ registry, defaultSlug, BrandContext, BrandMark/BrandLoader, themes, profile-driven title/favicon/copy, locale formatting, and VITE_BRAND_PROFILE resolution; verify no label literals in generic web/src components. Retain the pulsegrid console as the default.
2. Replace W01–W03 in the new slice with brand consumers. Preserve the current old HTML files as historical references during the authorized migration. Do not claim the still-advertised terminal HTML has become switchable until its retained features are migrated or it is retired.
3. Establish the provider-neutral frontend aiClient/selection interface described in Phase 4A when AI UI enters scope. Keep Groq as the current provider; a second provider implementation is not required merely to fix the interface boundary.

### CAN DEFER UNTIL LATER

1. Externalize the remaining backend source-specific intelligence, mock/seed datasets, reports, email, chart colors, aliases, and locale through the active backend label (R03–R30). This is required before a real second-label deployment, even if the frontend slice can be built earlier.
2. Add source/profile tests for Example Records covering search prefixes, knowledge sources, social IDs, benchmark, AI prompt and fallback, admin guard, emails, PDFs, charts, and locale. Keep the pulsegrid snapshots as regression fixtures.
3. Rename the assembler, PM2 service, and old package/docs references when deployment tooling is updated. Resolve R32's preset ownership. Provider routing can be completed alongside the AI phase.

## 15. Final verdict

The existing default experience is pulsegrid-specific by design, and its data should remain. Today the specialization is wired into generic code, and the Phase 4A profile layer is only documented. The current application fails the Example Records switch without generic-source edits. A Phase 4B frontend slice may be built against a clearly limited frontend gate, but it cannot be reported as an end-to-end brand portability pass.

BRAND PORTABILITY VERDICT: FAIL

GENERIC PLATFORM CODE FREE OF UNEXPLAINED LABEL COUPLING: NO

SAFE TO BEGIN PHASE 4B WITHOUT PORTABILITY REGRESSION: NO
