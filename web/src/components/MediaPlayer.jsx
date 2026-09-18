import { useState } from 'react';
export function MediaPlayer({ url, title = 'Track' }) {
  const [playing, setPlaying] = useState(false);
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['https:', 'http:'].includes(parsed.protocol)) return null;
  let embed;
  if (['soundcloud.com', 'www.soundcloud.com'].includes(parsed.hostname)) embed = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false`;
  if (parsed.hostname === 'open.spotify.com' && /^\/(track|album|playlist)\/[a-zA-Z0-9]+$/.test(parsed.pathname)) embed = `https://open.spotify.com/embed${parsed.pathname}`;
  const direct = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(parsed.pathname);
  return <div>
    {direct ? <audio controls preload="none" src={url} aria-label={`Play ${title}`} style={{ maxWidth: '100%' }} />
      : embed ? (playing ? <iframe title={`Play ${title}`} src={embed} width="100%" height="166" allow="autoplay; encrypted-media" style={{ border: 0 }} />
        : <button type="button" onClick={() => setPlaying(true)}>Play {title}</button>) : null}
    <a href={url} target="_blank" rel="noopener noreferrer">Open track ↗</a>
  </div>;
}
