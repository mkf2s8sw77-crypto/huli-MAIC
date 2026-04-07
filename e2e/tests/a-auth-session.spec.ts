/**
 * Group A — 账号与会话测试 (A-01 ~ A-07)
 *
 * 验证注册、登录、登出、会话保持、受保护页面拦截。
 *
 * 这组测试使用模块级别共享的用户凭据，因为多个用例需要
 * 对同一用户执行顺序操作（先注册 → 再重复注册 → 再错误登录 → 再正确登录）。
 */

import { test, expect } from '../fixtures/auth';
import { RegisterPage } from '../pages/register.page';
import { LoginPage } from '../pages/login.page';

const tid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const USER = {
  email: `auth-${tid}@e2e.test`,
  password: 'AuthTest123!',
  nickname: `AuthUser-${tid}`,
};

test.describe.serial('A. 账号与会话', () => {
  // A-01 注册成功
  test('A-01 注册成功', async ({ page }) => {
    const reg = new RegisterPage(page);
    await reg.goto();
    await expect(reg.heading).toBeVisible();

    await reg.register(USER.email, USER.password, USER.nickname);

    await page.waitForURL('/', { timeout: 15_000 });
    expect(page.url()).not.toContain('/register');
  });

  // A-02 重复邮箱注册失败
  test('A-02 重复邮箱注册失败', async ({ page }) => {
    const reg = new RegisterPage(page);
    await reg.goto();

    await reg.register(USER.email, USER.password, USER.nickname);

    await expect(reg.errorMessage).toBeVisible({ timeout: 5_000 });
    await expect(reg.errorMessage).toContainText('已被注册');
    expect(page.url()).toContain('/register');
  });

  // A-03 错误密码登录失败
  test('A-03 错误密码登录失败', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login(USER.email, 'wrong-password-xxx');

    await expect(login.errorMessage).toBeVisible({ timeout: 5_000 });
    await expect(login.errorMessage).toContainText('错误');
    expect(page.url()).toContain('/login');
  });

  // A-04 登录成功
  test('A-04 登录成功', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login(USER.email, USER.password);

    await page.waitForURL('/', { timeout: 15_000 });
    expect(page.url()).not.toContain('/login');
  });

  // A-05 受保护页面拦截
  test('A-05 受保护页面拦截', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // 首页 → 重定向登录
    await page.goto('/');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');

    // 课堂页 → 重定向登录
    await page.goto('/classroom/any-id');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');

    // 生成预览页 → 重定向登录
    await page.goto('/generation-preview');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');

    // 受保护 API 返回 401
    const apiRes = await page.request.get('/api/stages');
    expect(apiRes.status()).toBe(401);

    await ctx.close();
  });

  // A-06 会话刷新保持
  test('A-06 会话刷新保持', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USER.email, USER.password);
    await page.waitForURL('/', { timeout: 15_000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');

    const stagesRes = await page.request.get('/api/stages');
    expect(stagesRes.ok()).toBe(true);
  });

  // A-07 登出失效
  test('A-07 登出后无法访问受保护页面', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USER.email, USER.password);
    await page.waitForURL('/', { timeout: 15_000 });

    // 尝试点击登出按钮
    const logoutBtn = page.locator('button[title*="退出登录"]');
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
    } else {
      // Fallback: 通过 NextAuth signout 页面
      await page.goto('/api/auth/signout');
      const csrfInput = page.locator('input[name="csrfToken"]');
      if (await csrfInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await page.getByRole('button', { name: /sign out/i }).click();
      }
    }

    await page.waitForURL(/\/login/, { timeout: 10_000 });

    // 再次访问受保护页面
    await page.goto('/');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });
});
