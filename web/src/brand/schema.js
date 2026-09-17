/**
 * @typedef {Object} BrandProfile
 * @property {number} schemaVersion
 * @property {string} slug
 * @property {string} name
 * @property {string} displayName
 * @property {string} shortName
 * @property {string} tagline
 * @property {string} documentTitle
 * @property {string} domain
 * @property {string|null} website
 * @property {{support:string|null, privacy:string|null}} contact
 * @property {{fromName:string, fromAddress:string}} email
 * @property {{language:string, numberLocale:string, currency:string, timeZone:string}} locale
 * @property {string} theme
 * @property {{mark:string|null, loader:string|null, favicon:string, logo:string|null}} assets
 * @property {{searchContext:string, artistQueryPrefix:string}} search
 * @property {Record<string, unknown>} copy
 * @property {{footer:string|null, copyright:string|null}} legal
 * @property {Record<string, unknown>} features
 */

const requiredStrings = [
  'slug', 'name', 'displayName', 'shortName', 'tagline', 'documentTitle',
  'domain', 'locale.language', 'locale.numberLocale', 'locale.currency',
  'locale.timeZone', 'theme', 'assets.favicon', 'search.searchContext',
  'search.artistQueryPrefix', 'email.fromName', 'email.fromAddress',
];

export function validateProfile(profile) {
  if (!import.meta.env.DEV) return true;
  const issues = [];
  if (profile?.schemaVersion !== 1) issues.push('schemaVersion');
  for (const key of requiredStrings) {
    const value = key.split('.').reduce((current, part) => current?.[part], profile);
    if (typeof value !== 'string' || !value.trim()) issues.push(key);
  }
  if (profile?.slug && !/^[a-z0-9-]+$/.test(profile.slug)) issues.push('slug format');
  if (profile?.shortName?.length > 12) issues.push('shortName length');
  for (const key of ['contact', 'email', 'locale', 'assets', 'search', 'copy', 'legal', 'features']) {
    if (!profile?.[key] || typeof profile[key] !== 'object') issues.push(key);
  }
  for (const issue of issues) console.error(`Invalid brand profile: ${issue}`);
  return issues.length === 0;
}
