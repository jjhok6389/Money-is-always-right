import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../contexts/AuthContext';

const PROPENSITY_LABELS = {
  stable: '안정형',
  stable_seeking: '안정추구형',
  neutral: '위험중립형',
  aggressive: '적극투자형',
  very_aggressive: '공격투자형',
};

export default function HomePage() {
  const { profile } = useAuth();

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content">
        <section className="hero-panel">
          <p className="eyebrow">Phase 5 · AI 금융 코치</p>
          <h1>
            안녕하세요, {profile?.displayName || '회원'}님
          </h1>
          <p className="lead">
            오른쪽 아래 AI 코치에게 상품 비교, 가입 적합성, 로드맵 실행을 한국어로
            물어보세요. AWS Bedrock이 없으면 로컬 안내 모드로 동작합니다.
          </p>
          <div className="hero-actions">
            <Link to="/simulation" className="btn btn-primary">
              시뮬레이션 시작
            </Link>
            <Link to="/dashboard" className="btn btn-ghost">
              대시보드 보기
            </Link>
            <Link to="/products" className="btn btn-ghost">
              예·적금·연금 보기
            </Link>
          </div>
        </section>

        <section className="profile-summary">
          <h2>내 프로필 요약</h2>
          <dl className="summary-grid">
            <div>
              <dt>나이 / 직업</dt>
              <dd>
                {profile?.age}세 · {profile?.occupation}
              </dd>
            </div>
            <div>
              <dt>월 소득</dt>
              <dd>{Number(profile?.monthlyIncome || 0).toLocaleString('ko-KR')}원</dd>
            </div>
            <div>
              <dt>고정 지출</dt>
              <dd>{Number(profile?.fixedExpenses || 0).toLocaleString('ko-KR')}원</dd>
            </div>
            <div>
              <dt>예상 월 저축</dt>
              <dd>
                {Number(profile?.estimatedMonthlySavings || 0).toLocaleString('ko-KR')}원
              </dd>
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
          <Link to="/onboarding" className="btn btn-ghost">
            프로필 수정
          </Link>
        </section>
      </main>
    </div>
  );
}
