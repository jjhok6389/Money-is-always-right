import { useMemo, useState } from 'react';
import {
  applyReturn,
  calculateCashflowMetrics,
  calculatePayDeductionScenario,
  calculateRealValue,
  estimateAnnualFundCost,
  estimateEtfCompanyShock,
  monthsToReachTarget,
  projectMonthlySavings,
  projectSpendingReduction,
  recoveryRateAfterLoss,
  RISK_EXAMPLES,
  SAFETY_SCENARIOS,
} from '../utils/tutorialCalculators';

function formatWon(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

function formatPercent(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

function profileAmount(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatCashflow(value) {
  return value >= 0 ? `${formatWon(value)} 잉여` : `${formatWon(Math.abs(value))} 부족`;
}

function SalaryInteraction({ onComplete }) {
  const [gross, setGross] = useState(3000000);
  const [nonTaxable, setNonTaxable] = useState(200000);
  const result = calculatePayDeductionScenario(gross, 11.2, nonTaxable);

  const change = (event) => {
    setGross(Number(event.target.value));
    onComplete();
  };

  return (
    <div className="tutorial-interaction">
      <label className="tutorial-range-label">
        교육용 월 총지급액 <strong>{formatWon(gross)}</strong>
        <input type="range" min="1000000" max="6000000" step="100000" value={gross} onChange={change} />
      </label>
      <label className="tutorial-range-label">
        요건을 충족한 비과세 항목 합계 가정 <strong>{formatWon(nonTaxable)}</strong>
        <input type="range" min="0" max="300000" step="50000" value={nonTaxable} onChange={(event) => { setNonTaxable(Number(event.target.value)); onComplete(); }} />
      </label>
      <dl className="tutorial-result-rows">
        <div><dt>교육용 과세 대상 급여 가정</dt><dd>{formatWon(result.taxable)}</dd></div>
        <div><dt>보험료·세금 일괄 공제 시나리오</dt><dd>- {formatWon(result.deductions)}</dd></div>
        <div><dt>총지급액 대비 시나리오 공제 비율</dt><dd>{formatPercent(result.scenarioDeductionRate)}</dd></div>
        <div className="is-highlight"><dt>교육용 가정에 따른 잔여 급여</dt><dd>{formatWon(result.net)}</dd></div>
      </dl>
      <p className="tutorial-data-note">과세 대상 급여 가정에 일괄 비율 {result.assumedDeductionRate}%를 적용한 비교 시나리오이며 실제 실수령액 계산기가 아닙니다. 소득세와 각 사회보험료는 서로 다른 기준·요율·상하한을 사용합니다.</p>
    </div>
  );
}

function CashflowInteraction({ financialSummary, onComplete }) {
  const income = profileAmount(financialSummary?.totalIncome, 3000000);
  const fixed = profileAmount(financialSummary?.fixedLivingExpenses, 1500000);
  const initialVariable = profileAmount(financialSummary?.variableExpenses, 800000);
  const [variable, setVariable] = useState(initialVariable);
  const [reduction, setReduction] = useState(Math.min(50000, initialVariable));
  const metrics = calculateCashflowMetrics(income, fixed, variable, reduction);
  const actualReduction = variable - metrics.adjustedVariable;
  const projections = projectSpendingReduction(actualReduction);
  const maxVariable = Math.max(Math.ceil((income * 1.5) / 10000) * 10000, 1000000);

  const change = (event) => {
    setReduction(Number(event.target.value));
    onComplete();
  };

  const changeVariable = (event) => {
    const nextVariable = Number(event.target.value);
    setVariable(nextVariable);
    setReduction((current) => Math.min(current, nextVariable));
    onComplete();
  };

  return (
    <div className="tutorial-interaction">
      <div className="tutorial-context-line">
        <span>월 가용소득 가정 {formatWon(income)}</span>
        <span>고정 지출 {formatWon(fixed)}</span>
      </div>
      <label className="tutorial-range-label">
        월 변동지출 직접 입력 <strong>{formatWon(variable)}</strong>
        <input type="range" min="0" max={maxVariable} step="10000" value={variable} onChange={changeVariable} />
      </label>
      <label className="tutorial-range-label">
        매월 줄여볼 변동비 <strong>{formatWon(reduction)}</strong>
        <input type="range" min="0" max={variable} step="10000" value={reduction} disabled={variable === 0} onChange={change} />
      </label>
      <div className="tutorial-projection-grid">
        {projections.map((item) => (
          <div key={item.years}><span>{item.years}년</span><strong>{formatWon(item.amount)}</strong></div>
        ))}
      </div>
      <dl className="tutorial-result-rows">
        <div><dt>가용소득 대비 고정비 비중</dt><dd>{formatPercent(metrics.fixedExpenseRate)}</dd></div>
        <div className={metrics.currentBalance < 0 ? 'is-risk' : ''}><dt>현재 월 현금흐름</dt><dd>{formatCashflow(metrics.currentBalance)}</dd></div>
        <div className={metrics.adjustedBalance < 0 ? 'is-risk' : 'is-highlight'}><dt>조정 후 월 현금흐름</dt><dd>{formatCashflow(metrics.adjustedBalance)}</dd></div>
        <div><dt>조정 후 잉여·부족 비율</dt><dd>{formatPercent(metrics.adjustedBalanceRate)}</dd></div>
      </dl>
      <p className="tutorial-data-note">소득·고정 생활비·변동 소비의 초기값은 같은 달에 생성된 Demo 금융 거래 기준입니다. 사용자가 변동 소비를 직접 조정할 수 있고 음수인 월 부족액도 그대로 표시합니다. 장기 절감액은 이자 없이 단순 합산했습니다.</p>
    </div>
  );
}

function SavingsInteraction({ onComplete }) {
  const [monthly, setMonthly] = useState(200000);
  const [runwayMonths, setRunwayMonths] = useState(6);
  const [essentialExpenses, setEssentialExpenses] = useState(1500000);
  const [currentEmergencyFund, setCurrentEmergencyFund] = useState(0);
  const emergencyTarget = essentialExpenses * runwayMonths;
  const emergencyShortfall = Math.max(emergencyTarget - currentEmergencyFund, 0);
  const targetMonths = monthsToReachTarget(emergencyTarget, monthly, 3.5, currentEmergencyFund);
  const nominalFiveYears = projectMonthlySavings(monthly, 5);
  const realFiveYears = calculateRealValue(nominalFiveYears, 5, 2);

  const change = (event) => {
    setMonthly(Number(event.target.value));
    onComplete();
  };

  return (
    <div className="tutorial-interaction">
      <label className="tutorial-range-label">
        매월 저축액 <strong>{formatWon(monthly)}</strong>
        <input type="range" min="0" max="1000000" step="50000" value={monthly} onChange={change} />
      </label>
      <label className="tutorial-range-label">
        월 최소 필수생활비 <strong>{formatWon(essentialExpenses)}</strong>
        <input type="range" min="0" max="4000000" step="100000" value={essentialExpenses} onChange={(event) => { setEssentialExpenses(Number(event.target.value)); onComplete(); }} />
      </label>
      <label className="tutorial-range-label">
        현재 즉시 사용 가능한 비상자금 <strong>{formatWon(currentEmergencyFund)}</strong>
        <input type="range" min="0" max="30000000" step="500000" value={currentEmergencyFund} onChange={(event) => { setCurrentEmergencyFund(Number(event.target.value)); onComplete(); }} />
      </label>
      <div>
        <p className="tutorial-prompt">필수지출을 몇 개월 버틸 비상자금을 만들까요?</p>
        <div className="tutorial-choice-row">
          {[3, 6].map((months) => (
            <button type="button" key={months} className={`tutorial-choice${runwayMonths === months ? ' is-selected' : ''}`} onClick={() => { setRunwayMonths(months); onComplete(); }}>
              <span>{months}개월분</span>
              <strong>{formatWon(essentialExpenses * months)}</strong>
            </button>
          ))}
        </div>
      </div>
      <dl className="tutorial-result-rows">
        <div><dt>비상자금 목표</dt><dd>{formatWon(emergencyTarget)}</dd></div>
        <div><dt>현재 부족액</dt><dd>{formatWon(emergencyShortfall)}</dd></div>
        <div className="is-highlight"><dt>목표 도달 예상</dt><dd>{targetMonths === 0 ? '이미 목표 충족' : targetMonths ? `약 ${targetMonths}개월` : '계산 불가'}</dd></div>
        <div><dt>월 저축 5년 후 명목금액</dt><dd>{formatWon(nominalFiveYears)}</dd></div>
        <div><dt>연 2% 물가 기준 현재 구매력</dt><dd>{formatWon(realFiveYears)}</dd></div>
      </dl>
      <p className="tutorial-data-note">프로필에는 최소 필수생활비가 별도 저장되지 않아 월 150만원 예시에서 시작하며 직접 조정해야 합니다. 연 3.5% 명목금리·월복리·매월 말 납입과 연 2% 물가상승률을 고정 가정한 세전 예시입니다. 3~6개월은 참고 범위이며 직업 안정성·부양가족·보험에 따라 달라집니다. 비상자금은 수익률보다 유동성이 우선입니다.</p>
    </div>
  );
}

function RiskInteraction({ onComplete }) {
  const [selected, setSelected] = useState(null);
  const principal = 1000000;
  const choice = RISK_EXAMPLES.find((item) => item.id === selected);
  const recoveryRate = choice ? recoveryRateAfterLoss(choice.downside) : null;

  return (
    <div className="tutorial-interaction">
      <p className="tutorial-prompt">100만원을 운용할 때 상승·하락 폭이 다른 시나리오를 비교해보세요.</p>
      <div className="tutorial-choice-row">
        {RISK_EXAMPLES.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`tutorial-choice${selected === item.id ? ' is-selected' : ''}`}
            onClick={() => { setSelected(item.id); onComplete(); }}
          >
            <span>{item.label}</span>
            <strong>상승 시나리오 +{item.upside}%</strong>
          </button>
        ))}
      </div>
      {choice && (
        <dl className="tutorial-result-rows" aria-live="polite">
          <div><dt>상승 시 평가금액</dt><dd>{formatWon(applyReturn(principal, choice.upside))}</dd></div>
          <div className="is-risk"><dt>하락 시 평가금액</dt><dd>{formatWon(applyReturn(principal, choice.downside))}</dd></div>
          <div><dt>손실 후 원금 회복에 필요한 수익률</dt><dd>{recoveryRate === null ? '전액 손실 시 동일 잔액에서 회복 불가' : `+${formatPercent(recoveryRate)}`}</dd></div>
        </dl>
      )}
      <p className="tutorial-data-note">상승·하락 폭을 비교하기 위한 고정 시나리오입니다. 발생확률을 반영한 기대수익률이나 특정 상품의 실제 변동성을 추정한 값이 아닙니다.</p>
    </div>
  );
}

