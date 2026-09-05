import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ProductTour.jsx', import.meta.url), 'utf8');

test('외부 코치는 선택 단계와 종료 동작을 주입할 수 있다', () => {
  assert.match(source, /active: activeProp,/);
  assert.match(source, /stepIndex: stepIndexProp,/);
  assert.match(source, /const tourSteps = steps \|\| PRODUCT_TOUR_STEPS/);
  assert.match(source, /const active = activeProp \?\? dashboardActive/);
  assert.match(source, /const currentStepIndex = stepIndexProp \?\? stepIndex/);
  assert.match(source, /onStepChange\?\.\(next\)/);
  assert.match(source, /onClick=\{onDismiss \? dismissExternal : dismiss\}/);
  assert.match(source, /product-tour\$\{modifier \? ` \$\{modifier\}` : ''\}/);
});

test('코치가 열리면 카드로 포커스를 옮긴다', () => {
  assert.match(source, /cardRef\.current\?\.focus\(\)/);
  assert.match(source, /requestAnimationFrame\(\(\) => cardRef\.current\?\.focus\(\)\)/);
  assert.match(source, /tabIndex="-1"/);
  assert.match(source, /document\.activeElement === first \|\| document\.activeElement === cardRef\.current/);
});
