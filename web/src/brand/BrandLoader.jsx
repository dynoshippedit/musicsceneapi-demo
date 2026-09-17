import { useBrand } from './BrandContext.jsx';
import { registry } from './registry.js';
import { RingLoader } from './defaults/RingLoader.jsx';

export function BrandLoader() {
  const { profile, text } = useBrand();
  const Loader = registry.marks[profile.assets.loader]?.Loader || RingLoader;
  return <Loader label={text.a11y.loading} />;
}
