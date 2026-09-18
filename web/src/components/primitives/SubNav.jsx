import { NavLink } from 'react-router-dom';
import styles from './SubNav.module.css';

/** Contextual sub-tab strip (A&R room/scouting, Settings integrations/AI, artist detail tabs). */
export function SubNav({ items, ariaLabel }) {
  return (
    <nav aria-label={ariaLabel} className={styles.bar}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `label ${styles.tab} ${isActive ? styles.active : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Same strip driven by state instead of the URL (used where the tab is not a route). */
export function SubNavButtons({ items, value, onChange, ariaLabel }) {
  return (
    <nav aria-label={ariaLabel} className={styles.bar}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`label ${styles.tab} ${value === item.id ? styles.active : ''}`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
