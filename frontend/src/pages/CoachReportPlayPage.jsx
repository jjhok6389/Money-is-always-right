import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import CoachReportPlayer from '../components/CoachReportPlayer';
import { useAuth } from '../contexts/AuthContext';
import { getReport } from '../services/reportService';

export default function CoachReportPlayPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="page-shell report-shell">
      <AppHeader />
      <main className="page-content page-content-report">
        {loading && (
          <section className="report-loading">
            <p className="eyebrow">금융 코치</p>
            <h1>{profile?.displayName || '회원'}님의 금융 이야기를 정리하고 있어요</h1>
            <p className="lead">저장된 리포트를 불러오는 중입니다.</p>
            <div className="report-loading-pulse" aria-hidden />
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
        {!loading && !error && report && <CoachReportPlayer report={report} />}
      </main>
    </div>
  );
}
