import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../contexts/AuthContext';
import { saveUserProfile } from '../services/userService';

const INVESTMENT_TYPES = [
  {
    value: 'stable',
    label: '안정형',
    description: '예·적금 수준의 수익을 기대하며 원금 손실을 원하지 않습니다.',
  },
  {
    value: 'stable_seeking',
    label: '안정추구형',
    description: '원금 손실 위험을 최소화하면서 이자·배당 수준의 안정적인 수익을 목표로 합니다.',
  },
  {
    value: 'neutral',
    label: '위험중립형',
    description: '단기 손실은 제한적으로 감수하고, 자산 일부를 변동성 있는 상품에 투자할 의향이 있습니다.',
  },
  {
    value: 'aggressive',
    label: '적극투자형',
    description: '예·적금보다 높은 수익을 기대할 수 있다면 일정 수준의 손실 위험을 감수합니다.',
  },
  {
    value: 'very_aggressive',
    label: '공격투자형',
    description: '높은 수익을 위해 자산 대부분에서 큰 손실 위험까지 감수할 수 있습니다.',
  },
];

const LINK_STEPS = [
  { id: 'bank', label: '은행 계좌 · 예·적금' },
  { id: 'card', label: '카드 결제 · 소비 내역' },
  { id: 'invest', label: '증권 · 투자 자산' },
  { id: 'loan', label: '대출 · 보험' },
];

const INITIAL_FORM = {
  displayName: '',
  age: '',
  occupation: '',
  investmentPropensity: 'neutral',
  targetAssetAmount: '',
  targetYears: '',
  goalDescription: '',
};

