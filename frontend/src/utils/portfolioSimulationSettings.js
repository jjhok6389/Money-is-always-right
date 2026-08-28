import { ALLOCATION_PRESETS } from './portfolioSimulator';

export const PORTFOLIO_SESSION_KEY = 'simulation-portfolio-settings';

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function yearsBefore(years, isoDate = todayIso()) {
  const date = new Date(isoDate);
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

export function oneYearBefore(isoDate = todayIso()) {
  return yearsBefore(1, isoDate);
}

export function loadPortfolioSettings() {
  try {
    const raw = sessionStorage.getItem(PORTFOLIO_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(PORTFOLIO_SESSION_KEY);
    return null;
  }
}

export function savePortfolioSettings(settings) {
  sessionStorage.setItem(PORTFOLIO_SESSION_KEY, JSON.stringify(settings));
}

/**
 * Demo holdings.totals.totalAssets가 시작 자산의 기준(source of truth)입니다.
 * 사용자가 직접 수정하면 startingAssetsSource='manual'로 표시합니다.
 */
export function buildDefaultPortfolioSettings({
  endDate = todayIso(),
  startingAssets = 0,
  profile,
  propensity,
  financialSummary,
  startingAssetsSource = 'holdings',
}) {
  const monthly = Math.max(
    Number(financialSummary?.monthlySavingsCapacity)
      || Number(financialSummary?.totalIncome) - Number(financialSummary?.totalExpenses),
    0,
  );
  const preset = propensity === 'stable' ? 'stable' : propensity;
  return {
    startDate: oneYearBefore(endDate),
    startingAssets,
    startingAssetsSource,
    targetAssetAmount: Number(profile?.targetAssetAmount) || 0,
    monthlyInvestable: monthly,
    preset,
    etfRatio: ALLOCATION_PRESETS[preset]?.etf ?? 0,
  };
}

export function productKey(product) {
  return `${product.companyCode || ''}:${product.productCode || product.productName}`;
}

export function matchRecommendedProduct(products, recommended) {
  if (!products.length) return '';
  if (!recommended) return productKey(products[0]);
  const exact = products.find(
    (item) => item.productName === recommended.productName
      && item.companyName === recommended.companyName,
  );
  if (exact) return productKey(exact);
  const byName = products.find((item) => item.productName === recommended.productName);
  return productKey(byName || products[0]);
}
