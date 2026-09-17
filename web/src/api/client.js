const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
let onUnauthorized = () => {};

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === 'function' ? handler : () => {};
  return () => { if (onUnauthorized === handler) onUnauthorized = () => {}; };
}

export async function apiFetch(path, { method = 'GET', body, token, signal } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    signal,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) onUnauthorized();
  return response;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload.error || payload.message || `Request failed (${response.status})`);
  return payload;
}
