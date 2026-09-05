import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import PortfolioSimulationPanel from '../components/PortfolioSimulationPanel';
import TrajectoryChart, { formatWon } from '../components/TrajectoryChart';
import { useAuth } from '../contexts/AuthContext';
import useFinancialSummary from '../hooks/useFinancialSummary';
import useHoldingsSnapshot from '../hooks/useHoldingsSnapshot';
import { summarizeLoans } from '../utils/debtSimulation';
import { runSimulationFromProfile } from '../services/simulationService';

const FUTURE_TAB_ID = 'sim-tab-future';
const PORTFOLIO_TAB_ID = 'sim-tab-portfolio';
const FUTURE_PANEL_ID = 'sim-panel-future';
const PORTFOLIO_PANEL_ID = 'sim-panel-portfolio';

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

function financialFingerprint(summary) {
  if (!summary) return '';
  return [
    summary.month,
    summary.totalIncome,
    summary.totalExpenses,
    summary.monthlySavingsCapacity,
  ].join(':');
}

function FutureSimulationPanel({ onSwitchMode }) {
  const { profile } = useAuth();
  const { financialSummary, loading: financialLoading, error: financialError } = useFinancialSummary();
  const { holdings, loading: holdingsLoading } = useHoldingsSnapshot();
  const baselineDefaults = useMemo(
    () => defaultScenarioFromFinancialData(profile, financialSummary),
    [profile, financialSummary],
  );
  const [scenario, setScenario] = useState(baselineDefaults);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRunFingerprint, setLastRunFingerprint] = useState('');

  const currentFingerprint = useMemo(
    () => financialFingerprint(financialSummary),
    [financialSummary],
  );
  const demoDataStale = Boolean(
    result && currentFingerprint && lastRunFingerprint && currentFingerprint !== lastRunFingerprint,
  );

  const projectedMonthlyDeposit = useMemo(() => {
    const surplus = Math.max(Number(scenario.monthlyIncome) - Number(scenario.monthlyExpenses), 0);
    return Math.round(surplus * (Number(scenario.savingsRate) / 100));
  }, [scenario]);

  const monthlyCapacity = useMemo(() => Math.max(
    Number(scenario.monthlyIncome) - Number(scenario.monthlyExpenses),
    0,
  ), [scenario]);

  const debtSummary = useMemo(
    () => summarizeLoans(holdings?.loans, monthlyCapacity),
    [holdings?.loans, monthlyCapacity],
  );

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
      const data = await runSimulationFromProfile(payload);
      setResult(data);
      setLastRunFingerprint(financialFingerprint(financialSummary));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.targetAssetAmount, financialSummary?.month]);

  return (
    <>
      {demoDataStale && (
        <p className="info-box sim-stale-banner" role="status">
          Demo 금융 데이터가 갱신되었습니다. 입력값을 확인한 뒤 다시 계산해 주세요.
          <button type="button" className="btn btn-ghost" onClick={() => run()}>
            다시 계산
          </button>
        </p>
      )}

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
      </section>

      <div className="info-box sim-deposit">
        시나리오 예상 월 적립액:{' '}
        <strong>{formatWon(projectedMonthlyDeposit)}</strong>
        <span className="muted"> (소득 − 지출) × 저축률 · 시작 자산은 Demo 보유 합산</span>
      </div>

      {debtSummary.count > 0 && (
        <p className="info-box sim-debt-note">
          Demo 부채 {debtSummary.count}건 · 잔액 {formatWon(debtSummary.totalBalance)}.
          월 저축분은 <strong>부채 상환 우선</strong> 후 남는 금액만 자산에 적립됩니다.
        </p>
      )}

      <div className="toolbar">
        <button type="button" className="btn btn-ghost" onClick={resetToBaseline}>
          기본값으로 되돌리기
        </button>
        <button type="button" className="btn btn-primary" onClick={() => run()} disabled={loading || financialLoading}>
          {loading ? '계산 중...' : '시뮬레이션 실행'}
        </button>
      </div>

      {financialLoading && <p className="muted">Demo 금융 데이터를 불러오는 중...</p>}
      {holdingsLoading && <p className="muted">Demo 보유·부채 데이터를 불러오는 중...</p>}
      {(error || financialError) && <p className="alert alert-error" role="alert">{error || financialError}</p>}

      {result && (
        <>
          <section className="stat-row">
            <article>
              <h3>기본 월 적립</h3>
              <p>{formatWon(result.baselineSummary.monthlyDeposit)}</p>
            </article>
            <article>
              <h3>시나리오 월 적립</h3>
              <p>{formatWon(result.scenarioSummary.monthlyDeposit)}</p>
            </article>
            {result.scenarioSummary.monthlyDebtPayment > 0 && (
              <article>
                <h3>월 부채 상환(평균)</h3>
                <p>{formatWon(result.scenarioSummary.monthlyDebtPayment)}</p>
              </article>
            )}
            {result.scenarioSummary.monthlyInvestable > 0 && (
              <article>
                <h3>상환 후 적립</h3>
                <p>{formatWon(result.scenarioSummary.monthlyInvestable)}</p>
              </article>
            )}
            <article>
              <h3>종료 시점 차이</h3>
              <p>{formatWon(result.scenarioSummary.surplusVsBaseline)}</p>
            </article>
            {result.scenarioSummary.finalDebtBalance > 0 && (
              <article>
                <h3>종료 부채 잔액</h3>
                <p>{formatWon(result.scenarioSummary.finalDebtBalance)}</p>
              </article>
            )}
            <article>
              <h3>시나리오 목표 도달</h3>
              <p className="stat-date">
                {result.scenarioSummary.targetHitLabel || '기간 내 미도달'}
              </p>
            </article>
          </section>

          <section className="panel chart-panel">
            <h2>자산 궤적 비교</h2>
            <p className="muted">진한 선은 기본 로드맵, 중간 선은 변경 시나리오입니다.</p>
            <TrajectoryChart
              data={result.trajectory}
              variant="twin"
              targetAmount={Math.max(
                Number(result.trajectory[0]?.targetAssetAmount) || 0,
                Number(profile?.targetAssetAmount) || 0,
              )}
            />
          </section>

          <section className="panel">
            <h2>인사이트</h2>
            <ul className="insight-list">
              {result.insights.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </section>

          <section className="panel sim-cross-cta">
            <p className="muted">과거 시장 데이터로 내 포트폴리오를 되돌려 볼 수도 있어요.</p>
            <button type="button" className="btn btn-ghost" onClick={() => onSwitchMode('portfolio')}>
              과거 포트폴리오로 돌아가기
            </button>
          </section>
        </>
      )}
    </>
  );
}

