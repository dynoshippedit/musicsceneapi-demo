import { NavLink, useNavigate } from 'react-router-dom';
import { BrandMark } from '../brand/BrandMark.jsx';
import { useBrand } from '../brand/BrandContext.jsx';
import { useAuth } from '../auth/useAuth.js';
import { canSee, isAdmin } from '../auth/permissions.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { NAV_PRIMARY, NAV_SECONDARY } from './nav.js';
import styles from './Sidebar.module.css';

// Must stay identical to the rail @media block in Sidebar.module.css: the icon-only rail is the
// only width at which `title` tooltips are specified (architecture §13.5.2: none at ≥1280).
const RAIL_QUERY = '(max-width: 1279px) and (min-width: 1024px)';

export function Sidebar({ mobileOpen, onClose }) {
  const { profile, text } = useBrand();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isRail = useMediaQuery(RAIL_QUERY);
  const railTitle = (value) => (isRail ? value : undefined);
  const visiblePrimary = NAV_PRIMARY.filter((item) => (!item.adminOnly || isAdmin(user)) && canSee(user, item.perm));

  function navItem(item) {
    const label = text.nav[item.id] || item.label;
    return (
      <li key={item.id}>
        <NavLink to={item.to} title={railTitle(label)} onClick={onClose} className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}>
          <i className={`${item.icon} ${styles.icon}`} aria-hidden="true" />
          <span className={styles.itemLabel}>{label}</span>
        </NavLink>
      </li>
    );
  }

  function endSession() {
    logout();
    onClose();
    navigate('/login', { replace: true });
  }

  return (
    <aside className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''}`}>
      <div className={styles.brand} title={railTitle(profile.shortName)}>
        <span className={styles.fullMark}><BrandMark size={40} /></span>
        <span className={styles.railMark}><BrandMark size={24} /></span>
        <span className={styles.brandText}>
          <strong className={styles.wordmark}>{profile.displayName}</strong>
          <span className={`label label--accent ${styles.tagline}`}>{profile.tagline}</span>
        </span>
      </div>
      <nav aria-label={text.a11y.primaryNav}>
        <ul className={styles.navList}>{visiblePrimary.map(navItem)}</ul>
      </nav>
      <div className={styles.bottom}>
        <nav aria-label={text.a11y.secondaryNav}><ul className={styles.navList}>{NAV_SECONDARY.map(navItem)}</ul></nav>
        <div className={styles.divider} />
        <button className={styles.logout} type="button" onClick={endSession} title={railTitle(text.logout)}>
          <i className={`ri-logout-box-line ${styles.icon}`} aria-hidden="true" />
          <span className={styles.itemLabel}>{text.logout}</span>
        </button>
      </div>
    </aside>
  );
}
