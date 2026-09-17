import styles from './defaults.module.css';

export function RingLoader({ label }) {
  return <span className={styles.ring} role="img" aria-label={label} />;
}
