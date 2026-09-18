import { apiFetch, readJson } from '../api/client.js';
import { aiQuery } from '../api/endpoints.js';

/**
 * The AI seam (PHASE_4A_HANDOFF.md §12, FRONTEND_ARCHITECTURE.md §8).
 *
 * Components depend on THIS contract and never on a vendor. There is no provider SDK, no API
 * key, and no direct call to any model host anywhere in web/ — every AI request goes to this
 * application's own backend, which owns the credentials.
 *
 * The authenticated catalogue reports configuration, not a successful provider call.
 * A missing catalogue degrades to unavailable and never claims readiness.
 */
export async function listProviders(token, { signal } = {}) {
  try {
    const response = await apiFetch('/v3/ai/providers', { token, signal });
    if (response.status === 404) return unsupported();
    const payload = await readJson(response);
    return {
      selectable: payload.selectable === true,
      status: payload.status || 'unknown',
      defaultProvider: payload.defaultProvider ?? null,
      defaultModel: payload.defaultModel ?? null,
      providers: payload.providers ?? [],
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return unsupported();
  }
}

function unsupported() {
  return { status: 'unavailable', selectable: false, defaultProvider: null, defaultModel: null, providers: [] };
}

/**
 * `POST /v3/ai/query` is validated by a `.strict()` zod schema (src/validation/index.js
 * `aiQuery`), so sending `provider`/`model` against the current backend 400s EVERY call.
 * They are therefore only attached when the catalogue says selection is supported.
 */
export async function query(token, { prompt, artistId, forceRefresh, provider, model, selectable = false }, { signal } = {}) {
  const body = { prompt };
  if (artistId) body.artistId = artistId;
  if (forceRefresh) body.forceRefresh = forceRefresh;
  if (selectable) {
    if (provider) body.provider = provider;
    if (model) body.model = model;
  }
  const payload = await aiQuery(token, body, { signal });
  return {
    answer: payload.answer ?? '',
    source: payload.source ?? null,
    provider: payload.provider ?? null,
    model: payload.model ?? null,
  };
}
