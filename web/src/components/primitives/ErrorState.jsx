import { useBrand } from '../../brand/BrandContext.jsx';
import { Button } from './Button.jsx';
import styles from './ErrorState.module.css';

export function ErrorState({ variant = 'panel', message, onRetry, status, hideKicker = false }) {
  const { text } = useBrand();
  const kicker = status === 403 ? text.accessDenied : variant === 'fullscreen' ? text.errorKicker : text.errorGeneric;
  return (
    <div className={`${styles[variant]} ${styles.error}`} role="alert">
      {variant === 'fullscreen' && <i className={`ri-error-warning-line ${styles.icon}`} aria-hidden="true" />}
      {!hideKicker && <div className={`label ${styles.kicker}`}>{kicker}</div>}
      <p className={styles.message}>{message || text.errorNetwork}</p>
      {onRetry && status !== 403 && <Button variant="danger" onClick={onRetry}>{text.errorRetry}</Button>}
    </div>
  );
}
