<!-- C12 findings ledger — AI/LLM Integration Engineer (AIX), Phase 2. -->
<!-- One entry per problem: ID · title · severity · confidence · location · -->
<!-- evidence (quoted) · what's wrong · impact · suggested fix.              -->
<!-- Statuses follow the Playbook B7 lifecycle. The Tech Lead merges these    -->
<!-- into devteam/ISSUES.md.                                                 -->
# Findings — AIX (AI/LLM Integration Engineer)

Scope: `src/ai/` (aiService.js, disclaimer.js, groqClient.js, prompts.js,
responseParser.js), `src/routes/ai.js`, `src/services/entityAuditService.js`,
plus every `groq` / `analyzeEntityHealth` / `reportInsight` / `ai_call`
reference in `src/` and the AI surfaces in `web/src`. Source read-only;
behavioral claims verified by reading code and by injected-transport repros
(no live Groq completions — see "Verification log" for one protocol note).

| ID | Sev | Conf | Status | Title | Location |
|---|---|---|---|---|---|
| AIX-001 | S3 | Confirmed | NEW | Model-output `status` key overrides server-set `status:'ok'` — breaks the paid-call usage gate | src/ai/aiService.js:128; src/services/entityAuditService.js:148 |
| AIX-002 | S2 | Confirmed | NEW | No per-user quota or AI-specific rate limit: entity-audit `?refresh=true` spends provider + Groq calls under only the global 1000/hr/IP limiter | src/middleware/index.js:97-101; src/services/entityAuditService.js:20-25 |
| AIX-003 | S3 | Confirmed | NEW | Disclaimer attached to API response but never rendered on the interactive AI surface (CommandConsole / Intelligence page) | src/routes/ai.js:41; web/src/ai/aiClient.js:52-58; web/src/components/ai/CommandConsole.jsx |
| AIX-004 | S4 | Confirmed | NEW | No retry with backoff in groqClient — single attempt, 20s timeout; transient 429/5xx surfaces as 503 | src/ai/groqClient.js:28,84-107 |
| AIX-005 | S4 | Confirmed | NEW | maxTokens hardcoded per call site (300/400/100), not env-configurable; no spend-cap config | src/ai/aiService.js:64,124,186 |
| AIX-006 | S4 | Confirmed | NEW | `DEV_FALLBACK_ANSWER` exported but consumed nowhere; profile comment claims a single-source sharing that does not exist | src/ai/aiService.js:20,197; src/profile/labels/pulsegrid.js:99 |
| AIX-007 | S4 | Confirmed | NEW | `GROQ_MODEL` not documented in `.env.example` (overlaps BLD-009) | src/config/index.js:114; devteam/notes/env-inventory.md:26 |
| AIX-008 | S4 | Probable | NEW | Stored/in-band prompt injection: DB artist names interpolated raw into prompts; user prompt and trusted data concatenated without a delimiter | src/ai/prompts.js:38-44,54-58,66-70 |

P1 known lead #5 (AI cache cross-user leak) disposition: **FIXED** — see
"Lead #5 disposition" below.

## AIX-001 · Model-output `status` key overrides the server-set status

- **Severity:** S3 (integrity of the fail-closed contract + spend attribution).
- **Confidence:** Confirmed (reproduced live against the real code path).
- **Location:** `src/ai/aiService.js:128`; downstream gate
  `src/services/entityAuditService.js:148`.
- **Evidence:**
  ```js
  // src/ai/aiService.js — analyzeEntityHealth()
  const validated = validateEntityAudit(content);
  if (validated && validated._meta && validated._meta.ok) {
      return { status: 'ok', ...validated };   // <-- model fields spread LAST
  }
  ```
  `validateEntityAudit` uses `z.object({}).passthrough()` (deliberately
  permissive, `src/ai/responseParser.js:54`), so any model-emitted key —
  including `status` — survives validation. Repro output:
  ```
  model -> {"status":"compromised","summary":"hi",...}
  merged.status -> "compromised"   // server-set 'ok' was overwritten
  ```
  The `_meta` diagnostic does NOT leak into JSON (verified: non-enumerable),
  so it cannot serve as the downstream discriminator.
