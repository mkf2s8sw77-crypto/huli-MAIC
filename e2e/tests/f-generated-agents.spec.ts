/**
 * Group F — Generated Agents 测试 (F-01 ~ F-03)
 *
 * 验证生成 agent 刷新恢复、跨浏览器可见、不同课程不串 agent。
 */

import { test, expect } from '../fixtures/auth';
import { seedStage, seedAgents } from '../fixtures/seed';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS = createSettingsStorage();

const AGENTS_COURSE_X = [
  { id: 'agent-teacher-x', name: '王老师', role: 'teacher', persona: '严谨的理科老师', color: '#3b82f6' },
  { id: 'agent-student-x', name: '小明', role: 'student', persona: '好奇心强的学生', color: '#ef4444' },
];

const AGENTS_COURSE_Y = [
  { id: 'agent-teacher-y', name: '李老师', role: 'teacher', persona: '活泼的文科老师', color: '#10b981' },
  { id: 'agent-narrator-y', name: '旁白', role: 'narrator', persona: '沉稳的旁白', color: '#8b5cf6' },
];

test.describe('F. Generated Agents', () => {
  // F-01 生成 agent 后刷新恢复
  test('F-01 agent 刷新恢复', async ({ authedPage: page, testId }) => {
    const stageId = `f01-${testId}`;
    await seedStage(page, { stageId, name: 'Agent测试-F01' });
    await seedAgents(page, stageId, AGENTS_COURSE_X);

    // 重新获取验证
    const res = await page.request.get(`/api/stages/${stageId}/agents`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.agents).toHaveLength(2);
    expect(data.agents.map((a: { name: string }) => a.name)).toContain('王老师');
    expect(data.agents.map((a: { name: string }) => a.name)).toContain('小明');
    expect(data.agents.find((a: { id: string }) => a.id === 'agent-teacher-x').role).toBe('teacher');
  });

  // F-02 Generated agents 跨浏览器可见
  test('F-02 agent 跨浏览器可见', async ({
    authedPage: page, userA, secondContext, testId,
  }) => {
    const stageId = `f02-${testId}`;
    await seedStage(page, { stageId, name: '跨浏览器Agent-F02' });
    await seedAgents(page, stageId, AGENTS_COURSE_X);

    const page2 = await secondContext.newPage();
    await page2.route('**/api/server-providers', (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ providers: {} }) }),
    );
    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userA.email);
    await page2.getByLabel('密码').fill(userA.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    const res = await page2.request.get(`/api/stages/${stageId}/agents`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.agents).toHaveLength(2);
  });

  // F-03 不同课程不串 agent
  test('F-03 不同课程不串 agent', async ({ authedPage: page, testId }) => {
    const stageX = `f03x-${testId}`;
    const stageY = `f03y-${testId}`;

    await seedStage(page, { stageId: stageX, name: '课程X-F03' });
    await seedStage(page, { stageId: stageY, name: '课程Y-F03' });

    await seedAgents(page, stageX, AGENTS_COURSE_X);
    await seedAgents(page, stageY, AGENTS_COURSE_Y);

    // 验证课程 X 的 agents
    const resX = await page.request.get(`/api/stages/${stageX}/agents`);
    const dataX = await resX.json();
    const namesX = dataX.agents.map((a: { name: string }) => a.name);
    expect(namesX).toContain('王老师');
    expect(namesX).not.toContain('李老师');

    // 验证课程 Y 的 agents
    const resY = await page.request.get(`/api/stages/${stageY}/agents`);
    const dataY = await resY.json();
    const namesY = dataY.agents.map((a: { name: string }) => a.name);
    expect(namesY).toContain('李老师');
    expect(namesY).not.toContain('王老师');
  });
});
