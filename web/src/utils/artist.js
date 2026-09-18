/**
 * Derived-at-render roster helpers (PHASE_4A_HANDOFF.md §11 — derived values are computed in
 * the view, never cached in a store).
 *
 * `GET /v3/artists` serves a `revenue` OBJECT and no `totalRevenue` field; only
 * `GET /v3/artists/:id` adds one. The legacy roster read `artist.totalRevenue` off the list
 * payload and therefore rendered `$NaNk` for every row. This mirrors the server's own
 * `calculateTotalRevenue` (src/utils/dataShape.js L17) byte-for-byte in behaviour — sum the
 * NUMERIC members of `revenue`, skipping the nested `streamingBreakdown` object — so a roster
 * row, `/v3/artists/:id.totalRevenue` and `label/overview.topArtists[].revenue` all agree.
 */
export function totalRevenue(artist) {
  if (!artist?.revenue) return 0;
  return Object.values(artist.revenue).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
}

export const ARCHIVED_TIER = 'archived';

export function isArchived(artist) {
  return artist?.tier === ARCHIVED_TIER || artist?.status === ARCHIVED_TIER;
}

export function tierTone(tier) {
  if (tier === 'flagship') return 'accent';
  if (tier === ARCHIVED_TIER) return 'muted';
  return 'neutral';
}

export function sortArtists(artists, sort, derive) {
  if (!sort?.key) return artists;
  const factor = sort.direction === 'desc' ? -1 : 1;
  return [...artists].sort((a, b) => {
    const left = derive(a, sort.key);
    const right = derive(b, sort.key);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return String(left ?? '').localeCompare(String(right ?? '')) * factor;
  });
}
