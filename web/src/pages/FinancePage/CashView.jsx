import { useCallback, useState } from 'react';
import {
  getPayouts, getDeposits, postDeposit, postMatch, deleteMatch,
} from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { TextInput } from '../../components/primitives/Field.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import styles from './FinancePage.module.css';

/**
 * Cash workspace: persisted payouts, bank deposits, matching/unmatching.
 * Matched cash is evidence of statement income — never additional income.
 */
export function CashView() {
  const { token } = useAuth();
  const { formatters } = useBrand();
  const payoutsQ = useCallback(({ signal }) => getPayouts(token, { signal }), [token]);
  const depositsQ = useCallback(({ signal }) => getDeposits(token, { signal }), [token]);
  const payouts = useApiQuery(payoutsQ);
  const deposits = useApiQuery(depositsQ);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function unmatch(payoutId, depositId) {
    setBusy(true); setError(null);
    try { await deleteMatch(token, { payoutId, depositId }); payouts.refetch(); deposits.refetch(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  const loading = (payouts.loading && !payouts.data) || (deposits.loading && !deposits.data);
  const failed = payouts.error || deposits.error;
  if (loading) return <LoadingScreen />;
  if (failed && !payouts.data && !deposits.data) {
    return <ErrorState variant="fullscreen" message={failed.message} status={failed.status}
      onRetry={() => { payouts.refetch(); deposits.refetch(); }} />;
  }

  return (
    <>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
      <Section title="PAYOUTS — PERSISTED FROM SYNC">
        {(payouts.data?.payouts || []).map((p) => (
          <div key={p.id} className={styles.row}>
            <span className={styles.rowId}>{p.provider}:{p.providerPayoutId}</span>
            <span>{formatters.money(p.amountCents / 100)} {p.currency}</span>
            <span className={styles.muted}>{p.status}{p.matched ? ` · matched ↔ deposit #${p.matchedDepositId}` : ' · unmatched'}</span>
            {p.matched && (
              <Button busy={busy} onClick={() => unmatch(p.id, p.matchedDepositId)}>UNMATCH (ADMIN)</Button>
            )}
          </div>
        ))}
        {(payouts.data?.payouts || []).length === 0 && <EmptyState />}
      </Section>
      <Section title="BANK DEPOSITS — HUMAN-RECORDED">
        {(deposits.data?.deposits || []).map((d) => (
          <div key={d.id} className={styles.row}>
            <span className={styles.rowId}>{d.bankRef}</span>
            <span>{formatters.money(d.amountCents / 100)} {d.currency}</span>
            <span className={styles.muted}>{d.description}{d.matched ? ' · matched' : ' · UNRESOLVED'}</span>
          </div>
        ))}
        {(deposits.data?.deposits || []).length === 0 && <EmptyState />}
        <RecordDeposit token={token} formatters={formatters} onSaved={deposits.refetch} />
      </Section>
      <Section title="MATCH PAYOUT ↔ DEPOSIT">
        <MatchControls token={token} payouts={payouts.data?.payouts || []} deposits={deposits.data?.deposits || []}
          formatters={formatters} onSaved={() => { payouts.refetch(); deposits.refetch(); }} />
      </Section>
    </>
  );
}

function RecordDeposit({ token, formatters, onSaved }) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [bankRef, setBankRef] = useState('');
  const [description, setDescription] = useState('');
  const [depositAt, setDepositAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const cents = Math.round(Number(amount) * 100);
      await postDeposit(token, {
        amountCents: cents, currency, bankRef,
        description, depositAt: depositAt || undefined,
      });
      setAmount(''); setBankRef(''); setDescription(''); setDepositAt('');
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form className={styles.matchForm} onSubmit={submit}>
      <h3 className="label">RECORD DEPOSIT (ADMIN)</h3>
      <TextInput label="AMOUNT" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <TextInput label="CURRENCY" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} required />
      <TextInput label="BANK REFERENCE" value={bankRef} onChange={(e) => setBankRef(e.target.value)} required />
      <TextInput label="DESCRIPTION" value={description} onChange={(e) => setDescription(e.target.value)} />
      <TextInput label="DEPOSIT DATE" type="date" value={depositAt} onChange={(e) => setDepositAt(e.target.value)} />
      <Button type="submit" variant="primary" busy={busy} disabled={!amount || !bankRef}>RECORD DEPOSIT</Button>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
      <p className={styles.note}>Deposits are cash evidence. An unmatched deposit is an unresolved item — it is never silently added to income.</p>
    </form>
  );
}

function MatchControls({ token, payouts, deposits, formatters, onSaved }) {
  const [payoutId, setPayoutId] = useState('');
  const [depositId, setDepositId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const openPayouts = payouts.filter((p) => !p.matched);
  const openDeposits = deposits.filter((d) => !d.matched);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await postMatch(token, { payoutId: Number(payoutId), depositId: Number(depositId) });
      setPayoutId(''); setDepositId('');
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form className={styles.matchForm} onSubmit={submit}>
      <TextInput label="PAYOUT ID" type="number" value={payoutId} onChange={(e) => setPayoutId(e.target.value)} required />
      <TextInput label="DEPOSIT ID" type="number" value={depositId} onChange={(e) => setDepositId(e.target.value)} required />
      <Button type="submit" variant="primary" busy={busy} disabled={!payoutId || !depositId}>MATCH (ADMIN)</Button>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
      <p className={styles.note}>{openPayouts.length} unmatched payouts · {openDeposits.length} unmatched deposits. Matches require the same currency; amount differences are flagged, never auto-resolved.</p>
    </form>
  );
}
