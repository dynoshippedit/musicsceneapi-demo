import { createContext, useContext, useLayoutEffect, useState } from 'react';
import { resolveActiveBrand } from './index.js';
import { createFormatters } from '../utils/format.js';

const BrandContext = createContext(null);

export function BrandProvider({ children }) {
  const [brand] = useState(() => {
    const resolved = resolveActiveBrand();
    return { ...resolved, formatters: createFormatters(resolved.profile.locale) };
  });

  useLayoutEffect(() => {
    document.title = brand.profile.documentTitle;
    document.documentElement.dataset.theme = brand.profile.theme;
    document.body.dataset.theme = brand.profile.theme;
    let icon = document.getElementById('brand-favicon');
    if (!icon) {
      icon = document.createElement('link');
      icon.id = 'brand-favicon';
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = brand.profile.assets.favicon;
  }, [brand]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const brand = useContext(BrandContext);
  if (!brand) throw new Error('BrandProvider is missing');
  return brand;
}
