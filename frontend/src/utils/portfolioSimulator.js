import {
  applyMonthlyDebtPayments,
  cloneLoanStates,
  loanStatesFromHoldings,
} from './debtSimulation.js';

export const ALLOCATION_PRESETS = Object.freeze({
  stable: { savings: 100, etf: 0 },
  stable_seeking: { savings: 80, etf: 20 },
  neutral: { savings: 60, etf: 40 },
  aggressive: { savings: 30, etf: 70 },
  very_aggressive: { savings: 10, etf: 90 },
});

const roundWon = (value) => Math.round(Number(value) || 0);
const roundRate = (value) => Math.round((Number(value) || 0) * 100) / 100;
const rate = (option) => Math.max(Number(option?.interestRate ?? option?.maxInterestRate) || 0, 0) / 100;
const term = (option) => Math.max(Math.round(Number(option?.saveTermMonths) || 12), 1);
const compound = (option) => /복리|compound/i.test(String(option?.interestType || ''));
const monthKey = (date) => String(date).slice(0, 7);

function monthlyCloseByMonth(prices, startDate, endDate) {
  const lastByMonth = new Map();
  prices.forEach((point) => {
    lastByMonth.set(monthKey(point.date), point);
  });

  const monthlyPrices = [];
  let [year, month] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const hit = lastByMonth.get(key);
    monthlyPrices.push(hit || {
      date: monthlyPrices.length ? `${key}-01` : startDate,
      close: null,
    });
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return monthlyPrices;
}

