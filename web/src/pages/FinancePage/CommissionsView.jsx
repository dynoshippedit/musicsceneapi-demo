import { useCallback, useState } from 'react';
import {
  getCommissionContracts, postCommissionContract, getCommissionWorksheet,
} from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { TextInput, SelectInput } from '../../components/primitives/Field.jsx';
import { StatCard } from '../../components/primitives/StatCard.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import { InlineLoading } from '../../components/primitives/InlineLoading.jsx';
import styles from './FinancePage.module.css';

/**
 * Commission contracts and the deterministic draft worksheet. The contract
 * basis is stored as data (rate, base, dates, exclusions, source) — never
 * inferred — and the worksheet is computed from it with integer math.
 */
export function CommissionsView() {
  const { token } = useAuth();
  const { formatters } = useBrand();
  const contractsQ = useCallback(({ signal }) => getCommissionContracts(token, { signal }), [token]);
  const contracts = useApiQuery(contractsQ);

  if (contracts.loading && !contracts.data) return <LoadingScreen />;
  if (contracts.error && !contracts.data) {
    return <ErrorState variant="fullscreen" message={contracts.error.message} status={contracts.error.status} onRetry={contracts.refetch} />;
  }

  return (
    <>
      <Section title="COMMISSION CONTRACTS — STORED BASIS">
        <p className={styles.note}>
          The rate, base, effective dates, exclusions, and source live here as data.
          Calculation happens only after the underlying income has been reviewed.
        </p>
        {(contracts.data?.contracts || []).map((c) => (
          <div key={c.id} className={styles.row}>
            <span className={styles.rowId}>{c.name || `contract #${c.id}`}</span>
            <span>{(c.rateBps / 100).toFixed(2)}% on {c.basis}</span>
            <span className={styles.muted}>{c.effectiveFrom} → {c.effectiveTo}{c.sourceDescription ? ` · ${c.sourceDescription}` : ''}</span>
          </div>
        ))}
        {(contracts.data?.contracts || []).length === 0 && !contracts.loading && <EmptyState />}
        {contracts.loading && <InlineLoading />}
      </Section>
      <Section title="NEW CONTRACT (ADMIN)">
        <ContractForm token={token} onSaved={contracts.refetch} />
      </Section>
      <Section title="DRAFT WORKSHEET">
        <WorksheetBuilder token={token} contracts={contracts.data?.contracts || []} formatters={formatters} />
      </Section>
    </>
  );
}

function ContractForm({ token, onSaved }) {
  const [artistId, setArtistId] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [basis, setBasis] = useState('counted_net_income');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [excludedCategories, setExcludedCategories] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const rateBps = Math.round(Number(rate) * 100);
      await postCommissionContract(token, {
        artistId, name: name || undefined, rateBps, basis,
        effectiveFrom, effectiveTo,
        excludedCategories: excludedCategories.split(',').map((s) => s.trim()).filter(Boolean),
        sourceDescription: sourceDescription || undefined,
      });
      setArtistId(''); setName(''); setRate(''); setEffectiveFrom(''); setEffectiveTo('');
      setExcludedCategories(''); setSourceDescription('');
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form className={styles.matchForm} onSubmit={submit}>
      <TextInput label="ARTIST ID" value={artistId} onChange={(e) => setArtistId(e.target.value)} required />
      <TextInput label="CONTRACT NAME" value={name} onChange={(e) => setName(e.target.value)} hint="e.g. 2026 management agreement" />
      <TextInput label="RATE (%)" type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required hint="Stored as integer basis points" />
      <SelectInput label="BASE" value={basis} onChange={(e) => setBasis(e.target.value)}
        options={[
          { value: 'counted_net_income', label: 'Counted net income (trusted minus exclusions)' },
          { value: 'counted_gross_income', label: 'Counted gross income (trusted royalties + merch, before deductions)' },
          { value: 'cash_receipts', label: 'Matched cash receipts (label-level only)' },
        ]} />
      <TextInput label="EFFECTIVE FROM" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
      <TextInput label="EFFECTIVE TO" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} required />
      <TextInput label="EXCLUDED CATEGORIES" value={excludedCategories} onChange={(e) => setExcludedCategories(e.target.value)}
        hint="Comma-separated: royalties, merch_settlements, direct_sales, manual_adjustments" />
      <TextInput label="SOURCE" value={sourceDescription} onChange={(e) => setSourceDescription(e.target.value)}
        hint="Where this basis comes from (e.g. signed agreement 2026-01-15)" />
      <Button type="submit" variant="primary" busy={busy} disabled={!artistId || !rate || !effectiveFrom || !effectiveTo}>
        STORE CONTRACT
      </Button>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
    </form>
  );
}

function WorksheetBuilder({ token, contracts, formatters }) {
  const [artistId, setArtistId] = useState('');
  const [period, setPeriod] = useState('');
  const [contractId, setContractId] = useState('');
  const [worksheet, setWorksheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function build(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      setWorksheet(await getCommissionWorksheet(token, {
        artistId, period, contractId: contractId || undefined,
      }));
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form className={styles.matchForm} onSubmit={build}>
      <TextInput label="ARTIST ID" value={artistId} onChange={(e) => setArtistId(e.target.value)} required />
      <TextInput label="PERIOD" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
      <SelectInput label="CONTRACT" value={contractId} onChange={(e) => setContractId(e.target.value)}
        options={[{ value: '', label: 'AUTO — COVERING THE PERIOD', disabled: false },
          ...contracts.filter((c) => !artistId || c.artistId === artistId).map((c) => ({
            value: String(c.id), label: `${c.name || `#${c.id}`} · ${(c.rateBps / 100).toFixed(2)}%`,
          }))]} />
      <Button type="submit" variant="primary" busy={busy} disabled={!artistId || !period}>BUILD DRAFT</Button>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
      {worksheet && (
        <div className={styles.worksheet}>
          <p><strong>{worksheet.contractName}</strong> · {(worksheet.rateBps / 100).toFixed(2)}% · basis {worksheet.basis}</p>
          <p className={styles.muted}>{worksheet.source} · effective {worksheet.effectiveFrom} → {worksheet.effectiveTo}</p>
          {(worksheet.exclusions?.categories?.length > 0 || worksheet.exclusions?.royaltySources?.length > 0) && (
            <p className={styles.muted}>
              Exclusions: {[...(worksheet.exclusions.categories || []), ...(worksheet.exclusions.royaltySources || [])].join(', ')}
            </p>
          )}
          <div className={styles.grid}>
            <StatCard label="BASIS (TRUSTED INCOME)" value={formatters.money(worksheet.basisCents / 100)} />
            <StatCard label="COMMISSION — ROUND-HALF-UP" value={formatters.money(worksheet.commissionCents / 100)} />
          </div>
          <p className={styles.muted}>
            Underlying review: {worksheet.underlyingReview?.trustedCount ?? 0} trusted, {worksheet.underlyingReview?.disputedCount ?? 0} disputed, {worksheet.underlyingReview?.estimatedCount ?? 0} estimated records.
            {worksheet.underlyingReview?.note}
          </p>
          {worksheet.cashBasisLimitation && <p className={styles.disclaimer}>{worksheet.cashBasisLimitation}</p>}
          <p className={styles.disclaimer}>{worksheet.draftOnly}</p>
        </div>
      )}
    </form>
  );
}
