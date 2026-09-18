import { useBrand } from '../../brand/BrandContext.jsx';
import styles from './EmptyState.module.css';

export function EmptyState({ title, detail, icon = 'ri-inbox-line', children }) {
  const { text } = useBrand();
  return (
    <div className={styles.empty} role="status">
      <i className={`${icon} ${styles.icon}`} aria-hidden="true" />
      <div className={`label ${styles.title}`}>{title || text.empty}</div>
      {detail !== null && <p className={styles.detail}>{detail || text.emptyDetail}</p>}
      {children}
    </div>
  );
}
