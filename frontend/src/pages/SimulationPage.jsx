import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import TrajectoryChart from '../components/TrajectoryChart';
import { useAuth } from '../contexts/AuthContext';
import useFinancialSummary from '../hooks/useFinancialSummary';
import { runSimulationFromProfile } from '../services/simulationService';

function defaultScenarioFromFinancialData(profile, financialSummary) {
  const income = Number(financialSummary?.totalIncome) || 0;
  const expenses = Number(financialSummary?.totalExpenses) || 0;
  const estimated = Number(financialSummary?.monthlySavingsCapacity) || 0;
  const surplus = Math.max(income - expenses, 0);
  const savingsRate = surplus > 0 ? Math.min(100, Math.round((estimated / surplus) * 1000) / 10) : 0;

  return {
    monthlyIncome: income,
    monthlyExpenses: expenses,
    savingsRate,
    annualInterestRate: 3.5,
    horizonMonths: Math.max((Number(profile?.targetYears) || 5) * 12, 12),
  };
}

export default function SimulationPage() {
  const { profile } = useAuth();
  const { financialSummary, loading: financialLoading, error: financialError } = useFinancialSummary();
  const baselineDefaults = useMemo(
    () => defaultScenarioFromFinancialData(profile, financialSummary),
    [profile, financialSummary],
  );
  const [scenario, setScenario] = useState(baselineDefaults);
  const [currentAssets, setCurrentAssets] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const projectedMonthlyDeposit = useMemo(() => {
    const surplus = Math.max(Number(scenario.monthlyIncome) - Number(scenario.monthlyExpenses), 0);
    return Math.round(surplus * (Number(scenario.savingsRate) / 100));
  }, [scenario]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setScenario((prev) => ({ ...prev, [name]: value === '' ? '' : Number(value) }));
  };

  const resetToBaseline = () => {
    setScenario(defaultScenarioFromFinancialData(profile, financialSummary));
  };

  const run = async (scenarioInput = scenario) => {
    if (!profile) {
      setError('온보딩 프로필이 필요합니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        profile: {
          targetAssetAmount: Number(profile.targetAssetAmount) || 0,
          targetYears: Number(profile.targetYears) || 5,
        },
        scenario: {
          monthlyIncome: Number(scenarioInput.monthlyIncome) || 0,
          monthlyExpenses: Number(scenarioInput.monthlyExpenses) || 0,
          savingsRate: Number(scenarioInput.savingsRate) || 0,
          annualInterestRate: Number(scenarioInput.annualInterestRate) || 0,
          horizonMonths: Number(scenarioInput.horizonMonths) || 60,
        },
        label: '맞춤 시나리오',
      };
      if (currentAssets !== '') {
        payload.currentAssets = Number(currentAssets);
      }
      const data = await runSimulationFromProfile(payload);
      setResult(data);
    } catch (err) {
      setError(err.message || '시뮬레이션에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && financialSummary) {
      const defaults = defaultScenarioFromFinancialData(profile, financialSummary);
      setScenario(defaults);
      run(defaults);
    }
    // Initial run once profile is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.targetAssetAmount, financialSummary?.month]);

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content page-content-xl">
        <section className="hero-panel">
          <p className="eyebrow">Phase 4 · 디지털 트윈</p>
          <h1>미래 자산 시뮬레이션</h1>
          <p className="lead">
            소득·지출·저축률·금리를 바꿔 보고, 기본 로드맵과 변경 시나리오의 자산
            궤적을 비교하세요.
          </p>
          <p className="muted">기본값은 생성된 월간 Demo 금융 데이터 기준입니다.</p>
        </section>

        <section className="sim-controls">
          <label>
            월 소득 (원)
            <input
              type="number"
              name="monthlyIncome"
              min="0"
              step="50000"
              value={scenario.monthlyIncome}
              onChange={onChange}
            />
          </label>
          <label>
            월 지출 (원)
            <input
              type="number"
              name="monthlyExpenses"
              min="0"
              step="50000"
              value={scenario.monthlyExpenses}
              onChange={onChange}
            />
          </label>
          <label>
            저축률 ({scenario.savingsRate}%)
            <input
              type="range"
              name="savingsRate"
              min="0"
              max="100"
              step="1"
              value={scenario.savingsRate}
              onChange={onChange}
            />
          </label>
          <label>
            연 예상 금리 ({scenario.annualInterestRate}%)
            <input
              type="range"
              name="annualInterestRate"
              min="0"
              max="15"
              step="0.1"
              value={scenario.annualInterestRate}
              onChange={onChange}
            />
          </label>
          <label>
            시뮬레이션 기간 (개월)
            <input
              type="number"
              name="horizonMonths"
              min="6"
              max="480"
              step="6"
              value={scenario.horizonMonths}
              onChange={onChange}
            />
          </label>
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
        </section>

        <div className="info-box sim-deposit">
          시나리오 예상 월 적립액:{' '}
          <strong>{projectedMonthlyDeposit.toLocaleString('ko-KR')}원</strong>
          <span className="muted"> (소득 − 지출) × 저축률</span>
        </div>

        <div className="toolbar">
          <button type="button" className="btn btn-ghost" onClick={resetToBaseline}>
            기본값으로 되돌리기
          </button>
          <button type="button" className="btn btn-primary" onClick={() => run()} disabled={loading || financialLoading}>
            {loading ? '계산 중...' : '시뮬레이션 실행'}
          </button>
        </div>

        {financialLoading && <p className="muted">Demo 금융 데이터를 불러오는 중...</p>}
        {(error || financialError) && <p className="alert alert-error" role="alert">{error || financialError}</p>}

        {result && (
          <>
            <section className="stat-row">
              <article>
                <h3>기본 월 적립</h3>
                <p>{Number(result.baselineSummary.monthlyDeposit).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>시나리오 월 적립</h3>
                <p>{Number(result.scenarioSummary.monthlyDeposit).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>종료 시점 차이</h3>
                <p>
                  {Number(result.scenarioSummary.surplusVsBaseline).toLocaleString('ko-KR')}원
                </p>
              </article>
              <article>
                <h3>시나리오 목표 도달</h3>
                <p className="stat-date">
                  {result.scenarioSummary.targetHitLabel || '기간 내 미도달'}
                </p>
              </article>
            </section>

            <section className="panel chart-panel">
              <h2>자산 궤적 비교</h2>
              <p className="muted">파란선은 기본 로드맵, 초록선은 변경 시나리오, 주황 점선은 목표 자산입니다.</p>
              <TrajectoryChart data={result.trajectory} />
            </section>

            <section className="panel">
              <h2>인사이트</h2>
              <ul className="insight-list">
                {result.insights.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
