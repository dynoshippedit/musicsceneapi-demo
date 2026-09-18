import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildNetwork } from './networkData.js';
import styles from './NetworkGraph.module.css';

export function NetworkGraph({ artists = [] }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const network = useMemo(() => buildNetwork(artists), [artists]);
  const nodes = network.nodes.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
  const positions = new Map(nodes.map((a, i) => [a.id, { x: 32 + (i % 4) * 250, y: 35 + Math.floor(i / 4) * 72 }]));
  const edges = network.edges.filter(([a, b]) => positions.has(a) && positions.has(b));
  const active = network.nodes.find(a => a.id === selected);
  return <div className={styles.wrap}>
    <div className={styles.toolbar}>
      <input aria-label="Find artist in network" placeholder="Find an artist…" value={search} onChange={e => setSearch(e.target.value)} />
      <span>{nodes.length} artists · {edges.length} recorded collaborations</span>
    </div>
    {!network.edges.length && <p className={styles.note}>No collaborations recorded yet. Select an artist to inspect their profile. Positions do not imply relationships.</p>}
    <div className={styles.viewport}>
      <svg className={styles.graph} viewBox={`0 0 1000 ${Math.max(100, Math.ceil(nodes.length / 4) * 72)}`} aria-label="Artist collaboration network">
        {edges.map(([a, b]) => <line key={`${a}-${b}`} x1={positions.get(a).x} y1={positions.get(a).y} x2={positions.get(b).x} y2={positions.get(b).y} className={styles.edge} />)}
        {nodes.map(artist => {
          const { x, y } = positions.get(artist.id);
          return <g key={artist.id} transform={`translate(${x},${y})`}>
            <a href={`/artists/${encodeURIComponent(artist.id)}`} onClick={event => { event.preventDefault(); setSelected(artist.id); }} aria-label={`Select ${artist.name}`}>
              <rect x="-20" y="-23" width="237" height="48" rx="4" className={`${styles.node} ${selected === artist.id ? styles.selected : ''}`} />
              <circle r="6" className={styles[artist.tier] || styles.core} />
              <text x="15" y="5" className={styles.name}>{artist.name.length > 23 ? `${artist.name.slice(0, 22)}…` : artist.name}</text>
              <title>{artist.name} · {artist.tier}</title>
            </a>
          </g>;
        })}
      </svg>
    </div>
    {!nodes.length && <p>No artists match your search.</p>}
    {active && <div className={styles.detail} aria-live="polite"><strong>{active.name}</strong><span>{network.edges.filter(pair => pair.includes(active.id)).length} recorded collaborations</span><Link to={`/artists/${encodeURIComponent(active.id)}?tab=network`}>Open artist profile →</Link></div>}
    <ul className={styles.legend}>
      <li><span className={`${styles.swatch} ${styles.flagship}`} />FLAGSHIP</li>
      <li><span className={`${styles.swatch} ${styles.core}`} />CORE</li>
      <li><span className={`${styles.swatch} ${styles.developing}`} />DEVELOPING</li>
    </ul>
  </div>;
}
