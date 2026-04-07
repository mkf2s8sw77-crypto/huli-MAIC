/**
 * Group J — 回归检查 (J-01 ~ J-03)
 *
 * 验证 provider 配置、公开页面、静态检查。
 */

import { test, expect } from '../fixtures/auth';

test.describe('J. 回归检查', () => {
  // J-01 Provider 配置逻辑未被破坏
  test('J-01 server-providers API 可正常返回', async ({ request }) => {
    const res = await request.get('/api/server-providers');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('providers');
  });

  // J-02 公开页面仍可访问（未登录状态）
  test('J-02 公开页面无需登录可访问', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // 登录页
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/login');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

    // 注册页
    await page.goto('/register');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/register');
    await expect(page.getByRole('heading', { name: '注册' })).toBeVisible();

    // 开源说明页
    const osRes = await page.request.get('/open-source');
    // open-source 页可能返回 200 或 301/302 重定向
    expect([200, 301, 302, 308]).toContain(osRes.status());

    // API health
    const healthRes = await page.request.get('/api/health');
    expect(healthRes.ok()).toBe(true);

    await ctx.close();
  });

  // J-03 基本静态检查 — lint 无新增高置信错误
  // 注：此测试通过 API / 页面加载检测运行时错误
  test('J-03 页面加载无 JS 报错', async ({ page, userA, registerUser, loginPage }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await registerUser(userA);
    await loginPage(page, userA);

    // 首页
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 登录页
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // 注册页
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // 过滤掉已知的非关键错误
    const critical = errors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('hydration') &&
        !e.includes('Loading chunk'),
    );

    expect(
      critical,
      `Unexpected JS errors: ${critical.join('\n')}`,
    ).toHaveLength(0);
  });
});
