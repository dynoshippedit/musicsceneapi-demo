import { useLocation } from 'react-router-dom';
import { useBrand } from '../brand/BrandContext.jsx';
import { useAuth } from '../auth/useAuth.js';
import { resolveNavEntry } from './nav.js';
import styles from './Header.module.css';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
}

export function Header({ onMenuClick }) {
  const location = useLocation();
  const { text } = useBrand();
  const { user } = useAuth();
  // Segment-bounded longest match, so a detail or sub-tab route keeps its section title
  // instead of falling back to the first nav entry (which is what exact matching did in 4B).
  // An unmatched path is a 404 and says so, rather than borrowing the first nav entry's title.
  const route = resolveNavEntry(location.pathname);
  const title = route ? (text.nav[route.id] || route.label) : text.notFoundTitle;
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <button type="button" className={styles.menu} onClick={onMenuClick} aria-label={text.a11y.openNavigation}>
          <i className="ri-menu-line" aria-hidden="true" />
        </button>
        <div className={styles.titleGroup}>
          <h1>{title}</h1>
          {/* Legacy renders the same sub-line under EVERY page title (L3526). PHASE_4A_HANDOFF.md
              §20 Q10 is still unanswered, and it states 4C defaults to the legacy behaviour. */}
          <p>{text.dashboardSubtitle}</p>
        </div>
      </div>
      <div className={`panel ${styles.chip}`}>
        <span className={styles.avatar}>{initials(user?.name)}</span>
        <span>{user?.name}</span>
      </div>
    </header>
  );
}
