import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useAiProviders } from '../../ai/useAiProviders.js';
import { query as runAiQuery } from '../../ai/aiClient.js';
import { archiveArtist, restoreArtist, createArtist } from '../../api/endpoints.js';
import { Panel } from '../primitives/Panel.jsx';
import { Button } from '../primitives/Button.jsx';
import { ProviderModelChip } from './ProviderModelChip.jsx';
import styles from './CommandConsole.module.css';

/**
 * The single AI surface (Dashboard rail, Intelligence, Admin) — one component, not three
 * implementations (matrix rows 21, 22, 30).
 *
 * Anti-chatbot rules (architecture §13.8): no chat bubbles, no avatars, no typing indicator,
 * no suggested prompts, no vendor logo, and NO provider/model picker here — the chip is a link
 * to /settings/ai and nothing else. Label context is never sent from the frontend (§8.8); the
 * backend injects it.
 */
export function CommandConsole({ artists = [], onRosterChange, compact = false }) {
  const { token } = useAuth();
  const { text } = useBrand();
  const providers = useAiProviders();
  const [artistId, setArtistId] = useState('');
  useEffect(() => { if (artistId && !artists.some(a => a.id === artistId)) setArtistId(''); }, [artists, artistId]);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function findArtist(name) {
    const needle = name.trim().toLowerCase();
    return artists.find((artist) => (artist.name || '').toLowerCase() === needle)
      || artists.find((artist) => (artist.displayName || '').toLowerCase() === needle);
  }

  async function submit(event) {
    event?.preventDefault();
    const raw = input.trim();
    if (!raw) return;
    const lowered = raw.toLowerCase();
    setBusy(true);
    setFailed(false);
    setOutput('');
    setInput('');

    try {
      // Command protocols run against the real artist routes; the server returns 403 for a
      // non-admin, which is surfaced verbatim rather than pre-judged in the client.
      if (lowered.startsWith('archive ') || lowered.startsWith('restore ')) {
        const archiving = lowered.startsWith('archive ');
        const name = raw.slice('archive '.length).trim();
        const artist = findArtist(name);
        if (!artist) { setOutput(text.consoleTargetMissing(name)); return; }
        try {
          await (archiving ? archiveArtist(token, artist.id) : restoreArtist(token, artist.id));
          setOutput(archiving ? text.consoleArchiveOk(artist.name) : text.consoleRestoreOk(artist.name));
          onRosterChange?.();
        } catch (failure) {
          setFailed(true);
          setOutput(text.consoleCommandFailed(name, failure.message));
        }
        return;
      }

      if (lowered.startsWith('sign ')) {
        const name = raw.slice(5).trim();
        try {
          const result = await createArtist(token, { name, tier: 'developing' });
          setOutput(text.consoleSignOk(result.artist?.name || name));
          onRosterChange?.();
        } catch (failure) {
          setFailed(true);
          setOutput(text.consoleCommandFailed(name, failure.message));
        }
        return;
      }

      // Anything else falls through to the backend AI route.
      const result = await runAiQuery(token, { prompt: raw, artistId, selectable: providers.selectable });
      setOutput(result.answer || text.consoleError);
    } catch (failure) {
      setFailed(true);
      setOutput(`${text.consoleError}${failure.message ? ` — ${failure.message}` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className={`${styles.console} ${compact ? styles.compact : ''}`.trim()}>
      <header className={styles.head}>
        <span className={styles.titleRow}>
          <i className="ri-brain-line" aria-hidden="true" />
          <span className="label label--accent">{text.consoleTitle}</span>
        </span>
        <ProviderModelChip providers={providers} />
      </header>

      <label className={`label ${styles.context}`}>ARTIST CONTEXT
        <select aria-label="Artist context" value={artistId} onChange={event => setArtistId(event.target.value)} disabled={busy}>
          <option value="">Accessible roster</option>
          {artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}
        </select>
      </label>
      <form className={styles.inputRow} onSubmit={submit}>
        <span className={styles.prompt} aria-hidden="true">&gt;</span>
        <input
          className={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={text.consolePlaceholder}
          aria-label={text.consoleTitle}
          disabled={busy}
        />
        <Button type="submit" variant="primary" busy={busy}>{busy ? text.consoleBusy : text.consoleRun}</Button>
      </form>

      <div className={`panel--well ${styles.output} ${failed ? styles.failed : ''}`.trim()} role="log" aria-live="polite">
        {output || <span className={styles.idle}>{providers.status === 'configured' ? text.consoleIdle : '// AI unavailable. Check provider settings. Artist commands remain available.'}</span>}
      </div>
    </Panel>
  );
}
