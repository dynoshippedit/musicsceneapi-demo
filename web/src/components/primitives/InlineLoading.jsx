import { useBrand } from '../../brand/BrandContext.jsx';
import styles from './InlineLoading.module.css';

/** In-panel busy line. The fullscreen brand loader stays reserved for first paint of a page. */
export function InlineLoading({ label }) {
  const { text } = useBrand();
  return (
    <div className={styles.row} role="status">
      <span className={styles.cursor} aria-hidden="true" />
      <span className={`label ${styles.text}`}>{label || text.loading}</span>
    </div>
  );
}
