/**
 * Group E — 大纲与播放进度测试 (E-01 ~ E-03)
 *
 * 验证大纲刷新恢复、播放进度恢复、跨重新登录恢复。
 */

import { test, expect } from '../fixtures/auth';
import { seedStage, seedOutlines, seedPlayback } from '../fixtures/seed';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS = createSettingsStorage();

const MOCK_OUTLINES = [
  {
    sceneIndex: 0,
    title: '光合作用概述',
    keyPoints: ['定义', '意义', '分类'],
    mediaGenerations: 0,
  },
  {
    sceneIndex: 1,
    title: '光反应',
    keyPoints: ['场所', '过程', '产物'],
    mediaGenerations: 0,
  },
  {
    sceneIndex: 2,
    title: '暗反应',
    keyPoints: ['碳固定', 'Calvin循环'],
    mediaGenerations: 0,
  },
];

test.describe('E. 大纲与播放进度', () => {
  // E-01 stage outlines 刷新恢复
  test('E-01 大纲刷新恢复', async ({ authedPage: page, testId }) => {
    const stageId = `e01-${testId}`;
    await seedStage(page, {
      stageId,
      name: '大纲测试-E01',
      sceneTitles: ['概述', '光反应', '暗反应'],
    });
    await seedOutlines(page, stageId, MOCK_OUTLINES);

    // 重新获取验证
    const res = await page.request.get(`/api/stages/${stageId}/outlines`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.outlines).toHaveLength(3);
    expect(data.outlines[0].title).toBe('光合作用概述');
    expect(data.outlines[1].keyPoints).toContain('场所');
  });

  // E-02 播放进度恢复
  test('E-02 播放进度恢复', async ({ authedPage: page, testId }) => {
    const stageId = `e02-${testId}`;
    const { scenes } = await seedStage(page, {
      stageId,
      name: '播放测试-E02',
      sceneTitles: ['S1', 'S2', 'S3'],
    });

    // 模拟播放到第 2 页第 3 个 action
    await seedPlayback(page, stageId, {
      sceneIndex: 1,
      actionIndex: 2,
      sceneId: scenes[1].id,
    });

    // 重新获取验证
    const res = await page.request.get(`/api/stages/${stageId}/playback`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.playback).toBeTruthy();
    expect(data.playback.sceneIndex).toBe(1);
    expect(data.playback.actionIndex).toBe(2);
    expect(data.playback.sceneId).toBe(scenes[1].id);
  });

  // E-03 播放进度跨重新登录恢复
  test('E-03 播放进度跨重新登录恢复', async ({
    page, userA, registerUser, loginPage, testId,
  }) => {
    await registerUser(userA);
    await page.addInitScript((s) => localStorage.setItem('settings-storage', s), SETTINGS);
    await loginPage(page, userA);

    const stageId = `e03-${testId}`;
    const { scenes } = await seedStage(page, {
      stageId,
      name: '跨登录播放-E03',
      sceneTitles: ['P1', 'P2'],
    });

    await seedPlayback(page, stageId, {
      sceneIndex: 0,
      actionIndex: 5,
      sceneId: scenes[0].id,
    });

    // 登出（通过清空 cookie 模拟）
    await page.context().clearCookies();

    // 重新登录
    await loginPage(page, userA);

    // 验证播放进度仍在
    const res = await page.request.get(`/api/stages/${stageId}/playback`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.playback.sceneIndex).toBe(0);
    expect(data.playback.actionIndex).toBe(5);
  });
});