- **What's wrong / impact:** the `status` field is meant to be server-set
  (`'ok'` / `'not_configured'` / `'unavailable'`) and is the discriminator
  for two things: (1) the fail-closed contract the UI and gap-6 rely on, and
  (2) the paid-call usage gate in entityAuditService:
  ```js
  if (aiAnalysis && aiAnalysis.status === 'ok') {
      usageService.recordUsage('ai_call', 1, { ... provider: 'groq', purpose: 'entity_audit_analysis' });
  }
  ```
  A model that emits `{"status": "not_configured", ...}` after a successful
  paid call makes the call invisible to usage accounting — spend happens but
  is never recorded as an `ai_call` event. The `EntityAuditTab` renders
  summary/correlationInsight regardless of status, so the user impact is
  limited to attribution/contract integrity.
- **Suggested fix:** strip/rename model-controlled `status` before merging,
  e.g. `const { status: _ignored, ...fields } = validated; return { status: 'ok', ...fields };`
  — or set status after the spread.

## AIX-002 · No per-user quota or AI-specific rate limit on spend endpoints

- **Severity:** S2 (unbounded per-user AI spend by any authenticated user).
- **Confidence:** Confirmed (code read; the cost is self-documented).
- **Location:** `src/middleware/index.js:97-101` (only limiter on `/v3/`);
  `src/services/entityAuditService.js:20-25` (self-documented cost note);
  `src/ai/aiService.js` (`complete()` calls at :64, :124, :186).
- **Evidence:**
  ```js
  // src/middleware/index.js
  const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,   // 60 * 60 * 1000
      max: config.rateLimit.max               // 1000
  });
  app.use('/v3/', limiter);
  ```
  ```js
  // src/services/entityAuditService.js header
  // COST NOTE (audit HIGH-7): `?refresh=true` triggers 5 external calls plus a
  // Groq completion with NO per-user quota — only the global 1000/hr/IP limiter.
  // Unchanged here; documented in BACKEND_ARCHITECTURE.md.
  ```
- **What's wrong / impact:** any authenticated user with artist access can
  call `GET /v3/artists/:id/entity-audit?refresh=true` (or
  `POST /v3/ai/query`, `POST /v3/ai/financial-analysis`,
  `POST /v3/ai/analyze`) up to 1000 times/hour/IP, each triggering paid
  third-party work (5 provider calls + a Groq completion at up to 400
  max_tokens for entity audit). No per-user quota, no per-endpoint AI
  limiter, no spend cap. `usageService.recordUsage` records spend events but
  nothing consumes them — it is attribution only, explicitly "NOT metering,
  NOT billing" (`src/services/usageService.js:7-9`).
- **Suggested fix:** per-user (or per-API-key) rate limit on the four AI
  spend endpoints, plus a configurable monthly token/call budget with a
  fail-closed tripwire; wire `usageService` records into an actual
  enforcement or alerting path before customer deployment. (Product/pricing
  decision for the owner — see QUESTIONS.md candidate.)

## AIX-003 · Disclaimer attached to API response but never rendered on the interactive AI surface

- **Severity:** S3 (output labeling gap on a surface that serves financial context).
- **Confidence:** Confirmed (traced API → client → component).
- **Location:** `src/routes/ai.js:39-42`; `web/src/ai/aiClient.js:52-58`;
  `web/src/components/ai/CommandConsole.jsx:82,109-111`;
  `web/src/pages/IntelligencePage/IntelligencePage.jsx:23`.
- **Evidence:** the API attaches the disclaimer on the success path:
  ```js
  return res.json({ success: true, answer: result.answer, insights: result.answer,
      source: ..., provider: 'groq', model: ...,
      disclaimer: AI_FINANCIAL_DISCLAIMER });
  ```
  but the frontend client drops it:
  ```js
  // web/src/ai/aiClient.js — query()
  return {
    answer: payload.answer ?? '',
    source: payload.source ?? null,
    provider: payload.provider ?? null,
    model: payload.model ?? null,
    // disclaimer is NOT forwarded
  };
  ```
  and `CommandConsole.jsx` renders only the answer string as a React text
  child (safe from HTML injection — no `dangerouslySetInnerHTML` anywhere in
  `web/src`) with no disclaimer element. The entity-audit tab
  (`EntityAuditTab.jsx:71-75`) likewise renders `aiAnalysis` fields with no
  disclaimer. The ONLY surface that carries the disclaimer is the monthly
  PDF block (`src/reports/monthlyReport.js:115`:
  `doc.text('AI-generated. ' + AI_FINANCIAL_DISCLAIMER, ...)`).
