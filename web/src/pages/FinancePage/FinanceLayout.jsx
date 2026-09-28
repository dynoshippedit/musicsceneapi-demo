import { Outlet } from 'react-router-dom';
import { SubNav } from '../../components/primitives/SubNav.jsx';

/**
 * Finance section: the monthly-close journey. The positioning contract:
 * "The Music Scene helps an artist team close its monthly income across
 * disconnected sources, explain every difference, and share a trusted view
 * with the artist."
 *
 * Every number on these screens is evidence-backed: trusted totals count
 * only reported/reconciled/approved records; disputed and estimated records
 * are shown separately and never enter a headline figure; cash is evidence
 * of income, never additional income; gaps are shown, never auto-filled.
 * Nothing here is a P&L, a credit rating, or a payment instruction.
 */
export function FinanceLayout() {
  return (
    <>
      <SubNav
        ariaLabel="Finance"
        items={[
          { to: '/finance', end: true, label: 'MONTHLY CLOSE' },
          { to: '/finance/reconciliation', label: 'RECONCILIATION' },
          { to: '/finance/cash', label: 'CASH' },
          { to: '/finance/commissions', label: 'COMMISSIONS' },
          { to: '/finance/evidence', label: 'EVIDENCE' },
        ]}
      />
      <Outlet />
    </>
  );
}
