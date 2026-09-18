import locations from './locations.js';

/** @type {import('../../schema.js').BrandProfile} */
const profile = {
  schemaVersion: 1,
  slug: 'mau5trap',
  name: 'mau5trap',
  displayName: 'mau5trap',
  shortName: 'mau5trap',
  tagline: 'INTELLIGENCE PLATFORM',
  documentTitle: 'mau5trap Intelligence Platform',
  domain: 'mau5trap.com',
  website: 'https://mau5trap.com',
  contact: { support: 'admin@mau5trap.com', privacy: null },
  email: { fromName: 'mau5trap OS', fromAddress: 'notify@mau5trap.com' },
  locale: { language: 'en-US', numberLocale: 'en-US', currency: 'USD', timeZone: 'America/Toronto' },
  theme: 'mau5trap-console',
  assets: { mark: 'mau5head', loader: 'mau5head', favicon: '/brands/mau5trap/favicon.svg', logo: null },
  search: { searchContext: 'mau5trap', artistQueryPrefix: 'mau5trap artist' },
  // Map centres are profile DATA (architecture §14.5): the generic GeoHeatmap holds no
  // coordinate table and resolves region names through this key.
  map: { center: [10, 0], zoom: 2, centers: locations.centers, continents: locations.continents },
  copy: {},
  legal: { footer: null, copyright: null },
  features: {},
};

export default profile;
