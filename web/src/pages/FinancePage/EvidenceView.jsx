import { useCallback, useState } from 'react';
import {
  getStatements, getExpectedReports, postExpectedReport, getMappings, approveMapping,
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
 * Evidence: statement provenance, the expected-report calendar, and the
 * mapping history. Approved mappings are reused only for identical formats;
 * changed formats require re-review.
 */
export function EvidenceView() {
  const { token } = useAuth();
  const statementsQ = useCallback(({ signal }) => getStatements(token, { signal }), [token]);
  const statements = useApiQuery(statementsQ);
  const expectedQ = useCallback(({ signal }) => getExpectedReports(token, { signal }), [token]);
  const expected = useApiQuery(expectedQ);
  const mappingsQ = useCallback(({ signal }) => getMappings(token, { signal }), [token]);
  const mappings = useApiQuery(mappingsQ);

  const loading = [statements, expected, mappings].some((q) => q.loading && !q.data);
  if (loading) return <LoadingScreen />;
  const failed = statements.error || expected.error || mappings.error;
  if (failed && !statements.data && !expected.data && !mappings.data) {
    return <ErrorState variant="fullscreen" message={failed.message} status={failed.status}
      onRetry={() => { statements.refetch(); expected.refetch(); mappings.refetch(); }} />;
  }

  return (
    <>
      <Section title="ROYALTY STATEMENTS — IMPORT PROVENANCE">
        <p className={styles.note}>The statement is the import unit: one file, one period, one supersede. Same-file re-uploads report already-imported without changing totals.</p>
        {(statements.data?.statements || []).map((s) => (
          <div key={s.id} className={styles.row}>
            <span className={styles.rowId}>{s.source} · {s.period} · v{s.importVersion}</span>
            <span>{s.rowCount} rows · {s.status}{s.supersededBy ? ` → superseded by #${s.supersededBy}` : ''}</span>
            <span className={styles.muted}>file {s.fileHash?.slice(0, 12)}… · mapping {s.mappingVersion || '—'}{s.originalFilename ? ` · ${s.originalFilename}` : ''}</span>
          </div>
        ))}
        {(statements.data?.statements || []).length === 0 && <EmptyState />}
      </Section>
      <Section title="EXPECTED REPORTS — WHAT SHOULD HAVE ARRIVED">
        <p className={styles.note}>Missing reports, changed schemas, and unexplained variances are evidence gaps. Gaps are shown, never auto-filled.</p>
        {(expected.data?.expectedReports || []).map((r) => (
          <div key={r.id} className={styles.row}>
            <span className={styles.rowId}>{r.customer} · {r.period}</span>
            <span>{r.status}{r.latestGap ? ` — ${r.latestGap.type}: ${r.latestGap.detail}` : ''}</span>
            <span className={styles.muted}>expected by {r.expectedBy}</span>
          </div>
        ))}
        {(expected.data?.expectedReports || []).length === 0 && <EmptyState />}
        <ExpectedReportForm token={token} onSaved={expected.refetch} />
      </Section>
      <Section title="MAPPING HISTORY — APPROVED LAYOUTS">
        <p className={styles.note}>Approved column mappings are reused only for identical formats (same header hash). A changed layout requires re-review before it can be approved.</p>
        {(mappings.data?.mappings || []).map((m) => (
          <MappingRow key={m.id} token={token} mapping={m} onSaved={mappings.refetch} />
        ))}
        {(mappings.data?.mappings || []).length === 0 && <EmptyState />}
      </Section>
    </>
  );
}

function ExpectedReportForm({ token, onSaved }) {
  const [customer, setCustomer] = useState('');
  const [period, setPeriod] = useState('');
  const [expectedBy, setExpectedBy] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await postExpectedReport(token, { customer, period, expectedBy, source: source || undefined });
      setCustomer(''); setPeriod(''); setExpectedBy(''); setSource('');
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form className={styles.matchForm} onSubmit={submit}>
      <h3 className="label">EXPECT A REPORT (ADMIN)</h3>
      <TextInput label="CUSTOMER" value={customer} onChange={(e) => setCustomer(e.target.value)} required />
      <TextInput label="PERIOD" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
      <TextInput label="EXPECTED BY" type="date" value={expectedBy} onChange={(e) => setExpectedBy(e.target.value)} required />
      <TextInput label="SOURCE" value={source} onChange={(e) => setSource(e.target.value)} hint="distributor/source name" />
      <Button type="submit" variant="primary" busy={busy} disabled={!customer || !period || !expectedBy}>EXPECT REPORT</Button>
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
    </form>
  );
}

function MappingRow({ token, mapping, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [evidence, setEvidence] = useState('');

  async function approve() {
    setBusy(true); setError(null);
    try { await approveMapping(token, mapping.id, { evidence }); onSaved(); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <div className={styles.gapBox}>
      <div className={styles.row}>
        <span className={styles.rowId}>{mapping.source} · v{mapping.version}</span>
        <span>{mapping.status}{mapping.approvedBy ? ` · approved by ${mapping.approvedBy}` : ''}{mapping.approvalEvidence ? ` — ${mapping.approvalEvidence}` : ''}</span>
        <span className={styles.muted}>format {mapping.formatHash?.slice(0, 12)}…</span>
      </div>
      {mapping.status !== 'approved' && (
        <div className={styles.gapForm}>
          <TextInput label="APPROVAL EVIDENCE" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          <Button busy={busy} onClick={approve}>APPROVE (ADMIN)</Button>
        </div>
      )}
      {error && <ErrorState variant="panel" message={error.message} status={error.status} />}
    </div>
  );
}
