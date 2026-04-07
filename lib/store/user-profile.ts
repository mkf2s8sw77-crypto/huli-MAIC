/**
 * User Profile Store
 *
 * Phase 1 改造：数据真源从 localStorage 变为服务端 SQLite。
 *
 * 保留 zustand store 作为 UI 层缓存，但：
 *   - 不再使用 persist 中间件写入 localStorage
 *   - 登录后通过 hydrateFromServer() 从服务端拉取资料
 *   - setAvatar / setNickname / setBio 同时写服务端
 *   - 未登录时 store 保持默认值
 */

import { create } from 'zustand';
import { withBasePath } from '@/lib/utils/base-path';

/** 预定义头像选项 */
export const AVATAR_OPTIONS = [
  '/avatars/user.png',
  '/avatars/teacher-2.png',
  '/avatars/assist-2.png',
  '/avatars/clown-2.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker-2.png',
  '/avatars/thinker-2.png',
] as const;

export interface UserProfileState {
  avatar: string;
  nickname: string;
  bio: string;
  /** 标记是否已从服务端加载过 */
  _hydrated: boolean;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
  /** 从服务端拉取当前用户资料 */
  hydrateFromServer: () => Promise<void>;
  /** 清除 store（登出时调用） */
  clearProfile: () => void;
}

async function patchProfile(updates: Record<string, string>) {
  try {
    const res = await fetch(withBasePath('/api/auth/profile'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) console.warn('[UserProfile] Failed to persist profile:', res.status);
  } catch (err) {
    console.warn('[UserProfile] Failed to persist profile:', err);
  }
}

export const useUserProfileStore = create<UserProfileState>()((set) => ({
  avatar: AVATAR_OPTIONS[0],
  nickname: '',
  bio: '',
  _hydrated: false,

  setAvatar: (avatar) => {
    set({ avatar });
    void patchProfile({ avatar });
  },

  setNickname: (nickname) => {
    set({ nickname });
    void patchProfile({ nickname });
  },

  setBio: (bio) => {
    set({ bio });
    void patchProfile({ bio });
  },

  hydrateFromServer: async () => {
    try {
      const res = await fetch(withBasePath('/api/auth/profile'));
      if (!res.ok) return;
      const data = await res.json();
      set({
        avatar: data.avatar || AVATAR_OPTIONS[0],
        nickname: data.nickname || '',
        bio: data.bio || '',
        _hydrated: true,
      });
    } catch {
      // 网络失败时保持当前值
    }
  },

  clearProfile: () => {
    set({
      avatar: AVATAR_OPTIONS[0],
      nickname: '',
      bio: '',
      _hydrated: false,
    });
  },
}));
