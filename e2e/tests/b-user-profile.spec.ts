/**
 * Group B — 用户资料测试 (B-01 ~ B-03)
 *
 * 验证用户资料保存、跨浏览器可见、用户隔离。
 */

import { test, expect } from '../fixtures/auth';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS = createSettingsStorage();

test.describe('B. 用户资料', () => {
  // B-01 用户资料保存
  test('B-01 用户资料保存并刷新后仍存在', async ({ page, userA, registerUser, loginPage }) => {
    await registerUser(userA);
    await page.addInitScript((s) => localStorage.setItem('settings-storage', s), SETTINGS);
    await loginPage(page, userA);

    // 通过 API 修改资料
    const patchRes = await page.request.patch('/api/auth/profile', {
      data: {
        nickname: 'NewNick-B01',
        bio: 'Test bio for B-01',
      },
    });
    expect(patchRes.ok()).toBe(true);
    const patched = await patchRes.json();
    expect(patched.nickname).toBe('NewNick-B01');
    expect(patched.bio).toBe('Test bio for B-01');

    // 重新获取验证持久化
    const getRes = await page.request.get('/api/auth/profile');
    expect(getRes.ok()).toBe(true);
    const profile = await getRes.json();
    expect(profile.nickname).toBe('NewNick-B01');
    expect(profile.bio).toBe('Test bio for B-01');
  });

  // B-02 用户资料跨浏览器可见
  test('B-02 用户资料跨浏览器可见', async ({
    page, userA, registerUser, loginPage, secondContext,
  }) => {
    await registerUser(userA);
    await page.addInitScript((s) => localStorage.setItem('settings-storage', s), SETTINGS);
    await loginPage(page, userA);

    // 浏览器 1 修改资料
    await page.request.patch('/api/auth/profile', {
      data: { nickname: 'CrossBrowser-B02', bio: 'visible everywhere' },
    });

    // 浏览器 2 登录同一用户
    const page2 = await secondContext.newPage();
    await page2.addInitScript((s) => localStorage.setItem('settings-storage', s), SETTINGS);
    // Mock server-providers on the second context too
    await page2.route('**/api/server-providers', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: {} }),
      });
    });

    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userA.email);
    await page2.getByLabel('密码').fill(userA.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    // 浏览器 2 读取资料
    const profileRes = await page2.request.get('/api/auth/profile');
    expect(profileRes.ok()).toBe(true);
    const profile = await profileRes.json();
    expect(profile.nickname).toBe('CrossBrowser-B02');
    expect(profile.bio).toBe('visible everywhere');
  });

  // B-03 用户资料隔离
  test('B-03 用户资料隔离', async ({
    page, userA, userB, registerUser, loginPage, secondContext,
  }) => {
    await registerUser(userA);
    await registerUser(userB);

    await page.addInitScript((s) => localStorage.setItem('settings-storage', s), SETTINGS);
    await loginPage(page, userA);

    // User A 修改资料
    await page.request.patch('/api/auth/profile', {
      data: { nickname: 'UserA-Private', bio: 'A only' },
    });

    // User B 登录
    const page2 = await secondContext.newPage();
    await page2.route('**/api/server-providers', (route) => {
      route.fulfill({ status: 200, body: JSON.stringify({ providers: {} }) });
    });
    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userB.email);
    await page2.getByLabel('密码').fill(userB.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    const profileB = await page2.request.get('/api/auth/profile');
    const b = await profileB.json();

    // User B 看到的是自己的资料，不是 A 的
    expect(b.nickname).not.toBe('UserA-Private');
    expect(b.bio).not.toBe('A only');
    expect(b.email).toBe(userB.email);
  });
});
