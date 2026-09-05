import { ALLOCATION_PRESETS } from './portfolioSimulator.js';

export const PORTFOLIO_SESSION_KEY = 'simulation-portfolio-settings';
export const PORTFOLIO_TOUR_STORAGE_KEY = 'simulation-portfolio-tour-dismissed';
export const PORTFOLIO_RESULT_TOUR_STORAGE_KEY = 'simulation-portfolio-result-tour-dismissed';

function browserStorage(name) {
  try {
    return typeof window === 'undefined' ? null : window[name];
  } catch {
    return null;
  }
}

function settingsStorageKey(userId) {
  return userId ? `${PORTFOLIO_SESSION_KEY}:${userId}` : null;
}

function removeStoredValue(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage can be disabled.
  }
}

export function shouldShowPortfolioTour({
  modalOpen,
  hasSavedSettings,
  localStorage = browserStorage('localStorage'),
}) {
  try {
    return Boolean(modalOpen) && !hasSavedSettings && localStorage?.getItem(PORTFOLIO_TOUR_STORAGE_KEY) !== 'true';
  } catch {
    return false;
  }
}

export function dismissPortfolioTour(localStorage = browserStorage('localStorage')) {
  try {
    localStorage?.setItem(PORTFOLIO_TOUR_STORAGE_KEY, 'true');
  } catch {
    // Storage can be disabled; the in-memory dismissal still applies.
  }
}

export function shouldShowPortfolioResultTour({
  hasResult,
  calculating,
  modalOpen,
  localStorage = browserStorage('localStorage'),
}) {
  try {
    return Boolean(hasResult) && !calculating && !modalOpen
      && localStorage?.getItem(PORTFOLIO_RESULT_TOUR_STORAGE_KEY) !== 'true';
  } catch {
    return false;
  }
}

export function dismissPortfolioResultTour(localStorage = browserStorage('localStorage')) {
  try {
    localStorage?.setItem(PORTFOLIO_RESULT_TOUR_STORAGE_KEY, 'true');
  } catch {
    // Storage can be disabled; the in-memory dismissal still applies.
  }
}

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

export function loadPortfolioSettings(
  userId,
  localStorage = browserStorage('localStorage'),
  sessionStorage = browserStorage('sessionStorage'),
) {
  const key = settingsStorageKey(userId);
  if (!key) return null;
  try {
    const raw = localStorage?.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    removeStoredValue(localStorage, key);
  }

  try {
    const raw = sessionStorage?.getItem(key);
    if (!raw) return null;
    const settings = JSON.parse(raw);
    try {
      localStorage.setItem(key, raw);
      removeStoredValue(sessionStorage, key);
    } catch {
      // Keep the legacy session value usable when localStorage is unavailable.
    }
    return settings;
  } catch {
    removeStoredValue(sessionStorage, key);
    return null;
  }
}

export function savePortfolioSettings(
  settings,
  userId,
  localStorage = browserStorage('localStorage'),
  sessionStorage = browserStorage('sessionStorage'),
) {
  const key = settingsStorageKey(userId);
  if (!key) return;
  const raw = JSON.stringify(settings);
  try {
    localStorage.setItem(key, raw);
    return;
  } catch {
    // Fall back so the current browser session survives a refresh.
  }
  try {
    sessionStorage.setItem(key, raw);
  } catch {
    // Storage can be disabled; settings remain available in component state.
  }
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

export function validatePortfolioSettingsStep(step, settings, endDate = todayIso()) {
  const hasValue = (value) => value !== '' && value != null;
  if (step === 1 && !hasValue(settings.startDate)) return '과거 시작일을 입력해 주세요.';
  if (step === 1 && settings.startDate > endDate) return '시작일은 오늘보다 늦을 수 없습니다.';
  if (step === 2 && !hasValue(settings.startingAssets)) return '시작 자산을 입력해 주세요.';
  if (step === 2 && (!Number.isFinite(Number(settings.startingAssets)) || Number(settings.startingAssets) < 0)) {
    return '시작 자산은 0원 이상이어야 합니다.';
  }
  if (step === 2 && !hasValue(settings.targetAssetAmount)) return '목표 자산을 입력해 주세요.';
  if (step === 2 && (!Number.isFinite(Number(settings.targetAssetAmount)) || Number(settings.targetAssetAmount) < 0)) {
    return '목표 자산은 0원 이상이어야 합니다.';
  }
  if (step === 3 && !hasValue(settings.monthlyInvestable)) return '월 투자 가능액을 입력해 주세요.';
  if (step === 3 && (!Number.isFinite(Number(settings.monthlyInvestable)) || Number(settings.monthlyInvestable) < 0)) {
    return '월 투자 가능액은 0원 이상이어야 합니다.';
  }
  return '';
}
