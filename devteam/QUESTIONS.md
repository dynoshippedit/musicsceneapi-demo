# QUESTIONS for the owner
(To answer: write under "Answer (owner)" and set Status to ANSWERED.)
(none yet — Phase 4+)

---

## Q-ARC-1 · Merge the legacy `integrations/` tree into `src/integrations/providers/`?
- **From:** ARC (architecture review, 2026-09-29)
- **Context:** two live integration trees exist (`integrations/` legacy providers + `src/integrations/` facade); `artistRepository` bypasses the facade. Finding ARC-005.
- **Recommendation:** yes — move providers under `src/integrations/providers/`, keep the facade surface unchanged. (Migration step 8.)
- **Status:** OPEN
- **Answer (owner):**

## Q-ARC-2 · Schema authority: keep "sync creates + explicit migrations alter", or go migration-only?
- **From:** ARC (2026-09-29)
- **Context:** `sequelize.sync()` creates absent tables at boot; `src/models/migrations.js` handles alters for existing DBs. A future model-field change without a matching migration entry gives new customers the field and existing customers silent drift. Finding ARC-006.
- **Recommendation:** keep the hybrid but add a boot/build-time drift test that fails when a model field lacks a migration entry for existing DBs (migration step 9a).
- **Status:** OPEN
- **Answer (owner):**

## Q-ARC-3 · Production topology: single PM2 instance forever, or is scale-out on the roadmap?
- **From:** ARC (2026-09-29)
- **Context:** the app is correct only as a single instance — `inMemoryStores` (votes, integration state, sales entries) is lost on restart and forked on scale-out; the only enforcement is the PM2 `instances: 1` config (currency unverified). CPU-heavy monthly-report cron also shares the request process. Findings ARC-004, ARC-010.
- **Recommendation:** formally pin single-instance (boot assertion + docs) OR commit to externalizing in-memory stores + moving cron work out of the request process (migration steps 10, 12).
- **Status:** OPEN
- **Answer (owner):**

## Q-ARC-4 · Should A&R's two vote models be unified, and should the A&R workspace become durable?
- **From:** ARC (2026-09-29)
- **Context:** split-brain A&R is documented and preserved: `anrSubmissions` (scalar vote counter) vs `anrState.demos` (per-user ratings[]), never reconciled; demos/whiteboard are ephemeral process memory while submissions are durable DB rows. Finding ARC-004.
- **Recommendation:** owner's product call — unifying changes vote semantics. At minimum, formally declare the ephemeral-vs-durable contract in user-facing docs.
- **Status:** OPEN
- **Answer (owner):**

## Q-ARC-5 · May success envelopes and pagination be unified (additive shape change)?
- **From:** ARC (2026-09-29)
- **Context:** `{error}` failure shape and `/v3/` versioning are uniform, but success envelopes vary (`{success}`, `{id}`, raw objects) and pagination is ad-hoc in three patterns. Finding ARC-008.
- **Recommendation:** yes — one shared `paginate()` + `ok()`/`paginated()` envelope, migrated one domain at a time (migration step 11).
- **Status:** OPEN
- **Answer (owner):**

## Q-ARC-6 · Is `docs/openapi.json` the maintained API contract (frontend checked against it in CI)?
- **From:** ARC (2026-09-29)
- **Context:** `docs/openapi.json` (4574 lines) exists; sync vs the 22 route domains is DOC's claims audit. `web/src/api/endpoints.js` centralizes all frontend paths — a contract check between them is cheap.
- **Recommendation:** yes — declare it the contract and extend `web/validation/gate.mjs` to check endpoint coverage in CI (migration step 14). If not, stop hand-editing it.
- **Status:** OPEN
- **Answer (owner):**
