'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { withBasePath } from '@/lib/utils/base-path';

/**
 * 客户端 Auth Session Provider
 * 包裹应用以提供 useSession() hook 能力
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider basePath={withBasePath('/api/auth')}>{children}</NextAuthSessionProvider>;
}
