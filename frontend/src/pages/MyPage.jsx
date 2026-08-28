import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import TutorialProgressPanel from '../components/TutorialProgressPanel';
import { useAuth } from '../contexts/AuthContext';
import useFinancialSummary from '../hooks/useFinancialSummary';
import useHoldingsSnapshot from '../hooks/useHoldingsSnapshot';
import { saveUserProfile } from '../services/userService';

const PROPENSITY_LABELS = {
  stable: '안정형',
  stable_seeking: '안정추구형',
  neutral: '위험중립형',
  aggressive: '적극투자형',
  very_aggressive: '공격투자형',
};

const ACCOUNT_TYPE_LABELS = {
  checking: '입출금',
  deposit: '예금',
  saving: '적금',
};

function formatFinancialValue(value, loading, error) {
  if (loading) return '불러오는 중';
  if (error) return '조회 실패';
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

export default function MyPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { financialSummary, loading: financialLoading, error: financialError } = useFinancialSummary();
  const { holdings, loading: holdingsLoading, error: holdingsError } = useHoldingsSnapshot();
  const [tourRestarting, setTourRestarting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const onRestartProductTour = async () => {
    if (tourRestarting || !user) return;
    setTourRestarting(true);
    setMessage('');
    setError('');
    try {
      const { updatedAt: _ignored, ...profileRest } = profile || {};
      await saveUserProfile(user.uid, {
        ...profileRest,
        productTourDismissed: false,
        createdAt: profile?.createdAt || new Date().toISOString(),
      });
      await refreshProfile();
      navigate('/?tour=1');
    } catch (err) {
      setError(err.message || '앱 둘러보기를 다시 시작하지 못했습니다.');
      setTourRestarting(false);
    }
  };

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content">
        <section className="hero-panel">
          <p className="eyebrow">마이페이지</p>
          <h1>{profile?.displayName || user?.displayName || '회원'}님</h1>
          <p className="lead">프로필과 목표를 확인하고 필요할 때 수정할 수 있습니다.</p>
          <div className="hero-actions">
            <Link to="/onboarding?edit=1" className="btn btn-primary">
              프로필 수정
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onRestartProductTour}
              disabled={tourRestarting}
            >
              {tourRestarting ? '준비 중...' : '앱 둘러보기'}
            </button>
            <Link to="/reports" className="btn btn-ghost">
              리포트 보관함
            </Link>
          </div>
          {message && (
            <p className="alert alert-success" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <TutorialProgressPanel detailed />

        <section className="profile-summary">
          <h2>Demo 보유 자산 · 부채</h2>
          <p className="muted">
            뱅크샐러드/마이데이터 연동 전 Demo 보유 원장입니다. 대시보드 Gap·포트폴리오·부채 로드맵에
            자동 반영됩니다.
          </p>
          <p className="source-banner mock">
            {holdings?.source === 'mock' ? 'Demo 보유 원장' : '보유 원장'} · 기준일{' '}
            {holdings?.asOf || '-'}
          </p>
          <dl className="summary-grid">
            <div>
              <dt>총 자산</dt>
              <dd>
                {formatFinancialValue(holdings?.totals?.totalAssets, holdingsLoading, holdingsError)}
              </dd>
            </div>
            <div>
              <dt>총 부채</dt>
              <dd>
                {formatFinancialValue(
                  holdings?.totals?.totalLiabilities,
                  holdingsLoading,
                  holdingsError,
                )}
              </dd>
            </div>
            <div>
              <dt>순자산</dt>
              <dd>
                {formatFinancialValue(holdings?.totals?.netWorth, holdingsLoading, holdingsError)}
              </dd>
            </div>
          </dl>
          {!holdingsLoading && !holdingsError && holdings && (
            <div className="holdings-lists">
              <div>
                <h3>계좌</h3>
                <ul className="holdings-list">
                  {holdings.accounts.map((account) => (
                    <li key={account.id}>
                      <strong>
                        {account.institution} · {account.accountName}
                      </strong>
                      <span>
                        {ACCOUNT_TYPE_LABELS[account.accountType] || account.accountType} ·{' '}
                        {Number(account.balance).toLocaleString('ko-KR')}원
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>투자</h3>
                <ul className="holdings-list">
                  {holdings.investments.map((item) => (
                    <li key={item.id}>
                      <strong>
                        {item.broker} · {item.name}
                      </strong>
                      <span>{Number(item.evalAmount).toLocaleString('ko-KR')}원</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>부채</h3>
                <ul className="holdings-list">
                  {(holdings.loans || []).length === 0 && <li className="muted">등록된 부채 없음</li>}
                  {(holdings.loans || []).map((loan) => (
                    <li key={loan.id}>
                      <strong>
                        {loan.institution} · {loan.loanName}
                      </strong>
                      <span>
                        {Number(loan.balance).toLocaleString('ko-KR')}원 · 연 {loan.interestRate}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>보험</h3>
                <ul className="holdings-list">
                  {holdings.insurances.map((item) => (
                    <li key={item.id}>
                      <strong>
                        {item.insurer} · {item.productName}
                      </strong>
                      <span>
                        월 {Number(item.monthlyPremium).toLocaleString('ko-KR')}원 · 해지환급{' '}
                        {Number(item.surrenderValue || 0).toLocaleString('ko-KR')}원
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

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
              <dd>
                {formatFinancialValue(
                  financialSummary?.fixedLivingExpenses,
                  financialLoading,
                  financialError,
                )}
              </dd>
            </div>
            <div>
              <dt>월 저축 여력</dt>
              <dd>
                {formatFinancialValue(
                  financialSummary?.monthlySavingsCapacity,
                  financialLoading,
                  financialError,
                )}
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
            <div>
              <dt>월간 리포트일</dt>
              <dd>
                {profile?.monthlyReportDay ? `매월 ${profile.monthlyReportDay}일` : '미설정'}
              </dd>
            </div>
          </dl>
          <p className="goal-note">목표: {profile?.goalDescription || '목표가 아직 없습니다.'}</p>
          <p className="muted mypage-hint">
            기본 정보·투자 성향·목표는 「프로필 수정」에서 변경할 수 있습니다.
            <br />
            소득·지출·자산·부채는 Demo 금융 데이터에서 자동 생성됩니다.
          </p>
        </section>
      </main>
    </div>
  );
}
