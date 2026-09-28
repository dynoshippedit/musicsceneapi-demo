# Brand portability audit — independent recheck

## 1. First-audit verdict review

**Scope and method.** This pass read `BRAND_PORTABILITY_AUDIT.md`, `FRONTEND_ARCHITECTURE.md`, `PHASE_4A_HANDOFF.md`, `PHASE_4A_DESIGN_AUDIT.md`, `BACKEND_ARCHITECTURE.md`, `PHASE_3_VALIDATION.md`, and `REFACTOR_PROGRESS.md` before checking the current files. It traced the canonical `npm start` path (`package.json:7` → `server.js:28-35` → `production-api.js:42-81` → `src/routes/context.js:41-110`), the old browser pages, configuration, integration and AI modules, fixtures, tests, and deployment metadata. This is static verification; no server, tests, or Phase 4B implementation were run.

The first audit is substantially right about **today's runtime**: an actual second-label deployment cannot be obtained by supplying only a new profile and dataset. It is **too strict about the order of work**. Phase 4A expressly specified a frontend-only Phase 4B slice and assigned backend label closure to a later `4-LABEL` phase (`PHASE_4A_HANDOFF.md:426-439,660-662,686,802-812`). A pulsegrid-backed Example Records *display* run is the specified 4B test; it is not a proof that the data, AI, PDFs, email, or auth have switched labels. The first audit's final “not safe to begin 4B” does not follow from the source or handoff.

For the tables below, **CONFIRMED** means the cited defect and its materiality for a real rebrand are supported by source. **OVERSCOPED** means the source issue exists but the first audit overstated its brand-portability severity, live reachability, or pre-4B timing. **EXPECTED** means migration or implementation deliberately scheduled for 4B/4C. **INCORRECT** is reserved for claims contradicted by source. A/B/C/D retain the first audit's value/data/config/business-logic/documentation classes; a class-A value becomes class C when generic runtime code selects it unconditionally. “Later” means before claiming a real second-label deployment, not necessarily before 4B.

| Original BLOCKER | Recheck | Reason |
|---|---|---|
| R01 | CONFIRMED | No backend active-label resolver or route-context value; blocks a real configurable backend, but not the 4B frontend slice. |
| R02 | CONFIRMED | Fixed roster import feeds reads and seeding; blocks a real second-label roster, but not 4B. |
| R03 | OVERSCOPED | Fixed social IDs are real debt; artists without mappings still run on mock fallback, so MAJOR rather than BLOCKER. |
| R11 | OVERSCOPED | Fixed benchmark/prospect report is real debt; only A&R evaluation is wrong, so MAJOR rather than application BLOCKER. |
| R17 | CONFIRMED | Fixed root-admin email breaks that protection for a new root account; real rebrand BLOCKER, not a 4B prerequisite. |
| W01 | EXPECTED | The old workstation is hardcoded; Phase 4B creates a different React slice and explicitly leaves this HTML untouched. |

Every original MAJOR is disposed of individually in §§3–5. This recheck does not treat the absence of `web/`, `BrandProvider`, profiles, or `VITE_BRAND_PROFILE` wiring as a Phase 4A specification defect.

## 2. Confirmed BLOCKER findings

| ID / class | Independently verified runtime path and value | Phase 4A design coverage; smallest remedy; timing |
|---|---|---|
| R01 / C | `src/config/index.js:60-120` resolves operational env values but no active slug/profile; `src/routes/context.js:43-85` distributes that config to all route modules. | §15.2 L1 and §15.3 specify `LABEL_SLUG` → `config.label`/`activeLabel`; implement in later 4-LABEL, then pass the selected value through existing seams. No backend change needed for 4B. |
| R02 / C over A data | `src/repositories/artistRepository.js:34-49` requires `../../mock/artistData` unconditionally; `production-api.js:75-81` gives it to `initDB()`, and `src/routes/context.js:77-85` gives it to routes. | §15.2 L4 and §15.3 cover selected roster data. Keep the pulsegrid dataset intact and select it through `activeLabel.datasets.roster` later. This blocks real second-label artist/KPI correctness, not 4B. |
| R17 / C | Live `DELETE /v3/auth/me` in `src/routes/auth.js:157-163` protects only `admin@pulsegrid.fm`. A new label's root user would pass this guard. | §15.3 has `rootAdminEmail`; compare against that or a persisted root flag in later 4-LABEL. Preserve the current protected pulsegrid account. |

