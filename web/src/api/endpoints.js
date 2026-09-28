// The ONLY file that contains '/v3/…' path strings (PHASE_4A_HANDOFF.md §7).
// One thin function per real backend route. No route is invented here: every path below
// is registered in src/routes/*.js. Routes the backend does not implement
// (label/entity-audit, ai/providers) are handled at their call site as
// documented failures, never faked.
import { apiFetch, readJson } from './client.js';

// ---------- auth ----------
export async function login(credentials, { signal } = {}) {
  return readJson(await apiFetch('/v3/auth/login', { method: 'POST', body: credentials, signal }));
}

export async function getMe(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/auth/me', { token, signal }));
}

// STEP 7: password reset. Both routes are public; the responses are generic.
export async function requestPasswordReset(email, { signal } = {}) {
  return readJson(await apiFetch('/v3/auth/forgot-password', { method: 'POST', body: { email }, signal }));
}

export async function confirmPasswordReset(token, newPassword, { signal } = {}) {
  return readJson(await apiFetch('/v3/auth/reset-password', { method: 'POST', body: { token, newPassword }, signal }));
}

// ---------- label ----------
export async function getLabelOverview(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/label/overview', { token, signal }));
}

// ---------- artists ----------
// The route accepts only `search`, `limit` and `offset` (src/routes/artists.js L48). Search and
// sort stay CLIENT-side per PHASE_4A_HANDOFF.md matrix row 10; `limit` is raised so the whole
// server-filtered roster arrives in one page.
export async function getArtists(token, { limit = 500, offset = 0, signal } = {}) {
  return readJson(await apiFetch(`/v3/artists?limit=${limit}&offset=${offset}`, { token, signal }));
}

export async function getArtist(token, id, { signal } = {}) {
  return readJson(await apiFetch(`/v3/artists/${encodeURIComponent(id)}`, { token, signal }));
}

export async function createArtist(token, body, { signal } = {}) {
  return readJson(await apiFetch('/v3/artists', { method: 'POST', body, token, signal }));
}

export async function archiveArtist(token, id, { signal } = {}) {
  return readJson(await apiFetch(`/v3/artists/${encodeURIComponent(id)}/archive`, { method: 'POST', body: {}, token, signal }));
}

