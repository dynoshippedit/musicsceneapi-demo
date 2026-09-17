import { useLocation } from 'react-router-dom';
import { useBrand } from '../brand/BrandContext.jsx';
import { useAuth } from '../auth/useAuth.js';
import { NAV_PRIMARY, NAV_SECONDARY } from './nav.js';
import styles from './Header.module.css';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
}

export function Header({ onMenuClick }) {
  const location = useLocation();
  const { text } = useBrand();
  const { user } = useAuth();
  const route = [...NAV_PRIMARY, ...NAV_SECONDARY].find((item) => location.pathname === item.to) || NAV_PRIMARY[0];
  const title = text.nav[route.id] || route.label;
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <button type="button" className={styles.menu} onClick={onMenuClick} aria-label={text.a11y.openNavigation}>
          <i className="ri-menu-line" aria-hidden="true" />
        </button>
        <div className={styles.titleGroup}>
          <h1>{title}</h1>
          {route.subtitle && <p>{text[route.subtitle]}</p>}
        </div>
      </div>
      <div className={`panel ${styles.chip}`}>
        <span className={styles.avatar}>{initials(user?.name)}</span>
        <span>{user?.name}</span>
      </div>
    </header>
  );
}
