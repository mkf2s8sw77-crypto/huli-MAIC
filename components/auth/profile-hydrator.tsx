'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useUserProfileStore } from '@/lib/store/user-profile';

/**
 * 用户资料自动水合组件
 *
 * 当用户登录态变化时，自动从服务端拉取最新用户资料到 zustand store。
 * 登出时清除 store。
 */
export function ProfileHydrator() {
  const { status } = useSession();
  const hydrated = useUserProfileStore((s) => s._hydrated);
  const hydrateFromServer = useUserProfileStore((s) => s.hydrateFromServer);
  const clearProfile = useUserProfileStore((s) => s.clearProfile);

  useEffect(() => {
    if (status === 'authenticated' && !hydrated) {
      void hydrateFromServer();
    } else if (status === 'unauthenticated') {
      clearProfile();
    }
  }, [status, hydrated, hydrateFromServer, clearProfile]);

  return null;
}