## 3. Confirmed MAJOR findings

Each row gives the smallest useful source range, the live path or reachability, the value that would leak or fail, and the relevant Phase 4A seam. These are **existing backend debt unless W04 says otherwise**. None needs completion before the documented 4B slice.

| ID / class | Independent source and runtime verification | Design coverage and smallest remedy / timing |
|---|---|---|
| R04 / C | `GET /v3/integrations/google-kg` at `src/routes/integrations.js:54-78` tries Fandom and `pulsegrid ${query}`. | §15.3 `search.searchContext` exists; resolve prefix and optional fallback sources from active label in 4-LABEL. Keep pulsegrid query quality. |
| R05 / C | `modules/entityAudit.js:49-66`, called through `src/integrations/index.js:31-52` and `src/services/entityAuditService.js:56-69`, uses `pulsegrid artist ${artistName}` as a tertiary KG query. | §15.3 `search.artistQueryPrefix` covers it; inject profile value later. |
| R06 / C | Live `/v3/integrations/fandom/roster` calls `modules/entityAudit.js:546-556`; the separately exported, currently unrouted `auditLabel()` at `:612-661` fixes Pulsegrid Wikipedia/Fandom/Discogs URLs and fallback prose. | §15.3 `knowledge` covers sources; externalize the live roster and label audit later. Do not count the unrouted audit as a current HTTP leak. |
| R07 / C | Artist entity audit via `src/services/entityAuditService.js:56-69` always calls five sources; `modules/entityAudit.js:684-732` uses `lumenveil.fandom.com` for any artist. | §15.3 provides the Fandom host/null source; also make the source list optional per label in 4-LABEL. Keep all five for pulsegrid. |
| R08 / C | `modules/entityAudit.js:447-458` generates website and Instagram/Twitter URLs by lowercasing an artist name when explicit identity is absent. This is wrong for aliases, including current artist handles. | §15.3 `datasets.socials` partly covers identity; use explicit artist/label alias and website data, omit unknown URLs. Later, with entity work. |
| R09 / C | `modules/entityAudit.js:573-590` parses the current Fandom roster's English sections. A new source with a different shape will not parse correctly. | §15.3 supplies URLs but **not parser selection**. Keep this parser as a source adapter and choose adapter by configured source, or skip unsupported roster sources. Later. |
| R10 / B | `modules/entityAudit.js:180,206,228,287,621` sends PulsegridIntelligence, pulsegrid-api, and PulsegridBot User-Agents in outgoing requests. | §15.3 `http.*UserAgent` explicitly covers them; read active label identity later, preserving these pulsegrid strings. |
| R12 / C | Real `/v3/ai/query` builds `src/ai/prompts.js:34-41` system prompt “AI analyst for pulsegrid”; `:25,65` also embeds `$` in artist/report context. | §15.3 `ai.systemContext` covers prompt identity. Backend monetary formatting needs a locale/currency field **absent from §15.3**; add it in 4-LABEL before real rebrand. |
| R13 / C | Live `/v3/ai/analyze` calls `src/ai/aiService.js:127-143`: “Novakin is second at 6.5x,” `artists[1]` touring comparison, fixed TikTok/15% claims. | §15.3 covers only `ai.heuristics.roiRunnerUp`; move other label-authored claims to data or derive from actual selected roster. Later. |
| R15 / B | `src/config/index.js:80-85` hardcodes `pulsegrid_v5.sqlite`; `src/models/index.js:29-40` consumes it when SQLite is selected. | §15.3 `db.sqliteFile` and L1 `DB_STORAGE` override cover one database per deployment. Later; PostgreSQL URL is already env configurable. |
| R16 / B | `src/config/index.js:109-117` defaults the live sender to `"pulsegrid OS" <notify@pulsegrid.fm>`; the same block fixes reset links to localhost. | §15.3 covers sender. Reset link base is **deployment URL configuration**, not inherently brand data; make it configurable when backend mail is closed. Later. |
| R19 / B | Live monthly PDF builder `src/reports/monthlyReport.js:43-55,437-449` uses green, “pulsegrid,” and “PULSEGRID INTELLIGENCE • CONFIDENTIAL.” | §15.3 `reports` covers header/footer/accent; pass active label to PDF builder later. |
| R20 / B | Separate export route `src/routes/reports.js:149-175` writes “pulsegrid Intelligence Report” and “Generated by pulsegrid OS v5.0.” | §15.3 `reports.title/generatedBy` covers the second PDF path; change both paths later. |
| R21 / B | `src/reports/monthlyReport.js:57,82,142-150,347,419,432-433`, `src/routes/reports.js:153`, and `src/ai/prompts.js:25,65` use dollars/host locale. | Frontend §14.2 has locale/currency, but backend §15.3 does **not**. Add explicit backend financial denomination and locale/time zone; format without pretending a currency change converts amounts. Later. |
| R22 / B | Generated charts at `src/utils/charts.js:30,52,78-79,106` use `#00FF00`; `/v3/analytics/projections` at `src/routes/analytics.js:162-166` returns `#00FF5F`. | Backend §15.3 has report accent, not a general chart/payload theme. Make generated colors active-label theme/report data later. Frontend CSS tokens cannot change already generated images/JSON. |
| R23 / B | `src/config/logger.js:27-34` says `pulsegrid-api`; `server.js:60-79` prints the pulsegrid banner and a `demo@novakin.band` account absent from `src/models/index.js:94-105`; `ecosystem.config.js:3-4` names the PM2 app pulsegrid. | §15.3 covers logger and §15.1 banner. Resolve operational names/seed listing from selected config/data later; PM2 name can be deployment config. This is mainly operator-facing leakage, still real. |
| R24 / C over A data | Empty-DB `initDB()` at `src/models/index.js:94-105` always seeds pulsegrid admin and NOVAKIN account/artist ID. | §15.3 `datasets.users` and L4 cover selection; preserve these accounts in pulsegrid seed data. Later. |
| R25 / C over A data | `src/repositories/operationsRepository.js:21-97` exports the old label-mark-named, NOVAKIN, lumenveil, GLASSWOLFE operations records to live operations routes. | §15.3 `datasets.operations` covers selection; move fixture intact and load selected label's data later. |
| R26 / C over A data | `src/repositories/inMemoryStores.js:39-83` initializes live A&R stores with Neon Relay, lumenveil/NOVAKIN, pulsegrid SoundCloud URL, and Tech House/Minimal brief. | §15.3 `datasets.anrSeeds` covers selection; preserve pulsegrid values and initialize from chosen label later. |
| R27 / C over A demo data | `/v3/anr/scout` uses `src/integrations/scoutService.js:33-70` fixed electronic-genre mock candidates for any query/label. | §15.3 does not expressly list scout fixtures; add selected demo-scout data while keeping filtering generic. Later. |
| R28 / C over A demo data | `/v3/fans/demographics` in `src/routes/label.js:77-105` returns fixed ages, cities, and platform growth even if roster changes. | Add selected-label demo demographics or derive measured values; §15.3 dataset list needs this extension. Later. |
| R29 / C | `/v3/artists/:id/development` in `src/routes/artists.js:271-285` asserts 15% genre outperformance, South America touring, and TikTok/LATAM focus for every artist. | Derive from selected artist metrics or place explicitly authored reference insights in label/artist data. §15.3 has no field yet. Later. |
| R33 / C | `src/ai/aiService.js:35-37,87-94` and `src/routes/ai.js:110-120` return invented 2.5% growth/EU touring advice on dev AI failure. | The frontend/provider abstraction cannot correct backend fallback content. Make fallback a selected-label demo response or an honest unavailable state; preserve the current pulsegrid demo response if parity requires it. Later. |
| W04 / C | Legacy map `pulsegrid-frontend-connected.html:983-1011,1020-1025` drops an unmapped `r.region`; `FRONTEND_ARCHITECTURE.md:193-196` and `PHASE_4A_HANDOFF.md:127` specify copying this venue/city table verbatim into generic `web/src/components/maps/geoCenters.js`. | **Actual 4C specification gap:** keep reusable geography generic, but put label venue aliases/coordinates in label data or accept coordinates from the API. Correct when implementing the 4C map, not before 4B. |