export async function restoreArtist(token, id, { signal } = {}) {
  return readJson(await apiFetch(`/v3/artists/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {}, token, signal }));
}

export async function updateArtistImage(token, id, imageUrl, { signal } = {}) {
  return readJson(await apiFetch(`/v3/artists/${encodeURIComponent(id)}/image`, { method: 'PUT', body: { imageUrl }, token, signal }));
}

// `?refresh=true` spends real money upstream (PHASE_4A_HANDOFF.md §18 / HIGH-7): the caller
// must gate it behind an explicit confirm, never a one-click control.
export async function getEntityAudit(token, id, { refresh = false, signal } = {}) {
  const query = refresh ? '?refresh=true' : '';
  return readJson(await apiFetch(`/v3/artists/${encodeURIComponent(id)}/entity-audit${query}`, { token, signal }));
}

// ---------- analytics ----------
export async function getGeography(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/analytics/geography', { token, signal }));
}

export async function getProjections(token, { artistId, signal } = {}) {
  const query = artistId ? `?artistId=${encodeURIComponent(artistId)}` : '';
  return readJson(await apiFetch(`/v3/analytics/projections${query}`, { token, signal }));
}

export async function postSales(token, body, { signal } = {}) {
  return readJson(await apiFetch('/v3/analytics/sales', { method: 'POST', body, token, signal }));
}

// ---------- fans / marketing / operations ----------
export async function getFanDemographics(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/fans/demographics', { token, signal }));
}

export async function getCampaignStats(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/campaigns/stats', { token, signal }));
}

export async function createCampaign(token, body, { signal } = {}) {
  return readJson(await apiFetch('/v3/marketing/campaigns', { method: 'POST', body, token, signal }));
}

export async function getLogistics(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/operations/logistics', { token, signal }));
}

export async function getAssets(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/operations/assets', { token, signal }));
}

export async function getContracts(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/operations/contracts', { token, signal }));
}

// ---------- A&R (two stores, deliberately NOT merged — FRONTEND_API_MAP.md §1) ----------
export async function getAnrState(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/anr/state', { token, signal }));
}

export async function getAnrSubmissions(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/anr/submissions', { token, signal }));
}

export async function createSubmission(token, body, { signal } = {}) {
  return readJson(await apiFetch('/v3/anr/submissions', { method: 'POST', body, token, signal }));
}

export async function voteSubmission(token, id, direction, { signal } = {}) {
  return readJson(await apiFetch(`/v3/anr/submissions/${encodeURIComponent(id)}/vote`, { method: 'POST', body: { direction }, token, signal }));
}

export async function deleteSubmission(token, id, { signal } = {}) {
  return readJson(await apiFetch(`/v3/anr/submissions/${encodeURIComponent(id)}`, { method: 'DELETE', token, signal }));
}

// Store #2 semantics: the body is { action: 'add' | 'remove' } and the ratings array is keyed
// by user email; anything else is a 400 (src/routes/anr.js L235-262).
export async function voteDemo(token, demoId, action, { signal } = {}) {
  return readJson(await apiFetch(`/v3/anr/vote/${encodeURIComponent(demoId)}`, { method: 'POST', body: { action }, token, signal }));
}

export async function getDemoRating(token, demoId, { includeTally = false, signal } = {}) {
  const query = includeTally ? '?includeTally=true' : '';
  return readJson(await apiFetch(`/v3/anr/demos/${encodeURIComponent(demoId)}/rating${query}`, { token, signal }));
}

export async function getScouts(token, { query = '', signal } = {}) {
  return readJson(await apiFetch(`/v3/anr/scout?query=${encodeURIComponent(query)}`, { token, signal }));
}

export async function shortlistScout(token, scout, { signal } = {}) {
  return readJson(await apiFetch('/v3/anr/shortlist', { method: 'POST', body: scout, token, signal }));
}

// ---------- integrations ----------
export async function getIntegrationStatus(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/integrations/status', { token, signal }));
}

export async function connectIntegration(token, service, { signal } = {}) {
  return readJson(await apiFetch(`/v3/integrations/auth/${encodeURIComponent(service)}`, { token, signal }));
}

export async function disconnectIntegration(token, service, { signal } = {}) {
  return readJson(await apiFetch('/v3/integrations/disconnect', { method: 'POST', body: { service }, token, signal }));
}

export async function getGoogleKg(token, { query, signal } = {}) {
  return readJson(await apiFetch(`/v3/integrations/google-kg?query=${encodeURIComponent(query)}`, { token, signal }));
}

// ---------- AI (backend only — no provider SDK, no key, ever, in this app) ----------
export async function aiQuery(token, body, { signal } = {}) {
  return readJson(await apiFetch('/v3/ai/query', { method: 'POST', body, token, signal }));
}

// ---------- users (admin) ----------
export async function getUsers(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/users', { token, signal }));
}

export async function createUser(token, body, { signal } = {}) {
  return readJson(await apiFetch('/v3/users', { method: 'POST', body, token, signal }));
}

export async function updateUser(token, id, body, { signal } = {}) {
  return readJson(await apiFetch(`/v3/users/${encodeURIComponent(id)}`, { method: 'PUT', body, token, signal }));
}

export async function deleteUser(token, id, { signal } = {}) {
  return readJson(await apiFetch(`/v3/users/${encodeURIComponent(id)}`, { method: 'DELETE', token, signal }));
}

// ---------- exports (server-generated PDF/CSV — never approximated client-side) ----------
export function exportPath({ format = 'pdf', artistId, timeframe = '30d' } = {}) {
  const params = new URLSearchParams({ format, timeframe });
  if (artistId) params.set('artistId', artistId);
  return `/v3/exports?${params.toString()}`;
}

export async function getCampaigns(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/marketing/campaigns', { token, signal }));
}
export async function createRoomDemo(token, body) {
  return readJson(await apiFetch('/v3/anr/demos', { token, method: 'POST', body }));
}
export async function saveWhiteboard(token, message) {
  return readJson(await apiFetch('/v3/anr/whiteboard', { token, method: 'POST', body: { message } }));
}
export async function saveListening(token, url) {
  return readJson(await apiFetch('/v3/anr/listening', { token, method: 'POST', body: { url } }));
}