function initialForm(profile, user) {
  return {
    ...INITIAL_FORM,
    displayName: profile?.displayName || user?.displayName || '',
    age: profile?.age?.toString() || '',
    occupation: profile?.occupation || '',
    investmentPropensity: profile?.investmentPropensity || 'neutral',
    targetAssetAmount: profile?.targetAssetAmount?.toString() || '',
    targetYears: profile?.targetYears?.toString() || '',
    goalDescription: profile?.goalDescription || '',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function OnboardingPage() {
  const { user, profile, refreshProfile, isOnboarded, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = searchParams.get('edit') === '1';
  const maxStep = isEdit ? 2 : 3;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => initialForm(profile, user));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [linkPhase, setLinkPhase] = useState('idle'); // idle | linking | done
  const [linkProgress, setLinkProgress] = useState(0);

  // Returning users who landed here due to a login race go to the dashboard.
  // MyPage "프로필 수정" uses /onboarding?edit=1 and stays here.
  useEffect(() => {
    if (!loading && isOnboarded && !isEdit) {
      navigate('/', { replace: true });
    }
  }, [loading, isOnboarded, isEdit, navigate]);

  useEffect(() => {
    if (profile || user) {
      setForm(initialForm(profile, user));
    }
  }, [profile, user]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep = (targetStep = step) => {
    if (targetStep === 1) {
      if (!form.displayName.trim() || !form.age || !form.occupation.trim()) {
        return '개인 정보를 모두 입력해 주세요.';
      }
      if (Number(form.age) < 18 || Number(form.age) > 100) {
        return '나이는 18세 이상이어야 합니다.';
      }
    }

    if (targetStep === 2) {
      if (!form.investmentPropensity) {
        return '투자 성향을 선택해 주세요.';
      }
      if (!form.targetAssetAmount || !form.targetYears || !form.goalDescription.trim()) {
        return '목표 자산 정보를 모두 입력해 주세요.';
      }
    }

    return '';
  };

  const profilePayload = (extra = {}) => ({
    email: user.email,
    displayName: form.displayName.trim(),
    age: Number(form.age),
    occupation: form.occupation.trim(),
    investmentPropensity: form.investmentPropensity,
    targetAssetAmount: Number(form.targetAssetAmount),
    targetYears: Number(form.targetYears),
    goalDescription: form.goalDescription.trim(),
    onboardingCompleted: true,
    createdAt: profile?.createdAt || new Date().toISOString(),
    ...extra,
  });

  const goNext = () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep((prev) => Math.min(prev + 1, maxStep));
  };

  const goPrev = () => {
    if (linkPhase === 'linking') return;
    setError('');
    setLinkPhase('idle');
    setLinkProgress(0);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const saveAndFinish = async (extra = {}) => {
    setSubmitting(true);
    setError('');
    try {
      await saveUserProfile(user.uid, profilePayload(extra));
      await refreshProfile();
      navigate('/');
    } catch (err) {
      setError(err.message || '프로필 저장에 실패했습니다.');
      setLinkPhase('idle');
      setLinkProgress(0);
    } finally {
      setSubmitting(false);
    }
  };

  const onConnectFinancialData = async () => {
    const message = validateStep(2);
    if (message) {
      setError(message);
      setStep(2);
      return;
    }

    setError('');
    setLinkPhase('linking');
    setLinkProgress(0);

    try {
      for (let index = 0; index < LINK_STEPS.length; index += 1) {
        await sleep(550 + index * 120);
        setLinkProgress(index + 1);
      }
      await sleep(400);
      setLinkPhase('done');
      await sleep(700);
      await saveAndFinish({
        financialDataLinked: true,
        financialDataLinkedAt: new Date().toISOString(),
        financialDataSource: 'demo',
      });
    } catch (err) {
      setError(err.message || '연결에 실패했습니다. 다시 시도해 주세요.');
      setLinkPhase('idle');
      setLinkProgress(0);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (step < maxStep) {
      goNext();
      return;
    }

    // Edit mode ends on step 2 with a normal save.
    if (isEdit) {
      const message = validateStep(2);
      if (message) {
        setError(message);
        return;
      }
      await saveAndFinish({
        financialDataLinked: profile?.financialDataLinked ?? false,
        ...(profile?.financialDataLinkedAt != null
          ? { financialDataLinkedAt: profile.financialDataLinkedAt }
          : {}),
        ...(profile?.financialDataSource != null
          ? { financialDataSource: profile.financialDataSource }
          : {}),
      });
    }
  };

  const stepLabel = isEdit ? '프로필 수정' : `온보딩 ${step} / 3`;
  const title =
    isEdit
      ? '프로필 수정'
      : step === 3
        ? '금융 데이터 연결'
        : '맞춤 자산 프로필 설정';
  const lead =
    isEdit
      ? '기본 정보·투자 성향·목표를 업데이트할 수 있습니다.'
      : step === 3
        ? '마이데이터 연동을 시뮬레이션합니다. Demo 보유·거래 데이터가 대시보드에 반영됩니다.'
        : '기본 정보와 목표는 맞춤 추천에, 소득·지출은 생성된 Demo 금융 데이터에 기반해 사용됩니다.';

  return (
    <div className="auth-shell">
      <AppHeader />
      <main className="auth-card auth-card-wide">
        <p className="step-label">{stepLabel}</p>
        <h1>{title}</h1>
        <p className="muted">{lead}</p>

        <div className="stepper" aria-hidden="true">
          <span className={step >= 1 ? 'active' : ''} />
          <span className={step >= 2 ? 'active' : ''} />
          {!isEdit && <span className={step >= 3 ? 'active' : ''} />}
        </div>

        <form onSubmit={onSubmit} className="form-stack">
          {step === 1 && (
            <>
              <h2 className="section-title">기본 정보</h2>
              <label>
                이름
                <input
                  name="displayName"
                  value={form.displayName}
                  onChange={onChange}
                  placeholder="홍길동"
                  required
                />
              </label>
              <label>
                나이
                <input
                  type="number"
                  name="age"
                  min="18"
                  max="100"
                  value={form.age}
                  onChange={onChange}
                  placeholder="28"
                  required
                />
              </label>
              <label>
                직업 / 신분
                <input
                  name="occupation"
                  value={form.occupation}
                  onChange={onChange}
                  placeholder="예: 직장인, 대학원생, 프리랜서"
                  required
                />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="section-title">투자 성향 · 목표 자산</h2>
              <fieldset className="propensity-grid">
                <legend>투자 성향</legend>
                {INVESTMENT_TYPES.map((item) => (
                  <label key={item.value} className="propensity-option">
                    <input
                      type="radio"
                      name="investmentPropensity"
                      value={item.value}
                      checked={form.investmentPropensity === item.value}
                      onChange={onChange}
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label>
                목표 자산 금액 (원)
                <input
                  type="number"
                  name="targetAssetAmount"
                  min="0"
                  step="1000000"
                  value={form.targetAssetAmount}
                  onChange={onChange}
                  placeholder="50000000"
                  required
                />
              </label>
              <label>
                목표 달성 기간 (년)
                <input
                  type="number"
                  name="targetYears"
                  min="1"
                  max="40"
                  value={form.targetYears}
                  onChange={onChange}
                  placeholder="5"
                  required
                />
              </label>
              <label>
                목표 설명
                <textarea
                  name="goalDescription"
                  value={form.goalDescription}
                  onChange={onChange}
                  placeholder="예: 내 집 마련 계약금 마련"
                  rows={3}
                  required
                />
              </label>
            </>
          )}

          {step === 3 && !isEdit && (
            <section className="link-finance-panel" aria-live="polite">
              <h2 className="section-title">내 금융데이터와 연결하기</h2>
              <p className="muted">
                은행·카드·증권·보험 정보를 한 번에 불러오는 마이데이터 연결을 체험합니다.
                실제 기관 로그인은 없으며 Demo 데이터로 대시보드가 채워집니다.
              </p>

              <ul className="link-finance-list">
                {LINK_STEPS.map((item, index) => {
                  const done = linkProgress > index;
                  const current = linkPhase === 'linking' && linkProgress === index;
                  return (
                    <li
                      key={item.id}
                      className={`link-finance-item${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
                    >
                      <span className="link-finance-status" aria-hidden="true">
                        {done ? '✓' : current ? '…' : '○'}
                      </span>
                      <span>{item.label}</span>
                    </li>
                  );
                })}
              </ul>

              {linkPhase === 'idle' && (
                <p className="source-banner mock">Demo 연동 · 실제 계좌 비밀번호를 요구하지 않습니다.</p>
              )}
              {linkPhase === 'linking' && (
                <p className="source-banner live">금융기관에서 데이터를 가져오는 중…</p>
              )}
              {linkPhase === 'done' && (
                <p className="source-banner live">연결 완료 · 대시보드로 이동합니다.</p>
              )}
            </section>
          )}

          {error && (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            {step > 1 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={goPrev}
                disabled={linkPhase === 'linking' || submitting}
              >
                이전
              </button>
            ) : (
              <span />
            )}

            {step < maxStep && (
              <button type="button" className="btn btn-primary" onClick={goNext}>
                다음
              </button>
            )}

            {step === maxStep && isEdit && (
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={onSubmit}>
                {submitting ? '저장 중...' : '프로필 저장'}
              </button>
            )}

            {step === 3 && !isEdit && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={linkPhase === 'linking' || submitting || linkPhase === 'done'}
                onClick={onConnectFinancialData}
              >
                {linkPhase === 'linking' || submitting
                  ? '연결 중...'
                  : linkPhase === 'done'
                    ? '완료'
                    : '내 금융데이터와 연결하기'}
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
