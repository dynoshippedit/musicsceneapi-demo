import { useEffect, useRef } from 'react';
import { useBrand } from '../brand/BrandContext.jsx';
import styles from './NetworkGraph.module.css';

/**
 * Roster relationship graph — the legacy `IntelligenceGraph` canvas loop (legacy frontend
 * L331-438) ported with its physics intact. Tier colours come from tokens, and this legend is
 * the ONLY place `--color-info` (cyan) and `--color-tier-dev` (violet) are allowed to appear
 * (tokens.css marks both RESTRICTED). They are never a button, link, nav or general accent.
 */
export function NetworkGraph({ artists = [], height = 320 }) {
  const canvasRef = useRef(null);
  const frame = useRef(0);
  const { text } = useBrand();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    const style = getComputedStyle(document.documentElement);
    const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    const colors = {
      core: token('--color-info', 'currentColor'),
      developing: token('--color-tier-dev', 'currentColor'),
      flagship: token('--color-accent', 'currentColor'),
      archived: token('--color-text-faint', 'currentColor'),
      link: token('--chart-grid', 'currentColor'),
    };

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();

    const visible = artists
      .filter((artist) => artist.tier !== 'archived' && artist.status !== 'archived')
      .slice(0, 40);
    const nodes = visible.map((artist, index) => ({
      id: artist.id,
      name: artist.name,
      collaborations: artist.collaborations || [],
      tier: artist.tier,
      radius: 4 + Math.min(8, (artist.monthlyListeners || 0) / 1_500_000),
      angle: (index / Math.max(1, visible.length)) * Math.PI * 2,
      distance: 0.22 + ((index % 5) * 0.06),
      speed: 0.0009 + ((index % 7) * 0.00012),
    }));
    const collabKey = (entry) => {
      if (entry == null) return '';
      if (typeof entry === 'string') return entry.toLowerCase();
      return String(entry.id || entry.name || '').toLowerCase();
    };
    const linked = (a, b) => {
      const keys = new Set([String(b.id || '').toLowerCase(), String(b.name || '').toLowerCase()].filter(Boolean));
      return (a.collaborations || []).some((entry) => keys.has(collabKey(entry)));
    };

    let running = true;
    const draw = () => {
      if (!running) return;
      const width = canvas.clientWidth;
      const heightPx = canvas.clientHeight;
      const cx = width / 2;
      const cy = heightPx / 2;
      const scale = Math.min(width, heightPx);
      context.clearRect(0, 0, width, heightPx);

      const placed = nodes.map((node) => {
        node.angle += node.speed;
        return { ...node, x: cx + Math.cos(node.angle) * scale * node.distance, y: cy + Math.sin(node.angle) * scale * node.distance };
      });

      context.strokeStyle = colors.link;
      context.lineWidth = 1;
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          if (linked(placed[i], placed[j]) || linked(placed[j], placed[i])) {
            context.beginPath();
            context.moveTo(placed[i].x, placed[i].y);
            context.lineTo(placed[j].x, placed[j].y);
            context.stroke();
          }
        }
      }

      for (const node of placed) {
        context.beginPath();
        context.fillStyle = colors[node.tier] || colors.archived;
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fill();
      }

      frame.current = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);

    // Cleanup on unmount — the legacy version leaked a rAF loop per re-render.
    return () => {
      running = false;
      cancelAnimationFrame(frame.current);
      window.removeEventListener('resize', resize);
    };
  }, [artists]);

  return (
    <div className={styles.wrap}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height }} role="img" aria-label={text.a11y.network} />
      <ul className={styles.legend}>
        <li><span className={`${styles.swatch} ${styles.flagship}`} aria-hidden="true" />FLAGSHIP</li>
        <li><span className={`${styles.swatch} ${styles.core}`} aria-hidden="true" />{text.networkTierCore}</li>
        <li><span className={`${styles.swatch} ${styles.developing}`} aria-hidden="true" />{text.networkTierDeveloping}</li>
      </ul>
    </div>
  );
}
