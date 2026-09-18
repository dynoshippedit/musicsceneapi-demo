import { useCallback, useEffect, useState } from 'react';
import { getCampaignStats, createCampaign, getArtists, getCampaigns } from '../../api/endpoints.js';
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

// Saves strategy drafts and retrieves them from the server.
export function MarketingPage() {
  const { token, user } = useAuth();
  const { text, formatters } = useBrand();

  const statsQuery = useCallback(({ signal }) => getCampaignStats(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(statsQuery);
  const rosterQuery = useCallback(({ signal }) => getArtists(token, { signal }), [token]);
  const { data: roster } = useApiQuery(rosterQuery);

  const campaignQuery = useCallback(({ signal }) => getCampaigns(token, { signal }), [token]);
  const campaigns = useApiQuery(campaignQuery);
  const [step, setStep] = useState(1);
  const [values, setValues] = useState({ name: '', artistId: '', type: 'playlist-push', platforms: ['spotify'] });
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState(null);

  useEffect(() => { if (values.artistId && roster && !roster.artists?.some(a => a.id === values.artistId)) setValues(v => ({ ...v, artistId: '' })); }, [roster, values.artistId]);

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;

  const stats = data?.stats ?? {};
  const history = data?.history ?? [];

  async function generate() {
    setBusy(true);
    setPlanError(null);
    try {
      if (values.artistId && !roster?.artists?.some(a => a.id === values.artistId)) throw new Error('Select an available artist');
      setPlan(await createCampaign(token, { name: values.name, artistId: values.artistId, type: values.type, platforms: values.platforms }));
      setStep(3);
      campaigns.refetch();
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

      <p>{data?.note}</p>
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
        {planError && <ErrorState variant="panel" message={planError.message} status={planError.status} />}
        {step === 1 && (
          <div className={styles.form}>
            <TextInput label={text.marketingName} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
            <SelectInput
              label={text.marketingAudience}
              value={values.artistId}
              onChange={(event) => setValues({ ...values, artistId: event.target.value })}
              options={[{ value: '', label: user.role === 'admin' ? 'ALL ARTISTS' : 'SELECT ARTIST' }, ...(roster?.artists ?? []).map((artist) => ({ value: artist.id, label: artist.name }))]}
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
            {plan ? (
              <>
                <div className={styles.planHead}>
                  <span className="label label--accent">{text.marketingPlan}</span>
                  <ProvenanceBadge>SAVED DRAFT</ProvenanceBadge>
                </div>
                <p>{plan.message}</p>
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
      <Section title="SAVED CAMPAIGN PLANS">
        {campaigns.error && <ErrorState variant="panel" message={campaigns.error.message} onRetry={campaigns.refetch} />}
        <DataTable columns={[{ key: 'name', header: 'NAME', render: row => <Button onClick={() => { setPlan({ ...row, campaignId: row.id, budget: 'Pending approval', message: 'Saved draft plan.' }); setStep(3); }}>{row.name}</Button> }, { key: 'type', header: 'STRATEGY' }, { key: 'status', header: 'STATUS' }]}
          rows={campaigns.data?.campaigns ?? []} rowKey={row => row.id} />
        <p>Saved plans are drafts. Ads and messages are not sent automatically.</p>
      </Section>
    </div>
  );
}
