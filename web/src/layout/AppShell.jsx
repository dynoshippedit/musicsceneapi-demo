import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header.jsx';
import { Sidebar } from './Sidebar.jsx';
import styles from './AppShell.module.css';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className={styles.shell}>
      {mobileOpen && <div className={styles.backdrop} onClick={() => setMobileOpen(false)} />}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className={styles.main}>
        <Header onMenuClick={() => setMobileOpen(true)} />
        <Outlet />
      </main>
    </div>
  );
}
