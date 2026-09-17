import { useBrand } from '../BrandContext.jsx';
import styles from './defaults.module.css';

export function MonogramMark({ size = 40 }) {
  const { profile } = useBrand();
  return (
    <span className={styles.monogram} style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">
      {profile.displayName.charAt(0).toUpperCase()}
    </span>
  );
}
