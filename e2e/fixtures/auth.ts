/**
 * Auth-aware Playwright Fixture
 *
 * Provides per-test-file unique user credentials, helper functions for
 * registration / login, and multi-context support for cross-browser tests.
 *
 * Every test file that imports from this module gets its own unique user pair
 * (userA / userB) whose emails are suffixed with a random token to avoid
 * collisions across parallel workers.
 */

import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { MockApi } from './mock-api';
import { createSettingsStorage } from './test-data/settings';

const SETTINGS_STORAGE = createSettingsStorage();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export interface TestUser {
  email: string;
  password: string;
  nickname: string;
}

export interface AuthFixtures {
  mockApi: MockApi;
  testId: string;
  userA: TestUser;
  userB: TestUser;
  registerUser: (user: TestUser) => Promise<void>;
  loginPage: (page: Page, user: TestUser) => Promise<void>;
  authedPage: Page;
  secondContext: BrowserContext;
}

export const test = base.extend<AuthFixtures>({
  mockApi: async ({ page }, use) => {
    const m = new MockApi(page);
    await m.mockServerProviders();
    await use(m);
  },

  testId: async ({}, use) => {
    await use(uid());
  },

  userA: async ({ testId }, use) => {
    await use({
      email: `a-${testId}@e2e.test`,
      password: 'Test123!pwd',
      nickname: `UserA-${testId}`,
    });
  },

  userB: async ({ testId }, use) => {
    await use({
      email: `b-${testId}@e2e.test`,
      password: 'Test456!pwd',
      nickname: `UserB-${testId}`,
    });
  },

  registerUser: async ({ request }, use) => {
    const fn = async (user: TestUser) => {
      const res = await request.post('/api/auth/register', {
        data: { email: user.email, password: user.password, nickname: user.nickname },
      });
      if (!res.ok()) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Register failed: ${res.status()} ${body.error || ''}`);
      }
    };
    await use(fn);
  },

  loginPage: async ({}, use) => {
    const fn = async (page: Page, user: TestUser) => {
      await page.goto('/login');
      await page.getByLabel('邮箱').fill(user.email);
      await page.getByLabel('密码').fill(user.password);
      await page.getByRole('button', { name: '登录' }).click();
      await page.waitForURL('/', { timeout: 15_000 });
    };
    await use(fn);
  },

  authedPage: async ({ page, userA, registerUser, loginPage }, use) => {
    await registerUser(userA);
    await page.addInitScript((s) => localStorage.setItem('settings-storage', s), SETTINGS_STORAGE);
    await loginPage(page, userA);
    await use(page);
  },

  secondContext: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    await use(ctx);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
