import { BrandLoader } from '../../brand/BrandLoader.jsx';
import { useBrand } from '../../brand/BrandContext.jsx';
import styles from './LoadingScreen.module.css';

export function LoadingScreen() {
  const { text } = useBrand();
  return <div className={styles.screen} role="status" aria-label={text.a11y.loading}><BrandLoader /></div>;
}
