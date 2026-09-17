import { apiFetch, readJson } from './client.js';

export async function login(credentials, { signal } = {}) {
  return readJson(await apiFetch('/v3/auth/login', { method: 'POST', body: credentials, signal }));
}

export async function getMe(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/auth/me', { token, signal }));
}

export async function getLabelOverview(token, { signal } = {}) {
  return readJson(await apiFetch('/v3/label/overview', { token, signal }));
}
