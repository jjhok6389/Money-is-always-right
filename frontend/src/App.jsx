import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './contexts/AuthContext';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import ProductsPage from './pages/ProductsPage';
import CoachReportPlayPage from './pages/CoachReportPlayPage';
import CoachReportStartPage from './pages/CoachReportStartPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import MyPage from './pages/MyPage';
import SignupPage from './pages/SignupPage';
import SimulationPage from './pages/SimulationPage';
import TransactionsPage from './pages/TransactionsPage';

function AppFooter() {
  return (
    <footer className="app-footer">
      <p>Copyright © 2026 | All Rights Reserved</p>
      <a
        className="footer-github"
        href="https://github.com/jjhok6389/Money-is-always-right"
        target="_blank"
        rel="noreferrer"
        aria-label="GitHub 원본 저장소 열기"
        title="GitHub 원본 저장소"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
          <path d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.3.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 12 .7Z" />
        </svg>
      </a>
    </footer>
  );
}

function PublicOnly({ children }) {
  const { user, loading, isOnboarded } = useAuth();

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">불러오는 중...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to={isOnboarded ? '/' : '/onboarding'} replace />;
  }

  return children;
}

export default function App() {
  const location = useLocation();
  const isPublicAuth = ['/login', '/signup', '/forgot-password'].includes(location.pathname);

  return (
    <div className={`app-layout${isPublicAuth ? ' public-auth-layout' : ''}`}>
      <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <SignupPage />
          </PublicOnly>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnly>
            <ForgotPasswordPage />
          </PublicOnly>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
      </Route>

      <Route element={<ProtectedRoute requireOnboarding />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/simulation" element={<SimulationPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/coach-report" element={<CoachReportStartPage />} />
        <Route path="/reports/play/:reportId" element={<CoachReportPlayPage />} />
      </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppFooter />
    </div>
  );
}
