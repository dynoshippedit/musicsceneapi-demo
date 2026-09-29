# AI Integration — surface notes (AIX, Phase 2)

How the Groq AI surface is wired as of `devteam/review-2026-09-29`. Companion
to `devteam/findings/aix.md` (findings AIX-001…AIX-008). All paths verified by
reading code; fail-closed behavior verified with injected-transport repros.

## 1. Module layout

| File | Role |
|---|---|
| `src/ai/groqClient.js` | Sole boundary to `groq-sdk`. Lazy construction (module load never throws on missing key), 20s timeout per call, `AiUnavailableError`/`AiTimeoutError`. No retries. |
| `src/ai/prompts.js` | All prompt construction. Templates verbatim from the monolith ("frozen strings"). |
| `src/ai/aiService.js` | `query()` (POST /v3/ai/query + /analyze + /financial-analysis), `analyzeEntityHealth()` (entity audit), `reportInsight()` (monthly PDF block). |
| `src/ai/responseParser.js` | Tolerant JSON extraction (`parseJsonLoose`) + permissive zod passthrough schema; `_meta` attached non-enumerably (never serializes). |
| `src/ai/disclaimer.js` | Three constants: `AI_FINANCIAL_DISCLAIMER`, `AI_FINANCIAL_USER_RESPONSIBILITY`, `AI_INSIGHTS_NOT_REQUESTED`. |
| `src/routes/ai.js` | `GET /v3/ai/providers`, `POST /v3/ai/query`, `POST /v3/ai/analyze` (alias), `POST /v3/ai/financial-analysis` (requires `acknowledgeNotAdvice: true`). |
| `src/services/entityAuditService.js` | Orchestrates 7 providers + `analyzeEntityHealth`; records `ai_call` usage ONLY on `status === 'ok'`. |

## 2. Key and model configuration

- `GROQ_API_KEY` → `src/config/index.js:110`, server-side only. Never
  referenced in `web/` (grep-verified); the frontend talks only to this
  backend's `/v3/ai/*` routes.
- `GROQ_MODEL` → `src/config/index.js:114`, default `'openai/gpt-oss-20b'`
  (previous default `llama-3.1-8b-instant` was retired by Groq → 404).
  Single source; consumed in `aiService.js` (3 call sites) and the providers
  endpoint. NOT documented in `.env.example` (AIX-007).
- `/v3/ai/providers` reports `configured`/`unconfigured` only — no key
  material leaves the server.
- The `aiQuery` zod schema is `.strict()`, so clients cannot smuggle
  `provider`/`model` overrides (`src/validation/index.js:48-53`).

## 3. The three call paths and their failure modes

| Path | Trigger | Unconfigured | Provider failure |
|---|---|---|---|
| `query()` | user POST (auth + `hasArtistAccess` pre-check) | `{kind:'error'}` → HTTP 503 generic | `{kind:'error'}` → 503 (504 on timeout) |
| `analyzeEntityHealth()` | entity-audit route (auth + `hasArtistAccess`) | `{status:'not_configured', ...}` — explicit, no fake analysis | `{status:'unavailable', ...}` — never throws |
| `reportInsight()` | monthly PDF, only when `options.aiInsights === true` | throws → PDF prints "AI Insights unavailable at this time (Service Offline)." | same |

No canned roster claims anywhere (gap-6 removal verified: `DEV_FALLBACK_ANSWER`
is a dead export, AIX-006).

## 4. Tenant / per-artist isolation

- Dedicated instance per label — no cross-label concern by design.
- Per-artist: `hasArtistAccess` enforced on every AI route **before** cache
  or provider work; label-wide queries build context only from
  access-filtered roster.
- AI cache key = `prompt_artistId : sha256(user.id, role, artistAccess,
  contextData)` — lead #5 fixed; no cross-user sharing.
- Report-insight cache `report_ai_<artistId>_<month>` has TTL NEVER_EXPIRE —
  correct for a frozen monthly report, but the insight is never refreshed
  even if the month's data changes (correctness note, not isolation).

## 5. What goes to Groq (privacy)

- Per call: artist name, monthly listeners, total streams, growth rate,
  revenue breakdown (via `buildArtistContext`), or entity-audit statuses +
  health score, or the user's own prompt (truncated to 500 chars).
- Logged server-side: token counts (`console.log`), error messages
  (`console.error`/`logger.error`) — no prompts or answers in logs.
  `usageService` records `ai_tokens`/`ai_call` events with
  userId/artistId/model metadata (winston) — attribution only.
- Retention: nothing configured in code; Groq's vendor-default policy
  applies. Recommend documenting in the privacy/GDPR surfaces (SEC/DAT lane).

## 6. Cost and abuse posture (today)

- Per-call budgets: 300 (query) / 400 (entity audit) / 100 (report) tokens.
- Rate limiting: global 1000/hr/IP on `/v3/` only — no per-user or
  per-endpoint AI limiter (AIX-002).
- Retries: none (AIX-004). Spend visibility: `usageService` records only
  (AIX-002).

## 7. Open questions for the owner

1. Groq data-retention/zero-retention posture — accept vendor default or
   configure/document?
2. Threadripper runtime env has an invalid `GROQ_API_KEY` (401s) — remove it
   (honest `not_configured`) or provision a valid key?
3. Per-user AI quotas / spend caps before any customer deployment (pricing
   decision).
