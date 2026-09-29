<!-- Security flow note — SEC, 2026-09-29. Companion to authz-matrix.md and findings/sec.md. -->
# Flow security note — AI query (flow 10)

**Path:** `POST /v3/ai/query` | `/v3/ai/analyze` (src/routes/ai.js:49-50) ->
aiService -> Groq (opt-in) -> responseParser -> cache -> response.

**Security-relevant hops:**
1. Access checked BEFORE cache lookup AND before LLM call (aiService.js:35-49):
   hasArtistAccess on the requested artist; the AI prompt context is resolved
   to the granted-artist subset only.
2. Cache key = sha256(prompt, artistId, userId, role, grants, resolved
   context) (aiService.js:47-49). No cross-user cache collision: two users
   with different grants never share a cache entry. P1 #5 dismissed (fixed).
3. LLM output parsed with zod schemas (src/ai/responseParser.js); on schema
   failure returns a fixed fallback stub — never raw model text, never
   executed. The `_meta` field is non-enumerable (never JSON-serialized).
4. Financial analysis (ai.js:57) requires explicit `acknowledgeNotAdvice ===
   true` opt-in; without it the endpoint refuses (no silent advice).
5. Groq API key is admin-configured (opt-in); no user-supplied key path.

**Residual:** prompt content leaves the instance to Groq only when the admin
has configured it — documented trade-off, not a finding. No SSRF: no
user-supplied URLs are fetched server-side anywhere in the AI path.
