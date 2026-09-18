import { Outlet } from 'react-router-dom';
import { useBrand } from '../../brand/BrandContext.jsx';
import { SubNav } from '../../components/primitives/SubNav.jsx';
import styles from './SettingsPage.module.css';

/** Secondary-nav section: available to every authenticated user, no page permission (§10). */
export function SettingsLayout() {
  const { text } = useBrand();
  return (
    <div className={styles.page}>
      <SubNav
        ariaLabel={text.nav.settings}
        items={[
          { to: '/settings/integrations', label: text.settingsIntegrations },
          { to: '/settings/ai', label: text.settingsAi },
        ]}
      />
      <Outlet />
    </div>
  );
}
