/**
 * Stage Storage Manager
 *
 * Phase 3: 所有业务数据真源均为服务端 SQLite。
 * 聊天、大纲、播放状态、Agent、媒体全部通过 API 读写。
 * 不再依赖 IndexedDB。
 */

import type { Stage, Scene } from '../types/stage';
import type { ChatSession } from '../types/chat';
import { saveChatSessions, loadChatSessions } from './chat-storage';
import { createLogger } from '@/lib/logger';
import { DEFAULT_VIEWPORT_PRESET, getViewportOption } from '@/lib/config/viewport';
import { withBasePath } from '@/lib/utils/base-path';

const log = createLogger('StageStorage');

export interface StageStoreData {
  stage: Stage;
  scenes: Scene[];
  currentSceneId: string | null;
  chats: ChatSession[];
}

export interface StageListItem {
  id: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  firstSlideCanvas?: Record<string, unknown> | null;
}

/**
 * Save stage data — stage/scenes to server, chats to server
 */
export async function saveStageData(stageId: string, data: StageStoreData): Promise<void> {
  try {
    const res = await fetch(withBasePath(`/api/stages/${encodeURIComponent(stageId)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: data.stage,
        scenes: data.scenes,
        currentSceneId: data.currentSceneId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      log.error('Server save failed:', err);
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    if (data.chats) {
      await saveChatSessions(stageId, data.chats);
    }

    log.info(`Saved stage: ${stageId}`);
  } catch (error) {
    log.error('Failed to save stage:', error);
    throw error;
  }
}

/**
 * Load stage data — everything from server
 */
export async function loadStageData(stageId: string): Promise<StageStoreData | null> {
  try {
    const res = await fetch(
      withBasePath(`/api/stages/${encodeURIComponent(stageId)}`),
    );

    if (!res.ok) {
      if (res.status === 404) {
        log.info(`Stage not found on server: ${stageId}`);
        return null;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const json = await res.json();
    if (!json.success || !json.stage) {
      log.info(`Stage not found: ${stageId}`);
      return null;
    }

    const stage: Stage = {
      ...json.stage,
      viewportPreset: getViewportOption(
        json.stage.viewportPreset || DEFAULT_VIEWPORT_PRESET,
      ).id,
    };
    const scenes: Scene[] = json.scenes || [];

    const chats = await loadChatSessions(stageId);

    log.info(`Loaded stage: ${stageId}, scenes: ${scenes.length}, chats: ${chats.length}`);

    return {
      stage,
      scenes,
      currentSceneId: json.stage.currentSceneId || scenes[0]?.id || null,
      chats,
    };
  } catch (error) {
    log.error('Failed to load stage:', error);
    return null;
  }
}

/**
 * Delete stage — server handles cascade for all related data (chats, outlines, media, agents)
 */
export async function deleteStageData(stageId: string): Promise<void> {
  try {
    const res = await fetch(
      withBasePath(`/api/stages/${encodeURIComponent(stageId)}`),
      { method: 'DELETE' },
    );

    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    log.info(`Deleted stage: ${stageId}`);
  } catch (error) {
    log.error('Failed to delete stage:', error);
    throw error;
  }
}

/**
 * List all stages for the current user
 */
export async function listStages(): Promise<StageListItem[]> {
  try {
    const res = await fetch(withBasePath('/api/stages'));
    if (!res.ok) {
      log.error('Failed to list stages:', res.status);
      return [];
    }

    const json = await res.json();
    return (json.stages || []) as StageListItem[];
  } catch (error) {
    log.error('Failed to list stages:', error);
    return [];
  }
}

/**
 * Get first slide canvas for thumbnails.
 *
 * Phase 3: Media placeholder resolution uses server-side media URLs.
 */
export async function getFirstSlideByStages(
  stageIds: string[],
  stageList?: StageListItem[],
): Promise<Record<string, import('../types/slides').Slide>> {
  const result: Record<string, import('../types/slides').Slide> = {};

  try {
    for (const stageId of stageIds) {
      const item = stageList?.find((s) => s.id === stageId);
      if (!item?.firstSlideCanvas) continue;

      const slide = structuredClone(item.firstSlideCanvas) as unknown as import('../types/slides').Slide;
      if (!slide?.elements) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const placeholderEls = slide.elements.filter((el: any) =>
        el.type === 'image' && /^gen_(img|vid)_[\w-]+$/i.test(el.src as string),
      );

      if (placeholderEls.length > 0) {
        try {
          const mediaRes = await fetch(
            withBasePath(`/api/stages/${encodeURIComponent(stageId)}/media`),
          );
          if (mediaRes.ok) {
            const mediaJson = await mediaRes.json();
            const mediaMap = new Map<string, string>();
            for (const f of mediaJson.files || []) {
              if (f.storageKey) {
                mediaMap.set(f.elementId, withBasePath(`/api/media/${f.storageKey}`));
              } else if (f.ossKey) {
                mediaMap.set(f.elementId, f.ossKey);
              }
            }
            for (const el of placeholderEls as Array<{ src: string }>) {
              const url = mediaMap.get(el.src);
              el.src = url || '';
            }
          } else {
            for (const el of placeholderEls as Array<{ src: string }>) {
              el.src = '';
            }
          }
        } catch {
          for (const el of placeholderEls as Array<{ src: string }>) {
            el.src = '';
          }
        }
      }

      result[stageId] = slide;
    }
  } catch (error) {
    log.error('Failed to load thumbnails:', error);
  }

  return result;
}

/**
 * Rename a stage (updates only the name field in IndexedDB)
 */
export async function renameStage(stageId: string, newName: string): Promise<void> {
  try {
    await db.stages.update(stageId, { name: newName, updatedAt: Date.now() });
    log.info(`Renamed stage ${stageId} to "${newName}"`);
  } catch (error) {
    log.error('Failed to rename stage:', error);
    throw error;
  }
}

/**
 * Check if stage exists
 */
export async function stageExists(stageId: string): Promise<boolean> {
  try {
    const res = await fetch(
      withBasePath(`/api/stages/${encodeURIComponent(stageId)}`),
      { method: 'GET' },
    );
    return res.ok;
  } catch {
    return false;
  }
}
