import { Panel } from './Panel.jsx';
import styles from './StatCard.module.css';

export function StatCard({ label, value }) {
  return (
    <Panel className={styles.card}>
      <div className={`label ${styles.label}`}>{label}</div>
      <div className="kpi value">{value}</div>
    </Panel>
  );
}
