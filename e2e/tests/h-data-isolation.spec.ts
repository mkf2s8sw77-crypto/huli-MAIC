/**
 * Group H — 数据隔离与安全测试 (H-01 ~ H-03)
 *
 * 验证用户 B 无法访问用户 A 的课程列表、聊天、媒体，
 * 以及通过猜测 stageId 也无法越权。
 */

import { test, expect } from '../fixtures/auth';
import { seedStage, seedChat, seedMediaMetadata, seedAgents } from '../fixtures/seed';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS = createSettingsStorage();

test.describe('H. 数据隔离与安全', () => {
  // H-01 用户 B 看不到用户 A 的课程列表
  test('H-01 课程列表隔离', async ({
    authedPage: page, userB, registerUser, secondContext, testId,
  }) => {
    // User A 创建多个课程
    await seedStage(page, { stageId: `h01a-${testId}`, name: '课程A1-H01' });
    await seedStage(page, { stageId: `h01b-${testId}`, name: '课程A2-H01' });

    // User B 登录
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

    // User B 的课程列表不应包含 A 的课程
    const listRes = await page2.request.get('/api/stages');
    const list = await listRes.json();
    const ids = (list.stages || []).map((s: { id: string }) => s.id);
    expect(ids).not.toContain(`h01a-${testId}`);
    expect(ids).not.toContain(`h01b-${testId}`);
  });

  // H-02 用户 B 看不到用户 A 的聊天与媒体
  test('H-02 聊天与媒体隔离', async ({
    authedPage: page, userB, registerUser, secondContext, testId,
  }) => {
    const stageId = `h02-${testId}`;
    await seedStage(page, { stageId, name: '隔离测试-H02' });
    await seedChat(page, stageId, [
      { id: 'h02-chat', type: 'qa', title: 'Secret Chat', messages: [{ role: 'user', content: 'secret' }] },
    ]);
    await seedMediaMetadata(page, stageId, { elementId: 'h02-img', prompt: 'secret media' });

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

    // User B 尝试读取 A 的聊天
    const chatRes = await page2.request.get(`/api/stages/${stageId}/chats`);
    expect(chatRes.ok()).toBe(false);

    // User B 尝试读取 A 的媒体
    const mediaRes = await page2.request.get(`/api/stages/${stageId}/media`);
    expect(mediaRes.ok()).toBe(false);
  });

  // H-03 猜测 stageId 无法越权
  test('H-03 猜测 stageId / 子资源 URL 无法越权', async ({
    authedPage: page, userB, registerUser, secondContext, testId,
  }) => {
    const stageId = `h03-${testId}`;
    await seedStage(page, { stageId, name: '越权测试-H03' });
    await seedChat(page, stageId, [
      { id: 'h03-chat', type: 'qa', title: 'T', messages: [] },
    ]);
    await seedMediaMetadata(page, stageId, { elementId: 'h03-media' });

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

    // 尝试所有子资源 API
    const endpoints = [
      `/api/stages/${stageId}`,
      `/api/stages/${stageId}/chats`,
      `/api/stages/${stageId}/outlines`,
      `/api/stages/${stageId}/playback`,
      `/api/stages/${stageId}/agents`,
      `/api/stages/${stageId}/media`,
    ];

    for (const ep of endpoints) {
      const res = await page2.request.get(ep);
      expect(res.ok(), `Expected ${ep} to deny access, got ${res.status()}`).toBe(false);
    }

    // 尝试写入操作也应失败
    const putRes = await page2.request.put(`/api/stages/${stageId}`, {
      data: { stage: { name: 'hacked' } },
    });
    expect(putRes.ok()).toBe(false);

    const delRes = await page2.request.delete(`/api/stages/${stageId}`);
    expect(delRes.ok()).toBe(false);
  });
});
