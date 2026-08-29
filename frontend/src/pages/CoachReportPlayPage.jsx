import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import CoachReportPlayer from '../components/CoachReportPlayer';
import { useAuth } from '../contexts/AuthContext';
import { getReport } from '../services/reportService';
import { saveUserProfile } from '../services/userService';

export default function CoachReportPlayPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');
  const isFirstReportOnboarding =
    searchParams.get('onboarding') === '1' && profile?.firstReportCompleted === false;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!reportId) {
        navigate('/reports', { replace: true });
        return;
      }
      setLoading(true);
      setError('');
      try {
        const data = await getReport(reportId);
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || '리포트를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [reportId, navigate]);

  const startDashboard = async () => {
    if (!isFirstReportOnboarding) {
      navigate('/dashboard');
      return;
    }

    setFinishing(true);
    setFinishError('');
    try {
      await saveUserProfile(user.uid, {
        email: profile?.email || user.email,
        displayName: profile?.displayName || user.displayName || '회원',
        age: Number(profile?.age),
        occupation: profile?.occupation,
        investmentPropensity: profile?.investmentPropensity || 'neutral',
        targetAssetAmount: Number(profile?.targetAssetAmount),
        targetYears: Number(profile?.targetYears),
        goalDescription: profile?.goalDescription,
        onboardingCompleted: true,
        financialDataLinked: profile?.financialDataLinked ?? true,
        ...(profile?.financialDataLinkedAt != null
          ? { financialDataLinkedAt: profile.financialDataLinkedAt }
          : {}),
        ...(profile?.financialDataSource != null
          ? { financialDataSource: profile.financialDataSource }
          : {}),
        firstReportCompleted: true,
        ...(typeof profile?.createdAt === 'string' ? { createdAt: profile.createdAt } : {}),
      });
      await refreshProfile();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFinishError(err.message || '첫 리포트 완료 상태를 저장하지 못했습니다.');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="page-shell report-shell">
      {!isFirstReportOnboarding && <AppHeader />}
      <main className="page-content page-content-report">
        {loading && (
          <section className="report-loading" role="status" aria-live="polite">
            <p className="eyebrow">금융 코치</p>
            <h1>{profile?.displayName || '회원'}님의 금융 이야기를 정리하고 있어요</h1>
            <p className="lead">저장된 리포트를 불러오는 중입니다.</p>
            <div className="report-loading-spinner" aria-hidden="true" />
          </section>
        )}
        {!loading && error && (
          <section className="hero-panel">
            <p className="alert alert-error">{error}</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/reports')}>
              리포트 목록으로
            </button>
          </section>
        )}
        {!loading && !error && report && (
          <>
            {finishError && <p className="alert alert-error" role="alert">{finishError}</p>}
            <CoachReportPlayer
              report={report}
              onDashboardStart={isFirstReportOnboarding ? startDashboard : undefined}
              dashboardStartPending={finishing}
            />
          </>
        )}
      </main>
    </div>
  );
}
