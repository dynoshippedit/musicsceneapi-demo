import { useCallback, useMemo, useState } from 'react';
import {
  getReconciliation, getPayouts, getDeposits, postMatch,
  annotateGap, getCommissionContracts, getCommissionWorksheet,
} from '../../api/endpoints.js';
import { apiFetch } from '../../api/client.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { StatCard } from '../../components/primitives/StatCard.jsx';
import { TextInput, SelectInput } from '../../components/primitives/Field.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import { InlineLoading } from '../../components/primitives/InlineLoading.jsx';
import { SubNavButtons } from '../../components/primitives/SubNav.jsx';
import styles from './FinancePage.module.css';

const STEPS = [
  { id: 'review', label: '1 · REVIEW INCOME' },
  { id: 'cash', label: '2 · MATCH CASH' },
  { id: 'gaps', label: '3 · RESOLVE GAPS' },
  { id: 'commissions', label: '4 · COMMISSION DRAFT' },
  { id: 'export', label: '5 · CLOSE & SHARE' },
];

function money(cents, formatters) {
  return typeof cents === 'number' ? formatters.money(cents / 100) : formatters.dash;
}

export function MonthlyCloseView() {
  const { token } = useAuth();
  const { formatters } = useBrand();
  const [period, setPeriod] = useState(defaultPeriod());
  const [step, setStep] = useState('review');

  return (
    <>
      <div className={styles.closeBar}>
        <TextInput label="CLOSE PERIOD" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
        <SubNavButtons items={STEPS} value={step} onChange={setStep} ariaLabel="Monthly close steps" />
      </div>
      <p className={styles.positioning}>
        The Music Scene helps an artist team close its monthly income across disconnected sources,
        explain every difference, and share a trusted view with the artist.
      </p>
      {step === 'review' && <CloseReview token={token} period={period} formatters={formatters} onDone={() => setStep('cash')} />}
      {step === 'cash' && <CloseCash token={token} period={period} formatters={formatters} onDone={() => setStep('gaps')} />}
      {step === 'gaps' && <CloseGaps token={token} period={period} formatters={formatters} onDone={() => setStep('commissions')} />}
      {step === 'commissions' && <CloseCommissions token={token} period={period} formatters={formatters} onDone={() => setStep('export')} />}
      {step === 'export' && <CloseExport token={token} period={period} formatters={formatters} />}
    </>
  );
}

function defaultPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function useRecon(token, period) {
  const q = useCallback(({ signal }) => getReconciliation(token, { period, signal }), [token, period]);
  return useApiQuery(q);
}

/* ---------- Step 1: review income ---------- */
function CloseReview({ token, period, formatters, onDone }) {
  const { data, loading, error, refetch } = useRecon(token, period);
  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;
  if (!data) return <LoadingScreen />;
  const cur = data.primaryCurrency || 'USD';
  const totals = data.totals?.[cur] || { countedCents: 0, disputedCents: 0, estimatedCents: 0 };
  return (
    <>
      <Section title={`TRUSTED INCOME · ${period} · ${cur}`}>
        <div className={styles.grid}>
          <StatCard label="TRUSTED (REPORTED + RECONCILED + APPROVED)" value={money(totals.countedCents, formatters)} />
          <StatCard label="DISPUTED (SEPARATE, NEVER IN TRUSTED)" value={money(totals.disputedCents, formatters)} />
          <StatCard label="ESTIMATED (SEPARATE, NEVER IN TRUSTED)" value={money(totals.estimatedCents, formatters)} />
        </div>
        <p className={styles.note}>{data.coverage?.note}</p>
        <p className={styles.note}>Period filtering: royalties, merch settlements, direct sales and manual adjustments are each filtered to {period} on their own date field.</p>
        {data.disclaimers?.map((d, i) => <p key={i} className={styles.disclaimer}>{d}</p>)}
      </Section>
      <Section title="PER ARTIST">
        {(data.artists || []).map((a) => {
          const t = a.totals?.[cur] || { countedCents: 0, disputedCents: 0, estimatedCents: 0 };
          return (
            <div key={a.artistId} className={styles.row}>
              <span className={styles.rowId}>{a.artistId}</span>
              <span>Trusted {money(t.countedCents, formatters)}</span>
              <span className={styles.muted}>Disputed {money(t.disputedCents, formatters)}</span>
              <span className={styles.muted}>Estimated {money(t.estimatedCents, formatters)}</span>
            </div>
          );
        })}
        {(!data.artists || data.artists.length === 0) && <EmptyState />}
      </Section>
      <Button variant="primary" onClick={onDone}>INCOME REVIEWED — MATCH CASH</Button>
    </>
  );
}

