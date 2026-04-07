/**
 * Group I — 本地存储退场验证 (I-01 ~ I-02)
 *
 * 验证清空浏览器本地 IndexedDB / localStorage 后业务数据仍存在，
 * 以及新浏览器首次登录即可看到完整数据。
 */

import { test, expect } from '../fixtures/auth';
import { seedStage, seedChat, seedOutlines, seedPlayback, seedAgents } from '../fixtures/seed';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS = createSettingsStorage();

test.describe('I. 本地存储退场验证', () => {
  // I-01 清空浏览器本地业务库后数据仍存在
  test('I-01 清空本地存储后数据仍存在', async ({ authedPage: page, testId }) => {
    const stageId = `i01-${testId}`;
    await seedStage(page, {
      stageId,
      name: '本地存储测试-I01',
      sceneTitles: ['Scene A', 'Scene B'],
    });
    await seedChat(page, stageId, [
      { id: 'i01-chat', type: 'qa', title: 'Chat', messages: [{ role: 'user', content: 'hi' }] },
    ]);
    await seedOutlines(page, stageId, [{ sceneIndex: 0, title: 'Outline', keyPoints: ['K1'] }]);
    await seedPlayback(page, stageId, { sceneIndex: 1, actionIndex: 3 });
    await seedAgents(page, stageId, [
      { id: 'i01-agent', name: 'TestAgent', role: 'teacher' },
    ]);

    // 清空 IndexedDB 和 localStorage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
      return dbs.then((databases: IDBDatabaseInfo[]) => {
        for (const db of databases) {
          if (db.name) indexedDB.deleteDatabase(db.name);
        }
      });
    });

    // 等一会确保清除完成
    await page.waitForTimeout(500);

    // 恢复 settings（这是设备偏好，允许丢失后重设）
    await page.evaluate(
      (s) => localStorage.setItem('settings-storage', s),
      SETTINGS,
    );

    // 重新加载 — 会话 cookie 仍有效
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 核心业务数据仍从服务端获取
    const stageRes = await page.request.get(`/api/stages/${stageId}`);
    expect(stageRes.ok()).toBe(true);
    const stageData = await stageRes.json();
    expect(stageData.scenes).toHaveLength(2);

    const chatRes = await page.request.get(`/api/stages/${stageId}/chats`);
    expect(chatRes.ok()).toBe(true);
    const chatData = await chatRes.json();
    expect(chatData.sessions).toHaveLength(1);

    const outlineRes = await page.request.get(`/api/stages/${stageId}/outlines`);
    expect(outlineRes.ok()).toBe(true);
    const outlineData = await outlineRes.json();
    expect(outlineData.outlines).toHaveLength(1);

    const playbackRes = await page.request.get(`/api/stages/${stageId}/playback`);
    expect(playbackRes.ok()).toBe(true);
    const pbData = await playbackRes.json();
    expect(pbData.playback.sceneIndex).toBe(1);

    const agentRes = await page.request.get(`/api/stages/${stageId}/agents`);
    expect(agentRes.ok()).toBe(true);
    const agentData = await agentRes.json();
    expect(agentData.agents).toHaveLength(1);
  });

  // I-02 新浏览器首次登录即可看到完整业务数据
  test('I-02 新浏览器首次登录可见完整数据', async ({
    authedPage: page, userA, secondContext, testId,
  }) => {
    const stageId = `i02-${testId}`;
    await seedStage(page, {
      stageId,
      name: '新浏览器测试-I02',
      sceneTitles: ['S1'],
    });
    await seedChat(page, stageId, [
      { id: 'i02-chat', type: 'qa', title: 'C', messages: [{ role: 'user', content: 'msg' }] },
    ]);

    // 新浏览器（无任何历史 cookie / localStorage / IndexedDB）
    const page2 = await secondContext.newPage();
    await page2.route('**/api/server-providers', (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ providers: {} }) }),
    );

    // 登录
    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userA.email);
    await page2.getByLabel('密码').fill(userA.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    // 验证数据
    const stageRes = await page2.request.get(`/api/stages/${stageId}`);
    expect(stageRes.ok()).toBe(true);

    const chatRes = await page2.request.get(`/api/stages/${stageId}/chats`);
    expect(chatRes.ok()).toBe(true);
    const chatData = await chatRes.json();
    expect(chatData.sessions).toHaveLength(1);

    const listRes = await page2.request.get('/api/stages');
    const list = await listRes.json();
    const found = list.stages.find((s: { id: string }) => s.id === stageId);
    expect(found).toBeTruthy();
  });
});
