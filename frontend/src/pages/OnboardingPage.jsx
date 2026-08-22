import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../contexts/AuthContext';
import { saveUserProfile } from '../services/userService';

const INVESTMENT_TYPES = [
  {
    value: 'stable',
    label: '안정형',
    description: '원금 보존을 우선하며 낮은 변동성을 선호합니다.',
  },
  {
    value: 'neutral',
    label: '중립형',
    description: '수익과 안정성의 균형을 추구합니다.',
  },
  {
    value: 'aggressive',
    label: '적극형',
    description: '높은 수익을 위해 변동성을 감수합니다.',
  },
];

const INITIAL_FORM = {
  displayName: '',
  age: '',
  occupation: '',
  monthlyIncome: '',
  fixedExpenses: '',
  investmentPropensity: 'neutral',
  targetAssetAmount: '',
  targetYears: '',
  goalDescription: '',
};

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile && !user) return;
    setForm((prev) => ({
      ...prev,
      displayName: profile?.displayName || user?.displayName || '',
      age: profile?.age?.toString() || '',
      occupation: profile?.occupation || '',
      monthlyIncome: profile?.monthlyIncome?.toString() || '',
      fixedExpenses: profile?.fixedExpenses?.toString() || '',
      investmentPropensity: profile?.investmentPropensity || 'neutral',
      targetAssetAmount: profile?.targetAssetAmount?.toString() || '',
      targetYears: profile?.targetYears?.toString() || '',
      goalDescription: profile?.goalDescription || '',
    }));
  }, [profile, user]);

  const savingsCapacity = useMemo(() => {
    const income = Number(form.monthlyIncome) || 0;
    const expenses = Number(form.fixedExpenses) || 0;
    return Math.max(income - expenses, 0);
  }, [form.monthlyIncome, form.fixedExpenses]);

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
      if (!form.monthlyIncome || !form.fixedExpenses) {
        return '월 소득과 고정 지출을 입력해 주세요.';
      }
      if (Number(form.fixedExpenses) > Number(form.monthlyIncome)) {
        return '고정 지출이 월 소득보다 클 수 없습니다.';
      }
    }

    if (step === 3) {
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
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const goPrev = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
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
        monthlyIncome: Number(form.monthlyIncome),
        fixedExpenses: Number(form.fixedExpenses),
        estimatedMonthlySavings: savingsCapacity,
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
        <p className="step-label">온보딩 {step} / 3</p>
        <h1>맞춤 자산 프로필 설정</h1>
        <p className="muted">입력하신 정보는 추천과 로드맵 생성에 사용됩니다.</p>

        <div className="stepper" aria-hidden="true">
          <span className={step >= 1 ? 'active' : ''} />
          <span className={step >= 2 ? 'active' : ''} />
          <span className={step >= 3 ? 'active' : ''} />
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
              <h2 className="section-title">소득 · 지출</h2>
              <label>
                월 소득 (원)
                <input
                  type="number"
                  name="monthlyIncome"
                  min="0"
                  step="10000"
                  value={form.monthlyIncome}
                  onChange={onChange}
                  placeholder="3000000"
                  required
                />
              </label>
              <label>
                월 고정 지출 (원)
                <input
                  type="number"
                  name="fixedExpenses"
                  min="0"
                  step="10000"
                  value={form.fixedExpenses}
                  onChange={onChange}
                  placeholder="1500000"
                  required
                />
              </label>
              <div className="info-box">
                예상 월 저축 여력:{' '}
                <strong>{savingsCapacity.toLocaleString('ko-KR')}원</strong>
              </div>
            </>
          )}

          {step === 3 && (
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

            {step < 3 ? (
              <button type="button" className="btn btn-primary" onClick={goNext}>
                다음
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? '저장 중...' : '프로필 저장하고 시작하기'}
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
