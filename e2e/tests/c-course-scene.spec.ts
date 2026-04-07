/**
 * Group C — 课程与场景测试 (C-01 ~ C-08)
 *
 * 验证课程创建、列表持久化、打开、编辑、跨浏览器、删除、owner 隔离。
 * 课程通过 API 种子创建（不依赖 LLM 生成），验证数据持久化链路。
 */

import { test, expect } from '../fixtures/auth';
import { seedStage } from '../fixtures/seed';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS = createSettingsStorage();

test.describe('C. 课程与场景', () => {
  // C-01 创建课程成功（via API seeding）
  test('C-01 创建课程成功', async ({ authedPage: page, testId }) => {
    const stageId = `c01-${testId}`;
    await seedStage(page, {
      stageId,
      name: '光合作用-C01',
      sceneTitles: ['基本概念', '光反应', '暗反应'],
    });

    // 验证 API 返回
    const res = await page.request.get(`/api/stages/${stageId}`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.stage.name).toBe('光合作用-C01');
    expect(data.scenes).toHaveLength(3);
  });

  // C-02 首页课程列表持久化
  test('C-02 首页课程列表持久化', async ({ authedPage: page, testId }) => {
    const stageId = `c02-${testId}`;
    await seedStage(page, { stageId, name: '列表测试-C02' });

    // 刷新首页
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 通过 API 验证列表包含新创建的课程
    const listRes = await page.request.get('/api/stages');
    const list = await listRes.json();
    const found = list.stages.find((s: { id: string }) => s.id === stageId);
    expect(found).toBeTruthy();
    expect(found.name).toBe('列表测试-C02');
  });

  // C-03 打开已有课程
  test('C-03 打开已有课程', async ({ authedPage: page, testId }) => {
    const stageId = `c03-${testId}`;
    await seedStage(page, {
      stageId,
      name: '打开测试-C03',
      sceneTitles: ['概述', '详情'],
    });

    const res = await page.request.get(`/api/stages/${stageId}`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.scenes).toHaveLength(2);
    expect(data.scenes[0].title).toBe('概述');
  });

  // C-04 场景编辑后刷新仍在
  test('C-04 场景编辑后刷新仍在', async ({ authedPage: page, testId }) => {
    const stageId = `c04-${testId}`;
    const { scenes } = await seedStage(page, {
      stageId,
      name: '编辑测试-C04',
      sceneTitles: ['原始内容'],
    });

    // 通过 API 更新场景内容
    const updatedScenes = scenes.map((s) => ({
      ...s,
      title: '已修改内容',
      content: {
        type: 'slide',
        canvas: {
          ...((s.content as Record<string, unknown>).canvas as Record<string, unknown>),
          elements: [
            { type: 'text', id: 'el-edited', content: '<p>已修改内容</p>', left: 50, top: 50, width: 900, height: 100 },
          ],
        },
      },
    }));

    await page.request.put(`/api/stages/${stageId}`, {
      data: { scenes: updatedScenes, currentSceneId: scenes[0].id },
    });

    // 重新获取验证
    const res = await page.request.get(`/api/stages/${stageId}`);
    const data = await res.json();
    expect(data.scenes[0].title).toBe('已修改内容');
  });

  // C-05 同账号跨浏览器可见
  test('C-05 同账号跨浏览器可见', async ({
    authedPage: page, userA, secondContext, testId,
  }) => {
    const stageId = `c05-${testId}`;
    await seedStage(page, {
      stageId,
      name: '跨浏览器-C05',
      sceneTitles: ['S1', 'S2'],
    });

    // 浏览器 2 登录 userA
    const page2 = await secondContext.newPage();
    await page2.route('**/api/server-providers', (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ providers: {} }) }),
    );
    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userA.email);
    await page2.getByLabel('密码').fill(userA.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    // 浏览器 2 可以看到课程
    const listRes = await page2.request.get('/api/stages');
    const list = await listRes.json();
    const found = list.stages.find((s: { id: string }) => s.id === stageId);
    expect(found).toBeTruthy();

    // 浏览器 2 可以打开课程
    const stageRes = await page2.request.get(`/api/stages/${stageId}`);
    expect(stageRes.ok()).toBe(true);
    const data = await stageRes.json();
    expect(data.scenes).toHaveLength(2);
  });

  // C-06 删除课程
  test('C-06 删除课程', async ({ authedPage: page, testId }) => {
    const stageId = `c06-${testId}`;
    await seedStage(page, { stageId, name: '删除测试-C06' });

    // 验证存在
    const before = await page.request.get(`/api/stages/${stageId}`);
    expect(before.ok()).toBe(true);

    // 删除
    const delRes = await page.request.delete(`/api/stages/${stageId}`);
    expect(delRes.ok()).toBe(true);

    // 验证已消失
    const after = await page.request.get(`/api/stages/${stageId}`);
    expect(after.status()).toBe(404);
  });

  // C-07 非 owner 无法读取课程
  test('C-07 非 owner 无法读取课程', async ({
    authedPage: page, userB, registerUser, secondContext, testId,
  }) => {
    const stageId = `c07-${testId}`;
    await seedStage(page, { stageId, name: 'Owner隔离-C07' });

    // 注册并登录 userB
    await registerUser(userB);
    const page2 = await secondContext.newPage();
    await page2.route('**/api/server-providers', (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ providers: {} }) }),
    );
    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userB.email);
    await page2.getByLabel('密码').fill(userB.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    // User B 尝试读取 User A 的课程
    const res = await page2.request.get(`/api/stages/${stageId}`);
    expect(res.ok()).toBe(false);
    expect([403, 404]).toContain(res.status());
  });

  // C-08 非 owner 无法删除课程
  test('C-08 非 owner 无法删除课程', async ({
    authedPage: page, userB, registerUser, secondContext, testId,
  }) => {
    const stageId = `c08-${testId}`;
    await seedStage(page, { stageId, name: '删除隔离-C08' });

    await registerUser(userB);
    const page2 = await secondContext.newPage();
    await page2.route('**/api/server-providers', (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ providers: {} }) }),
    );
    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userB.email);
    await page2.getByLabel('密码').fill(userB.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    // User B 尝试删除
    const delRes = await page2.request.delete(`/api/stages/${stageId}`);
    expect(delRes.ok()).toBe(false);

    // User A 的课程仍在
    const checkRes = await page.request.get(`/api/stages/${stageId}`);
    expect(checkRes.ok()).toBe(true);
  });
});