/* ---------- Step 2: match cash ---------- */
function CloseCash({ token, period, formatters, onDone }) {
  const payoutsQ = useCallback(({ signal }) => getPayouts(token, { signal }), [token]);
  const payouts = useApiQuery(payoutsQ);
  const depositsQ = useCallback(({ signal }) => getDeposits(token, { signal }), [token]);
  const deposits = useApiQuery(depositsQ);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const unmatchedPayouts = useMemo(
    () => (payouts.data?.payouts || []).filter((p) => !p.matched),
    [payouts.data]);
  const unmatchedDeposits = useMemo(
    () => (deposits.data?.deposits || []).filter((d) => !d.matched),
    [deposits.data]);

  async function match(payout, deposit) {
    setBusy(true); setError(null);
    try {
      await postMatch(token, { payoutId: payout.id, depositId: deposit.id, note: `Matched during ${period} close` });
      payouts.refetch(); deposits.refetch();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Section title="CASH MATCHING — EVIDENCE, NEVER INCOME">
      <p className={styles.note}>
        Payouts and deposits matched to statement income are cash evidence of that same income —
        they are never counted a second time. Unmatched deposits stay visible as unresolved items;
        they are never silently added to income.
      </p>
      {(payouts.loading || deposits.loading) && <InlineLoading />}
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
      <h3 className="label">UNMATCHED PAYOUTS ({unmatchedPayouts.length})</h3>
      {unmatchedPayouts.map((p) => (
        <div key={p.id} className={styles.row}>
          <span className={styles.rowId}>{p.provider}:{p.providerPayoutId}</span>
          <span>{money(p.amountCents, formatters)} {p.currency}</span>
          <span className={styles.muted}>{p.arrivalAt?.slice(0, 10) || ''} {p.status}</span>
        </div>
      ))}
      {unmatchedPayouts.length === 0 && !payouts.loading && <EmptyState />}
      <h3 className="label">UNMATCHED DEPOSITS ({unmatchedDeposits.length})</h3>
      {unmatchedDeposits.map((d) => (
        <div key={d.id} className={styles.row}>
          <span className={styles.rowId}>{d.bankRef}</span>
          <span>{money(d.amountCents, formatters)} {d.currency}</span>
          <span className={styles.muted}>{d.description}</span>
        </div>
      ))}
      {unmatchedDeposits.length === 0 && !deposits.loading && <EmptyState />}
      {unmatchedPayouts.length > 0 && unmatchedDeposits.length > 0 && (
        <div className={styles.matchBox}>
          <MatchForm payouts={unmatchedPayouts} deposits={unmatchedDeposits} onMatch={match} busy={busy} formatters={formatters} />
        </div>
      )}
      <Button variant="primary" onClick={onDone}>CASH MATCHED — RESOLVE GAPS</Button>
    </Section>
  );
}

function MatchForm({ payouts, deposits, onMatch, busy, formatters }) {
  const [payoutId, setPayoutId] = useState('');
  const [depositId, setDepositId] = useState('');
  const payout = payouts.find((p) => String(p.id) === payoutId);
  const deposit = deposits.find((d) => String(d.id) === depositId);
  const currencyMismatch = payout && deposit && payout.currency !== deposit.currency;
  return (
    <div className={styles.matchForm}>
      <SelectInput label="PAYOUT" value={payoutId} onChange={(e) => setPayoutId(e.target.value)}
        options={[{ value: '', label: 'SELECT', disabled: true }, ...payouts.map((p) => ({
          value: String(p.id), label: `${p.provider}:${p.providerPayoutId} · ${formatters.money(p.amountCents / 100)} ${p.currency}`,
        }))]} />
      <SelectInput label="DEPOSIT" value={depositId} onChange={(e) => setDepositId(e.target.value)}
        options={[{ value: '', label: 'SELECT', disabled: true }, ...deposits.map((d) => ({
          value: String(d.id), label: `${d.bankRef} · ${formatters.money(d.amountCents / 100)} ${d.currency}`,
        }))]} />
      {currencyMismatch && <p className={styles.warn}>Currency mismatch — matches require the same currency.</p>}
      {payout && deposit && !currencyMismatch && payout.amountCents !== deposit.amountCents && (
        <p className={styles.warn}>
          Amount differs by {formatters.money((deposit.amountCents - payout.amountCents) / 100)} —
          the difference is flagged in the reconciliation, never auto-resolved.
        </p>
      )}
      <Button variant="primary" busy={busy} disabled={!payout || !deposit || currencyMismatch}
        onClick={() => onMatch(payout, deposit)}>MATCH (ADMIN)</Button>
    </div>
  );
}

/* ---------- Step 3: gaps ---------- */
function CloseGaps({ token, period, formatters, onDone }) {
  const { data, loading, error, refetch } = useRecon(token, period);
  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;
  if (!data) return <LoadingScreen />;
  const cashGaps = data.cash?.gaps || [];
  const evidenceGaps = data.evidenceGaps || [];
  return (
    <>
      <Section title="CASH GAPS — INCOME WITH NO CASH EVIDENCE">
        <p className={styles.note}>Gaps are shown, never auto-filled. Annotate each with an owner and next action.</p>
        {cashGaps.map((g) => (
          <GapAnnotator key={g.key} token={token} gap={g} formatters={formatters} onSaved={refetch} />
        ))}
        {cashGaps.length === 0 && <EmptyState />}
      </Section>
      <Section title="EVIDENCE GAPS — EXPECTED BUT MISSING">
        {evidenceGaps.map((g, i) => (
          <div key={i} className={styles.row}>
            <span className={styles.rowId}>{g.type}</span>
            <span>{g.customer || g.source || g.statementRef || ''}</span>
            <span className={styles.muted}>{g.detail}</span>
          </div>
        ))}
        {evidenceGaps.length === 0 && <EmptyState />}
      </Section>
      <Button variant="primary" onClick={onDone}>GAPS REVIEWED — COMMISSION DRAFT</Button>
    </>
  );
}

function GapAnnotator({ token, gap, formatters, onSaved }) {
  const [owner, setOwner] = useState(gap.owner || '');
  const [nextAction, setNextAction] = useState(gap.nextAction || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    setBusy(true); setError(null);
    try { await annotateGap(token, gap.annotationId, { owner, nextAction }); onSaved(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <div className={styles.gapBox}>
      <div className={styles.row}>
        <span className={styles.rowId}>{gap.artistId} · {gap.currency} · {gap.period}</span>
        <span>Gap {formatters.money(gap.gapCents / 100)}</span>
        <span className={styles.muted}>{gap.detail}</span>
      </div>
      <div className={styles.gapForm}>
        <TextInput label="OWNER" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <TextInput label="NEXT ACTION" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        <Button busy={busy} onClick={save}>SAVE (ADMIN)</Button>
      </div>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
    </div>
  );
}

/* ---------- Step 4: commission draft ---------- */
function CloseCommissions({ token, period, formatters, onDone }) {
  const [artistId, setArtistId] = useState('');
  const contractsQ = useCallback(({ signal }) => getCommissionContracts(token, { signal }), [token]);
  const contracts = useApiQuery(contractsQ);
  const [worksheet, setWorksheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function build() {
    setBusy(true); setError(null);
    try {
      const ws = await getCommissionWorksheet(token, { artistId, period });
      setWorksheet(ws);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Section title="COMMISSION WORKSHEET — DRAFT ONLY">
      <p className={styles.note}>
        Calculated deterministically from the stored contract basis (rate, base, dates, exclusions)
        and the trusted review states. Draft only — not a payment instruction, no AI involved.
      </p>
      {contracts.loading && <InlineLoading />}
      <div className={styles.closeBar}>
        <TextInput label="ARTIST ID" value={artistId} onChange={(e) => setArtistId(e.target.value)} required />
        <Button variant="primary" busy={busy} disabled={!artistId} onClick={build}>BUILD WORKSHEET</Button>
      </div>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
      {worksheet && (
        <div className={styles.worksheet}>
          <p><strong>{worksheet.contractName}</strong> · rate {worksheet.rateBps / 100}% · basis {worksheet.basis}</p>
          <p className={styles.muted}>{worksheet.source} · {worksheet.effectiveFrom} → {worksheet.effectiveTo}</p>
          <div className={styles.grid}>
            <StatCard label="BASIS" value={formatters.money(worksheet.basisCents / 100)} />
            <StatCard label="COMMISSION (ROUND-HALF-UP)" value={formatters.money(worksheet.commissionCents / 100)} />
          </div>
          <p className={styles.muted}>Underlying review: {worksheet.underlyingReview?.trustedCount ?? 0} trusted records, {worksheet.underlyingReview?.disputedCount ?? 0} disputed, {worksheet.underlyingReview?.estimatedCount ?? 0} estimated. {worksheet.underlyingReview?.note}</p>
          <p className={styles.disclaimer}>{worksheet.draftOnly}</p>
        </div>
      )}
      <Button variant="primary" onClick={onDone}>DRAFT REVIEWED — CLOSE & SHARE</Button>
    </Section>
  );
}

/* ---------- Step 5: close & share ---------- */
function CloseExport({ token, period, formatters }) {
  const { data, loading, error, refetch } = useRecon(token, period);
  const [busy, setBusy] = useState(false);
  const [dlError, setDlError] = useState(null);

  async function download() {
    setBusy(true); setDlError(null);
    try {
      const response = await apiFetch(`/v3/financials/export?period=${encodeURIComponent(period)}`, { token });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `financial-close-${period}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) { setDlError(e); } finally { setBusy(false); }
  }

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;
  if (!data) return <LoadingScreen />;
  const cur = data.primaryCurrency || 'USD';
  const totals = data.totals?.[cur] || { countedCents: 0, disputedCents: 0, estimatedCents: 0 };
  return (
    <Section title={`CLOSE ${period} — TRUSTED VIEW`}>
      <div className={styles.grid}>
        <StatCard label="TRUSTED INCOME" value={formatters.money(totals.countedCents / 100)} />
        <StatCard label="DISPUTED (SEPARATE)" value={formatters.money(totals.disputedCents / 100)} />
        <StatCard label="ESTIMATED (SEPARATE)" value={formatters.money(totals.estimatedCents / 100)} />
      </div>
      <p className={styles.note}>
        Share this view with the artist: trusted income only, every difference explained above,
        cash gaps and evidence gaps visible, nothing auto-filled. The CSV export carries the
        full provenance — statements, mappings, review states, cash evidence — behind every number.
      </p>
      {data.disclaimers?.map((d, i) => <p key={i} className={styles.disclaimer}>{d}</p>)}
      <Button variant="primary" busy={busy} onClick={download}>DOWNLOAD CLOSE EXPORT (CSV)</Button>
      {dlError && <ErrorState variant="panel" message={dlError.message} />}
    </Section>
  );
}
