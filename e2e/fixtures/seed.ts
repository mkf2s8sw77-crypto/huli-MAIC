/**
 * Data seeding helpers for e2e tests.
 *
 * Seed stages, scenes, chats, outlines, playback state, agents, and media
 * via the real API routes. Requires an authenticated page context.
 */

import type { Page } from '@playwright/test';
import { defaultTheme } from './test-data/scene-content';

const BASE = '';

function makeSlideContent(title: string, elId: string) {
  return {
    type: 'slide',
    canvas: {
      id: `slide-${elId}`,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: defaultTheme,
      elements: [
        {
          type: 'text',
          id: `el-${elId}`,
          content: `<p>${title}</p>`,
          left: 50,
          top: 50,
          width: 900,
          height: 100,
        },
      ],
    },
  };
}

export interface SeedStageOptions {
  stageId: string;
  name: string;
  sceneCount?: number;
  sceneTitles?: string[];
  language?: string;
}

export async function seedStage(page: Page, opts: SeedStageOptions) {
  const scenes = (opts.sceneTitles ?? ['Scene 1', 'Scene 2', 'Scene 3'])
    .slice(0, opts.sceneCount ?? 3)
    .map((title, i) => ({
      id: `${opts.stageId}-scene-${i}`,
      stageId: opts.stageId,
      type: 'slide',
      title,
      order: i,
      content: makeSlideContent(title, `${opts.stageId}-${i}`),
    }));

  const res = await page.request.post(`${BASE}/api/stages`, {
    data: {
      stage: {
        id: opts.stageId,
        name: opts.name,
        description: `E2E test stage: ${opts.name}`,
        language: opts.language ?? 'zh-CN',
        style: 'professional',
      },
      scenes,
      currentSceneId: scenes[0]?.id ?? null,
    },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`seedStage failed (${res.status()}): ${body}`);
  }
  return { stageId: opts.stageId, scenes };
}

export async function seedChat(
  page: Page,
  stageId: string,
  sessions: Array<{
    id: string;
    type: string;
    title: string;
    messages: unknown[];
  }>,
) {
  const full = sessions.map((s) => ({
    ...s,
    status: 'idle',
    config: {},
    toolCalls: [],
    sceneId: null,
    lastActionIndex: null,
  }));

  const res = await page.request.put(`${BASE}/api/stages/${stageId}/chats`, {
    data: { sessions: full },
  });
  if (!res.ok()) throw new Error(`seedChat failed: ${res.status()}`);
}

export async function seedOutlines(page: Page, stageId: string, outlines: unknown[]) {
  const res = await page.request.put(`${BASE}/api/stages/${stageId}/outlines`, {
    data: { outlines },
  });
  if (!res.ok()) throw new Error(`seedOutlines failed: ${res.status()}`);
}

export async function seedPlayback(
  page: Page,
  stageId: string,
  state: { sceneIndex: number; actionIndex: number; sceneId?: string },
) {
  const res = await page.request.put(`${BASE}/api/stages/${stageId}/playback`, {
    data: {
      sceneIndex: state.sceneIndex,
      actionIndex: state.actionIndex,
      consumedDiscussions: [],
      sceneId: state.sceneId,
    },
  });
  if (!res.ok()) throw new Error(`seedPlayback failed: ${res.status()}`);
}

export async function seedAgents(
  page: Page,
  stageId: string,
  agents: Array<{
    id: string;
    name: string;
    role: string;
    persona?: string;
    avatar?: string;
    color?: string;
  }>,
) {
  const full = agents.map((a) => ({
    persona: '',
    avatar: '/avatars/teacher.png',
    color: '#3b82f6',
    priority: 5,
    voiceConfig: null,
    ...a,
  }));

  const res = await page.request.put(`${BASE}/api/stages/${stageId}/agents`, {
    data: { agents: full },
  });
  if (!res.ok()) throw new Error(`seedAgents failed: ${res.status()}`);
}

export async function seedMediaMetadata(
  page: Page,
  stageId: string,
  media: {
    elementId: string;
    type?: string;
    prompt?: string;
    error?: string | null;
    errorCode?: string | null;
  },
) {
  const res = await page.request.post(`${BASE}/api/stages/${stageId}/media`, {
    data: {
      elementId: media.elementId,
      type: media.type ?? 'image',
      mimeType: media.type === 'video' ? 'video/mp4' : 'image/png',
      size: 0,
      prompt: media.prompt ?? 'test prompt',
      error: media.error ?? null,
      errorCode: media.errorCode ?? null,
    },
  });
  if (!res.ok()) throw new Error(`seedMediaMetadata failed: ${res.status()}`);
}
