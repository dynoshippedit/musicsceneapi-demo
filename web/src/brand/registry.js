import mau5trapProfile from './profiles/mau5trap/profile.js';
import exampleProfile from './profiles/example-records/profile.js';
import { Mau5Head } from './profiles/mau5trap/Mau5Head.jsx';
import { Mau5HeadLoader } from './profiles/mau5trap/Mau5HeadLoader.jsx';
import './themes/mau5trap-console.css';
import './themes/example-records-magenta.css';

export const registry = {
  defaultSlug: 'mau5trap',
  profiles: {
    mau5trap: mau5trapProfile,
    'example-records': exampleProfile,
  },
  marks: {
    mau5head: { Mark: Mau5Head, Loader: Mau5HeadLoader },
  },
};