- **What's wrong / impact:** the stated liability posture ("Successful AI
  responses carry a 'not financial advice' disclaimer ... in the response
  itself", `src/routes/ai.js` header) is true of the JSON but not of what
  the user sees on the primary interactive surface. `POST /v3/ai/query`
  serves answers built over revenue context (`buildArtistContext` includes
  total revenue) with no per-request acknowledgment (unlike
  `/v3/ai/financial-analysis`, which requires `acknowledgeNotAdvice: true`).
- **Suggested fix:** render the disclaimer in `CommandConsole` (and the
  entity-audit Analysis block) from the API payload, or add a persistent
  non-dismissible label on AI surfaces.

## AIX-004 · No retry with backoff — single attempt, 20s timeout

- **Severity:** S4 (availability nit; degradation is already clean).
- **Confidence:** Confirmed.
- **Location:** `src/ai/groqClient.js:28` (`DEFAULT_TIMEOUT_MS = 20000`),
  `:84-107` (`complete()` — one `Promise.race`, no retry).
- **Evidence:** `complete()` races the SDK call against a single 20s timer
  and propagates any error to the caller's catch, which maps it to
  `503`/`504`. There is no retry, no backoff, no idempotency key.
- **What's wrong / impact:** transient Groq 429/5xx or a slow cold start
  surfaces to the user as "AI is unavailable" immediately. Low impact
  because the failure mode is already an honest 503, not a fake answer.
- **Suggested fix:** one retry with jittered backoff on retryable
  statuses (429, 5xx), keeping the total budget under the 20s timeout.

## AIX-005 · maxTokens hardcoded per call site; no spend-cap config

- **Severity:** S4.
- **Confidence:** Confirmed.
- **Location:** `src/ai/aiService.js:64` (query, 300), `:124` (entity
  audit, 400), `:186` (reportInsight, 100); `src/ai/groqClient.js:84`
  (default 300).
- **What's wrong / impact:** per-call token budgets are code constants,
  not env-configurable; there is no configurable ceiling an operator can
  lower to bound worst-case spend per request (complements AIX-002).
- **Suggested fix:** move per-endpoint token budgets into config with env
  overrides (e.g. `AI_MAX_TOKENS_QUERY`), keeping current values as defaults.

## AIX-006 · `DEV_FALLBACK_ANSWER` exported but consumed nowhere

- **Severity:** S4 (dead export + misleading comment).
- **Confidence:** Confirmed (repo-wide grep: only definition at
  `src/ai/aiService.js:20` and export at `:197`).
- **Location:** `src/ai/aiService.js:20,197`;
  `src/profile/labels/pulsegrid.js:98-99`.
- **Evidence:** the profile comment says "src/ai/aiService.js +
  src/routes/ai.js dev fallback (single source now)" but `src/routes/ai.js`
  never references `DEV_FALLBACK_ANSWER`. The constant is dead — the
  unconfigured path returns `{ kind: 'error', message: 'AI provider is not
  configured' }` (→ HTTP 503), never a canned answer, which is the intended
  fail-closed behavior.
- **What's wrong / impact:** a reader (or a future change) could believe a
  dev fallback answer is still served somewhere; it is not. Minor cleanup.
- **Suggested fix:** delete the export and correct the profile comment, or
  document explicitly that no canned fallback exists by design (gap-6).

## AIX-007 · `GROQ_MODEL` not documented in `.env.example`

- **Severity:** S4.
- **Confidence:** Confirmed.
- **Location:** `src/config/index.js:110-114`;
  `devteam/notes/env-inventory.md:25-26`.
- **Evidence:**
  ```js
  groqApiKey: process.env.GROQ_API_KEY,          // documented in .env.example
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',  // NOT documented
  ```
  env-inventory line 26: `| GROQ_MODEL | src/config/index.js:114 |
  'openai/gpt-oss-20b' | **NOT documented** |`.
- **What's wrong / impact:** operator cannot discover the model override
  from the template; overlaps BLD-009 (stale `.env.example`). The previous
  default (`llama-3.1-8b-instant`) was retired by Groq and returned 404 —
  deprecation today is handled only by failing into the 503 path, which is
  honest but gives the operator no proactive signal.
- **Suggested fix:** add `GROQ_MODEL` to `.env.example`; consider a startup
  log line naming the configured model (never the key).

## AIX-008 · Stored/in-band prompt injection via interpolated values

- **Severity:** S4 (limited exploitability; output is parsed and text-rendered).
- **Confidence:** Probable (code inspection; no live exploit attempted).
- **Location:** `src/ai/prompts.js:38-44` (`buildQueryMessages`), `:54-58`
  (`buildEntityAuditPrompt`), `:66-70` (`buildReportInsightPrompt`).
