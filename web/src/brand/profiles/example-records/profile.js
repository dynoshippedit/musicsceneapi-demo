/** @type {import('../../schema.js').BrandProfile} */
const profile = {
  schemaVersion: 1,
  slug: 'example-records',
  name: 'Example Records',
  displayName: 'Example Records',
  shortName: 'Example',
  tagline: 'LABEL OPERATIONS',
  documentTitle: 'Example Records — Label Operations',
  domain: 'example-records.test',
  website: null,
  contact: { support: 'ops@example-records.test', privacy: null },
  email: { fromName: 'Example Records', fromAddress: 'noreply@example-records.test' },
  locale: { language: 'en-GB', numberLocale: 'en-GB', currency: 'GBP', timeZone: 'Europe/London' },
  theme: 'example-records-magenta',
  assets: { mark: null, loader: null, favicon: '/brands/example-records/favicon.svg', logo: null },
  search: { searchContext: 'Example Records', artistQueryPrefix: 'Example Records artist' },
  // Map portability acceptance fixture (PHASE_4A_HANDOFF.md §17): a location that exists ONLY
  // in this profile. `homeMarkers` are pins a label always wants shown regardless of what the
  // API returns; the generic GeoHeatmap resolves them through `centers` below. Its marker must
  // render with no edit to web/src/components/maps/ or any other generic source.
  map: {
    center: [54.0, -2.0],
    zoom: 5,
    centers: { 'Example Arena, Leeds': [53.80, -1.55], 'Example Records HQ, Bristol': [51.45, -2.59] },
    continents: ['North America', 'Europe', 'Asia', 'South America', 'Oceania', 'Africa'],
    homeMarkers: [{ region: 'Example Arena, Leeds', value: 42000, percent: 12 }],
  },
  copy: {},
  legal: { footer: '© Example Records — portability test profile', copyright: null },
  features: {},
};

export default profile;
