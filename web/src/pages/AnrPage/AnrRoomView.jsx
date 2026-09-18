import { useCallback, useState } from 'react';
import { getAnrState, voteDemo, getDemoRating, createSubmission } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { Badge } from '../../components/primitives/Badge.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { TextInput } from '../../components/primitives/Field.jsx';
import styles from './AnrPage.module.css';

const STATUS_TONE = { 'high-priority': 'danger', reviewing: 'warning', new: 'accent' };

/**
 * A&R Room — store #2 (`anrState.demos`, vote semantics = a `ratings[]` array keyed by user).
 * The Scouting tab reads store #1 (`anrSubmissions`, vote semantics = a scalar `votes`).
 * FRONTEND_API_MAP.md documents this split brain; PHASE_4A_HANDOFF.md matrix row 18 requires
 * it be PRESERVED as two surfaces and never reconciled client-side. Nothing here merges them.
 */
export function AnrRoomView() {
  const { token } = useAuth();
  const { text, formatters } = useBrand();
  const query = useCallback(({ signal }) => getAnrState(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(query);

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;

  const demos = data?.demos ?? [];

  return (
    <>
      <div className={styles.split}>
        <Section title={text.anrWhiteboard}>
          {data?.whiteboard
            ? <pre className={styles.whiteboard}>{data.whiteboard}</pre>
            : <EmptyState title={text.empty} detail={null} />}
        </Section>
        <Section title={text.anrNowListening} note={data?.nowListening?.updatedBy}>
          {data?.nowListening?.url ? (
            <div className={styles.listening}>
              <a className={styles.link} href={data.nowListening.url} target="_blank" rel="noreferrer noopener">{data.nowListening.url}</a>
              <span className={`label ${styles.muted}`}>{formatters.dateTime(data.nowListening.timestamp)}</span>
            </div>
          ) : <EmptyState title={text.empty} detail={null} />}
        </Section>
      </div>

      <Section title={text.anrDemos} note={`${demos.length}`}>
        {demos.length === 0 ? <EmptyState /> : (
          <ul className={styles.demoList}>
            {demos.map((demo) => <DemoRow key={demo.id} demo={demo} token={token} />)}
          </ul>
        )}
      </Section>

      <SubmitDemoForm token={token} onDone={refetch} />
    </>
  );
}

function DemoRow({ demo, token }) {
  const { text, formatters } = useBrand();
  // `hasVoted` is served per-user by GET /v3/anr/state; the optimistic flip below is reverted
  // on failure so a non-idempotent vote endpoint never leaves the row lying (§18).
  const [voted, setVoted] = useState(Boolean(demo.hasVoted));
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState(null);
  const [error, setError] = useState(null);

  async function toggleVote() {
    const nextVoted = !voted;
    setVoted(nextVoted);
    setBusy(true);
    setError(null);
    try {
      const result = await voteDemo(token, demo.id, nextVoted ? 'add' : 'remove');
      setVoted(Boolean(result.hasVoted));
      if (tally) setTally(result.demo);
    } catch (failure) {
      setVoted(!nextVoted);
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setError(null);
    try {
      setTally(await getDemoRating(token, demo.id, { includeTally: true }));
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <li className={styles.demoRow}>
      <div className={styles.demoMain}>
        <span className={styles.demoTitle}>{demo.title}</span>
        <span className={styles.muted}>{demo.artist}</span>
      </div>
      <Badge tone={STATUS_TONE[demo.status] || 'neutral'}>{demo.status}</Badge>
      <span className={`value ${styles.muted}`}>{demo.submittedBy}</span>
      <div className={styles.demoActions}>
        {tally && (
          <span className={`value ${styles.tally}`}>
            {formatters.integer(tally.artistVotes)}/{formatters.integer(tally.totalVotes)} · {'★'.repeat(tally.stars || 0) || '—'}
          </span>
        )}
        <Button onClick={reveal}>{text.anrTally}</Button>
        <Button variant={voted ? 'primary' : 'outline'} busy={busy} onClick={toggleVote}>{text.anrRate}</Button>
      </div>
      {error && <div className={styles.rowError}><ErrorState variant="panel" message={error.message} status={error.status} /></div>}
    </li>
  );
}

function SubmitDemoForm({ token, onDone }) {
  const { text } = useBrand();
  const [values, setValues] = useState({ artist: '', track: '', genre: '', url: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // NOTE: POST /v3/anr/submissions writes store #1, which the Scouting tab lists. The room
      // above reads store #2. That is the documented legacy behaviour, preserved deliberately.
      const result = await createSubmission(token, values);
      setValues({ artist: '', track: '', genre: '', url: '' });
      setNotice(`${result.submission?.artist ?? ''} → ${text.anrTabScouting}`);
      onDone();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={text.anrSubmitTitle} note={text.anrTabScouting}>
      <form className={styles.submitForm} onSubmit={submit}>
        <TextInput label={text.anrArtist} value={values.artist} onChange={set('artist')} required />
        <TextInput label={text.anrTrack} value={values.track} onChange={set('track')} required />
        <TextInput label={text.anrGenre} value={values.genre} onChange={set('genre')} />
        <TextInput label={text.anrUrl} type="url" value={values.url} onChange={set('url')} required />
        <Button type="submit" variant="primary" busy={busy}>{text.anrSubmit}</Button>
      </form>
      {notice && <p className={`label ${styles.notice}`}>{notice}</p>}
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
    </Section>
  );
}
