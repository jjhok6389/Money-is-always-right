import { test, expect } from '@playwright/test';

// 공개 페이지 스모크: 인증 없이 접근 가능한 화면들.
test('로그인 화면이 렌더링된다', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
});

test('회원가입 화면이 렌더링된다', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByText('회원가입').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /회원가입/ })).toBeVisible();
});

test('비밀번호 찾기 화면이 렌더링된다', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.getByRole('button', { name: /전송|재설정|발송/ })).toBeVisible();
});

test('미인증 사용자는 보호 라우트에 접근하면 /login으로 이동한다', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