function DiversificationInteraction({ onComplete }) {
  const [shock, setShock] = useState(null);
  const [expenseRatio, setExpenseRatio] = useState(0.25);
  const principal = 1000000;
  const etfCompanyWeight = 8;
  const rows = useMemo(() => [
    { id: 'single', label: '한 종목 집중', after: shock ? applyReturn(principal, -30) : principal },
    { id: 'diversified', label: `해당 종목 비중 ${etfCompanyWeight}% ETF`, after: shock ? estimateEtfCompanyShock(principal, etfCompanyWeight, 30) : principal },
  ], [shock]);

  return (
    <div className="tutorial-interaction">
      <p className="tutorial-prompt">ETF 편입기업 한 곳의 가격이 30% 하락하는 상황을 집중투자와 ETF에 각각 적용해보세요.</p>
      <button type="button" className="btn btn-primary" onClick={() => { setShock(true); onComplete(); }}>
        개별 기업 충격 적용
      </button>
      <div className="tutorial-comparison-bars" aria-live="polite">
        {rows.map((row) => (
          <div key={row.id}>
            <span>{row.label}</span>
            <div className="tutorial-comparison-track">
              <span style={{ width: `${(row.after / principal) * 100}%` }} />
            </div>
            <strong>{formatWon(row.after)}</strong>
          </div>
        ))}
      </div>
      <label className="tutorial-range-label">
        ETF 총보수 가정 <strong>{formatPercent(expenseRatio, 2)}</strong>
        <input type="range" min="0.05" max="1" step="0.05" value={expenseRatio} onChange={(event) => setExpenseRatio(Number(event.target.value))} />
      </label>
      <dl className="tutorial-result-rows">
        <div><dt>평균 보유금액 1,000만원 가정 시 연간 총보수</dt><dd>{formatWon(estimateAnnualFundCost(10000000, expenseRatio))}</dd></div>
      </dl>
      <p className="tutorial-data-note">기업 충격 계산은 다른 종목 가격이 그대로라는 단순 가정입니다. 총보수는 평균 순자산이 1년간 유지된다고 본 추정치로 실제 비용은 잔액 변화·기타비용·매매비용에 따라 달라지며 펀드 자산에서 차감됩니다.</p>
    </div>
  );
}