## 4. Findings that are EXPECTED 4B/4C work

| ID / original class | Independently verified current state | Correct disposition |
|---|---|---|
| W01 / C | `pulsegrid-frontend-connected.html:7,3042-3085,3372,3429-3446,3572-3585` has pulsegrid title, mark, copy, export name. | EXPECTED 4B/4C migration. §14 and the handoff require new components to consume `useBrand()`; old HTML is explicitly left untouched (`PHASE_4A_HANDOFF.md:455-459`). |
| W02 / B | Same HTML `:29-70,200-227,3147-3159,3429-3443` owns palette/mark/day-theme behavior. | EXPECTED new brand/themes/mark registry work in 4B; current HTML itself is not the architecture test. |
| W03 / B | Same HTML includes extra green/chart/map/embed/USD literals at first-audit cited lines. | EXPECTED component/chart/locale migration across 4B and 4C; verify each migrated page against §14/§17 gates. |
| W05 / C | `pulsegrid-frontend-connected.html:2281,3720-3729` has Groq/GROK copy and no selector. | EXPECTED provider-neutral React AI surface in later 4C; the handoff §12 specifies 404-safe `aiClient` metadata and selectors. The backend Groq-only fact remains R14 below. |
| W06 / C | `pulsegrid-terminal-dashboard.html:6,23-39,91,130-131,244,250,264,485,542` is a second hardcoded legacy page. | EXPECTED terminal feature consolidation in handoff `:145,193` during 4C; until migrated or retired, the old URL stays pulsegrid-specific. |
| W07 / C | Same terminal page `:503-512,565-579` has lumenveil/NOVAKIN fallbacks and preview roster. | EXPECTED legacy demo content; when retained features migrate, keep any reference fallback under pulsegrid data or use an unavailable state. |
| W08 / B | Same terminal page `:420-422` says “Revenue (USD).” | EXPECTED 4C chart formatting via profile locale. |
| W09 / B | Legacy HTML API bases are `localhost:3000` (`pulsegrid-frontend-connected.html:236`; `pulsegrid-terminal-dashboard.html:95-96`). | EXPECTED 4B `VITE_API_BASE_URL` in `PHASE_4A_HANDOFF.md:217-226`; no need to edit legacy files. |
| W10 / B | `README.md:13-18,86-87` advertises the brand-named legacy URLs. | EXPECTED transitional documentation/URL identity while old files remain reference artifacts. A new Vite route is specified; these filenames alone do not force a generic React source edit. |

