'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { LogIn, LogOut } from 'lucide-react';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { withBasePath } from '@/lib/utils/base-path';

/**
 * 用户菜单 — 显示当前用户邮箱和登出按钮
 * 嵌入到顶部工具栏中
 */
export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') return null;

  if (!session?.user) {
    return (
      <Link
        href={withBasePath('/login')}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
        title="登录"
      >
        <LogIn className="w-4 h-4" />
        <span>登录</span>
      </Link>
    );
  }

  const handleSignOut = async () => {
    useUserProfileStore.getState().clearProfile();
    await signOut({ redirectTo: withBasePath('/login') });
  };

  return (
    <button
      onClick={handleSignOut}
      className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
      title={`退出登录 (${session.user.email || session.user.name})`}
    >
      <LogOut className="w-4 h-4" />
    </button>
  );
}
