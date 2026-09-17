import { platformCopy } from '../copy.js';
import { registry } from './registry.js';
import { validateProfile } from './schema.js';

const reportedUnknown = new Set();

function selectedSlug() {
  if (import.meta.env.DEV) {
    try {
      const override = localStorage.getItem('platform.brandProfile');
      if (override) return override;
    } catch { /* Storage may be disabled; deployment configuration still works. */ }
  }
  return import.meta.env.VITE_BRAND_PROFILE || registry.defaultSlug;
}

export function resolveActiveBrand() {
  const slug = selectedSlug();
  const profile = registry.profiles[slug] || registry.profiles[registry.defaultSlug];
  if (!registry.profiles[slug] && !reportedUnknown.has(slug)) {
    reportedUnknown.add(slug);
    console.error(`Unknown brand profile: ${slug}`);
  }
  validateProfile(profile);
  const text = { ...platformCopy, ...profile.copy, nav: { ...platformCopy.nav, ...profile.copy.nav } };
  return { profile, text };
}