## 5. OVERSCOPED findings

| ID / original class | Corrected interpretation and smallest remedy |
|---|---|
| R03 / C | `integrations/index.js:12-29,39-45` fixes lumenveil/NOVAKIN social mapping and returns mock data on a miss. **MAJOR**, not application BLOCKER: live integrations for another roster degrade. §15.3 `datasets.socials` is the right later seam; preserve the mappings. |
| R11 / C | `src/routes/anr.js:165-176` fixes `p1`/Neon Horizon and lumenveil. **MAJOR**, not application BLOCKER: this A&R endpoint gives a bad reference report but other endpoints still run. §15.3 covers benchmark only; prospect lookup and canned evaluation also need selected data later. |
| R14 / C | `src/ai/aiService.js:27-31,39,69-79,107-112,167-178` imports Groq and uses `config.groqModel`; that is real **provider** debt. Groq can remain selected while brands switch. The handoff §12 already specifies a provider-neutral frontend contract; backend provider routing belongs with later AI work, not pre-4B brand closure. |
| R18 / B | Live `/v3/auth/forgot-password` at `src/routes/auth.js:131-143` sends a pulsegrid subject/green HTML. `src/services/emailService.js:71-84` duplicates the template but `sendPasswordReset` has no production caller in the repository. Thus **one live path plus one unused helper**, not two live reset flows. Externalize the live template later; reconcile the helper when touched. |
| R30 / C | `src/routes/marketing.js:57-79` computes Jul–Dec synthetic history from the **selected** `labelData` CRM totals. The fixed calendar and invented historical trend are data-quality/demo limitations, but the formula contains no pulsegrid value and would run on another selected roster. Downgrade from MAJOR brand coupling; address truthful history separately. |

