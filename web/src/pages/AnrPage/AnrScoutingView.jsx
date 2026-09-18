import { useCallback, useState } from 'react';
import { getScouts, shortlistScout, getAnrSubmissions, voteSubmission, deleteSubmission } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { isAdmin } from '../../auth/permissions.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { Badge } from '../../components/primitives/Badge.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { ConfirmAction } from '../../components/primitives/ConfirmAction.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { InlineLoading } from '../../components/primitives/InlineLoading.jsx';
import { DataTable } from '../../components/primitives/DataTable.jsx';
import styles from './AnrPage.module.css';

/**
 * Scouting = the legacy `AnRMasterView` (ScoutPanel + InboxPanel), restored from orphan status.
 *
 * ScoutPanel ports as-is. InboxPanel does NOT: it rendered three hardcoded demos and the
 * fabricated "142 / 842 / 92%" counters. PHASE_4A_HANDOFF.md §3 row 4 and matrix row 20 replace
 * it with the REAL shortlist (store #1, `status === 'shortlisted'`) or an EmptyState. That is a
 * deliberate, recorded behaviour change — not a port defect.
 */
export function AnrScoutingView() {
  const { token, user } = useAuth();
  const { text, formatters } = useBrand();
  const admin = isAdmin(user);

  const submissionsQuery = useCallback(({ signal }) => getAnrSubmissions(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(submissionsQuery);

  const [term, setTerm] = useState('');
  const [scouts, setScouts] = useState(null);
  const [scouting, setScouting] = useState(false);
  const [scoutError, setScoutError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(null);

  async function runSearch(event) {
    event.preventDefault();
    setScouting(true);
    setScoutError(null);
    try {
      const result = await getScouts(token, { query: term });
      setScouts(result.scouts ?? []);
    } catch (failure) {
      setScoutError(failure);
    } finally {
      setScouting(false);
    }
  }

  async function addToShortlist(scout) {
    setPending(scout.spotifyId);
    setNotice(null);
    try {
      const result = await shortlistScout(token, scout);
      setNotice(result.message);
      refetch();
    } catch (failure) {
      setScoutError(failure);
    } finally {
      setPending(null);
    }
  }

  const submissions = data?.submissions ?? [];
  const shortlisted = submissions.filter((item) => item.status === 'shortlisted');
  const queue = submissions.filter((item) => item.status !== 'shortlisted');

  return (
    <>
      <Section
        title={text.anrScoutTitle}
        actions={
          <form className={styles.scoutForm} onSubmit={runSearch}>
            <input
              className={styles.scoutInput}
              type="search"
              value={term}
              placeholder={text.anrScoutPlaceholder}
              onChange={(event) => setTerm(event.target.value)}
              aria-label={text.search}
            />
            <Button type="submit" variant="primary" busy={scouting}>{text.search}</Button>
          </form>
        }
      >
        {scoutError && <ErrorState variant="panel" message={scoutError.message} status={scoutError.status} />}
        {notice && <p className={`label ${styles.notice}`}>{notice}</p>}
        {scouting && <InlineLoading />}
        {scouts === null && !scouting && <EmptyState title={text.anrScoutEmpty} detail={null} icon="ri-search-line" />}
        {scouts !== null && scouts.length === 0 && !scouting && <EmptyState title={text.anrScoutEmpty} detail={null} icon="ri-search-line" />}
        {scouts?.length > 0 && (
          <ul className={styles.scoutGrid}>
            {scouts.map((scout) => (
              <li key={scout.spotifyId} className={`panel--well ${styles.scoutCard}`}>
                <div className={styles.scoutHead}>
                  <span className={styles.demoTitle}>{scout.name}</span>
                  <Badge tone="neutral">{formatters.integer(scout.popularity)}</Badge>
                </div>
                <span className={`label ${styles.muted}`}>{text.anrFollowers} {formatters.compact(scout.followers)}</span>
                <span className={styles.genres}>{(scout.genres || []).join(' · ') || formatters.dash}</span>
                <Button variant="primary" busy={pending === scout.spotifyId} onClick={() => addToShortlist(scout)}>{text.anrShortlist}</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={text.anrShortlistTitle} note={`${shortlisted.length}`}>
        {loading && !data && <InlineLoading />}
        {error && !data && <ErrorState variant="panel" message={error.message} status={error.status} onRetry={refetch} />}
        {data && (
          <SubmissionTable
            rows={shortlisted}
            token={token}
            admin={admin}
            onChanged={refetch}
            emptyTitle={text.anrShortlistEmpty}
          />
        )}
      </Section>

      <Section title={text.anrSubmissions} note={`${queue.length}`}>
        {data && (
          <SubmissionTable
            rows={queue}
            token={token}
            admin={admin}
            onChanged={refetch}
            emptyTitle={text.empty}
          />
        )}
      </Section>
    </>
  );
}

function SubmissionTable({ rows, token, admin, onChanged, emptyTitle }) {
  const { text, formatters } = useBrand();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function vote(id, direction) {
    setBusyId(id);
    setError(null);
    try {
      // Store #1 vote is a non-idempotent scalar (§18): the control stays disabled in flight
      // rather than being optimistically doubled.
      await voteSubmission(token, id, direction);
      onChanged();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    { key: 'artist', header: text.anrArtist },
    { key: 'track', header: text.anrTrack, render: (row) => formatters.text(row.track) },
    { key: 'genre', header: text.anrGenre, render: (row) => formatters.text(row.genre) },
    { key: 'votes', header: text.anrVotes, align: 'right', mono: true, render: (row) => formatters.integer(row.votes) },
    { key: 'submittedAt', header: 'SUBMITTED', mono: true, render: (row) => formatters.date(row.submittedAt) },
    {
      key: 'actions', header: '', align: 'right',
      render: (row) => (
        <span className={styles.rowActions}>
          <Button disabled={busyId === row.id} onClick={() => vote(row.id, 'up')}>{text.anrVoteUp}</Button>
          <Button disabled={busyId === row.id} onClick={() => vote(row.id, 'down')}>{text.anrVoteDown}</Button>
          {admin && (
            <ConfirmAction
              label={text.remove}
              busy={busyId === row.id}
              onConfirm={async () => {
                setBusyId(row.id);
                try { await deleteSubmission(token, row.id); onChanged(); }
                catch (failure) { setError(failure); }
                finally { setBusyId(null); }
              }}
            />
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyTitle={emptyTitle} emptyDetail={null} />
    </>
  );
}
