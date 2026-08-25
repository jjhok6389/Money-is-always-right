import { Navigate, Route, Routes } from 'react-router-dom';
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
  return (
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
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
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
  );
}
