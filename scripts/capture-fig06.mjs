/**
 * Capture fig06.png — /simulation with monthly expenses reduced by 120,000 KRW.
 * Usage: node scripts/capture-fig06.mjs
 * Optional env: FIG06_CAPTURE_EMAIL, FIG06_CAPTURE_PASSWORD (skip signup)
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:5173';
const API_BASE = process.env.CAPTURE_API_BASE || 'http://127.0.0.1:8001';
const OUTPUT = path.join(ROOT, 'docs', 'submission', 'images', 'fig06.png');
const EXPENSE_REDUCTION = 120_000;

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
    const fromLocalStorage = () => {
      const keys = Object.keys(localStorage).filter((key) => key.includes('firebase:authUser'));
      for (const key of keys) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const token = parsed?.stsTokenManager?.accessToken;
          if (token) return token;
        } catch {
          // try next key
        }
      }
      return null;
    };

    const fromIndexedDb = () =>
      new Promise((resolve) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
            resolve(null);
            return;
          }
          const tx = db.transaction('firebaseLocalStorage', 'readonly');
          const req = tx.objectStore('firebaseLocalStorage').getAll();
          req.onerror = () => resolve(null);
          req.onsuccess = () => {
            const row = req.result.find((item) =>
              String(item.fbase_key || '').includes('authUser'),
            );
            if (!row) {
              resolve(null);
              return;
            }
            try {
              const parsed = JSON.parse(row.value);
              resolve(parsed?.stsTokenManager?.accessToken || null);
            } catch {
              resolve(null);
            }
          };
        };
      });

    return fromLocalStorage() || (await fromIndexedDb());
  });
}

async function skipFirstReportGate(page) {
  const token = await getFirebaseIdToken(page);
  if (!token) {
    throw new Error('Firebase ID token not found after signup.');
  }

  const profileResponse = await page.request.get(`${API_BASE}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!profileResponse.ok()) {
    throw new Error(`Failed to load profile: ${profileResponse.status()}`);
  }
  const profile = await profileResponse.json();

  await page.request.put(`${API_BASE}/api/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      ...profile,
      firstReportCompleted: true,
      onboardingCompleted: true,
      financialDataLinked: profile.financialDataLinked ?? true,
    },
  });

  await page.goto(`${BASE_URL}/simulation`);
  await page.reload();
}

async function loginOrSignup(page) {
  const email = process.env.FIG06_CAPTURE_EMAIL;
  const password = process.env.FIG06_CAPTURE_PASSWORD;

  if (email && password) {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 });
    if (page.url().includes('/coach-report')) {
      await skipFirstReportGate(page);
    }
    return;
  }

  const uniqueEmail = `fig06cap${Date.now()}@example.com`;
  const signupPassword = 'Fig06Capture1!';

  await page.goto(`${BASE_URL}/signup`);
  await page.fill('input[name="displayName"]', '캡처용');
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
  await page.fill('textarea[name="goalDescription"]', '내 집 마련 목표 자금');
  await page.click('button:has-text("다음")');

  await page.click('button:has-text("내 금융데이터와 연결하기")');
  await page.waitForURL('**/coach-report**', { timeout: 120_000 });
  await skipFirstReportGate(page);
}

async function captureSimulation(page) {
  await page.goto(`${BASE_URL}/simulation`);
  await page.waitForSelector('input[name="monthlyExpenses"]', { timeout: 60_000 });

  const expenseInput = page.locator('input[name="monthlyExpenses"]');
  const baselineExpenses = Number(await expenseInput.inputValue());
  const scenarioExpenses = Math.max(0, baselineExpenses - EXPENSE_REDUCTION);
  await expenseInput.fill(String(scenarioExpenses));
  await page.getByRole('button', { name: '시뮬레이션 실행' }).click();

  await page.waitForSelector('text=자산 궤적 비교', { timeout: 60_000 });
  await page.waitForTimeout(1500);

  const panel = page.locator('.page-content').first();
  await panel.screenshot({ path: OUTPUT });
}

async function main() {
  await mkdir(path.dirname(OUTPUT), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  try {
    await loginOrSignup(page);
    await captureSimulation(page);
    console.log(`Saved ${OUTPUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
