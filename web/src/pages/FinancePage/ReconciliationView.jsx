import { useCallback, useState } from 'react';
import { getReconciliation } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { TextInput } from '../../components/primitives/Field.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import styles from './FinancePage.module.css';

/**
 * The full reconciliation as a live table: trusted/disputed/estimated per
 * artist per currency, cash evidence alongside income, gaps, evidence gaps,
 * and disclaimers. Same pipeline as the monthly close and the dashboard KPIs.
 */
export function ReconciliationView() {
  const { token } = useAuth();
  const { formatters } = useBrand();
  const [period, setPeriod] = useState('');
  const query = useCallback(
    ({ signal }) => getReconciliation(token, { period: period || undefined, signal }),
    [token, period]);
  const { data, loading, error, refetch } = useApiQuery(query);

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;
  if (!data) return <LoadingScreen />;

  return (
    <>
      <div className={styles.closeBar}>
        <TextInput label="PERIOD FILTER" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>
      <Section title={`INCOME & CASH RECONCILIATION${period ? ` · ${period}` : ' · ALL TIME'}`}>
        <p className={styles.note}>{data.coverage?.note}</p>
        <p className={styles.note}>
          Trusted states: {(data.coverage?.trustedStates || []).join(', ')}.
          Separated states: {(data.coverage?.separatedStates || []).join(', ')}.
          {data.coverage?.cash?.note}
        </p>
        {(data.artists || []).map((a) => (
          <div key={a.artistId}>
            <h3 className="label">{a.artistId}</h3>
            {Object.entries(a.totals || {}).map(([cur, t]) => (
              <div key={cur} className={styles.row}>
                <span className={styles.rowId}>{cur}</span>
                <span>Trusted {formatters.money(t.countedCents / 100)}</span>
                <span className={styles.muted}>Disputed {formatters.money(t.disputedCents / 100)} ({t.disputedCount})</span>
                <span className={styles.muted}>Estimated {formatters.money(t.estimatedCents / 100)} ({t.estimatedCount})</span>
                <span className={styles.muted}>{t.countedCount} trusted records</span>
              </div>
            ))}
          </div>
        ))}
        {(!data.artists || data.artists.length === 0) && <EmptyState />}
      </Section>
      <Section title="CASH EVIDENCE">
        <h3 className="label">MATCHED ({(data.cash?.matched || []).length})</h3>
        {(data.cash?.matched || []).map((m) => (
          <div key={`${m.payoutId}:${m.depositId}`} className={styles.row}>
            <span className={styles.rowId}>{m.provider}:{m.providerPayoutId} ↔ {m.bankRef}</span>
            <span>Payout {formatters.money(m.payoutCents / 100)} · Deposit {formatters.money(m.depositCents / 100)} {m.currency}</span>
            <span className={styles.muted}>{m.amountDifferenceCents === 0 ? 'exact' : `difference ${formatters.money(m.amountDifferenceCents / 100)}`}{m.note ? ` · ${m.note}` : ''}</span>
          </div>
        ))}
        <h3 className="label">UNMATCHED PAYOUTS ({(data.cash?.unmatchedPayouts || []).length})</h3>
        {(data.cash?.unmatchedPayouts || []).map((p) => (
          <div key={p.id} className={styles.row}>
            <span className={styles.rowId}>{p.provider}:{p.providerPayoutId}</span>
            <span>{formatters.money(p.amountCents / 100)} {p.currency}</span>
            <span className={styles.muted}>{p.status}</span>
          </div>
        ))}
        <h3 className="label">UNMATCHED DEPOSITS — UNRESOLVED ({(data.cash?.unmatchedDeposits || []).length})</h3>
        {(data.cash?.unmatchedDeposits || []).map((d) => (
          <div key={d.id} className={styles.row}>
            <span className={styles.rowId}>{d.bankRef}</span>
            <span>{formatters.money(d.amountCents / 100)} {d.currency}</span>
            <span className={styles.muted}>{d.description}</span>
          </div>
        ))}
      </Section>
      <Section title="DISCLAIMERS">
        {(data.disclaimers || []).map((d, i) => <p key={i} className={styles.disclaimer}>{d}</p>)}
      </Section>
    </>
  );
}
