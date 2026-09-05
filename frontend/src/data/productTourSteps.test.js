import assert from 'node:assert/strict';
import test from 'node:test';
import { SIMULATION_RESULT_TOUR_STEPS, SIMULATION_TOUR_STEPS } from './productTourSteps.js';

test('포트폴리오 설정 코치는 세 단계와 모달 대상만 안내한다', () => {
  assert.deepEqual(
    SIMULATION_TOUR_STEPS.map(({ id, target }) => ({ id, target })),
    [
      { id: 'portfolio-period', target: '[data-tour="portfolio-period"]' },
      { id: 'portfolio-goal', target: '[data-tour="portfolio-goal"]' },
      { id: 'portfolio-investment', target: '[data-tour="portfolio-investment"]' },
    ],
  );
});

test('결과 코치는 네 결과 영역을 순서대로 안내한다', () => {
  assert.deepEqual(
    SIMULATION_RESULT_TOUR_STEPS.map(({ id, target }) => ({ id, target })),
    [
      { id: 'portfolio-settings', target: '[data-tour="simulation-settings"]' },
      { id: 'goal-result', target: '[data-tour="simulation-goal-result"]' },
      { id: 'trajectory', target: '[data-tour="simulation-trajectory"]' },
      { id: 'details', target: '[data-tour="simulation-details"]' },
    ],
  );
  assert.match(SIMULATION_RESULT_TOUR_STEPS[1].body, /미래 보장이 아닙니다/);
  assert.match(SIMULATION_RESULT_TOUR_STEPS[2].body, /과거 흐름/);
});
