/**
 * Group G — 媒体持久化测试 (G-01 ~ G-06)
 *
 * 验证媒体元数据持久化、跨浏览器可见、首页缩略图、错误态恢复。
 *
 * 注意：实际图片/视频文件生成需要可用的 provider。
 * 此测试验证元数据链路（storageKey / error / mimeType 等），
 * 对于依赖外部 provider 的用例标记为 provider-dependent。
 */

import { test, expect } from '../fixtures/auth';
import { seedStage, seedMediaMetadata } from '../fixtures/seed';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS = createSettingsStorage();

test.describe('G. 媒体持久化', () => {
  // G-01 生成图片后刷新仍在（元数据层验证）
  test('G-01 图片元数据刷新恢复', async ({ authedPage: page, testId }) => {
    const stageId = `g01-${testId}`;
    await seedStage(page, { stageId, name: '图片测试-G01' });
    await seedMediaMetadata(page, stageId, {
      elementId: 'gen_img_1',
      type: 'image',
      prompt: 'photosynthesis diagram',
    });

    const res = await page.request.get(`/api/stages/${stageId}/media`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.files).toHaveLength(1);
    expect(data.files[0].elementId).toBe('gen_img_1');
    expect(data.files[0].type).toBe('image');
    expect(data.files[0].prompt).toBe('photosynthesis diagram');
  });

  // G-02 生成视频后刷新仍在（元数据层验证）
  test('G-02 视频元数据刷新恢复', async ({ authedPage: page, testId }) => {
    const stageId = `g02-${testId}`;
    await seedStage(page, { stageId, name: '视频测试-G02' });
    await seedMediaMetadata(page, stageId, {
      elementId: 'gen_vid_1',
      type: 'video',
      prompt: 'chloroplast animation',
    });

    const res = await page.request.get(`/api/stages/${stageId}/media`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.files).toHaveLength(1);
    expect(data.files[0].elementId).toBe('gen_vid_1');
    expect(data.files[0].type).toBe('video');
  });

  // G-03 媒体跨浏览器可见
  test('G-03 媒体跨浏览器可见', async ({
    authedPage: page, userA, secondContext, testId,
  }) => {
    const stageId = `g03-${testId}`;
    await seedStage(page, { stageId, name: '跨浏览器媒体-G03' });
    await seedMediaMetadata(page, stageId, {
      elementId: 'gen_img_cross',
      type: 'image',
      prompt: 'test image',
    });

    const page2 = await secondContext.newPage();
    await page2.route('**/api/server-providers', (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ providers: {} }) }),
    );
    await page2.goto('/login');
    await page2.getByLabel('邮箱').fill(userA.email);
    await page2.getByLabel('密码').fill(userA.password);
    await page2.getByRole('button', { name: '登录' }).click();
    await page2.waitForURL('/', { timeout: 15_000 });

    const res = await page2.request.get(`/api/stages/${stageId}/media`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.files).toHaveLength(1);
    expect(data.files[0].elementId).toBe('gen_img_cross');
  });

  // G-04 服务端重启后媒体仍可访问
  // 注：无法在 e2e 中真正重启进程，但可以验证数据持久化到 SQLite
  test('G-04 媒体元数据持久化在数据库中', async ({ authedPage: page, testId }) => {
    const stageId = `g04-${testId}`;
    await seedStage(page, { stageId, name: '持久化测试-G04' });
    await seedMediaMetadata(page, stageId, {
      elementId: 'gen_img_persist',
      type: 'image',
      prompt: 'persistent image',
    });

    // 多次获取，验证结果一致
    for (let i = 0; i < 3; i++) {
      const res = await page.request.get(`/api/stages/${stageId}/media`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data.files).toHaveLength(1);
      expect(data.files[0].prompt).toBe('persistent image');
    }
  });

  // G-05 首页缩略图可用（课程列表含 firstSlideCanvas）
  test('G-05 首页课程列表返回缩略图数据', async ({ authedPage: page, testId }) => {
    const stageId = `g05-${testId}`;
    await seedStage(page, {
      stageId,
      name: '缩略图测试-G05',
      sceneTitles: ['Thumbnail Scene'],
    });

    const listRes = await page.request.get('/api/stages');
    expect(listRes.ok()).toBe(true);
    const list = await listRes.json();
    const found = list.stages.find((s: { id: string }) => s.id === stageId);
    expect(found).toBeTruthy();
    // firstSlideCanvas should be populated
    expect(found.firstSlideCanvas).toBeTruthy();
  });

  // G-06 媒体错误态可恢复或可见
  test('G-06 媒体错误态持久化', async ({ authedPage: page, testId }) => {
    const stageId = `g06-${testId}`;
    await seedStage(page, { stageId, name: '错误态测试-G06' });
    await seedMediaMetadata(page, stageId, {
      elementId: 'gen_img_err',
      type: 'image',
      prompt: 'failed generation',
      error: 'Provider returned 500',
      errorCode: 'PROVIDER_ERROR',
    });

    const res = await page.request.get(`/api/stages/${stageId}/media`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.files).toHaveLength(1);
    expect(data.files[0].error).toBe('Provider returned 500');
    expect(data.files[0].errorCode).toBe('PROVIDER_ERROR');
  });
});
