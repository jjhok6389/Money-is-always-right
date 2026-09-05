/**
 * Capture fig05.png — dashboard Gap analysis at /.
 * Profile: 위험중립형, 목표 5,000만 원·5년 (Demo 소득/지출은 파이프라인 시드 기준).
 * Usage: node scripts/capture-fig05.mjs
 * Optional env: FIG05_CAPTURE_EMAIL, FIG05_CAPTURE_PASSWORD
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:5173';
const API_BASE = process.env.CAPTURE_API_BASE || 'http://127.0.0.1:8001';
const OUTPUT = path.join(ROOT, 'docs', 'submission', 'images', 'fig05.png');

async function getFirebaseIdToken(page) {
  await page.waitForTimeout(1000);
  const fromApp = await page.evaluate(async () => {
    try {
      const { auth } = await import('/src/firebase/config.js');
      const user = auth.currentUser;
      if (!user) return null;
      return user.getIdToken();
    } catch {
      return null;
    }
  });
  if (fromApp) return fromApp;

  return page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter((key) => key.includes('firebase:authUser'));
    for (const key of keys) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        const token = parsed?.stsTokenManager?.accessToken;
        if (token) return token;
      } catch {
        // continue
      }
    }
    return null;
  });
}

async function skipFirstReportGate(page, redirectPath = '/') {
  const token = await getFirebaseIdToken(page);
  if (!token) throw new Error('Firebase ID token not found.');

  const profileResponse = await page.request.get(`${API_BASE}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!profileResponse.ok()) throw new Error(`Failed to load profile: ${profileResponse.status()}`);
  const profile = await profileResponse.json();

  await page.request.put(`${API_BASE}/api/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      ...profile,
      investmentPropensity: 'neutral',
      targetAssetAmount: 50_000_000,
      targetYears: 5,
      goalDescription: profile.goalDescription || '내 집 마련 목표 자금',
      firstReportCompleted: true,
      onboardingCompleted: true,
      financialDataLinked: profile.financialDataLinked ?? true,
    },
  });

  await page.goto(`${BASE_URL}${redirectPath}`);
  await page.reload();
}

async function loginOrSignup(page) {
  const email = process.env.FIG05_CAPTURE_EMAIL;
  const password = process.env.FIG05_CAPTURE_PASSWORD;

  if (email && password) {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 });
    if (page.url().includes('/coach-report')) {
      await skipFirstReportGate(page, '/');
    } else {
      await skipFirstReportGate(page, '/');
    }
    return;
  }

  const uniqueEmail = `fig05cap${Date.now()}@example.com`;
  const signupPassword = 'Fig05Capture1!';

  await page.goto(`${BASE_URL}/signup`);
  await page.fill('input[name="displayName"]', '김민수');
  await page.fill('input[name="email"]', uniqueEmail);
  await page.fill('input[name="password"]', signupPassword);
  await page.fill('input[name="confirmPassword"]', signupPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/onboarding**', { timeout: 60_000 });

  await page.fill('input[name="displayName"]', '김민수');
  await page.fill('input[name="age"]', '28');
  await page.fill('input[name="occupation"]', '직장인');
  await page.click('button:has-text("다음")');

  await page.click('input[name="investmentPropensity"][value="neutral"]');
  await page.fill('input[name="targetAssetAmount"]', '50000000');
  await page.fill('input[name="targetYears"]', '5');
  await page.fill('textarea[name="goalDescription"]', '5년 내 5,000만 원 목표 자산');
  await page.click('button:has-text("다음")');

  await page.click('button:has-text("내 금융데이터와 연결하기")');
  await page.waitForURL('**/coach-report**', { timeout: 120_000 });
  await skipFirstReportGate(page, '/');
}

async function dismissProductTour(page) {
  const dismiss = page.getByRole('button', { name: '다시 보지 않기' });
  if (await dismiss.isVisible({ timeout: 8000 }).catch(() => false)) {
    await dismiss.click();
    await page.waitForTimeout(400);
  }
}

async function captureDashboard(page) {
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector('[data-tour="goal-stats"]', { timeout: 120_000 });
  await page.waitForSelector('[data-tour="portfolio"]', { timeout: 120_000 });
  await page.waitForSelector('[data-tour="consumption"]', { timeout: 120_000 });
  await page.waitForSelector('[data-tour="roadmap"]', { timeout: 120_000 });
  await page.waitForSelector('[data-tour="roadmap"] .personal-roadmap-cards', { timeout: 120_000 });

  await dismissProductTour(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);

  const stats = await page.locator('[data-tour="goal-stats"]').boundingBox();
  const roadmap = await page.locator('[data-tour="roadmap"]').boundingBox();
  if (!stats || !roadmap) {
    throw new Error('Could not measure dashboard capture region.');
  }

  const padding = 12;
  const clip = {
    x: Math.max(0, Math.min(stats.x, roadmap.x) - padding),
    y: Math.max(0, stats.y - padding),
    width: Math.max(stats.width, roadmap.width) + padding * 2,
    height: roadmap.y + roadmap.height - stats.y + padding * 2,
  };

  await page.screenshot({ path: OUTPUT, clip });
}

async function main() {
  await mkdir(path.dirname(OUTPUT), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  try {
    await loginOrSignup(page);
    await captureDashboard(page);
    console.log(`Saved ${OUTPUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
