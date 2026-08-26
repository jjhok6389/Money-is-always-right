import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import TutorialProgressPanel from '../components/TutorialProgressPanel';
import { useAuth } from '../contexts/AuthContext';
import useFinancialSummary from '../hooks/useFinancialSummary';

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

export default function MyPage() {
  const { user, profile } = useAuth();
  const { financialSummary, loading: financialLoading, error: financialError } = useFinancialSummary();

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content">
        <section className="hero-panel">
          <p className="eyebrow">마이페이지</p>
          <h1>{profile?.displayName || user?.displayName || '회원'}님</h1>
          <p className="lead">프로필과 목표를 확인하고 필요할 때 수정할 수 있습니다.</p>
          <div className="hero-actions">
            <Link to="/onboarding" className="btn btn-primary">
              프로필 수정
            </Link>
            <Link to="/reports" className="btn btn-ghost">
              리포트 보관함
            </Link>
          </div>
        </section>

        <TutorialProgressPanel detailed />

        <section className="profile-summary">
          <h2>내 프로필</h2>
          <p className="muted">소득·지출은 실제 금융기관 연동 전 생성된 월간 Demo 거래 기준입니다.</p>
          <dl className="summary-grid">
            <div>
              <dt>이메일</dt>
              <dd>{user?.email || profile?.email || '-'}</dd>
            </div>
            <div>
              <dt>나이 / 직업</dt>
              <dd>
                {profile?.age ? `${profile.age}세` : '-'} · {profile?.occupation || '-'}
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
            <div>
              <dt>월간 리포트일</dt>
              <dd>
                {profile?.monthlyReportDay
                  ? `매월 ${profile.monthlyReportDay}일`
                  : '미설정'}
              </dd>
            </div>
          </dl>
          <p className="goal-note">목표: {profile?.goalDescription || '목표가 아직 없습니다.'}</p>
          <p className="muted mypage-hint">
            기본 정보·투자 성향·목표는 「프로필 수정」에서 변경할 수 있습니다. 소득·지출은 Demo 거래에서 자동 생성됩니다.
          </p>
        </section>
      </main>
    </div>
  );
}
