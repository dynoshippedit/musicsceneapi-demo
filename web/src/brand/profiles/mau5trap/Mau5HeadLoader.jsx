import styles from './mau5head.module.css';

export function Mau5HeadLoader({ label }) {
  return <div className={styles.head} role="img" aria-label={label} />;
}
