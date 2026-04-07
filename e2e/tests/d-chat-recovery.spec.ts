/**
 * Group D — 聊天与恢复测试 (D-01 ~ D-04)
 *
 * 验证聊天持久化、跨浏览器可见、owner 隔离。
 */

import { test, expect } from '../fixtures/auth';
import { seedStage, seedChat } from '../fixtures/seed';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS = createSettingsStorage();

const MOCK_QA_SESSION = {
  id: 'qa-session-1',
  type: 'qa',
  title: 'QA Test Chat',
  messages: [
    { role: 'user', content: '光合作用是什么？' },
    { role: 'assistant', content: '光合作用是植物利用光能将二氧化碳和水转化为有机物的过程。' },
  ],
};

const MOCK_DISCUSSION_SESSION = {
  id: 'disc-session-1',
  type: 'discussion',
  title: 'Discussion Test',
  messages: [
    { role: 'user', content: '讨论光反应的意义' },
    { role: 'assistant', content: '光反应阶段产生 ATP 和 NADPH，为暗反应提供能量。' },
  ],
};

test.describe('D. 聊天与恢复', () => {
  // D-01 QA 聊天持久化
  test('D-01 QA 聊天持久化', async ({ authedPage: page, testId }) => {
    const stageId = `d01-${testId}`;
    await seedStage(page, { stageId, name: '聊天测试-D01' });
    await seedChat(page, stageId, [MOCK_QA_SESSION]);

    // 重新获取验证
    const res = await page.request.get(`/api/stages/${stageId}/chats`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].type).toBe('qa');
    expect(data.sessions[0].messages).toHaveLength(2);
    expect(data.sessions[0].messages[0].content).toContain('光合作用');
  });

  // D-02 讨论会话持久化
  test('D-02 讨论会话持久化', async ({ authedPage: page, testId }) => {
    const stageId = `d02-${testId}`;
    await seedStage(page, { stageId, name: '讨论测试-D02' });
    await seedChat(page, stageId, [MOCK_DISCUSSION_SESSION]);

    const res = await page.request.get(`/api/stages/${stageId}/chats`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].type).toBe('discussion');
  });

  // D-03 聊天跨浏览器可见
  test('D-03 聊天跨浏览器可见', async ({
    authedPage: page, userA, secondContext, testId,
  }) => {
    const stageId = `d03-${testId}`;
    await seedStage(page, { stageId, name: '跨浏览器聊天-D03' });
    await seedChat(page, stageId, [MOCK_QA_SESSION, MOCK_DISCUSSION_SESSION]);

    // 浏览器 2
    const page2 = await secondContext.newPage();
    await page2.route('**/api/server-providers', (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ providers: {} }) }),
    );
    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userA.email);
    await page2.getByLabel('密码').fill(userA.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    const res = await page2.request.get(`/api/stages/${stageId}/chats`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.sessions).toHaveLength(2);
  });

  // D-04 非 owner 无法读取聊天
  test('D-04 非 owner 无法读取聊天', async ({
    authedPage: page, userB, registerUser, secondContext, testId,
  }) => {
    const stageId = `d04-${testId}`;
    await seedStage(page, { stageId, name: '聊天隔离-D04' });
    await seedChat(page, stageId, [MOCK_QA_SESSION]);

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

    const res = await page2.request.get(`/api/stages/${stageId}/chats`);
    expect(res.ok()).toBe(false);
    expect([403, 404]).toContain(res.status());
  });
});
