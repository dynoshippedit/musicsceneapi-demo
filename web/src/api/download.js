// Server-generated report downloads. The PDF/CSV bytes are produced by GET /v3/exports
// (src/routes/reports.js, PDFKit / csv-writer). This helper only transports them — it never
// renders or approximates a report client-side (PHASE_4A_HANDOFF.md matrix row 31).
import { apiFetch, ApiError } from './client.js';
import { exportPath } from './endpoints.js';

// The filename stem is brand DATA supplied by the caller from the active profile
// (architecture §14.2) — never a label literal in this module.
export async function downloadExport(token, { format = 'pdf', artistId, timeframe = '30d', stem = 'export', signal } = {}) {
  const response = await apiFetch(exportPath({ format, artistId, timeframe }), { token, signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload.error || `Export failed (${response.status})`);
  }
  const blob = await response.blob();
  const suffix = artistId ? `-${artistId}` : '';
  saveBlob(blob, `${stem}${suffix}-${timeframe}.${format}`);
  return { bytes: blob.size, type: blob.type };
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