## 6. INCORRECT findings

None of the first audit's BLOCKER/MAJOR rows is wholly contradicted by repository evidence. The timing, severity, and reachability corrections above are material; they do not erase the source facts. In particular, `Server v5.js` and the alternate `package1.json`/`package-production.json` are documented as retained legacy artifacts (`BACKEND_ARCHITECTURE.md:95-97`; `REFACTOR_PROGRESS.md:87-88`), not the canonical `npm start` runtime.

## 7. Issues the first audit missed

| Source | Independent finding | Class, impact, and timing |
|---|---|---|
| `src/routes/anr.js:59-66` | A missing submission genre becomes `'Electronic'` for every label. | C, MAJOR for a non-electronic label's A&R data. Use selected label default genre or require the submitted value in later backend label closure. Not 4B-blocking. |
| `modules/entityAudit.js:215-220,402-406,447-450` | Wikipedia `musicRelated` scoring favors `electronic music`, and JSON-LD genre falls back to `'Electronic Music'`. | C, MAJOR for genre-neutral knowledge quality. Keep electronic keywords/default as pulsegrid intelligence; choose genre/category terms from active label or artist data later. |
| `integrations/youtube.js:94-101,133-152` → `integrations/index.js:151-154` | A hardcoded USD CPM (`3.5`) creates numeric `revenue.youtube` with no currency metadata. A future GBP profile can display that number as GBP. | C/B, MAJOR monetary provenance issue. Record source currency and convert or normalize before merging; do not treat frontend `Intl` formatting as conversion. Later backend financial closure. |
| `FRONTEND_ARCHITECTURE.md:1472-1505` vs `:1157,1351` | Planned backend label profile has no locale, accounting currency, time zone, chart palette, scout/demographics dataset, or source-parser selector, although the frontend profile and newly verified backend paths need them. | Specification gap in **backend 4-LABEL target**, not the 4B frontend seam. Extend backend schema when that phase is authorized; keep shared front/back identity and currency consistent. |
| `PHASE_4A_HANDOFF.md:551-575,660-662` | Example Records gate formats the *same* pulsegrid KPI numbers as GBP and checks two screens. The doc correctly calls frontend/backend parity later, but this gate cannot establish financial or full runtime portability. | Test-scope limitation, not a 4A implementation defect. Report the gate as display portability only and run a real second-label data test after backend closure. |

The first audit's additional R08–R09, R13–R14, R21–R22, R27–R29, R33, and W04 are genuine discoveries beyond the Phase 4A §15 inventory, subject to the corrections above. Reference data in `mock/artistData.js`, `scripts/generate_roster.js`, fixtures, snapshots, the visual contract, and pulsegrid profile/theme examples remains allowed. No `pulsegrid.*` browser storage key or generic auth authorization dependency on a fixed artist ID was found in the canonical runtime.

## 8. Phase 4A architecture verdict

**For the expressly defined 4B login/dashboard slice: PASS as a specification.** `FRONTEND_ARCHITECTURE.md:1136-1215,1216-1302,1315-1373` defines serializable `BrandProfile`, a single registry/default slug, `VITE_BRAND_PROFILE` plus dev override, `BrandProvider`/`useBrand`, document title/favicon/theme resolution, semantic colors, mark/loader fallbacks, profile copy and locale formatters, neutral storage keys, and an Example Records test. `PHASE_4A_HANDOFF.md:426-599` makes that a mandatory two-profile gate. A second frontend profile can be added to the specified slice by adding profile/assets/theme and registry entries, without editing generic React components. The planned files are not yet present because 4B has not begun.

