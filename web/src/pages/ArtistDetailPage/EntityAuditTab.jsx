import { useCallback, useState } from 'react';
import { getEntityAudit } from '../../api/endpoints.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { Badge } from '../../components/primitives/Badge.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { InlineLoading } from '../../components/primitives/InlineLoading.jsx';
import { ConfirmAction } from '../../components/primitives/ConfirmAction.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import styles from './ArtistDetailPage.module.css';

const TONE = { verified: 'accent', ok: 'accent', unconfigured: 'muted', error: 'danger', missing: 'warning' };

/**
 * Entity audit. The cached read is free; `?refresh=true` re-runs five upstream providers and
 * costs real money per call (PHASE_4A_HANDOFF.md §18 / HIGH-7, and the backend applies no
 * quota). The refresh is therefore behind a two-step inline confirmation and is never a
 * one-click control — this is the whole reason ConfirmAction exists.
 */
export function EntityAuditTab({ artist, token }) {
  const { text, formatters } = useBrand();
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  const query = useCallback(({ signal }) => getEntityAudit(token, artist.id, { signal }), [token, artist.id]);
  const { data, loading, error, refetch } = useApiQuery(query);

  async function paidRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await getEntityAudit(token, artist.id, { refresh: true });
      setRefreshToken((value) => value + 1);
      refetch();
    } catch (failure) {
      setRefreshError(failure);
    } finally {
      setRefreshing(false);
    }
  }

  const platforms = Object.entries(data?.platforms || {});

  return (
    <Section
      title={text.artistDetailAudit}
      note={data?.auditDate ? formatters.dateTime(data.auditDate) : undefined}
      actions={
        <ConfirmAction
          label={text.auditRefresh}
          confirmLabel={text.auditRefreshConfirm}
          confirmVariant="primary"
          prompt={text.auditRefreshWarning}
          busy={refreshing}
          onConfirm={paidRefresh}
        />
      }
    >
      {refreshError && <ErrorState variant="panel" message={refreshError.message} status={refreshError.status} />}
      {(loading || refreshing) && <InlineLoading />}
      {error && !data && <ErrorState variant="panel" message={error.message} status={error.status} onRetry={refetch} />}

      {data && (
        <>
          <div className={styles.scoreRow}>
            <span className="label">{text.auditScore}</span>
            <span className="kpi value">{formatters.integer(data.healthScore)}</span>
          </div>
          {platforms.length === 0 ? <EmptyState /> : (
            <ul className={styles.platformList} key={refreshToken}>
              {platforms.map(([name, platform]) => (
                <li key={name} className={styles.platformRow}>
                  <span className="label">{name}</span>
                  <Badge tone={TONE[platform?.status] || 'neutral'} dot>{platform?.status || 'unknown'}</Badge>
                  <span className={styles.platformMessage}>
                    {platform?.message || platform?.bioShort || platform?.url || formatters.dash}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
