import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArtists, archiveArtist, restoreArtist, createArtist } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { isAdmin } from '../../auth/permissions.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { Section } from '../../components/primitives/Section.jsx';
import { DataTable } from '../../components/primitives/DataTable.jsx';
import { Badge } from '../../components/primitives/Badge.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { ConfirmAction } from '../../components/primitives/ConfirmAction.jsx';
import { TextInput, SelectInput } from '../../components/primitives/Field.jsx';
import { totalRevenue, isArchived, tierTone, sortArtists } from '../../utils/artist.js';
import styles from './ArtistsPage.module.css';

const TIERS = ['flagship', 'core', 'developing'];

export function ArtistsPage() {
  const { token, user } = useAuth();
  const { text, formatters } = useBrand();
  const navigate = useNavigate();
  const admin = isAdmin(user);

  const query = useCallback(({ signal }) => getArtists(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(query);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'revenue', direction: 'desc' });
  const [showArchived, setShowArchived] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const artists = useMemo(() => data?.artists ?? [], [data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = artists.filter((artist) => {
      if (!showArchived && isArchived(artist)) return false;
      if (!needle) return true;
      return `${artist.displayName || ''} ${artist.name || ''}`.toLowerCase().includes(needle);
    });
    return sortArtists(filtered, sort, (artist, key) => {
      if (key === 'revenue') return totalRevenue(artist);
      if (key === 'name') return artist.displayName || artist.name;
      return artist[key];
    });
  }, [artists, search, sort, showArchived]);

  async function runAction(id, action) {
    setPendingId(id);
    setActionError(null);
    try {
      await action();
      refetch();
    } catch (actionFailure) {
      setActionError(actionFailure);
    } finally {
      setPendingId(null);
    }
  }

  const columns = [
    {
      key: 'name', header: text.artistsColName, sortable: true,
      render: (artist) => (
        <span className={styles.nameCell}>
          <span className={styles.name}>{artist.displayName || artist.name}</span>
          {isArchived(artist) && <Badge tone="muted">{text.networkTierArchived}</Badge>}
        </span>
      ),
    },
    { key: 'tier', header: text.artistsColTier, sortable: true, render: (artist) => <Badge tone={tierTone(artist.tier)}>{artist.tier}</Badge> },
    { key: 'monthlyListeners', header: text.artistsColListeners, align: 'right', mono: true, sortable: true, render: (artist) => formatters.compact(artist.monthlyListeners) },
    { key: 'revenue', header: text.artistsColRevenue, align: 'right', mono: true, sortable: true, render: (artist) => formatters.moneyCompact(totalRevenue(artist)) },
    { key: 'roi', header: 'ROI', align: 'right', mono: true, sortable: true, render: (artist) => formatters.multiplier(artist.roi) },
    {
      key: 'actions', header: text.artistsColActions, align: 'right',
      render: (artist) => (
        <span className={styles.actions} onClick={(event) => event.stopPropagation()}>
          <Button onClick={() => navigate(`/artists/${artist.id}`)}>{text.artistsView}</Button>
          {admin && (isArchived(artist) ? (
            <ConfirmAction
              label={text.artistsRestore}
              confirmVariant="primary"
              busy={pendingId === artist.id}
              prompt={text.artistsRestoreConfirm}
              onConfirm={() => runAction(artist.id, () => restoreArtist(token, artist.id))}
            />
          ) : (
            <ConfirmAction
              label={text.artistsArchive}
              busy={pendingId === artist.id}
              prompt={text.artistsArchiveConfirm}
              onConfirm={() => runAction(artist.id, () => archiveArtist(token, artist.id))}
            />
          ))}
        </span>
      ),
    },
  ];

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;

  return (
    <div className={styles.page}>
      <Section
        title={text.nav.artists}
        note={`${rows.length}/${artists.length}`}
        actions={
          <>
            <input
              className={styles.search}
              type="search"
              value={search}
              placeholder={text.artistsSearchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={text.search}
            />
            <Button onClick={() => setShowArchived((value) => !value)} variant={showArchived ? 'primary' : 'outline'}>
              {text.artistsShowArchived}
            </Button>
            {admin && <Button onClick={() => setSignOpen((value) => !value)}>{text.artistsSignTitle}</Button>}
          </>
        }
      >
        {actionError && <ErrorState variant="panel" message={actionError.message} status={actionError.status} />}
        {signOpen && admin && <SignArtistForm token={token} onDone={() => { setSignOpen(false); refetch(); }} />}
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(artist) => artist.id}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(artist) => navigate(`/artists/${artist.id}`)}
          emptyTitle={text.artistsEmpty}
          emptyDetail={null}
        />
      </Section>
    </div>
  );
}

function SignArtistForm({ token, onDone }) {
  const { text } = useBrand();
  const [name, setName] = useState('');
  const [tier, setTier] = useState('developing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The server derives the id and ignores any client-supplied one (§18): follow-up work
      // must use the returned artist.id, which is why nothing here invents one.
      await createArtist(token, { name: name.trim(), tier });
      setName('');
      onDone();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`panel--well ${styles.signForm}`} onSubmit={submit}>
      <TextInput label={text.artistsSignName} value={name} onChange={(event) => setName(event.target.value)} required />
      <SelectInput
        label={text.artistsSignTier}
        value={tier}
        onChange={(event) => setTier(event.target.value)}
        options={TIERS.map((value) => ({ value, label: value.toUpperCase() }))}
      />
      <div className={styles.signSubmit}>
        <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>{text.artistsSignSubmit}</Button>
      </div>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
    </form>
  );
}
