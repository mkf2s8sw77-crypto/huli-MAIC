/**
 * Media Generation Store
 *
 * Phase 3: 持久化真源改为服务端（SQLite 元数据 + 文件系统）。
 * restoreFromDB 改为从 /api/stages/:id/media 获取，
 * objectUrl 指向 /api/media/:storageKey。
 */

import { create } from 'zustand';
import type { MediaGenerationRequest } from '@/lib/media/types';
import { withBasePath } from '@/lib/utils/base-path';
import { createLogger } from '@/lib/logger';

const log = createLogger('MediaGenerationStore');

export type MediaTaskStatus = 'pending' | 'generating' | 'done' | 'failed';

export interface MediaTask {
  elementId: string;
  type: 'image' | 'video';
  status: MediaTaskStatus;
  prompt: string;
  params: {
    aspectRatio?: string;
    style?: string;
    duration?: number;
  };
  objectUrl?: string;
  poster?: string;
  error?: string;
  errorCode?: string;
  retryCount: number;
  stageId: string;
}

interface MediaGenerationState {
  tasks: Record<string, MediaTask>;

  enqueueTasks: (stageId: string, requests: MediaGenerationRequest[]) => void;
  markGenerating: (elementId: string) => void;
  markDone: (elementId: string, objectUrl: string, poster?: string) => void;
  markFailed: (elementId: string, error: string, errorCode?: string) => void;
  markPendingForRetry: (elementId: string) => void;

  getTask: (elementId: string) => MediaTask | undefined;
  isReady: (elementId: string) => boolean;

  restoreFromDB: (stageId: string) => Promise<void>;
  clearStage: (stageId: string) => void;
  revokeObjectUrls: () => void;
}

export function isMediaPlaceholder(src: string): boolean {
  return /^gen_(img|vid)_[\w-]+$/i.test(src);
}

export const useMediaGenerationStore = create<MediaGenerationState>()((set, get) => ({
  tasks: {},

  enqueueTasks: (stageId, requests) => {
    const newTasks: Record<string, MediaTask> = {};
    for (const req of requests) {
      if (get().tasks[req.elementId]) continue;
      newTasks[req.elementId] = {
        elementId: req.elementId,
        type: req.type,
        status: 'pending',
        prompt: req.prompt,
        params: {
          aspectRatio: req.aspectRatio,
          style: req.style,
        },
        retryCount: 0,
        stageId,
      };
    }
    if (Object.keys(newTasks).length > 0) {
      set((s) => ({ tasks: { ...s.tasks, ...newTasks } }));
    }
  },

  markGenerating: (elementId) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: { ...s.tasks, [elementId]: { ...task, status: 'generating' } },
      };
    }),

  markDone: (elementId, objectUrl, poster) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: {
            ...task,
            status: 'done',
            objectUrl,
            poster,
            error: undefined,
          },
        },
      };
    }),

  markFailed: (elementId, error, errorCode) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: { ...task, status: 'failed', error, errorCode },
        },
      };
    }),

  markPendingForRetry: (elementId) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: {
            ...task,
            status: 'pending',
            error: undefined,
            errorCode: undefined,
            retryCount: task.retryCount + 1,
          },
        },
      };
    }),

  getTask: (elementId) => get().tasks[elementId],

  isReady: (elementId) => get().tasks[elementId]?.status === 'done',

  restoreFromDB: async (stageId) => {
    try {
      const res = await fetch(
        withBasePath(`/api/stages/${encodeURIComponent(stageId)}/media`),
      );
      if (!res.ok) return;
      const json = await res.json();
      const files = json.files || [];

      const restored: Record<string, MediaTask> = {};
      for (const rec of files) {
        const elementId = rec.elementId as string;
        const params = (rec.params || {}) as Record<string, unknown>;

        if (rec.error) {
          restored[elementId] = {
            elementId,
            type: rec.type as 'image' | 'video',
            status: 'failed',
            prompt: rec.prompt as string,
            params: params as MediaTask['params'],
            error: rec.error as string,
            errorCode: rec.errorCode as string | undefined,
            retryCount: 0,
            stageId,
          };
        } else if (rec.storageKey) {
          const objectUrl = withBasePath(`/api/media/${rec.storageKey}`);
          const poster = rec.posterStorageKey
            ? withBasePath(`/api/media/${rec.posterStorageKey}`)
            : rec.posterOssKey || undefined;
          restored[elementId] = {
            elementId,
            type: rec.type as 'image' | 'video',
            status: 'done',
            prompt: rec.prompt as string,
            params: params as MediaTask['params'],
            objectUrl,
            poster,
            retryCount: 0,
            stageId,
          };
        } else if (rec.ossKey) {
          restored[elementId] = {
            elementId,
            type: rec.type as 'image' | 'video',
            status: 'done',
            prompt: rec.prompt as string,
            params: params as MediaTask['params'],
            objectUrl: rec.ossKey as string,
            poster: rec.posterOssKey as string | undefined,
            retryCount: 0,
            stageId,
          };
        }
      }

      if (Object.keys(restored).length > 0) {
        set((s) => ({ tasks: { ...s.tasks, ...restored } }));
      }
    } catch (err) {
      log.error('Failed to restore from server:', err);
    }
  },

  clearStage: (stageId) =>
    set((s) => {
      const remaining: Record<string, MediaTask> = {};
      for (const [id, task] of Object.entries(s.tasks)) {
        if (task.stageId !== stageId) {
          remaining[id] = task;
        }
      }
      return { tasks: remaining };
    }),

  revokeObjectUrls: () => {
    // Server URLs don't need revoking (no blob: URLs anymore)
  },
}));
