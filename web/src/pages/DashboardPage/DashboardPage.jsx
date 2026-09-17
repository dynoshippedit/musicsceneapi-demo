import { useCallback } from 'react';
import { getLabelOverview } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { StatCard } from '../../components/primitives/StatCard.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { token } = useAuth();
  const { text, formatters } = useBrand();
  const query = useCallback(({ signal }) => getLabelOverview(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(query);
  const errorMessage = error instanceof TypeError ? text.errorNetwork : error?.message;

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={errorMessage} status={error.status} onRetry={refetch} />;
  if (!data) return <LoadingScreen />;

  return (
    <>
      <div className={styles.grid}>
        <StatCard label={text.kpiMonthlyRevenue} value={formatters.moneyCompact(data.monthlyRevenue)} />
        <StatCard label={text.kpiQuarterlyProjection} value={formatters.moneyCompact(data.quarterlyProjection)} />
        <StatCard label={text.kpiAnnualProjection} value={formatters.moneyCompact(data.annualProjection)} />
        <StatCard label={text.kpiActiveArtists} value={formatters.integer(data.activeArtists)} />
      </div>
      {error && <ErrorState variant="panel" message={errorMessage} status={error.status} onRetry={refetch} />}
    </>
  );
}
