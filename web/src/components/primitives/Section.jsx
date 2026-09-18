import { Panel } from './Panel.jsx';
import styles from './Section.module.css';

/**
 * A panel with the mandatory `.label` kicker header (architecture §13.5.6 — every panel
 * header carries one). `actions` sits on the header's right edge so pages never invent
 * their own header geometry.
 */
export function Section({ title, kickerTone = 'accent', actions, children, className = '', note }) {
  return (
    <Panel className={`${styles.section} ${className}`.trim()}>
      {(title || actions) && (
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            {title && <h2 className={`label ${kickerTone === 'accent' ? 'label--accent' : ''} ${styles.title}`}>{title}</h2>}
            {note && <span className={styles.note}>{note}</span>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </Panel>
  );
}
