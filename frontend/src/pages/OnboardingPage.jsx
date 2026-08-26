import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => initialForm(profile, user));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep = () => {
    if (step === 1) {
      if (!form.displayName.trim() || !form.age || !form.occupation.trim()) {
        return '개인 정보를 모두 입력해 주세요.';
      }
      if (Number(form.age) < 18 || Number(form.age) > 100) {
        return '나이는 18세 이상이어야 합니다.';
      }
    }

    if (step === 2) {
      if (!form.investmentPropensity) {
        return '투자 성향을 선택해 주세요.';
      }
      if (!form.targetAssetAmount || !form.targetYears || !form.goalDescription.trim()) {
        return '목표 자산 정보를 모두 입력해 주세요.';
      }
    }

    return '';
  };

  const goNext = () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep((prev) => Math.min(prev + 1, 2));
  };

  const goPrev = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    // 첫 단계에서 Enter / 다음 버튼 연속 클릭으로 submit 되는 것 방지
    if (step !== 2) {
      goNext();
      return;
    }

    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await saveUserProfile(user.uid, {
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
      });
      await refreshProfile();
      navigate('/');
    } catch (err) {
      setError(err.message || '프로필 저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <AppHeader />
      <main className="auth-card auth-card-wide">
        <p className="step-label">온보딩 {step} / 2</p>
        <h1>맞춤 자산 프로필 설정</h1>
        <p className="muted">기본 정보와 목표는 맞춤 추천에, 소득·지출은 생성된 Demo 금융 데이터에 기반해 사용됩니다.</p>

        <div className="stepper" aria-hidden="true">
          <span className={step >= 1 ? 'active' : ''} />
          <span className={step >= 2 ? 'active' : ''} />
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

          {error && <p className="alert alert-error" role="alert">{error}</p>}

          <div className="form-actions">
            {step > 1 ? (
              <button type="button" className="btn btn-ghost" onClick={goPrev}>
                이전
              </button>
            ) : (
              <span />
            )}

            {step < 2 ? (
              <button type="button" className="btn btn-primary" onClick={goNext}>
                다음
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={onSubmit}
              >
                {submitting ? '저장 중...' : '프로필 저장하고 시작하기'}
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
