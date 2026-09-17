import { useBrand } from './BrandContext.jsx';
import { registry } from './registry.js';
import { MonogramMark } from './defaults/MonogramMark.jsx';

export function BrandMark({ size = 40 }) {
  const { profile } = useBrand();
  const Mark = registry.marks[profile.assets.mark]?.Mark || MonogramMark;
  return <Mark size={size} />;
}
