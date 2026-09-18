import { useCallback, useState } from 'react';
import { getCampaignStats, createCampaign, getArtists } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { StatCard } from '../../components/primitives/StatCard.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { SelectInput, TextInput, CheckGroup } from '../../components/primitives/Field.jsx';
import { DataTable } from '../../components/primitives/DataTable.jsx';
import { ProvenanceBadge } from '../../components/primitives/Badge.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import styles from './MarketingPage.module.css';

// The three strategies the backend actually understands (src/routes/marketing.js L41-45);
// anything else silently returns the generic plan, so the UI does not offer anything else.
const TYPES = [
  { value: 'playlist-push', label: 'PLAYLIST PUSH' },
  { value: 'social-growth', label: 'SOCIAL GROWTH' },
  { value: 'tour-promo', label: 'TOUR PROMO' },
];
const PLATFORMS = ['spotify', 'tiktok', 'instagram', 'youtube', 'email'];

/**
 * Restored from orphan status (legacy `CampaignsView`, never reachable). The wizard is fully
 * functional, but `POST /v3/marketing/campaigns` returns a CANNED plan and persists nothing —
 * so the result carries a PROTOTYPE provenance badge (PHASE_4A_HANDOFF.md §3 row 3 / row 24).
 */
export function MarketingPage() {
  const { token } = useAuth();
  const { text, formatters } = useBrand();

  const statsQuery = useCallback(({ signal }) => getCampaignStats(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(statsQuery);
  const rosterQuery = useCallback(({ signal }) => getArtists(token, { signal }), [token]);
  const { data: roster } = useApiQuery(rosterQuery);

  const [step, setStep] = useState(1);
  const [values, setValues] = useState({ name: '', artistId: '', type: 'playlist-push', platforms: ['spotify'] });
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState(null);

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;

  const stats = data?.stats ?? {};
  const history = data?.history ?? [];

  async function generate() {
    setBusy(true);
    setPlanError(null);
    try {
      setPlan(await createCampaign(token, { artistId: values.artistId, type: values.type, platforms: values.platforms }));
      setStep(3);
    } catch (failure) {
      setPlanError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.kpis}>
        <StatCard label={text.marketingEmails} value={formatters.compact(stats.totalEmails)} />
        <StatCard label={text.marketingSms} value={formatters.compact(stats.totalSMS)} />
        <StatCard label={text.marketingPresale} value={formatters.compact(stats.presaleSignups)} />
      </div>

      <Section title={text.marketingHistory}>
        <DataTable
          columns={[
            { key: 'month', header: 'MONTH' },
            { key: 'email', header: text.marketingEmails, align: 'right', mono: true, render: (row) => formatters.compact(row.email) },
            { key: 'sms', header: text.marketingSms, align: 'right', mono: true, render: (row) => formatters.compact(row.sms) },
          ]}
          rows={history}
          rowKey={(row) => row.month}
        />
      </Section>

      <Section title={text.marketingWizard} note={`${text.marketingStep} ${step}/3`}>
        {step === 1 && (
          <div className={styles.form}>
            <TextInput label={text.marketingName} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
            <SelectInput
              label={text.marketingAudience}
              value={values.artistId}
              onChange={(event) => setValues({ ...values, artistId: event.target.value })}
              options={[{ value: '', label: 'ALL ARTISTS' }, ...(roster?.artists ?? []).map((artist) => ({ value: artist.id, label: artist.name }))]}
            />
            <div className={styles.stepActions}>
              <Button variant="primary" onClick={() => setStep(2)} disabled={!values.name.trim()}>{text.marketingNext}</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.form}>
            <SelectInput
              label={text.marketingChannel}
              value={values.type}
              onChange={(event) => setValues({ ...values, type: event.target.value })}
              options={TYPES}
            />
            <CheckGroup
              label="PLATFORMS"
              options={PLATFORMS.map((value) => ({ value, label: value }))}
              value={values.platforms}
              onChange={(platforms) => setValues({ ...values, platforms })}
            />
            <div className={styles.stepActions}>
              <Button onClick={() => setStep(1)}>{text.marketingBack}</Button>
              <Button variant="primary" busy={busy} onClick={generate} disabled={values.platforms.length === 0}>{text.marketingLaunch}</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.form}>
            {planError && <ErrorState variant="panel" message={planError.message} status={planError.status} />}
            {plan ? (
              <>
                <div className={styles.planHead}>
                  <span className="label label--accent">{text.marketingPlan}</span>
                  <ProvenanceBadge>{text.provenancePrototype}</ProvenanceBadge>
                </div>
                <DataTable
                  columns={[
                    { key: 'step', header: text.marketingStep, mono: true, width: '80px' },
                    { key: 'action', header: 'ACTION' },
                    { key: 'platform', header: 'PLATFORM', mono: true },
                  ]}
                  rows={plan.plan ?? []}
                  rowKey={(row) => row.step}
                />
                <dl className={styles.meta}>
                  <div><dt className="label">CAMPAIGN ID</dt><dd className="value">{plan.campaignId}</dd></div>
                  <div><dt className="label">BUDGET</dt><dd className="value">{plan.budget}</dd></div>
                </dl>
              </>
            ) : <EmptyState />}
            <div className={styles.stepActions}>
              <Button onClick={() => { setStep(1); setPlan(null); }}>{text.marketingBack}</Button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
