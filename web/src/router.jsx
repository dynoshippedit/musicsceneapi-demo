import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute.jsx';
import { PermissionRoute } from './auth/PermissionRoute.jsx';
import { AppShell } from './layout/AppShell.jsx';
import { LoginPage } from './pages/LoginPage/LoginPage.jsx';
import { ResetPasswordPage } from './pages/ResetPasswordPage/ResetPasswordPage.jsx';
import { DashboardPage } from './pages/DashboardPage/DashboardPage.jsx';
import { ArtistsPage } from './pages/ArtistsPage/ArtistsPage.jsx';
import { ArtistDetailPage } from './pages/ArtistDetailPage/ArtistDetailPage.jsx';
import { AnrLayout } from './pages/AnrPage/AnrLayout.jsx';
import { AnrRoomView } from './pages/AnrPage/AnrRoomView.jsx';
import { AnrScoutingView } from './pages/AnrPage/AnrScoutingView.jsx';
import { IntelligencePage } from './pages/IntelligencePage/IntelligencePage.jsx';
import { MarketingPage } from './pages/MarketingPage/MarketingPage.jsx';
import { FansPage } from './pages/FansPage/FansPage.jsx';
import { OperationsPage } from './pages/OperationsPage/OperationsPage.jsx';
import { FinanceLayout } from './pages/FinancePage/FinanceLayout.jsx';
import { MonthlyCloseView } from './pages/FinancePage/MonthlyCloseView.jsx';
import { ReconciliationView } from './pages/FinancePage/ReconciliationView.jsx';
import { CashView } from './pages/FinancePage/CashView.jsx';
import { CommissionsView } from './pages/FinancePage/CommissionsView.jsx';
import { EvidenceView } from './pages/FinancePage/EvidenceView.jsx';
import { SettingsLayout } from './pages/SettingsPage/SettingsLayout.jsx';
import { IntegrationsView } from './pages/SettingsPage/IntegrationsView.jsx';
import { AiSettingsView } from './pages/SettingsPage/AiSettingsView.jsx';
import { AdminPage } from './pages/AdminPage/AdminPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage/NotFoundPage.jsx';

// Route map per PHASE_4A_HANDOFF.md §4. `PermissionRoute` mirrors the sidebar's visibility
// rule so a typed URL behaves like the nav; the backend still authorizes every request.
// Settings carries no permission — it is the secondary nav, available to every session (§10).
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // STEP 7: public landing page for password-reset email links (?token=…)
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          {
            element: <PermissionRoute perm="overview" />,
            children: [{ path: '/dashboard', element: <DashboardPage /> }],
          },
          {
            element: <PermissionRoute perm="roster" />,
            children: [
              { path: '/artists', element: <ArtistsPage /> },
              { path: '/artists/:artistId', element: <ArtistDetailPage /> },
            ],
          },
          {
            element: <PermissionRoute perm="anr_room" />,
            children: [
              {
                path: '/anr',
                element: <AnrLayout />,
                children: [
                  { index: true, element: <AnrRoomView /> },
                  { path: 'scouting', element: <AnrScoutingView /> },
                ],
              },
            ],
          },
          {
            element: <PermissionRoute perm="ai_lab" />,
            children: [{ path: '/intelligence', element: <IntelligencePage /> }],
          },
          {
            element: <PermissionRoute perm="marketing" />,
            children: [{ path: '/marketing', element: <MarketingPage /> }],
          },
          {
            element: <PermissionRoute perm="fans" />,
            children: [{ path: '/fans', element: <FansPage /> }],
          },
          {
            element: <PermissionRoute perm="operations" />,
            children: [{ path: '/operations', element: <OperationsPage /> }],
          },
          {
            // Finance rides on the dashboard's visibility (perm "overview"); the
            // backend authorizes every read and gates every write to admins.
            element: <PermissionRoute perm="overview" />,
            children: [
              {
                path: '/finance',
                element: <FinanceLayout />,
                children: [
                  { index: true, element: <MonthlyCloseView /> },
                  { path: 'reconciliation', element: <ReconciliationView /> },
                  { path: 'cash', element: <CashView /> },
                  { path: 'commissions', element: <CommissionsView /> },
                  { path: 'evidence', element: <EvidenceView /> },
                ],
              },
            ],
          },
          {
            path: '/settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="/settings/integrations" replace /> },
              { path: 'integrations', element: <IntegrationsView /> },
              { path: 'ai', element: <AiSettingsView /> },
            ],
          },
          {
            element: <PermissionRoute perm="admin" adminOnly />,
            children: [{ path: '/admin', element: <AdminPage /> }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
