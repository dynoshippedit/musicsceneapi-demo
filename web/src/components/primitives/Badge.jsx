import styles from './Badge.module.css';

/**
 * Status pill. `--radius-pill` is permitted here only because the contract caps pills at 22px
 * tall (tokens.css); the badge is 18px. Tone is semantic and always accompanied by its text —
 * colour alone never carries meaning.
 */
export function Badge({ children, tone = 'neutral', dot = false }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * Data-provenance marker. Phase 4A requires every surface backed by mock, fixture or
 * prototype data to say so on the surface itself (orphan classification, §3).
 */
export function ProvenanceBadge({ children }) {
  return <span className={`label ${styles.provenance}`}>{children}</span>;
}
