/**
 * Auth.js 配置 — Edge-compatible 部分
 *
 * 此文件不引入任何 Node-only 模块（better-sqlite3, bcryptjs 等），
 * 可以在 Next.js middleware（Edge Runtime）中安全使用。
 *
 * 完整的 providers 配置（含 authorize 逻辑）在 auth.ts 中。
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  providers: [], // 在 auth.ts 中填充
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
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
      const { pathname } = nextUrl;

      const publicPaths = ['/login', '/register', '/open-source'];
      const publicApiPrefixes = ['/api/auth', '/api/health', '/api/server-providers'];

      const isPublicPage = publicPaths.some(
        (p) => pathname === p || pathname.startsWith(p + '/'),
      );
      const isPublicApi = publicApiPrefixes.some(
        (p) => pathname === p || pathname.startsWith(p + '/'),
      );

      if (isPublicPage || isPublicApi) {
        if (isLoggedIn && (pathname === '/login' || pathname === '/register')) {
          return Response.redirect(new URL('/', nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        if (pathname.startsWith('/api/')) {
          return Response.json({ error: '未登录' }, { status: 401 });
        }
        return false;
      }

      return true;
    },
  },
  trustHost: true,
};
