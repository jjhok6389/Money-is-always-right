import { test, expect } from '@playwright/test';

// 회원가입 → 온보딩 → 대시보드 전체 흐름 (실 Firebase 계정 생성).
// 실행하려면 frontend/.env에 실제 Firebase 프로젝트가 설정되어 있어야 한다.
const RUN_AUTH = process.env.E2E_AUTH === '1';
test.describe.configure({ mode: RUN_AUTH ? 'default' : 'skip' });

// E2E_AUTH=1 일 때만 실행. 매 실행마다 고유 이메일로 새 계정 생성.
const stamp = Date.now();
const EMAIL = `e2e-${stamp}@example.com`;
const PASSWORD = `E2e-${stamp}!pass`;

test('가입 → 온보딩 → 대시보드 흐름', async ({ page }) => {
  test.skip(!RUN_AUTH, 'E2E_AUTH=1 일 때만 실행 (실 Firebase 계정 생성)');

  // 1. 회원가입
  await page.goto('/signup');
  await page.getByPlaceholder(/이메일|example\.com/).first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('input[type="password"]').nth(1).fill(PASSWORD); // 비밀번호 확인
  await page.getByPlaceholder(/이름|홍길동/).fill('E2E사용자');
  await page.getByRole('button', { name: /회원가입/ }).click();

  // 2. 온보딩으로 이동 (가입 후 자동 리다이렉트 or 수동 이동)
  await page.waitForURL(/\/(onboarding|login)/, { timeout: 20_000 });
  if (page.url().includes('/login')) {
    await page.getByPlaceholder(/example\.com/).fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
  }
  await page.waitForURL(/\/onboarding/, { timeout: 20_000 });

  // 3. 온보딩 1단계: 기본 정보
  await page.getByPlaceholder('홍길동').fill('E2E사용자');
  await page.getByPlaceholder('28').fill('28');
  await page.getByPlaceholder(/직장인|프리랜서/).fill('직장인');
  await page.getByRole('button', { name: '다음' }).click();

  // 4. 온보딩 2단계: 소득·지출
  await page.getByPlaceholder('3000000').fill('3200000');
  await page.getByPlaceholder('1500000').fill('1500000');
  await expect(page.getByText(/예상 월 저축 여력/)).toBeVisible();
  await expect(page.getByText('1,700,000원')).toBeVisible(); // 320만 - 150만
  await page.getByRole('button', { name: '다음' }).click();

  // 5. 온보딩 3단계: 성향·목표
  await page.getByText('위험중립형').click();
  await page.getByPlaceholder('50000000').fill('50000000');
  await page.getByPlaceholder('5', { exact: true }).fill('5');
  await page.getByPlaceholder(/내 집 마련/).fill('E2E 목표 자산');
  await page.getByRole('button', { name: /프로필 저장/ }).click();

  // 6. 홈으로 이동, 프로필 요약 확인
  await page.waitForURL(/localhost:5173\/$|\/($|\?)/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /E2E사용자/ })).toBeVisible();
  await expect(page.getByText('위험중립형')).toBeVisible();

  // 7. 대시보드
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /자산 · 소비 · 목표/ })).toBeVisible();
  await expect(page.getByText('목표 달성률')).toBeVisible();
  await expect(page.getByText('10%')).toBeVisible(); // 5,000,000 추정자산(170만×6) / 5,000만 → 10%

  // 8. 시뮬레이션
  await page.goto('/simulation');
  await expect(page.getByRole('heading', { name: /미래 자산 시뮬레이션/ })).toBeVisible();
  await expect(page.getByText(/시나리오 예상 월 적립액/)).toBeVisible();
});
