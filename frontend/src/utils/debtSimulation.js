/**
 * Debt amortization aligned with backend debt_simulation.py / roadmap policy.
 * Monthly savings budget repays highest-rate loans first; remainder invests.
 */

const roundWon = (value) => Math.round(Number(value) || 0);

export function scheduledPayment(loan, monthlyCapacity) {
  const payment = Number(loan.monthlyPayment);
  if (payment > 0) return roundWon(payment);
  return Math.max(roundWon(monthlyCapacity * 0.3), 1);
}

export function loanStatesFromHoldings(loans = []) {
  return (loans || [])
    .filter((loan) => Number(loan.balance) > 0)
    .map((loan) => ({
      balance: roundWon(loan.balance),
      interestRate: Number(loan.interestRate) || 0,
      monthlyPayment: loan.monthlyPayment != null ? roundWon(loan.monthlyPayment) : null,
      institution: loan.institution || '',
      loanName: loan.loanName || '',
    }));
}

export function cloneLoanStates(states) {
  return states.map((state) => ({ ...state }));
}

export function totalDebtBalance(states) {
  return states.reduce((sum, state) => sum + Math.max(roundWon(state.balance), 0), 0);
}

export function applyMonthlyDebtPayments(states, budget, monthlyCapacity) {
  let remainingBudget = Math.max(roundWon(budget), 0);
  let totalPaid = 0;
  const ordered = [...states].sort((a, b) => b.interestRate - a.interestRate);
  ordered.forEach((state) => {
    if (state.balance <= 0 || remainingBudget <= 0) return;
    const interest = roundWon(state.balance * state.interestRate / 100 / 12);
    const due = Math.min(state.balance + interest, scheduledPayment(state, monthlyCapacity));
    const payment = Math.min(due, remainingBudget);
    if (payment <= 0) return;
    const interestPaid = Math.min(interest, payment);
    const principalPaid = payment - interestPaid;
    state.balance = Math.max(0, state.balance - principalPaid);
    remainingBudget -= payment;
    totalPaid += payment;
  });
  return { totalPaid, remainingBalance: totalDebtBalance(states) };
}

export function summarizeLoans(loans, monthlyCapacity) {
  const states = loanStatesFromHoldings(loans);
  const totalBalance = totalDebtBalance(states);
  const monthlyObligation = states.reduce(
    (sum, loan) => sum + scheduledPayment(loan, monthlyCapacity),
    0,
  );
  return {
    states,
    totalBalance,
    monthlyObligation,
    count: states.length,
  };
}

export function investableAfterDebt(monthlyBudget, loans, monthlyCapacity) {
  const states = cloneLoanStates(loanStatesFromHoldings(loans));
  if (!states.length) {
    return { investable: Math.max(roundWon(monthlyBudget), 0), debtPaid: 0, debtBalance: 0 };
  }
  const { totalPaid, remainingBalance } = applyMonthlyDebtPayments(
    states,
    monthlyBudget,
    monthlyCapacity,
  );
  return {
    investable: Math.max(roundWon(monthlyBudget) - totalPaid, 0),
    debtPaid: totalPaid,
    debtBalance: remainingBalance,
  };
}
