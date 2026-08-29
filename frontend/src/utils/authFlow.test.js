import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostAuthPath } from './authFlow.js';

test('미완료 프로필은 온보딩으로 이동한다', () => {
  assert.equal(getPostAuthPath(null), '/onboarding');
});

test('신규 사용자는 첫 리포트를 완료하기 전까지 첫 진단으로 이동한다', () => {
  assert.equal(
    getPostAuthPath({ onboardingCompleted: true, firstReportCompleted: false }),
    '/coach-report?onboarding=1',
  );
});

test('첫 리포트 완료 사용자와 기존 사용자는 대시보드로 이동한다', () => {
  assert.equal(
    getPostAuthPath({ onboardingCompleted: true, firstReportCompleted: true }),
    '/',
  );
  assert.equal(getPostAuthPath({ onboardingCompleted: true }), '/');
});
