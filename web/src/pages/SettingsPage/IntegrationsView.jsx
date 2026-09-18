import { useCallback, useState } from 'react';
import { getIntegrationStatus, connectIntegration, disconnectIntegration } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { Badge } from '../../components/primitives/Badge.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import styles from './SettingsPage.module.css';

/**
 * Restored from orphan status (legacy `IntegrationsPanel`). The legacy component's dead
 * `fetchSubmissions` block (L1550-1562, referencing an undefined setter) is NOT ported (§5).
 *
 * Connections are per-user and entirely server-side: this view never sees a provider key, and
 * "connect" simply calls the backend's own auth route, which owns the credential exchange.
 */
export function IntegrationsView() {
  const { token } = useAuth();
  const { text, formatters } = useBrand();
  const query = useCallback(({ signal }) => getIntegrationStatus(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(query);
  const [pending, setPending] = useState(null);
  const [actionError, setActionError] = useState(null);

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;

  const services = data?.services ?? [];

  async function toggle(service) {
    setPending(service.id);
    setActionError(null);
    try {
      await (service.connected ? disconnectIntegration(token, service.id) : connectIntegration(token, service.id));
      refetch();
    } catch (failure) {
      setActionError(failure);
    } finally {
      setPending(null);
    }
  }

  return (
    <Section title={text.settingsIntegrations} note={`${services.filter((s) => s.connected).length}/${services.length}`}>
      <p className={`label ${styles.note}`}>{text.integrationsServerManaged}</p>
      {actionError && <ErrorState variant="panel" message={actionError.message} status={actionError.status} />}
      {services.length === 0 ? <EmptyState /> : (
        <ul className={styles.grid}>
          {services.map((service) => (
            <li key={service.id} className={`panel--well ${styles.card}`}>
              <div className={styles.cardHead}>
                <span className={styles.serviceName}>{service.name}</span>
                <Badge tone={service.connected ? 'accent' : 'muted'} dot>
                  {service.available === false ? 'NOT AVAILABLE' : service.connected ? text.integrationsConnected : text.integrationsDisconnected}
                </Badge>
              </div>
              <div className={styles.quota}>
                <span className="label">{text.integrationsQuota}</span>
                {/* PHASE 4CF: backend now serves quotaUsed: null = "no metering
                    data" (it used to be Math.random()). Render '—' instead of a
                    fake percentage bar. */}
                {service.quotaUsed == null ? (
                  <span className="value">—</span>
                ) : (
                  <>
                    <span className={styles.track}><span className={styles.fill} style={{ width: `${Math.min(100, service.quotaUsed)}%` }} /></span>
                    <span className="value">{formatters.percent(service.quotaUsed, { digits: 0 })}</span>
                  </>
                )}
              </div>
              <span className={`label ${styles.muted}`}>{text.integrationsLastSync} {formatters.dateTime(service.lastSync)}</span>
              {service.message && <p className={styles.note}>{service.message}</p>}
              <Button
                disabled={service.available === false}
                variant={service.connected ? 'outline' : 'primary'}
                busy={pending === service.id}
                onClick={() => toggle(service)}
              >
                {service.connected ? text.integrationsDisconnect : text.integrationsConnect}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