export function simulatePortfolio(input) {
  const etfRatio = Math.min(Math.max(Number(input.etfRatio) || 0, 0), 100);
  const prices = (input.prices || [])
    .filter((point) => point.date >= input.startDate && (!input.endDate || point.date <= input.endDate))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!prices.length && etfRatio > 0) throw new Error('조회 기간의 ETF 가격이 없습니다.');

  const monthlyPrices = monthlyCloseByMonth(prices, input.startDate, input.endDate);

  const monthlyInvestable = Math.max(Number(input.monthlyInvestable) || 0, 0);
  const monthlyCapacity = Math.max(Number(input.monthlyCapacity) || monthlyInvestable, 0);
  const startingAssets = Math.max(Number(input.startingAssets) || 0, 0);
  const target = Math.max(Number(input.targetAssetAmount) || 0, 0);
  const savingRate = rate(input.savingOption);
  const depositRate = rate(input.depositOption);
  const savingCompound = compound(input.savingOption);
  const depositCompound = compound(input.depositOption);
  const savingTerm = term(input.savingOption);
  const depositTerm = term(input.depositOption);
  const dividends = (input.dividends || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const depositTranches = startingAssets ? [{ balance: startingAssets, principal: startingAssets, age: 0 }] : [];
  const loanStates = cloneLoanStates(loanStatesFromHoldings(input.loans));

  let savingBalance = 0;
  let savingPrincipal = 0;
  let savingSimpleInterest = 0;
  let savingInterest = 0;
  let savingAge = 0;
  let depositInterest = 0;
  let etfShares = 0;
  let etfExternalInvested = 0;
  let etfCashRemainder = 0;
  let dividendCash = 0;
  let dividendsReceived = 0;
  let lastEtfPrice = 0;
  let firstCrossingDate = startingAssets >= target && target > 0 ? input.startDate : null;
  let firstDebtFreeDate = loanStates.length ? null : input.startDate;
  let totalDebtPaid = 0;
  let totalInvested = 0;
  const trajectory = [];

  monthlyPrices.forEach((point) => {
    const { totalPaid, remainingBalance } = applyMonthlyDebtPayments(
      loanStates,
      monthlyInvestable,
      monthlyCapacity,
    );
    const monthBudget = Math.max(monthlyInvestable - totalPaid, 0);
    totalDebtPaid += totalPaid;
    totalInvested += monthBudget;
    if (!firstDebtFreeDate && remainingBalance <= 0 && loanStates.length) {
      firstDebtFreeDate = point.date;
    }

    if (savingCompound) savingBalance *= 1 + savingRate / 12;
    depositTranches.forEach((tranche) => {
      if (depositCompound) tranche.balance *= 1 + depositRate / 12;
      tranche.age += 1;
      if (tranche.age >= depositTerm) {
        const earned = depositCompound
          ? tranche.balance - tranche.principal
          : tranche.principal * depositRate * tranche.age / 12;
        depositInterest += earned;
        tranche.balance += depositCompound ? 0 : earned;
        tranche.principal = tranche.balance;
        tranche.age = 0;
      }
    });

    if (point.close) lastEtfPrice = Number(point.close);
    const distribution = dividends
      .filter((item) => monthKey(item.date) === monthKey(point.date))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const received = etfShares * distribution;
    dividendsReceived += received;
    dividendCash += received;

    etfCashRemainder += monthBudget * etfRatio / 100;
    const shares = point.close ? Math.floor(etfCashRemainder / point.close) : 0;
    const spent = shares * (point.close || 0);
    etfCashRemainder -= spent;
    etfShares += shares;
    etfExternalInvested += spent;

    savingSimpleInterest += savingPrincipal * savingRate / 12;
    const savingDeposit = monthBudget * (100 - etfRatio) / 100;
    savingBalance += savingDeposit;
    savingPrincipal += savingDeposit;
    savingAge += 1;

    let savingMaturity = false;
    if (savingAge >= savingTerm) {
      const earned = savingCompound ? savingBalance - savingPrincipal : savingSimpleInterest;
      savingInterest += earned;
      const maturity = savingBalance + (savingCompound ? 0 : savingSimpleInterest);
      depositTranches.push({ balance: maturity, principal: maturity, age: 0 });
      savingBalance = 0;
      savingPrincipal = 0;
      savingSimpleInterest = 0;
      savingAge = 0;
      savingMaturity = true;
    }

    const openSavingInterest = savingCompound ? savingBalance - savingPrincipal : savingSimpleInterest;
    const depositBalance = depositTranches.reduce((sum, tranche) => sum + tranche.balance + (
      depositCompound ? 0 : tranche.principal * depositRate * tranche.age / 12
    ), 0);
    const etfValue = etfShares * lastEtfPrice;
    const etfBalance = etfValue + etfCashRemainder;
    const totalAssets = savingBalance + openSavingInterest + depositBalance + etfBalance + dividendCash;
    const debtBalance = remainingBalance;
    const netWorth = totalAssets - debtBalance;
    if (!firstCrossingDate && target > 0 && totalAssets >= target) firstCrossingDate = point.date;
    trajectory.push({
      date: point.date,
      label: point.date.slice(0, 7),
      totalAssets: roundWon(totalAssets),
      debtBalance: roundWon(debtBalance),
      netWorth: roundWon(netWorth),
      debtPaid: roundWon(totalPaid),
      savingBalance: roundWon(savingBalance + openSavingInterest),
      depositBalance: roundWon(depositBalance),
      etfValue: roundWon(etfValue),
      etfBalance: roundWon(etfBalance),
      etfCashRemainder: roundWon(etfCashRemainder),
      targetAssetAmount: target,
      savingMaturity,
    });
  });

  const last = trajectory.at(-1);
  const totalPrincipal = startingAssets + totalInvested;
  const savingOpenInterest = savingCompound ? savingBalance - savingPrincipal : savingSimpleInterest;
  const depositOpenInterest = depositTranches.reduce((sum, tranche) => sum + (
    depositCompound ? tranche.balance - tranche.principal : tranche.principal * depositRate * tranche.age / 12
  ), 0);
  const targetMet = last.totalAssets >= target;
  const etfAllocatedPrincipal = etfExternalInvested + etfCashRemainder;
  const etfProfitLoss = last.etfValue - etfExternalInvested;
  const etfTotalReturn = etfProfitLoss + dividendCash;
  const finalDebtBalance = last.debtBalance;
  const avgDebtPayment = monthlyPrices.length
    ? roundWon(totalDebtPaid / monthlyPrices.length)
    : 0;

  return {
    startDate: monthlyPrices[0].date,
    endDate: monthlyPrices.at(-1).date,
    source: input.source,
    monthlyInvestable: roundWon(monthlyInvestable),
    monthlyInvestableAfterDebt: roundWon(
      Math.max(monthlyInvestable - avgDebtPayment, 0),
    ),
    monthlyDebtPayment: avgDebtPayment,
    finalDebtBalance,
    firstDebtFreeDate,
    totalDebtPaid: roundWon(totalDebtPaid),
    totalPrincipal: roundWon(totalPrincipal),
    totalAssets: last.totalAssets,
    netWorth: last.netWorth,
    targetMet,
    firstCrossingDate,
    goalDifference: roundWon(last.totalAssets - target),
    savingPrincipal: roundWon(savingPrincipal),
    savingBalance: last.savingBalance,
    savingInterest: roundWon(savingInterest + savingOpenInterest),
    depositBalance: last.depositBalance,
    depositInterest: roundWon(depositInterest + depositOpenInterest),
    etfShares,
    etfExternalInvested: roundWon(etfExternalInvested),
    etfCashRemainder: roundWon(etfCashRemainder),
    etfAllocatedPrincipal: roundWon(etfAllocatedPrincipal),
    etfValue: last.etfValue,
    etfBalance: last.etfBalance,
    etfProfitLoss: roundWon(etfProfitLoss),
    etfTotalReturn: roundWon(etfTotalReturn),
    etfReturnRate: etfAllocatedPrincipal > 0
      ? roundRate(etfTotalReturn / etfAllocatedPrincipal * 100)
      : null,
    dividendsReceived: roundWon(dividendsReceived),
    dividendCash: roundWon(dividendCash),
    trajectory,
  };
}
