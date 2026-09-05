import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ requireOnboarding = false }) {
  const { user, profile, loading, isOnboarded } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">세션을 확인하는 중...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireOnboarding && !isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  const isFirstReportRoute =
    new URLSearchParams(location.search).get('onboarding') === '1' &&
    (location.pathname === '/coach-report' || location.pathname.startsWith('/reports/play/'));

  if (
    requireOnboarding &&
    isOnboarded &&
    profile?.firstReportCompleted === false &&
    !isFirstReportRoute
  ) {
    return <Navigate to="/coach-report?onboarding=1" replace />;
  }

  return <Outlet />;
}