- **Evidence:**
  ```js
  content: `${String(userPrompt).slice(0, 500)}\nData: ${JSON.stringify(contextData)}`
  // and
  return `Analyze entity health for ${artistName}: Google=${googleKgStatus}, ...`;
  ```
  User prompt and trusted data are concatenated with no delimiter; DB-stored
  artist names (user-controlled by label operators) are interpolated raw
  into the entity-audit and monthly-report prompts. Provider statuses are a
  fixed enum (`verified`/`candidate`/`not_found`/`error`/`unconfigured` —
  `modules/entityAudit.js`), so third-party status text is NOT an injection
  vector; only the artist name is.
- **What's wrong / impact:** a label operator (or anyone who can create an
  artist record) can plant instructions in an artist name that reach the
  model on the entity-audit and report-insight paths. Blast radius is small:
  the attacker only poisons their own label's prompts, and model output is
  loosely schema-parsed and rendered as React/PDF text (no execution).
  Not a cross-tenant issue (dedicated instance per label).
- **Suggested fix:** delimit interpolated values (e.g. quote artist names,
  put user prompt and data in clearly labeled sections), and/or sanitize
  artist names at write time.

## Lead #5 disposition — FIXED

P1 lead #5 ("`/v3/ai/query` cached by prompt+artistId" — cross-user answer
leak) is **fixed in current code**. Evidence (`src/ai/aiService.js:39-49`):

1. The access check runs **before** any cache work:
   `if (artistId && !hasArtistAccess(user, artistId)) return { kind: 'forbidden' };`
2. The cache key is the prompt/artistId prefix **plus** a scope hash of the
   requesting principal and the exact data placed in the prompt:
   ```js
   const scope = require('node:crypto').createHash('sha256')
       .update(JSON.stringify([user?.id, user?.role, user?.artistAccess, contextData])).digest('hex');
   const cacheKey = `${cacheService.keys.aiQuery(userPrompt, artistId)}:${scope}`;
   ```
   Two users (or the same user after an access change) can never share a
   cache entry; a user cannot be served an answer computed over data they
   could not see, because the label-wide roster is filtered by
   `hasArtistAccess` before prompt construction
   (`aiService.js:35-37`).
3. `isConfigured()` is checked before the cache lookup, so an unconfigured
   provider cannot serve stale cached answers (fail-closed).

No finding filed for lead #5.

## Verification log — fail-closed (gap-6) end-to-end

Repros run on the Threadripper against the real code with an injected
unconfigured client (`createAiService({ client: { isConfigured: () => false,
complete: async () => { throw ... } } })`) — no network, no SDK:

| Function | Provider unconfigured | Result |
|---|---|---|
| `analyzeEntityHealth` | `isConfigured() === false` | `{ status: 'not_configured', summary: 'AI analysis not configured', criticalActions: [], correlationInsight: 'Configure an AI provider to enable entity analysis.' }` — no throw, no fake analysis ✔ |
| `query` | same | `{ kind: 'error', message: 'AI provider is not configured' }` → route maps to HTTP 503 with a generic message ✔ |
| `reportInsight` | same | throws `'AI provider is not configured'` → `monthlyReport.js` catch writes `"AI Insights unavailable at this time (Service Offline)."` into the PDF ✔ |

UI side: `EntityAuditTab.jsx:71-75` renders whatever `aiAnalysis` the API
returns as plain text — with Groq unconfigured the user sees "AI analysis
not configured / Configure an AI provider to enable entity analysis.",
never a fabricated analysis. **Gap-6 fail-closed claim: VERIFIED.**

**Deployment note (observed, not a code finding):** the Threadripper
runtime environment carries a `GROQ_API_KEY` that Groq rejects with
`401 invalid_api_key`, so on this box the live path taken is
`'unavailable'`/503 rather than the honest `'not_configured'` path. Owner
call: remove the invalid key (so the not-configured path engages) or set a
valid one.

**Protocol disclosure:** while verifying, two `node -e` repro invocations
accidentally reached the live Groq API because the key is present in the
runtime env (dotenv-loaded; `env -u` did not remove it). Both calls failed
at authentication (`401 invalid_api_key`) — no completion was generated,
no tokens were consumed, no spend occurred, and no further live calls were
made. The key value was never read or recorded.
