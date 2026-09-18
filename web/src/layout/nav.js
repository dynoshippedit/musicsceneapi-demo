import { platformCopy } from '../copy.js';

export const NAV_PRIMARY = [
  { id: 'dashboard', label: platformCopy.nav.dashboard, icon: 'ri-dashboard-line', perm: 'overview', to: '/dashboard', subtitle: 'dashboardSubtitle' },
  { id: 'artists', label: platformCopy.nav.artists, icon: 'ri-user-star-line', perm: 'roster', to: '/artists' },
  { id: 'anr', label: platformCopy.nav.anr, icon: 'ri-headphone-line', perm: 'anr_room', to: '/anr' },
  { id: 'intelligence', label: platformCopy.nav.intelligence, icon: 'ri-brain-line', perm: 'ai_lab', to: '/intelligence' },
  { id: 'marketing', label: platformCopy.nav.marketing, icon: 'ri-megaphone-line', perm: 'marketing', to: '/marketing' },
  { id: 'fans', label: platformCopy.nav.fans, icon: 'ri-group-line', perm: 'fans', to: '/fans' },
  { id: 'operations', label: platformCopy.nav.operations, icon: 'ri-truck-line', perm: 'operations', to: '/operations' },
  { id: 'admin', label: platformCopy.nav.admin, icon: 'ri-settings-3-line', perm: 'admin', adminOnly: true, to: '/admin' },
];

export const NAV_SECONDARY = [
  { id: 'settings', label: platformCopy.nav.settings, icon: 'ri-equalizer-line', to: '/settings' },
];

/**
 * Resolve the nav entry that OWNS a pathname, so nested Phase 4C routes
 * (`/artists/:artistId`, `/anr/scouting`, `/settings/ai`) keep their parent's header title.
 * Longest match wins and the match is segment-bounded, so `/artistsfoo` never matches
 * `/artists`. An unmatched path resolves to null — the caller decides the fallback rather
 * than silently inheriting the first nav entry's title.
 */
export function resolveNavEntry(pathname) {
  const entries = [...NAV_PRIMARY, ...NAV_SECONDARY];
  let best = null;
  for (const entry of entries) {
    if (pathname === entry.to || pathname.startsWith(`${entry.to}/`)) {
      if (!best || entry.to.length > best.to.length) best = entry;
    }
  }
  return best;
}
