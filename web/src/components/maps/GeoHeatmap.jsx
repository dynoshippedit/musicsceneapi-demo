import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useBrand } from '../../brand/BrandContext.jsx';
import styles from './GeoHeatmap.module.css';

/**
 * Generic geographic scatter. Ported from the legacy `FanHeatmap` (legacy frontend L934-1085)
 * with ONE structural change, which is the point of the port: the legacy component embedded a
 * 44-entry region/city/venue coordinate table inline. This file contains NO coordinate table
 * (BRAND_PORTABILITY_AUDIT W04).
 *
 * A point is placed from, in order:
 *   1. coordinates carried by the dataset row itself (`lat`/`lng`, or `coordinates: [lat,lng]`)
 *   2. the ACTIVE profile's `map.centers[row.region]` lookup
 * A row that resolves to neither is counted as unmapped and reported, never silently dropped.
 *
 * Marker colour comes from the computed `--color-accent` token, so the active theme drives it;
 * the legacy hard-coded accent literal is gone (a raw hex here also fails static check S05).
 */
export function GeoHeatmap({ dataset, title, height = 400 }) {
  const container = useRef(null);
  const map = useRef(null);
  const { profile, text } = useBrand();
  const [unmapped, setUnmapped] = useState([]);

  const mapConfig = profile.map || {};
  const centers = mapConfig.centers || {};
  const continents = mapConfig.continents || [];

  // Profile-declared pins (an HQ or flagship room a label always wants shown) are merged with
  // whatever the API supplied. The default profile declares none — all of its points are API data.
  const points = useMemo(
    () => [...(mapConfig.homeMarkers || []), ...(Array.isArray(dataset) ? dataset : [])],
    [dataset, mapConfig.homeMarkers],
  );

  useEffect(() => {
    if (!container.current) return undefined;
    if (!map.current) {
      map.current = L.map(container.current, {
        center: mapConfig.center || [10, 0],
        zoom: mapConfig.zoom ?? 2,
        minZoom: 1.5,
        maxBounds: [[-90, -200], [90, 200]],
        maxBoundsViscosity: 0.5,
        zoomControl: false,
        attributionControl: false,
      });
      // Basemap source, in precedence order: active profile → deploy-time env → the legacy
      // default (kept byte-identical for parity). The provider behind that default now brands
      // unkeyed tiles with an "API KEY REQUIRED" watermark, so a real deployment supplies its
      // own keyed URL here instead of editing this file. Markers are unaffected either way.
      const tileUrl = mapConfig.tileUrl
        || import.meta.env.VITE_MAP_TILE_URL
        || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      L.tileLayer(tileUrl, {
        subdomains: mapConfig.tileSubdomains || 'abcd',
        maxZoom: 19,
        noWrap: true,
        // Without an explicit bounds, `noWrap` still lets Leaflet request the columns either
        // side of the world at low zoom (x=-1, x=4 at z=2). The provider answers those with
        // HTTP 400 "Tile does not exist", which surfaces as console errors on every map view.
        bounds: [[-90, -180], [90, 180]],
      }).addTo(map.current);
    }

    const instance = map.current;
    instance.eachLayer((layer) => { if (layer instanceof L.CircleMarker) instance.removeLayer(layer); });

    const rootStyle = getComputedStyle(document.documentElement);
    const token = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
    const accent = token('--color-accent', 'currentColor');
    // Legacy stroked each marker with a flat black; taking it from the environment token keeps
    // the value out of this file (static check S05 forbids colour literals in generic source).
    const stroke = token('--color-bg', 'currentColor');
    const missing = [];

    for (const row of points) {
      const center = resolveCenter(row, centers);
      if (!center) { missing.push(row.region); continue; }
      const isContinent = continents.includes(row.region);
      const scatterLat = isContinent ? 20 : 0.15;
      const scatterLng = isContinent ? 40 : 0.15;
      const raw = Math.ceil((row.percent || 0) / 2);
      const count = isContinent ? Math.max(5, raw) : Math.min(Math.max(5, raw), 20);

      for (let index = 0; index < count; index += 1) {
        const lat = center[0] + (Math.random() - 0.5) * scatterLat;
        const lng = center[1] + (Math.random() - 0.5) * scatterLng;
        L.circleMarker([lat, lng], {
          radius: 4 + Math.random() * 4,
          fillColor: accent, color: stroke, weight: 1, opacity: 0.2, fillOpacity: 0.4,
        }).bindTooltip(`${row.region}: ${row.percent ?? 0}%`, { sticky: true, direction: 'top' }).addTo(instance);
      }
    }
    setUnmapped(missing);
    // Leaflet measures the container on creation; a panel that was laid out after mount
    // (grid/responsive) needs one invalidateSize or the tiles render into a 0-height box.
    instance.invalidateSize();
    return undefined;
  }, [points, centers, continents, mapConfig.center, mapConfig.zoom]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  const mappedCount = points.length - unmapped.length;
  return (
    <div className={`panel ${styles.wrap}`} style={{ height }}>
      <div className={styles.overlay}>
        <div className={styles.titleRow}>
          <span className="status-dot status-dot--on" aria-hidden="true" />
          <span className={`label label--accent ${styles.title}`}>{title || text.geoTitle}</span>
        </div>
        <div className={`label ${styles.source}`}>{text.geoSource}</div>
        {unmapped.length > 0 && (
          <div className={`label ${styles.unmapped}`} title={unmapped.join(', ')}>
            {text.geoUnmapped}: {unmapped.length}
          </div>
        )}
      </div>
      <div
        ref={container}
        className={styles.canvas}
        role="img"
        aria-label={text.a11y.map}
        data-mapped-count={mappedCount}
        data-unmapped-count={unmapped.length}
      />
    </div>
  );
}

function resolveCenter(row, centers) {
  if (Array.isArray(row?.coordinates) && row.coordinates.length === 2) return row.coordinates;
  if (typeof row?.lat === 'number' && typeof row?.lng === 'number') return [row.lat, row.lng];
  return centers[row?.region] || null;
}
