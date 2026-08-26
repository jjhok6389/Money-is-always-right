import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../contexts/AuthContext';
import useFinancialSummary from '../hooks/useFinancialSummary';
import { listReports } from '../services/reportService';

const PROPENSITY_LABELS = {
  stable: '안정형',
  stable_seeking: '안정추구형',
  neutral: '위험중립형',
  aggressive: '적극투자형',
  very_aggressive: '공격투자형',
};

function formatFinancialValue(value, loading, error) {
  if (loading) return '불러오는 중';
  if (error) return '조회 실패';
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

export default function HomePage() {
  const { profile } = useAuth();
  const { financialSummary, loading: financialLoading, error: financialError } = useFinancialSummary();
  const [latestReportId, setLatestReportId] = useState(null);
  const ready =
    Boolean(profile?.onboardingCompleted) &&
    Number(profile?.targetAssetAmount) > 0;

  useEffect(() => {
    let cancelled = false;
    listReports()
      .then((rows) => {
        if (!cancelled && rows?.length) setLatestReportId(rows[0].reportId);
      })
      .catch(() => {
        if (!cancelled) setLatestReportId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.uid]);

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content">
        <section className="hero-panel">
          <p className="eyebrow">AI 금융 코치 리포트</p>
          <h1>
            안녕하세요, {profile?.displayName || '회원'}님
          </h1>
          <p className="lead">
            대시보드 전에, 소득·목표·소비를 스토리로 풀어 로드맵과 시뮬레이션을
            제안합니다. 오른쪽 아래 챗봇으로도 언제든 물어볼 수 있습니다.
          </p>
          <div className="hero-actions">
            {ready && !latestReportId && (
              <Link to="/coach-report" className="btn btn-primary">
                금융 코치 시작하기
              </Link>
            )}
            {ready && latestReportId && (
              <>
                <Link to={`/reports/play/${latestReportId}`} className="btn btn-primary">
                  최신 리포트 다시보기
                </Link>
                <Link to="/coach-report?type=monthly" className="btn btn-ghost">
                  월간 비교 리포트
                </Link>
              </>
            )}
            <Link to="/dashboard" className="btn btn-ghost">
              대시보드 보기
            </Link>
            <Link to="/simulation" className="btn btn-ghost">
              시뮬레이션
            </Link>
          </div>
        </section>

        <section className="profile-summary">
          <h2>내 프로필 요약</h2>
          <p className="muted">소득·지출은 실제 금융기관 연동 전 생성된 월간 Demo 거래 기준입니다.</p>
          <dl className="summary-grid">
            <div>
              <dt>나이 / 직업</dt>
              <dd>
                {profile?.age}세 · {profile?.occupation}
              </dd>
            </div>
            <div>
              <dt>월 소득</dt>
              <dd>{formatFinancialValue(financialSummary?.totalIncome, financialLoading, financialError)}</dd>
            </div>
            <div>
              <dt>고정 생활비</dt>
              <dd>{formatFinancialValue(financialSummary?.fixedLivingExpenses, financialLoading, financialError)}</dd>
            </div>
            <div>
              <dt>월 저축 여력</dt>
              <dd>{formatFinancialValue(financialSummary?.monthlySavingsCapacity, financialLoading, financialError)}</dd>
            </div>
            <div>
              <dt>투자 성향</dt>
              <dd>{PROPENSITY_LABELS[profile?.investmentPropensity] || '-'}</dd>
            </div>
            <div>
              <dt>목표 자산</dt>
              <dd>
                {Number(profile?.targetAssetAmount || 0).toLocaleString('ko-KR')}원
                {profile?.targetYears ? ` / ${profile.targetYears}년` : ''}
              </dd>
            </div>
          </dl>
          <p className="goal-note">
            목표: {profile?.goalDescription || '목표가 아직 없습니다.'}
          </p>
          <Link to="/mypage" className="btn btn-ghost">
            마이페이지
          </Link>
          <Link to="/onboarding" className="btn btn-ghost">
            프로필 수정
          </Link>
        </section>
      </main>
    </div>
  );
}
