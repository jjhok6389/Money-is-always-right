import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PORTFOLIO_RESULT_TOUR_STORAGE_KEY,
  PORTFOLIO_SESSION_KEY,
  PORTFOLIO_TOUR_STORAGE_KEY,
  dismissPortfolioResultTour,
  dismissPortfolioTour,
  loadPortfolioSettings,
  savePortfolioSettings,
  shouldShowPortfolioResultTour,
  shouldShowPortfolioTour,
  validatePortfolioSettingsStep,
} from './portfolioSimulationSettings.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('설정 단계별로 필요한 입력만 검증한다', () => {
  assert.equal(validatePortfolioSettingsStep(1, {
    startDate: '',
  }), '과거 시작일을 입력해 주세요.');
  assert.equal(validatePortfolioSettingsStep(1, {
    startDate: '2025-01-01',
  }), '');

  assert.equal(validatePortfolioSettingsStep(2, {
    startingAssets: '',
    targetAssetAmount: 0,
  }), '시작 자산을 입력해 주세요.');
  assert.equal(validatePortfolioSettingsStep(2, {
    startingAssets: 0,
    targetAssetAmount: '',
  }), '목표 자산을 입력해 주세요.');
  assert.equal(validatePortfolioSettingsStep(2, {
    startingAssets: 0,
    targetAssetAmount: 0,
  }), '');

  assert.equal(validatePortfolioSettingsStep(3, {
    monthlyInvestable: '',
  }), '월 투자 가능액을 입력해 주세요.');
  assert.equal(validatePortfolioSettingsStep(3, {
    monthlyInvestable: 0,
  }), '');
});

test('화면에서 사라진 단계도 날짜와 금액 범위를 검증한다', () => {
  assert.equal(
    validatePortfolioSettingsStep(1, { startDate: '2999-01-01' }, '2026-09-05'),
    '시작일은 오늘보다 늦을 수 없습니다.',
  );
  assert.equal(
    validatePortfolioSettingsStep(2, { startingAssets: -1, targetAssetAmount: 0 }),
    '시작 자산은 0원 이상이어야 합니다.',
  );
  assert.equal(
    validatePortfolioSettingsStep(2, { startingAssets: 0, targetAssetAmount: -1 }),
    '목표 자산은 0원 이상이어야 합니다.',
  );
  assert.equal(
    validatePortfolioSettingsStep(3, { monthlyInvestable: -1 }),
    '월 투자 가능액은 0원 이상이어야 합니다.',
  );
});

test('전체 검증은 가장 먼저 누락된 단계를 반환한다', () => {
  const incomplete = {
    startDate: '',
    startingAssets: '',
    targetAssetAmount: '',
    monthlyInvestable: '',
  };
  const firstError = [1, 2, 3]
    .map((step) => ({ step, message: validatePortfolioSettingsStep(step, incomplete) }))
    .find(({ message }) => message);

  assert.deepEqual(firstError, { step: 1, message: '과거 시작일을 입력해 주세요.' });
});

test('설정은 localStorage에 저장한다', () => {
  const localStorage = storage();
  const sessionStorage = storage();
  const settings = { startDate: '2025-01-01', targetAssetAmount: 10000000 };
  const key = `${PORTFOLIO_SESSION_KEY}:user-a`;

  savePortfolioSettings(settings, 'user-a', localStorage, sessionStorage);

  assert.equal(localStorage.getItem(key), JSON.stringify(settings));
  assert.equal(sessionStorage.getItem(key), null);
  assert.deepEqual(loadPortfolioSettings('user-a', localStorage, sessionStorage), settings);
  assert.equal(loadPortfolioSettings('user-b', localStorage, sessionStorage), null);
});

test('기존 sessionStorage 설정은 localStorage로 마이그레이션한 뒤 제거한다', () => {
  const settings = { startDate: '2025-01-01', targetAssetAmount: 10000000 };
  const key = `${PORTFOLIO_SESSION_KEY}:user-a`;
  const localStorage = storage();
  const sessionStorage = storage({ [key]: JSON.stringify(settings) });

  assert.deepEqual(loadPortfolioSettings('user-a', localStorage, sessionStorage), settings);
  assert.equal(localStorage.getItem(key), JSON.stringify(settings));
  assert.equal(sessionStorage.getItem(key), null);
});

test('localStorage 저장 실패 시 sessionStorage로 대체한다', () => {
  const localStorage = { setItem: () => { throw new Error('blocked'); } };
  const sessionStorage = storage();
  const settings = { startDate: '2025-01-01', targetAssetAmount: 10000000 };
  const key = `${PORTFOLIO_SESSION_KEY}:user-a`;

  savePortfolioSettings(settings, 'user-a', localStorage, sessionStorage);

  assert.equal(sessionStorage.getItem(key), JSON.stringify(settings));
});

test('손상된 저장값은 안전하게 무시한다', () => {
  const key = `${PORTFOLIO_SESSION_KEY}:user-a`;
  const localStorage = storage({ [key]: '{not-json' });
  const sessionStorage = storage({ [key]: '{also-not-json' });

  assert.equal(loadPortfolioSettings('user-a', localStorage, sessionStorage), null);
  assert.equal(localStorage.getItem(key), null);
  assert.equal(sessionStorage.getItem(key), null);
});

test('포트폴리오 코치는 미완료 기록일 때만 첫 모달에서 보인다', () => {
  const localStorage = storage();

  assert.equal(shouldShowPortfolioTour({ modalOpen: true, hasSavedSettings: false, localStorage }), true);
  assert.equal(shouldShowPortfolioTour({ modalOpen: true, hasSavedSettings: true, localStorage }), false);

  dismissPortfolioTour(localStorage);
  assert.equal(localStorage.getItem(PORTFOLIO_TOUR_STORAGE_KEY), 'true');
  assert.equal(shouldShowPortfolioTour({ modalOpen: true, hasSavedSettings: false, localStorage }), false);
});

test('결과 코치는 계산 완료 후 한 번만 보인다', () => {
  const localStorage = storage();

  assert.equal(shouldShowPortfolioResultTour({ hasResult: true, calculating: false, modalOpen: false, localStorage }), true);
  assert.equal(shouldShowPortfolioResultTour({ hasResult: true, calculating: true, modalOpen: false, localStorage }), false);
  assert.equal(shouldShowPortfolioResultTour({ hasResult: true, calculating: false, modalOpen: true, localStorage }), false);

  dismissPortfolioResultTour(localStorage);
  assert.equal(localStorage.getItem(PORTFOLIO_RESULT_TOUR_STORAGE_KEY), 'true');
  assert.equal(shouldShowPortfolioResultTour({ hasResult: true, calculating: false, modalOpen: false, localStorage }), false);
});