export default function SimulationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'portfolio' ? 'portfolio' : 'future';

  const setMode = useCallback((nextMode) => {
    setSearchParams({ mode: nextMode }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (searchParams.get('mode') && searchParams.get('mode') !== 'future' && searchParams.get('mode') !== 'portfolio') {
      setSearchParams({ mode: 'future' }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content page-content-xl simulation-page">
        <section className="hero-panel">
          <div className="simulation-hero-header">
            <div>
              <p className="eyebrow">자산 시뮬레이션</p>
              <h1 id="simulation-page-title">{mode === 'future' ? '미래 자산 시뮬레이션' : '과거 포트폴리오 시뮬레이션'}</h1>
              <p className="lead">
                {mode === 'future'
                  ? '소득·지출·저축률·금리를 바꿔 보고, 기본 로드맵과 변경 시나리오의 자산 궤적을 비교하세요.'
                  : '선택한 예금·적금·ETF에 같은 월 잔여자금을 과거부터 투자했다면 지금 얼마였을지 계산합니다.'}
              </p>
              <p className="muted">
                {mode === 'future'
                  ? '기본값은 생성된 월간 Demo 금융 데이터 기준입니다.'
                  : '과거 데이터 기반이며 미래 수익을 예측하지 않습니다.'}
              </p>
              {mode === 'portfolio' && (
                <p className="disclaimer-inline sim-disclaimer">
                  투자 권유 아님 · 과거 데이터 기반. 과거 변동 ≠ 미래 수익.
                </p>
              )}
            </div>
            <div
              className="simulation-mode-tabs"
              role="tablist"
              aria-label="시뮬레이션 유형"
              data-active-mode={mode}
            >
              <button
                type="button"
                role="tab"
                id={FUTURE_TAB_ID}
                aria-controls={FUTURE_PANEL_ID}
                aria-selected={mode === 'future'}
                tabIndex={mode === 'future' ? 0 : -1}
                onClick={() => setMode('future')}
              >
                미래 시나리오
              </button>
              <button
                type="button"
                role="tab"
                id={PORTFOLIO_TAB_ID}
                aria-controls={PORTFOLIO_PANEL_ID}
                aria-selected={mode === 'portfolio'}
                tabIndex={mode === 'portfolio' ? 0 : -1}
                onClick={() => setMode('portfolio')}
              >
                과거 포트폴리오
              </button>
            </div>
          </div>
        </section>

        <div
          id={FUTURE_PANEL_ID}
          role="tabpanel"
          aria-labelledby={FUTURE_TAB_ID}
          hidden={mode !== 'future'}
        >
          {mode === 'future' && <FutureSimulationPanel onSwitchMode={setMode} />}
        </div>
        <div
          id={PORTFOLIO_PANEL_ID}
          role="tabpanel"
          aria-labelledby={PORTFOLIO_TAB_ID}
          hidden={mode !== 'portfolio'}
        >
          {mode === 'portfolio' && <PortfolioSimulationPanel onSwitchMode={setMode} />}
        </div>
      </main>
    </div>
  );
}
