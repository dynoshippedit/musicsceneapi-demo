import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getArtist, getArtists, updateArtistImage, getGoogleKg } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { isAdmin } from '../../auth/permissions.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { Section } from '../../components/primitives/Section.jsx';
import { StatCard } from '../../components/primitives/StatCard.jsx';
import { Badge } from '../../components/primitives/Badge.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { SubNavButtons } from '../../components/primitives/SubNav.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import { DataTable } from '../../components/primitives/DataTable.jsx';
import { GeoHeatmap } from '../../components/maps/GeoHeatmap.jsx';
import { totalRevenue, tierTone } from '../../utils/artist.js';
import { EntityAuditTab } from './EntityAuditTab.jsx';
import styles from './ArtistDetailPage.module.css';

// Legacy tab set, in legacy order (ArtistDetailView L2039).
const TAB_IDS = ['overview', 'revenue', 'geography', 'touring', 'merch', 'brand', 'network', 'sustainability', 'entity'];

export function ArtistDetailPage() {
  const { artistId } = useParams();
  const { token, user } = useAuth();
  const { text, formatters } = useBrand();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const requested = params.get('tab');
  const tab = TAB_IDS.includes(requested) ? requested : 'overview';

  const query = useCallback(({ signal }) => getArtist(token, artistId, { signal }), [token, artistId]);
  const { data: artist, loading, error, refetch } = useApiQuery(query);

  // Sibling ids power legacy prev/next. A failure here must never block the detail view, so it
  // is a separate query whose error is ignored.
  const rosterQuery = useCallback(({ signal }) => getArtists(token, { signal }), [token]);
  const { data: roster } = useApiQuery(rosterQuery);

  const siblings = useMemo(() => roster?.artists?.map((item) => item.id) ?? [], [roster]);
  const index = siblings.indexOf(artistId);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  const tabs = useMemo(() => TAB_IDS.map((id) => ({ id, label: tabLabel(id, text) })), [text]);

  // Belt-and-suspenders: never render resource-local controls for a mismatched id.
  const shown = artist && artist.id === artistId ? artist : null;

  if (loading && !shown) return <LoadingScreen />;
  // A 403 here is the server's artistAccess decision; ErrorState renders ACCESS DENIED with no
  // retry for that status, which is the documented behaviour (matrix row 13).
  if (error && !shown) {
    return (
      <div className={styles.page}>
        <Button onClick={() => navigate('/artists')}>{text.artistDetailBack}</Button>
        <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={error.status === 403 ? undefined : refetch} />
      </div>
    );
  }
  if (!shown) return <LoadingScreen />;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Button onClick={() => navigate('/artists')}>{text.artistDetailBack}</Button>
        <div className={styles.pager}>
          <Button disabled={!previous} onClick={() => previous && navigate(`/artists/${previous}?tab=${tab}`)}>←</Button>
          <Button disabled={!next} onClick={() => next && navigate(`/artists/${next}?tab=${tab}`)}>→</Button>
        </div>
      </div>

      <Section
        title={shown.displayName || shown.name}
        kickerTone="accent"
        note={shown.meta?.dataSource ? `${text.provenance}: ${String(shown.meta.dataSource).toUpperCase()}` : undefined}
        actions={<Badge tone={tierTone(shown.tier)}>{shown.tier}</Badge>}
      >
        <div className={styles.kpis}>
          <StatCard label={text.artistsColListeners} value={formatters.compact(shown.monthlyListeners)} />
          <StatCard label={text.artistsColStreams} value={formatters.compact(shown.totalStreams)} />
          <StatCard label={text.artistsColGrowth} value={formatters.signedPercent(shown.growthRate)} />
          <StatCard label={text.artistsColRevenue} value={formatters.moneyCompact(shown.totalRevenue ?? totalRevenue(shown))} />
        </div>
      </Section>

      <SubNavButtons
        items={tabs}
        value={tab}
        ariaLabel={text.nav.artists}
        onChange={(id) => setParams(id === 'overview' ? {} : { tab: id }, { replace: false })}
      />

      <TabBody key={shown.id} tab={tab} artist={shown} token={token} admin={isAdmin(user)} onChanged={refetch} />
    </div>
  );
}

