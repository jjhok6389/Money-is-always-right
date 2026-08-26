import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import TutorialProgressPanel from '../components/TutorialProgressPanel';
import { useAuth } from '../contexts/AuthContext';
import useFinancialSummary from '../hooks/useFinancialSummary';
import { saveUserProfile } from '../services/userService';

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
  const { user, profile, refreshProfile } = useAuth();
  const { financialSummary, loading: financialLoading, error: financialError } = useFinancialSummary();
  const [currentAssets, setCurrentAssets] = useState('');
  const [debtBalance, setDebtBalance] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;
    setCurrentAssets(
      profile.currentAssets != null && profile.currentAssets !== '' ? String(profile.currentAssets) : '',
    );
    setDebtBalance(
      profile.debtBalance != null && profile.debtBalance !== '' ? String(profile.debtBalance) : '',
    );
  }, [profile]);

  const onSaveBalances = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      // updatedAt은 saveUserProfile이 serverTimestamp로 기록하므로 제외한다.
      const { updatedAt: _ignored, ...profileRest } = profile || {};
      await saveUserProfile(user.uid, {
        ...profileRest,
        currentAssets: currentAssets === '' ? null : Number(currentAssets),
        debtBalance: Number(debtBalance) || 0,
        createdAt: profile?.createdAt || new Date().toISOString(),
      });
      await refreshProfile();
      setMessage('저장했습니다. 대시보드에 바로 반영됩니다.');
    } catch (err) {
      setError(err.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
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
          <h2>자산 · 부채</h2>
          <p className="muted">
            대시보드의 포트폴리오·목표 달성률·부채 상환 계산에 사용됩니다. 현재 자산을 비우면
            저축 여력 기반으로 자동 추정합니다.
          </p>
          <form onSubmit={onSaveBalances} className="form-stack">
            <label>
              현재 자산 (원, 선택)
              <input
                type="number"
                min="0"
                step="100000"
                value={currentAssets}
                onChange={(event) => setCurrentAssets(event.target.value)}
                placeholder="비우면 자동 추정"
              />
            </label>
            <label>
              부채 잔액 (원)
              <input
                type="number"
                min="0"
                step="100000"
                value={debtBalance}
                onChange={(event) => setDebtBalance(event.target.value)}
                placeholder="0"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '저장 중...' : '자산·부채 저장'}
              </button>
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
          </form>
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
