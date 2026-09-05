import assert from 'node:assert/strict';
import test from 'node:test';
import { ALLOCATION_PRESETS, simulatePortfolio } from './portfolioSimulator.js';

const days = (values) => values.map(([date, close]) => ({ date, close }));

const base = {
  startDate: '2024-01-01',
  endDate: '2024-03-01',
  startingAssets: 0,
  targetAssetAmount: 250,
  monthlyInvestable: 100,
  etfRatio: 0,
  savingOption: { saveTermMonths: 2, interestRate: 0 },
  depositOption: { saveTermMonths: 12, interestRate: 0 },
  prices: days([
    ['2024-01-02', 100],
    ['2024-02-01', 100],
    ['2024-03-01', 100],
  ]),
  dividends: [],
  source: 'yfinance',
};

test('성향별 저축·ETF 비중의 합은 100이다', () => {
  Object.values(ALLOCATION_PRESETS).forEach(({ savings, etf }) => assert.equal(savings + etf, 100));
});

test('과거 월별 가격으로 같은 잔여자금을 투자하고 첫 목표 도달일을 찾는다', () => {
  const result = simulatePortfolio({ ...base, etfRatio: 100 });

  assert.equal(result.startDate, '2024-01-02');
  assert.equal(result.endDate, '2024-03-01');
  assert.equal(result.etfShares, 3);
  assert.equal(result.totalPrincipal, 300);
  assert.equal(result.totalAssets, 300);
  assert.equal(result.targetMet, true);
  assert.equal(result.firstCrossingDate, '2024-03-01');
  assert.equal(result.goalDifference, 50);
  assert.deepEqual(result.trajectory.map(({ date, totalAssets }) => [date, totalAssets]), [
    ['2024-01-02', 100],
    ['2024-02-01', 200],
    ['2024-03-01', 300],
  ]);
});

test('ETF 매수 잔액은 적금으로 보내지 않고 다음 달 매수에 이월한다', () => {
  const result = simulatePortfolio({
    ...base,
    etfRatio: 40,
    savingOption: { saveTermMonths: 12, interestRate: 0 },
    prices: days([
      ['2024-01-31', 70],
      ['2024-02-29', 70],
      ['2024-03-29', 70],
    ]),
  });

  assert.equal(result.etfShares, 1);
  assert.equal(result.etfExternalInvested, 70);
  assert.equal(result.etfCashRemainder, 50);
  assert.equal(result.etfAllocatedPrincipal, 120);
  assert.equal(result.etfBalance, 120);
  assert.equal(result.etfTotalReturn, 0);
  assert.equal(result.etfReturnRate, 0);
  assert.equal(result.savingPrincipal, 180);
  result.trajectory.forEach((point) => {
    assert.equal(point.etfBalance, point.etfValue + point.etfCashRemainder);
    assert.equal(point.targetAssetAmount, 250);
  });
  assert.equal(result.trajectory.at(-1).etfBalance, 120);
  assert.equal(result.trajectory.at(-1).savingBalance, 180);
  assert.equal(result.totalAssets, 300);
});

test('가격이 없는 달의 ETF 배정액도 전용 현금으로 보존한다', () => {
  const result = simulatePortfolio({
    ...base,
    endDate: '2024-02-29',
    etfRatio: 50,
    savingOption: { saveTermMonths: 12, interestRate: 0 },
    prices: days([['2024-02-29', 80]]),
  });

  assert.equal(result.etfShares, 1);
  assert.equal(result.etfCashRemainder, 20);
  assert.equal(result.savingPrincipal, 100);
  assert.equal(result.dividendsReceived, 0);
  assert.equal(result.totalAssets, 200);
});

test('실제 배당 이벤트만 현금으로 반영하고 가격 차이와 구분한다', () => {
  const result = simulatePortfolio({
    ...base,
    etfRatio: 100,
    prices: days([
      ['2024-01-02', 100],
      ['2024-02-01', 110],
      ['2024-03-01', 120],
    ]),
    dividends: [{ date: '2024-02-01', amount: 5 }],
  });

  assert.equal(result.etfShares, 2);
  assert.equal(result.etfExternalInvested, 220);
  assert.equal(result.etfCashRemainder, 80);
  assert.equal(result.dividendsReceived, 5);
  assert.equal(result.dividendCash, 5);
  assert.equal(result.etfValue, 240);
  assert.equal(result.etfProfitLoss, 20);
  assert.equal(result.etfAllocatedPrincipal, 300);
  assert.equal(result.etfTotalReturn, 25);
  assert.equal(result.etfReturnRate, 8.33);
});

