import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { LoadingScreen } from '../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../components/primitives/ErrorState.jsx';

export function ProtectedRoute() {
  const { token, status, retrySession } = useAuth();
  const location = useLocation();
  if (token && status === 'checking') return <LoadingScreen />;
  if (token && status === 'error') return <ErrorState variant="fullscreen" message="Unable to verify your session. Please retry." onRetry={retrySession} />;
  return token ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
