import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ requireOnboarding = false }) {
  const { user, loading, isOnboarded } = useAuth();

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

  return <Outlet />;
}
