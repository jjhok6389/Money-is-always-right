/**
 * Start coaching report generation with a loading interstitial, then open the player.
 * Auto-starts once (module lock avoids React StrictMode double invoke).
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../contexts/AuthContext';
import { generateReport } from '../services/reportService';

const inflight = new Map();

function buildProfilePayload(profile) {
  if (!profile) return undefined;
  return {
    displayName: profile.displayName,
    monthlyIncome: Number(profile.monthlyIncome) || 0,
    fixedExpenses: Number(profile.fixedExpenses) || 0,
    estimatedMonthlySavings: Number(profile.estimatedMonthlySavings) || 0,
    investmentPropensity: profile.investmentPropensity || 'neutral',
    targetAssetAmount: Number(profile.targetAssetAmount) || 0,
    targetYears: Number(profile.targetYears) || 1,
    goalDescription: profile.goalDescription || '',
    age: profile.age,
    occupation: profile.occupation,
  };
}

export default function CoachReportStartPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);
  const type = searchParams.get('type') === 'monthly' ? 'monthly' : 'initial';
  const lockKey = `${profile?.uid || 'anon'}:${type}`;

  const runGenerate = async () => {
    setStarting(true);
    setError('');
    try {
      let promise = inflight.get(lockKey);
      if (!promise) {
        promise = generateReport({
          type,
          profile: buildProfilePayload(profile),
        }).finally(() => {
          inflight.delete(lockKey);
        });
        inflight.set(lockKey, promise);
      }
      const data = await promise;
      navigate(`/reports/play/${data.reportId}`, { replace: true });
    } catch (err) {
      setError(err.message || '리포트 생성에 실패했습니다.');
      setStarting(false);
    }
  };

  useEffect(() => {
    runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockKey]);

  return (
    <div className="page-shell report-shell">
      <AppHeader />
      <main className="page-content page-content-report">
        <section className="report-loading">
          <p className="eyebrow">금융 코치</p>
          <h1>
            {starting
              ? `${profile?.displayName || '회원'}님의 금융 이야기를 정리하고 있어요`
              : '보고서를 만들지 못했습니다'}
          </h1>
          <p className="lead">
            {starting
              ? '대시보드 분석과 시뮬레이션을 준비하고 있습니다.'
              : '잠시 후 다시 시도해 주세요.'}
          </p>
          {error && <p className="alert alert-error">{error}</p>}
          {starting && <div className="report-loading-pulse" aria-hidden />}
          {!starting && (
            <div className="hero-actions">
              <button type="button" className="btn btn-primary" onClick={runGenerate}>
                다시 시도
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/reports')}>
                목록으로
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
