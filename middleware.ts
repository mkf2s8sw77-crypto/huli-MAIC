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

import NextAuth from 'next-auth';
import { authConfig } from '@/lib/server/auth.config';

const { auth } = NextAuth(authConfig);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Auth.js middleware type mismatch with Next.js 16
export default auth as any;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|avatars/|huli-tech-logo\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)',
  ],
};
