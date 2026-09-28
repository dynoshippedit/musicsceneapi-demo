import locations from './locations.js';

/** @type {import('../../schema.js').BrandProfile} */
const profile = {
  schemaVersion: 1,
  slug: 'pulsegrid',
  name: 'Pulsegrid',
  displayName: 'Pulsegrid',
  shortName: 'Pulsegrid',
  tagline: 'INTELLIGENCE PLATFORM',
  documentTitle: 'The Music Scene — Pulsegrid',
  domain: 'pulsegrid.fm',
  website: 'https://pulsegrid.fm',
  contact: { support: 'admin@pulsegrid.fm', privacy: null },
  email: { fromName: 'Pulsegrid OS', fromAddress: 'notify@pulsegrid.fm' },
  locale: { language: 'en-US', numberLocale: 'en-US', currency: 'USD', timeZone: 'America/Toronto' },
  theme: 'pulsegrid-console',
  assets: { mark: null, loader: null, favicon: '/brands/pulsegrid/favicon.svg', logo: null },
  search: { searchContext: 'Pulsegrid', artistQueryPrefix: 'Pulsegrid artist' },
  // Map centres are profile DATA (architecture §14.5): the generic GeoHeatmap holds no
  // coordinate table and resolves region names through this key.
  map: { center: [10, 0], zoom: 2, centers: locations.centers, continents: locations.continents },
  copy: {},
  legal: { footer: null, copyright: null },
  features: {},
};

export default profile;
