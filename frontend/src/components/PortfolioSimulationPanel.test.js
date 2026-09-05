import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('./PortfolioSimulationPanel.jsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const styles = readFileSync(
  new URL('../index.css', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

test('설정 모달은 document.body 아래 portal로 렌더링한다', () => {
  assert.match(
    source,
    /modalOpen && draft && createPortal\(\s*<div className="sim-modal-backdrop"[\s\S]*?\n\s*document\.body,\n\s*\)/,
  );
});

test('첫 설정 모달은 세 단계 포트폴리오 코치와 동기화한다', () => {
  assert.match(source, /<ProductTour[\s\S]*steps=\{SIMULATION_TOUR_STEPS\}/);
  assert.match(source, /stepIndex=\{settingsStep - 1\}/);
  assert.match(source, /onStepChange=\{\(stepIndex\) => selectSettingsStep\(stepIndex \+ 1\)\}/);
  assert.match(source, /active=\{showPortfolioTour && modalOpen && !hasSavedSettings && Boolean\(draft\)\}/);
  assert.match(source, /modifier="portfolio-settings"/);
  assert.match(source, /if \(!showPortfolioTour\) closeButtonRef\.current\?\.focus\(\);/);
  assert.match(source, /if \(showPortfolioTour\) return;/);
});

test('결과 코치는 설정 모달과 겹치지 않고 별도로 저장한다', () => {
  assert.match(source, /SIMULATION_RESULT_TOUR_STEPS/);
  assert.match(source, /shouldShowPortfolioResultTour/);
  assert.match(source, /dismissPortfolioResultTour/);
  assert.match(source, /active=\{showPortfolioResultTour && !showPortfolioTour && Boolean\(result\) && !calculating && !modalOpen\}/);
  assert.match(source, /data-tour="simulation-settings"/);
  assert.match(source, /className="panel chart-panel"/);
});

test('상품 도움말은 각 필드 안에서 모달 폭을 넘지 않는다', () => {
  assert.match(styles, /\.sim-product-field \{\s+position: relative;/);
  assert.match(styles, /\.sim-product-help \[role='tooltip'\] \{[\s\S]*?left: 0;[\s\S]*?width: min\(17rem, 100%\);/);
  assert.doesNotMatch(styles, /\.sim-product-help \[role='tooltip'\] \{[\s\S]*?left: 50%;/);
});

test('투자 방식 단계는 취소 가능한 상품 선택 초안을 사용한다', () => {
  assert.match(source, /data-tour="portfolio-investment"/);
  assert.match(source, /<h3>종목 선택<\/h3>/);
  assert.match(source, /선택한 상품의 실제 금리와 과거 가격을 적용해 자산 흐름을 계산합니다\./);
  assert.match(source, /id="sim-deposit-help" role="tooltip"/);
  assert.match(source, /적금 만기금이 합쳐지는 예금 상품입니다\./);
  assert.match(source, /id="sim-saving-help" role="tooltip"/);
  assert.match(source, /만기금은 예금으로 옮기고 같은 적금에 다시 가입합니다\./);
  assert.match(source, /id="sim-etf-help" role="tooltip"/);
  assert.match(source, /한 주를 사기에 부족한 금액은 ETF 전용 현금으로 이월합니다\./);
  assert.match(source, /const \[draftSelected, setDraftSelected\] = useState/);
  assert.match(source, /setDraftSelected\(selected\)/);
  assert.match(source, /setSelected\(draftSelected\)/);
  assert.match(source, /value=\{draftSelected\.deposit\}/);
  assert.match(source, /value=\{draftSelected\.saving\}/);
  assert.match(source, /value=\{draftSelected\.etf\}/);
  assert.match(source, /disabled=\{calculating \|\| isStable \|\| !draft\.etfRatio\}/);
  assert.match(source, /월 투자 가능액 중 ETF에 배분하는 비율이며, 나머지는 적금에 배분됩니다\./);
});

test('컴포넌트는 차단될 수 있는 localStorage를 직접 평가하지 않는다', () => {
  assert.doesNotMatch(source, /window\.localStorage/);
});

test('나중에는 입력 중인 초안을 저장하지 않는다', () => {
  assert.match(source, /const base = settings \|\| buildDefaultPortfolioSettings/);
});