function tabLabel(id, text) {
  if (id === 'entity') return text.artistDetailAudit;
  if (id === 'brand') return 'BRAND';
  return id.toUpperCase();
}

function TabBody({ tab, artist, token, admin, onChanged }) {
  const { text, formatters } = useBrand();

  if (tab === 'overview') return <OverviewTab artist={artist} token={token} admin={admin} onChanged={onChanged} />;

  if (tab === 'revenue') {
    const rows = Object.entries(artist.revenue || {})
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => ({ key, stream: key.toUpperCase(), value }));
    return (
      <Section title={text.artistDetailRevenue}>
        <DataTable
          columns={[
            { key: 'stream', header: text.opsType },
            { key: 'value', header: text.artistsColRevenue, align: 'right', mono: true, render: (row) => formatters.money(row.value) },
          ]}
          rows={rows}
          rowKey={(row) => row.key}
        />
      </Section>
    );
  }

  if (tab === 'geography') {
    const dataset = artist.revenue?.streamingBreakdown?.byLocation ?? [];
    return (
      <Section title={text.geoTitle} note={`${dataset.length}`}>
        {dataset.length === 0 ? <EmptyState /> : (
          <>
            <GeoHeatmap dataset={dataset} title={artist.displayName || artist.name} height={320} />
            <DataTable
              columns={[
                { key: 'region', header: text.opsLocation },
                { key: 'value', header: text.artistsColRevenue, align: 'right', mono: true, render: (row) => formatters.money(row.value) },
                { key: 'percent', header: '%', align: 'right', mono: true, render: (row) => formatters.percent(row.percent) },
              ]}
              rows={dataset}
              rowKey={(row) => row.region}
            />
          </>
        )}
      </Section>
    );
  }

  if (tab === 'touring') {
    const touring = artist.touring || {};
    return (
      <Section title={text.artistDetailTouring}>
        <DefinitionGrid
          rows={[
            ['UPCOMING SHOWS', formatters.integer(touring.upcomingShows)],
            ['AVG TICKET PRICE', formatters.money(touring.avgTicketPrice)],
            ['AVG ATTENDANCE', formatters.integer(touring.avgAttendance)],
            ['MERCH PER HEAD', formatters.money(touring.merchPerHead)],
            ['CARBON OFFSET', formatters.integer(touring.carbonOffset)],
            ['SUSTAINABILITY SCORE', formatters.text(touring.sustainabilityScore)],
          ]}
        />
        {touring.shows?.length ? (
          <DataTable
            columns={[
              { key: 'venue', header: text.opsLocation, render: (row) => formatters.text(row.venue || row.city) },
              { key: 'date', header: text.opsEta, mono: true, render: (row) => formatters.date(row.date) },
            ]}
            rows={touring.shows}
            rowKey={(row, position) => row.id || `${row.venue}-${position}`}
          />
        ) : <EmptyState title={text.empty} detail={null} />}
      </Section>
    );
  }

  if (tab === 'merch') {
    const merch = artist.merch || {};
    return (
      <Section title="MERCH">
        <DefinitionGrid
          rows={[
            ['ONLINE SALES', formatters.money(merch.onlineSales)],
            ['TOUR SALES', formatters.money(merch.tourSales)],
            ['MARGIN', typeof merch.margin === 'number' ? formatters.percent(merch.margin * 100) : formatters.dash],
          ]}
        />
        {merch.topItems?.length ? (
          <ul className={styles.chips}>{merch.topItems.map((item) => <li key={String(item)}><Badge>{String(item)}</Badge></li>)}</ul>
        ) : <EmptyState title={text.empty} detail={null} />}
      </Section>
    );
  }

  if (tab === 'brand') {
    const deals = artist.brandDeals || [];
    return (
      <Section title="BRAND DEALS">
        {deals.length === 0 ? <EmptyState title={text.empty} detail={null} /> : (
          <DataTable
            columns={[
              { key: 'brand', header: 'BRAND', render: (row) => formatters.text(row.brand || row.name) },
              { key: 'value', header: 'VALUE', align: 'right', mono: true, render: (row) => formatters.money(row.value) },
            ]}
            rows={deals}
            rowKey={(row, position) => row.id || `${row.brand}-${position}`}
          />
        )}
      </Section>
    );
  }

  if (tab === 'network') {
    const influences = artist.influences || [];
    const collaborations = artist.collaborations || [];
    return (
      <Section title={text.networkGraphTitle}>
        <DefinitionGrid rows={[['GENRE HYBRIDS', formatters.text(artist.genreHybrids)]]} />
        <div className={`label ${styles.groupLabel}`}>INFLUENCES</div>
        {influences.length ? <ul className={styles.chips}>{influences.map((item) => <li key={String(item)}><Badge>{String(item)}</Badge></li>)}</ul> : <EmptyState title={text.empty} detail={null} />}
        <div className={`label ${styles.groupLabel}`}>COLLABORATIONS</div>
        {collaborations.length ? <ul className={styles.chips}>{collaborations.map((item) => <li key={String(item.name || item)}><Badge>{String(item.name || item)}</Badge></li>)}</ul> : <EmptyState title={text.empty} detail={null} />}
      </Section>
    );
  }

  if (tab === 'sustainability') {
    const sustainability = artist.sustainability || {};
    return (
      <Section title="SUSTAINABILITY">
        <DefinitionGrid
          rows={[
            ['LONGEVITY SCORE', formatters.text(String(sustainability.longevityScore ?? ''))],
            ['REVENUE STABILITY', formatters.text(sustainability.revenueStability)],
            ['BURNOUT RISK', formatters.text(sustainability.burnoutRisk)],
            ['LEGACY IMPACT', formatters.integer(sustainability.legacyImpact)],
          ]}
        />
      </Section>
    );
  }

  return <EntityAuditTab artist={artist} token={token} />;
}

