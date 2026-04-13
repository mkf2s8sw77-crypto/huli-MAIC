/**
 * Auth.js 配置 — Edge-compatible 部分
 *
 * 此文件不引入任何 Node-only 模块（better-sqlite3, bcryptjs 等），
 * 可以在 Next.js middleware（Edge Runtime）中安全使用。
 *
 * 完整的 providers 配置（含 authorize 逻辑）在 auth.ts 中。
 */

import type { NextAuthConfig } from 'next-auth';
import { withBasePath, stripBasePath } from '@/lib/utils/base-path';

function getPublicOrigin(nextUrl: URL): string {
  const configured =
    process.env.APP_PUBLIC_ORIGIN?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();

  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // ignore invalid env and fall back to request origin
    }
  }

  return nextUrl.origin;
}

function buildAppUrl(nextUrl: URL, path: string): URL {
  return new URL(withBasePath(path), getPublicOrigin(nextUrl));
}

export const authConfig: NextAuthConfig = {
  providers: [], // 在 auth.ts 中填充
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: withBasePath('/login'),
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const pathname = stripBasePath(nextUrl.pathname);

      const publicPaths = ['/login', '/register', '/open-source'];
      const publicApiPrefixes = [
        '/api/auth',
        '/api/health',
        '/api/server-providers',
        '/api/public-assets',
      ];

      const isPublicPage = publicPaths.some(
        (p) => pathname === p || pathname.startsWith(p + '/'),
      );
      const isPublicApi = publicApiPrefixes.some(
        (p) => pathname === p || pathname.startsWith(p + '/'),
      );

      if (isPublicPage || isPublicApi) {
        if (isLoggedIn && (pathname === '/login' || pathname === '/register')) {
          return Response.redirect(buildAppUrl(nextUrl, '/'));
        }
        return true;
      }

      if (!isLoggedIn) {
        if (pathname.startsWith('/api/')) {
          return Response.json({ error: '未登录' }, { status: 401 });
        }
        const loginUrl = buildAppUrl(nextUrl, '/login');
        const callbackPath = `${pathname || '/'}${nextUrl.search}`;
        loginUrl.searchParams.set(
          'callbackUrl',
          `${getPublicOrigin(nextUrl)}${withBasePath(callbackPath)}`,
        );
        return Response.redirect(loginUrl);
      }

      return true;
    },
  },
  trustHost: true,
};
