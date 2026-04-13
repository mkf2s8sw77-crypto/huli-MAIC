/**
 * Next.js Middleware — 路由级访问控制
 *
 * 使用 Auth.js 的 Edge-safe 配置检查 JWT session。
 * authorized callback（在 auth.config.ts 中）决定是否放行。
 *
 * 策略：
 *   - 公开路径（login / register / open-source / api/auth / api/health）无需登录
 *   - 其他业务页面和业务 API 需要有效 session
 *   - 未登录用户访问受保护页面时重定向到 /login
 *   - 未登录用户访问受保护 API 时返回 401
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/server/auth.config';
import { stripBasePath } from '@/lib/utils/base-path';

const { auth } = NextAuth(authConfig);

const PUBLIC_FILE_RE = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$/i;

function isPublicAsset(pathname: string): boolean {
  const normalized = stripBasePath(pathname);

  return (
    normalized.startsWith('/_next/static') ||
    normalized.startsWith('/_next/image') ||
    normalized === '/favicon.ico' ||
    normalized === '/robots.txt' ||
    normalized === '/sitemap.xml' ||
    normalized === '/huli-tech-logo.png' ||
    normalized.startsWith('/avatars/') ||
    normalized.startsWith('/logos/') ||
    PUBLIC_FILE_RE.test(normalized)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Auth.js middleware type mismatch with Next.js 16
export default function middleware(request: NextRequest) {
  if (isPublicAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return (auth as any)(request);
}

export const config = {
  matcher: ['/:path*'],
};
