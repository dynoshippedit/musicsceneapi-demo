import { useState } from 'react';
import { downloadExport } from '../../api/download.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { Button } from '../primitives/Button.jsx';
import { ErrorState } from '../primitives/ErrorState.jsx';
import styles from './ExportControls.module.css';

/**
 * Triggers the SERVER's report generation (GET /v3/exports). The PDF is drawn by PDFKit and
 * the CSV by csv-writer, both backend-side; nothing here re-creates a report in the browser
 * (matrix row 31). Generation is chart-heavy and slow, so a long-op status line is shown and
 * the buttons disable while a job is in flight rather than letting the user queue more.
 *
 * `checkExportAccess` may answer 403 — that renders inline without a retry, like every other
 * 403 on the platform.
 */
export function ExportControls({ artistId, timeframe = '30d' }) {
  const { token } = useAuth();
  const { profile, text } = useBrand();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function run(format) {
    setBusy(format);
    setError(null);
    try {
      // The filename stem is the active profile's slug — brand data, never a literal here.
      await downloadExport(token, { format, artistId, timeframe, stem: profile.slug });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <Button busy={busy === 'pdf'} disabled={Boolean(busy)} onClick={() => run('pdf')}>
          {busy === 'pdf' ? text.exportBusy : text.exportPdf}
        </Button>
        <Button busy={busy === 'csv'} disabled={Boolean(busy)} onClick={() => run('csv')}>
          {busy === 'csv' ? text.exportBusy : text.exportCsv}
        </Button>
      </div>
      {busy && <p className={`label ${styles.status}`}>{text.exportNote}</p>}
      {error && <ErrorState variant="panel" message={error.message || text.exportFailed} status={error.status} />}
    </div>
  );
}
