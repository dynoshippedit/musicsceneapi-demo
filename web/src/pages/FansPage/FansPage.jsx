import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFanDemographics } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { DataTable } from '../../components/primitives/DataTable.jsx';
import { ProvenanceBadge } from '../../components/primitives/Badge.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import styles from './FansPage.module.css';

/**
 * Restored from orphan status (legacy `FanEngagementView`). The legacy component would have
 * CRASHED if it were ever rendered — its lightbox block referenced an undefined `zoomImage`
 * (L1317-1336). Phase 4A deletes that block rather than porting it (§5, matrix row 25).
 *
 * `GET /v3/fans/demographics` is a hardcoded mock aggregation server-side, so the surface
 * declares SOURCE: MOCK rather than presenting it as measured data.
 */
export function FansPage() {
  const { token } = useAuth();
  const { text, formatters } = useBrand();
  const navigate = useNavigate();
  const query = useCallback(({ signal }) => getFanDemographics(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(query);

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;

  const movers = data?.topMovers ?? [];
  const demographics = data?.demographics ?? {};

  return (
    <div className={styles.page}>
      <Section title={text.fansTopMovers} actions={<ProvenanceBadge>{text.provenanceMock}</ProvenanceBadge>}>
        <DataTable
          columns={[
            { key: 'name', header: text.artistsColName },
            { key: 'growth', header: text.fansGrowth, align: 'right', mono: true, render: (row) => formatters.signedPercent(row.growth) },
            { key: 'engagement', header: text.fansEngagement, align: 'right', mono: true, render: (row) => formatters.percent(row.engagement) },
          ]}
          rows={movers}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/artists/${row.id}`)}
        />
      </Section>

      <div className={styles.split}>
        <Section title={text.fansAge}>
          <BarList
            rows={(demographics.age ?? []).map((row) => ({ key: row.range, label: row.range, value: row.value }))}
            format={(value) => formatters.percent(value, { digits: 0 })}
          />
        </Section>
        <Section title={text.fansGender}>
          <BarList
            rows={(demographics.gender ?? []).map((row) => ({ key: row.label, label: row.label, value: row.value }))}
            format={(value) => formatters.percent(value, { digits: 0 })}
          />
        </Section>
      </div>

      <div className={styles.split}>
        <Section title={text.fansLocations}>
          <DataTable
            columns={[
              { key: 'city', header: text.opsLocation, render: (row) => `${row.city}, ${row.country}` },
              { key: 'value', header: 'LISTENERS', align: 'right', mono: true, render: (row) => formatters.compact(row.value) },
            ]}
            rows={demographics.locations ?? []}
            rowKey={(row) => row.city}
          />
        </Section>
        <Section title={text.fansPlatformGrowth}>
          <BarList
            rows={(demographics.platformGrowth ?? []).map((row) => ({ key: row.platform, label: row.platform, value: row.growth }))}
            format={(value) => formatters.signedPercent(value)}
          />
        </Section>
      </div>
    </div>
  );
}

/** Text-first distribution bar: the number is always readable without decoding the bar. */
function BarList({ rows, format }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value) || 0));
  return (
    <ul className={styles.bars}>
      {rows.map((row) => (
        <li key={row.key} className={styles.barRow}>
          <span className="label">{row.label}</span>
          <span className={styles.track}><span className={styles.fill} style={{ width: `${(Math.abs(row.value) / max) * 100}%` }} /></span>
          <span className="value">{format(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}
