export function calculatePayDeductionScenario(grossMonthlyPay, deductionRate = 11.2, nonTaxablePay = 200000) {
  const gross = Math.max(Number(grossMonthlyPay) || 0, 0);
  const rate = Math.min(Math.max(Number(deductionRate) || 0, 0), 100);
  const nonTaxable = Math.min(Math.max(Number(nonTaxablePay) || 0, 0), gross);
  const taxable = gross - nonTaxable;
  const deductions = Math.round(taxable * (rate / 100));
  const net = gross - deductions;
  const effectiveDeductionRate = gross ? (deductions / gross) * 100 : 0;
  return {
    gross,
    taxable,
    nonTaxable,
    deductions,
    net,
    assumedDeductionRate: rate,
    scenarioDeductionRate: effectiveDeductionRate,
  };
}

export function calculateCashflowMetrics(monthlyIncome, fixedExpenses, variableExpenses, monthlyReduction = 0) {
  const income = Math.max(Number(monthlyIncome) || 0, 0);
  const fixed = Math.max(Number(fixedExpenses) || 0, 0);
  const variable = Math.max(Number(variableExpenses) || 0, 0);
  const reduction = Math.max(Number(monthlyReduction) || 0, 0);
  const adjustedVariable = Math.max(variable - reduction, 0);
  const currentBalance = income - fixed - variable;
  const adjustedBalance = income - fixed - adjustedVariable;
  const percent = (value) => (income ? (value / income) * 100 : 0);
  return {
    income,
    fixed,
    variable,
    adjustedVariable,
    currentBalance,
    adjustedBalance,
    fixedExpenseRate: percent(fixed),
    currentBalanceRate: percent(currentBalance),
    adjustedBalanceRate: percent(adjustedBalance),
  };
}

export function projectSpendingReduction(monthlyReduction) {
  const monthly = Math.max(Number(monthlyReduction) || 0, 0);
  return [1, 3, 5].map((years) => ({
    years,
    amount: monthly * 12 * years,
  }));
}

export function projectMonthlySavings(monthlyDeposit, years, annualRate = 3.5) {
  const deposit = Math.max(Number(monthlyDeposit) || 0, 0);
  const months = Math.max(Math.round((Number(years) || 0) * 12), 0);
  const monthlyRate = Math.max(Number(annualRate) || 0, 0) / 100 / 12;
  let balance = 0;
  for (let month = 0; month < months; month += 1) {
    balance = balance * (1 + monthlyRate) + deposit;
  }
  return Math.round(balance);
}

export function calculateRealValue(nominalAmount, years, annualInflationRate = 2) {
  const nominal = Math.max(Number(nominalAmount) || 0, 0);
  const period = Math.max(Number(years) || 0, 0);
  const inflation = Math.max(Number(annualInflationRate) || 0, 0) / 100;
  return Math.round(nominal / ((1 + inflation) ** period));
}

export function monthsToReachTarget(targetAmount, monthlyDeposit, annualRate = 3.5, initialBalance = 0) {
  const target = Math.max(Number(targetAmount) || 0, 0);
  const deposit = Math.max(Number(monthlyDeposit) || 0, 0);
  const initial = Math.max(Number(initialBalance) || 0, 0);
  if (initial >= target || target === 0) return 0;
  const monthlyRate = Math.max(Number(annualRate) || 0, 0) / 100 / 12;
  if (deposit === 0 && (initial === 0 || monthlyRate === 0)) return null;
  let balance = initial;
  for (let month = 1; month <= 1200; month += 1) {
    balance = balance * (1 + monthlyRate) + deposit;
    if (balance >= target) return month;
  }
  return null;
}

export const RISK_EXAMPLES = [
  { id: 'low', label: '좁은 변동폭 가정', upside: 3, downside: -2, color: '#6b8f86' },
  { id: 'medium', label: '중간 변동폭 가정', upside: 7, downside: -10, color: '#0f766e' },
  { id: 'high', label: '넓은 변동폭 가정', upside: 14, downside: -28, color: '#b45f45' },
];

export function applyReturn(principal, percent) {
  return Math.round(Math.max(Number(principal) || 0, 0) * (1 + Number(percent) / 100));
}

export function recoveryRateAfterLoss(lossPercent) {
  const rawLoss = Math.max(Math.abs(Number(lossPercent) || 0), 0);
  if (rawLoss >= 100) return null;
  const loss = rawLoss / 100;
  return loss ? (loss / (1 - loss)) * 100 : 0;
}

export function estimateEtfCompanyShock(principal, companyWeightPercent, companyLossPercent) {
  const amount = Math.max(Number(principal) || 0, 0);
  const weight = Math.min(Math.max(Number(companyWeightPercent) || 0, 0), 100) / 100;
  const loss = Math.min(Math.max(Math.abs(Number(companyLossPercent) || 0), 0), 100) / 100;
  return Math.round(amount * (1 - weight * loss));
}

export function estimateAnnualFundCost(principal, expenseRatioPercent) {
  const amount = Math.max(Number(principal) || 0, 0);
  const ratio = Math.max(Number(expenseRatioPercent) || 0, 0) / 100;
  return Math.round(amount * ratio);
}

export const SAFETY_SCENARIOS = [
  {
    id: 'changed-invoice',
    text: '평소 거래하던 업체와 비슷한 이메일 주소에서 계좌가 바뀌었다며 새 계좌로 입금을 요청합니다.',
    isRisk: true,
    feedback: '이메일 계정 탈취나 유사 도메인을 이용한 송금 사기일 수 있습니다. 기존에 알고 있던 공식 번호로 담당자에게 재확인해야 합니다.',
  },
  {
    id: 'verified-disclosure',
    text: '투자 제안을 받은 뒤 송금하지 않고, 금융감독원 파인에서 제도권 금융회사 여부를 확인하고 투자 대상 회사의 공시는 DART에서 직접 조회합니다.',
    isRisk: false,
    feedback: '공식 채널을 직접 찾는 것은 필요한 1차 확인입니다. 다만 등록이나 공시가 있다는 사실만으로 투자 안전성·수익성 또는 정부 보증이 확인되는 것은 아닙니다.',
  },
  {
    id: 'remote-control-loan',
    text: '대출 금리를 낮춰주겠다며 휴대전화 원격제어 앱 설치와 공동인증서 비밀번호 입력을 요구합니다.',
    isRisk: true,
    feedback: '원격제어 앱은 금융정보 탈취와 임의 송금에 악용될 수 있습니다. 설치하지 말고 해당 금융회사 공식 번호로 확인해야 합니다.',
  },
];
