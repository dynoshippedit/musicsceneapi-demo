import pulsegridProfile from './profiles/pulsegrid/profile.js';
import exampleProfile from './profiles/example-records/profile.js';
import './themes/pulsegrid-console.css';
import './themes/example-records-magenta.css';

export const registry = {
  defaultSlug: 'pulsegrid',
  profiles: {
    pulsegrid: pulsegridProfile,
    'example-records': exampleProfile,
  },
  marks: {
    // No label-specific marks: BrandMark/BrandLoader fall back to the neutral
    // MonogramMark / RingLoader in brand/defaults/.
  },
};