function SafetyInteraction({ onComplete }) {
  const [answers, setAnswers] = useState({});

  const choose = (scenario, choice) => {
    setAnswers((current) => {
      const next = { ...current, [scenario.id]: choice };
      if (Object.keys(next).length === SAFETY_SCENARIOS.length) onComplete();
      return next;
    });
  };

  return (
    <div className="tutorial-interaction tutorial-safety-list">
      {SAFETY_SCENARIOS.map((scenario) => {
        const answer = answers[scenario.id];
        const correct = answer != null && answer === scenario.isRisk;
        return (
          <article key={scenario.id}>
            <p>{scenario.text}</p>
            <div className="tutorial-choice-row">
              <button type="button" className={answer === true ? 'tutorial-choice is-selected' : 'tutorial-choice'} onClick={() => choose(scenario, true)}>위험 신호</button>
              <button type="button" className={answer === false ? 'tutorial-choice is-selected' : 'tutorial-choice'} onClick={() => choose(scenario, false)}>안전한 대응</button>
            </div>
            {answer != null && <small className={correct ? 'is-correct' : 'is-wrong'}>{correct ? '정확해요. ' : '다시 살펴보세요. '}{scenario.feedback}</small>}
          </article>
        );
      })}
    </div>
  );
}

export default function TutorialInteraction({ chapterId, financialSummary, onComplete }) {
  if (chapterId === 'salary') return <SalaryInteraction onComplete={onComplete} />;
  if (chapterId === 'cashflow') return <CashflowInteraction financialSummary={financialSummary} onComplete={onComplete} />;
  if (chapterId === 'savings') return <SavingsInteraction onComplete={onComplete} />;
  if (chapterId === 'investment-risk') return <RiskInteraction onComplete={onComplete} />;
  if (chapterId === 'etf-diversification') return <DiversificationInteraction onComplete={onComplete} />;
  return <SafetyInteraction onComplete={onComplete} />;
}