function OverviewTab({ artist, token, admin, onChanged }) {
  const { text, formatters } = useBrand();
  const [imageUrl, setImageUrl] = useState(artist.manualImage || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const social = artist.social || {};

  // Legacy `useGoogleKG`. Without a provider key the backend answers
  // {status:'unconfigured'}, so this degrades to one muted line rather than an error.
  const kgQuery = useCallback(({ signal }) => getGoogleKg(token, { query: artist.name, signal }), [token, artist.name]);
  const kg = useApiQuery(kgQuery);

  async function applyImage(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateArtistImage(token, artist.id, imageUrl.trim());
      onChanged();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section title={text.artistDetailOverview}>
        {artist.wikipedia?.summary ? <p className={styles.bio}>{artist.wikipedia.summary}</p> : <EmptyState title={text.empty} detail={null} />}
        <DefinitionGrid
          rows={[
            ['ROI', formatters.multiplier(artist.roi)],
            ['PRIORITY', formatters.text(artist.priority)],
            ['GROWTH', formatters.signedPercent(artist.growthRate)],
            ['LAST UPDATED', formatters.dateTime(artist.meta?.lastUpdated)],
            ['KNOWLEDGE GRAPH', kg.loading ? text.loading : formatters.text(kg.data?.name || kg.data?.description || kg.data?.message || kg.error?.message)],
          ]}
        />
      </Section>

      <Section title={text.artistDetailSocial}>
        <DefinitionGrid
          rows={[
            ['INSTAGRAM', formatters.compact(social.instagram)],
            ['TWITTER', formatters.compact(social.twitter)],
            ['TIKTOK', formatters.compact(social.tiktok)],
            ['ENGAGEMENT RATE', formatters.percent(social.engagementRate)],
          ]}
        />
      </Section>

      {admin && (
        <Section title={text.artistImageLabel}>
          <form className={styles.imageForm} onSubmit={applyImage}>
            <input
              className={styles.imageInput}
              type="url"
              value={imageUrl}
              placeholder="https://"
              onChange={(event) => setImageUrl(event.target.value)}
              aria-label={text.artistImageLabel}
            />
            <Button type="submit" variant="primary" busy={busy}>{text.artistImageApply}</Button>
          </form>
          {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
        </Section>
      )}
    </>
  );
}

function DefinitionGrid({ rows }) {
  return (
    <dl className={styles.definition}>
      {rows.map(([term, value]) => (
        <div key={term} className={styles.definitionRow}>
          <dt className="label">{term}</dt>
          <dd className="value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
