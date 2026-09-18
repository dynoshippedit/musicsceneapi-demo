import { Outlet } from 'react-router-dom';
import { useBrand } from '../../brand/BrandContext.jsx';
import { SubNav } from '../../components/primitives/SubNav.jsx';
import styles from './AnrPage.module.css';

/**
 * A&R shell. Scouting was an orphaned legacy view (`AnRMasterView`, never reachable from the
 * 5-item nav); Phase 4A restores it as a CONTEXTUAL sub-tab under the existing `anr_room`
 * permission rather than as a new primary nav entry (§3).
 */
export function AnrLayout() {
  const { text } = useBrand();
  return (
    <div className={styles.page}>
      <SubNav
        ariaLabel={text.nav.anr}
        items={[
          { to: '/anr', label: text.anrTabRoom, end: true },
          { to: '/anr/scouting', label: text.anrTabScouting },
        ]}
      />
      <Outlet />
    </div>
  );
}
