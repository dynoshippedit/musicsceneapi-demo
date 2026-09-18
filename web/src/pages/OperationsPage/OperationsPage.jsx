import { useCallback } from 'react';
import { getLogistics, getAssets, getContracts } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { DataTable } from '../../components/primitives/DataTable.jsx';
import { Badge, ProvenanceBadge } from '../../components/primitives/Badge.jsx';
import { InlineLoading } from '../../components/primitives/InlineLoading.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import styles from './OperationsPage.module.css';

const STATUS_TONE = { 'In Transit': 'warning', Stocked: 'accent', 'Low Stock': 'danger', Approved: 'accent', Processing: 'warning', Active: 'accent' };

/**
 * Restored from orphan status (legacy `OperationsView`). All three endpoints serve static
 * fixtures server-side, so the page says SOURCE: FIXTURE (matrix row 26).
 *
 * `GET /v3/operations/contracts` is admin/manager only. A 403 there must NOT take down the
 * page — it renders inline on that one panel while logistics and assets keep working.
 */
export function OperationsPage() {
  const { token } = useAuth();
  const { text, formatters } = useBrand();

  const logisticsQuery = useCallback(({ signal }) => getLogistics(token, { signal }), [token]);
  const assetsQuery = useCallback(({ signal }) => getAssets(token, { signal }), [token]);
  const contractsQuery = useCallback(({ signal }) => getContracts(token, { signal }), [token]);

  const logistics = useApiQuery(logisticsQuery);
  const assets = useApiQuery(assetsQuery);
  const contracts = useApiQuery(contractsQuery);

  return (
    <div className={styles.page}>
      <Section title={text.opsLogistics} actions={<ProvenanceBadge>{text.provenanceFixture}</ProvenanceBadge>}>
        <PanelBody state={logistics}>
          <DataTable
            columns={[
              { key: 'item', header: text.opsItem },
              { key: 'quantity', header: text.opsQuantity, align: 'right', mono: true, render: (row) => formatters.integer(row.quantity) },
              { key: 'status', header: text.opsStatus, render: (row) => <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{row.status}</Badge> },
              { key: 'vendor', header: text.opsVendor },
              { key: 'eta', header: text.opsEta, mono: true, render: (row) => formatters.date(row.eta) },
              { key: 'location', header: text.opsLocation },
            ]}
            rows={logistics.data?.logistics ?? []}
            rowKey={(row) => row.id}
          />
        </PanelBody>
      </Section>

      <Section title={text.opsAssets} actions={<ProvenanceBadge>{text.provenanceFixture}</ProvenanceBadge>}>
        <PanelBody state={assets}>
          <DataTable
            columns={[
              { key: 'title', header: text.opsTitle },
              { key: 'type', header: text.opsType },
              { key: 'artist', header: text.opsArtist },
              { key: 'uploaded', header: text.opsUploaded, mono: true, render: (row) => formatters.date(row.uploaded) },
              { key: 'size', header: text.opsSize, align: 'right', mono: true },
              { key: 'status', header: text.opsStatus, render: (row) => <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{row.status}</Badge> },
            ]}
            rows={assets.data?.assets ?? []}
            rowKey={(row) => row.id}
          />
        </PanelBody>
      </Section>

      <Section title={text.opsContracts} actions={<ProvenanceBadge>{text.provenanceFixture}</ProvenanceBadge>}>
        <PanelBody state={contracts}>
          <DataTable
            columns={[
              { key: 'artist', header: text.opsArtist },
              { key: 'type', header: text.opsType },
              { key: 'signedDate', header: text.opsSigned, mono: true, render: (row) => formatters.date(row.signedDate) },
              { key: 'term', header: text.opsTerm },
              { key: 'advance', header: text.opsAdvance, align: 'right', mono: true },
              { key: 'royaltyRate', header: text.opsRoyalty, align: 'right', mono: true },
              { key: 'nextMilestone', header: text.opsMilestone, render: (row) => formatters.text(row.nextMilestone) },
            ]}
            rows={contracts.data?.contracts ?? []}
            rowKey={(row) => row.id}
          />
        </PanelBody>
      </Section>
    </div>
  );
}

function PanelBody({ state, children }) {
  if (state.loading && !state.data) return <InlineLoading />;
  if (state.error && !state.data) {
    return (
      <ErrorState
        variant="panel"
        message={state.error.message}
        status={state.error.status}
        onRetry={state.error.status === 403 ? undefined : state.refetch}
      />
    );
  }
  return children;
}