test('적금 만기 시 잔액을 0으로 기록하고 예금으로 옮긴다', () => {
  const result = simulatePortfolio(base);

  assert.equal(result.trajectory[0].savingBalance, 100);
  assert.equal(result.trajectory[1].savingMaturity, true);
  assert.equal(result.trajectory[1].savingBalance, 0);
  assert.equal(result.trajectory[1].depositBalance, 200);
  assert.equal(result.trajectory[2].savingBalance, 100);
  assert.equal(result.totalAssets, 300);
});

test('월별 ETF 가격은 해당 월 마지막 거래일 종가를 사용한다', () => {
  const result = simulatePortfolio({
    ...base,
    etfRatio: 100,
    prices: days([
      ['2024-01-02', 100],
      ['2024-01-31', 95],
      ['2024-02-15', 90],
      ['2024-02-29', 85],
      ['2024-03-01', 80],
    ]),
  });

  assert.equal(result.trajectory[0].date, '2024-01-31');
  assert.equal(result.trajectory[1].date, '2024-02-29');
  assert.equal(result.trajectory[2].date, '2024-03-01');
  assert.equal(result.trajectory[0].etfValue, 95);
  assert.equal(result.trajectory[1].etfValue, 170);
});

test('복리 이자는 잔액에 한 번만 반영한다', () => {
  const result = simulatePortfolio({
    ...base,
    startingAssets: 100,
    monthlyInvestable: 0,
    depositOption: { saveTermMonths: 12, interestRate: 12, interestType: '복리' },
  });

  assert.equal(result.depositBalance, 103);
  assert.equal(result.depositInterest, 3);
  assert.equal(result.totalAssets, 103);
});

test('ETF가 없으면 빈 가격 배열이어도 시작월부터 종료월까지 매월 납입한다', () => {
  const result = simulatePortfolio({ ...base, prices: [] });

  assert.equal(result.totalPrincipal, 300);
  assert.equal(result.etfAllocatedPrincipal, 0);
  assert.equal(result.etfTotalReturn, 0);
  assert.equal(result.etfReturnRate, null);
  assert.deepEqual(result.trajectory.map(({ date }) => date), [
    '2024-01-01',
    '2024-02-01',
    '2024-03-01',
  ]);
});

test('저장된 ETF 시세가 늦게 시작해도 요청 시작월부터 전체 궤적을 만든다', () => {
  const result = simulatePortfolio({
    ...base,
    startDate: '2024-01-01',
    endDate: '2024-04-30',
    etfRatio: 100,
    prices: days([
      ['2024-03-29', 100],
      ['2024-04-30', 100],
    ]),
  });

  assert.deepEqual(result.trajectory.map(({ date, label }) => [date, label]), [
    ['2024-01-01', '2024-01'],
    ['2024-02-01', '2024-02'],
    ['2024-03-29', '2024-03'],
    ['2024-04-30', '2024-04'],
  ]);
  assert.deepEqual(result.trajectory.map(({ etfCashRemainder }) => etfCashRemainder), [100, 200, 0, 0]);
  assert.equal(result.totalPrincipal, 400);
  assert.equal(result.etfShares, 4);
  assert.equal(result.etfCashRemainder, 0);
  assert.equal(result.depositBalance, 0);
});

test('시작 자산이 이미 목표 이상이면 요청 시작일을 첫 도달일로 사용한다', () => {
  const result = simulatePortfolio({ ...base, startingAssets: 300, monthlyInvestable: 0 });

  assert.equal(result.firstCrossingDate, '2024-01-01');
});

test('시작 자산은 첫 날짜부터 포함하고 목표 미달액을 음수 차이로 표현한다', () => {
  const result = simulatePortfolio({ ...base, startingAssets: 40, targetAssetAmount: 500 });

  assert.equal(result.totalPrincipal, 340);
  assert.equal(result.totalAssets, 340);
  assert.equal(result.targetMet, false);
  assert.equal(result.firstCrossingDate, null);
  assert.equal(result.goalDifference, -160);
});

test('부채가 있으면 월 예산을 상환에 우선 사용하고 잔액을 줄인다', () => {
  const result = simulatePortfolio({
    ...base,
    monthlyInvestable: 100,
    monthlyCapacity: 500,
    loans: [{
      balance: 200,
      interestRate: 12,
      monthlyPayment: 80,
    }],
  });

  assert.ok(result.monthlyDebtPayment > 0);
  assert.ok(result.monthlyInvestableAfterDebt < result.monthlyInvestable);
  assert.ok(result.finalDebtBalance < 200);
  assert.ok(result.totalDebtPaid >= 200);
  assert.ok(result.trajectory.every((point) => point.debtBalance >= 0));
});
