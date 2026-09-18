import { useCallback, useState } from 'react';
import { getLabelOverview, getProjections, getGeography, getArtists, postSales } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { StatCard } from '../../components/primitives/StatCard.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { InlineLoading } from '../../components/primitives/InlineLoading.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import { Section } from '../../components/primitives/Section.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { TextInput, SelectInput } from '../../components/primitives/Field.jsx';
import { RevenueForecastChart } from '../../charts/RevenueForecastChart.jsx';
import { GeoHeatmap } from '../../components/maps/GeoHeatmap.jsx';
import { CommandConsole } from '../../components/ai/CommandConsole.jsx';
import { ExportControls } from '../../components/reports/ExportControls.jsx';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { token } = useAuth();
  const { text, formatters } = useBrand();

  const overviewQuery = useCallback(({ signal }) => getLabelOverview(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(overviewQuery);
  const errorMessage = error instanceof TypeError ? text.errorNetwork : error?.message;

  const projectionsQuery = useCallback(({ signal }) => getProjections(token, { signal }), [token]);
  const projections = useApiQuery(projectionsQuery);
  const geographyQuery = useCallback(({ signal }) => getGeography(token, { signal }), [token]);
  const geography = useApiQuery(geographyQuery);
  const rosterQuery = useCallback(({ signal }) => getArtists(token, { signal }), [token]);
  const roster = useApiQuery(rosterQuery);

  // The KPI row owns the page's load/error state: it is the contract the Phase 4B gate pins.
  // Widgets below degrade individually so one slow panel never blanks the dashboard.
  //
  // RETRY CONNECTION is a page-level recovery, so it refetches every panel. Retrying only the
  // KPI query would clear the fullscreen error while leaving the chart, map and console rail
  // sitting in their own stale error states — the page would look recovered but not be.
  const retryAll = () => { refetch(); projections.refetch(); geography.refetch(); roster.refetch(); };

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={errorMessage} status={error.status} onRetry={retryAll} />;
  if (!data) return <LoadingScreen />;

  return (
    <>
      <div className={styles.grid}>
        <StatCard label={text.kpiMonthlyRevenue} value={formatters.moneyCompact(data.monthlyRevenue)} />
        <StatCard label={text.kpiQuarterlyProjection} value={formatters.moneyCompact(data.quarterlyProjection)} />
        <StatCard label={text.kpiAnnualProjection} value={formatters.moneyCompact(data.annualProjection)} />
        <StatCard label={text.kpiActiveArtists} value={formatters.integer(data.activeArtists)} />
      </div>
      {error && <ErrorState variant="panel" message={errorMessage} status={error.status} onRetry={retryAll} />}

      <div className={styles.mainRow}>
        <Section
          title={text.forecastTitle}
          className={styles.forecast}
          actions={<ExportControls />}
        >
          {projections.loading && !projections.data && <InlineLoading />}
          {projections.error && !projections.data && (
            <ErrorState variant="panel" message={projections.error.message} status={projections.error.status} onRetry={projections.refetch} />
          )}
          {projections.data?.chartData
            ? <RevenueForecastChart chartData={projections.data.chartData} />
            : projections.data && <EmptyState />}
          <LogSaleForm token={token} artists={roster.data?.artists ?? []} onLogged={projections.refetch} />
        </Section>

        <CommandConsole artists={roster.data?.artists ?? []} onRosterChange={roster.refetch} />
      </div>

      <Section title={text.geoTitle} className={styles.geoSection}>
        {geography.loading && !geography.data && <InlineLoading />}
        {geography.error && !geography.data && (
          <ErrorState variant="panel" message={geography.error.message} status={geography.error.status} onRetry={geography.refetch} />
        )}
        {geography.data && <GeoHeatmap dataset={geography.data.regions ?? []} />}
      </Section>
    </>
  );
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Writes through POST /v3/analytics/sales, then refetches — the legacy version used alert(). */
function LogSaleForm({ token, artists, onLogged }) {
  const { text } = useBrand();
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [artistId, setArtistId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postSales(token, { artistId, month, revenue: Number(amount) });
      setAmount('');
      onLogged();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.saleForm} onSubmit={submit}>
      <SelectInput
        label={text.salesArtist}
        value={artistId}
        onChange={(event) => setArtistId(event.target.value)}
        required
        options={[{ value: '', label: 'SELECT ARTIST', disabled: true }, ...artists.map((artist) => ({ value: artist.id, label: artist.name }))]}
      />
      <TextInput label={text.salesMonth} type="month" value={month} onChange={(event) => setMonth(event.target.value)} required />
      <TextInput label={text.salesAmount} type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      <div className={styles.saleSubmit}>
        <Button type="submit" variant="primary" busy={busy} disabled={!amount || !artistId || !month}>{text.salesSubmit}</Button>
      </div>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
    </form>
  );
}
