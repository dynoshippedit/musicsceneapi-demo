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
export function GeoHeatmap({ dataset, title, height = 400, source = 'roster reference' }) {
  const container = useRef(null);
  const map = useRef(null);
  const { profile, text } = useBrand();
  const [unmapped, setUnmapped] = useState([]);
  const [tileError, setTileError] = useState(false);

  const mapConfig = profile.map || {};
  const centers = mapConfig.centers || {};

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
        zoomControl: true,
        attributionControl: true,
      });
      // Profile or deployment can override the attributed public basemap.
      const tileUrl = mapConfig.tileUrl
        || import.meta.env.VITE_MAP_TILE_URL
        || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      L.tileLayer(tileUrl, {
        attribution: mapConfig.tileAttribution || import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: mapConfig.tileSubdomains || 'abcd',
        maxZoom: 19,
        noWrap: true,
        // Without an explicit bounds, `noWrap` still lets Leaflet request the columns either
        // side of the world at low zoom (x=-1, x=4 at z=2). The provider answers those with
        // HTTP 400 "Tile does not exist", which surfaces as console errors on every map view.
        bounds: [[-90, -180], [90, 180]],
      }).on('tileerror', () => setTileError(true)).addTo(map.current);
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
      const tooltip = document.createElement('span');
      tooltip.textContent = `${row.region}: ${row.percent ?? 0}% (regional aggregate)`;
      L.circleMarker(center, { radius: 5 + Math.sqrt(Math.max(0, Number(row.percent) || 0)) * 2,
        fillColor: accent, color: stroke, weight: 1, opacity: 0.7, fillOpacity: 0.65,
      }).bindTooltip(tooltip, { sticky: true, direction: 'top' }).addTo(instance);

    }
    setUnmapped(missing);
    // Leaflet measures the container on creation; a panel that was laid out after mount
    // (grid/responsive) needs one invalidateSize or the tiles render into a 0-height box.
    instance.invalidateSize();
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [points, centers, mapConfig.center, mapConfig.zoom]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  const mappedCount = points.length - unmapped.length;
  return (
    <div className={`panel ${styles.wrap}`} style={{ height }}>
      <div className={styles.overlay}>
        <div className={styles.titleRow}>
          <span className="status-dot status-dot--on" aria-hidden="true" />
          <span className={`label label--accent ${styles.title}`}>{title || text.geoTitle}</span>
        </div>
        <div className={`label ${styles.source}`}>SOURCE: {String(source).toUpperCase()} · REGION TOTALS</div>
        {tileError && <div role="status">Basemap unavailable. Regional markers remain visible.</div>}
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
  const candidate = Array.isArray(row?.coordinates) ? row.coordinates
    : typeof row?.lat === 'number' && typeof row?.lng === 'number' ? [row.lat, row.lng] : centers[row?.region];
  return Array.isArray(candidate) && candidate.length === 2 && candidate.every(Number.isFinite)
    && Math.abs(candidate[0]) <= 90 && Math.abs(candidate[1]) <= 180 ? candidate : null;
}