**For the entire frontend promised through 4C: FAIL on one narrow specification detail.** W04 tells the implementer to copy current venue coordinates into generic `geoCenters.js`. The new label's unknown venues then need a generic-source edit or disappear from the map, despite the §14.7/§17 “no edits outside brand” criterion. The remedy is a label-data coordinate/alias seam when the 4C map is built. This does not invalidate the 4B brand layer or require backend closure before 4B. Navigation, login, titles/favicon, storage, provider/model display, and semantic theme tokens otherwise have an explicit profile/configuration route. The fixed dark-console visual language is a documented platform design constraint, not a hidden pulsegrid literal.

## 9. Existing backend portability verdict

**FAIL for a real second-label deployment.** There is no active backend profile; artists/users/operations/A&R data, social mappings, search and wiki sources, AI context, admin protection, generated colors, PDF/email identity, and SQLite default remain selected inside generic runtime files (§§2–3, 7). The proposed backend §15.3 profile is a sound initial seam but is not implemented and needs the additions listed in §7. Provider neutrality is separate: Groq is the only runtime transport (`src/ai/aiService.js:27-31,69-79`), while the Phase 4A frontend provider contract anticipates later routing (`PHASE_4A_HANDOFF.md:275-320`). Neither the pulsegrid data nor its useful intelligence should be deleted.

## 10. Minimum work required before Phase 4B

**No separate backend label closure is required.** The authorized 4B slice uses the existing pulsegrid backend and tests frontend presentation with Example Records against that backend by design (`PHASE_4A_HANDOFF.md:562-572,686,808-809`). The existing handoff already states the limitation and prohibits backend label edits in 4B (`:688-713`). No new source or document change is a prerequisite identified by this recheck. When evaluating 4B, call its result a frontend display portability pass only; do not claim an end-to-end second-label deployment. W04 must be handled when the map is implemented in 4C, before certifying full frontend portability.

## 11. Work safe to perform during Phase 4B

Implement the already specified React/Vite brand layer, pulsegrid and Example Records profiles, registry, semantic tokens, mark/loader resolution, title/favicon, locale formatting, generic nav/copy/storage, and the two-profile login/dashboard gate. Preserve the pulsegrid default and its black/neon-green presentation. Keep the 4B AI client/provider boundary as documented if included in its slice; do not infer a second backend AI provider from the selector design. This report authorizes none of that work; it only evaluates its sequencing.

## 12. Work safe to defer

The separate backend `4-LABEL` pass can follow 4B/4C, but must precede a real second-label release or a claim of full runtime portability. It should implement active-label resolution; selected roster, users, operations, A&R/scout/demographics data; search/knowledge/alias/source adapters; AI prompt and fallback context; email/report/chart/logging identity; root-admin rule; database selection; and monetary denomination/locale. Carry today's pulsegrid values intact and compare pulsegrid API/PDF/email snapshots. The 4C map coordinate ownership should be settled **during 4C**. Backend AI multi-provider routing can be sequenced with later AI work because it is not a prerequisite for switching labels while retaining Groq.

## 13. Recommendation on separate backend closure before 4B

**C — NO.** Backend coupling is serious and survives the frontend brand layer, but Phase 4B does not build against a backend label API or attempt to switch backend data. Its contract is a brand-neutral React presentation over the current API, and its Example Records fixture deliberately reuses pulsegrid numbers (`PHASE_4A_HANDOFF.md:562-572`). Doing `4-LABEL` first would be a change in project sequence, not a dependency required to implement the specified frontend seam safely. Close the backend debt before deploying Example Records as a real label, and close W04 during map migration before claiming all frontend pages are portable.

PHASE 4A SPECIFICATION PORTABILITY: FAIL

CURRENT RUNTIME PORTABILITY: FAIL

SEPARATE BACKEND LABEL CLOSURE REQUIRED BEFORE 4B: NO

SAFE TO BEGIN 4B AFTER MINIMUM REQUIRED WORK: YES
