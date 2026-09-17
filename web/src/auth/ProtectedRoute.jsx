import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth.js';

export function ProtectedRoute() {
  const { token } = useAuth();
  const location = useLocation();
  return token ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
