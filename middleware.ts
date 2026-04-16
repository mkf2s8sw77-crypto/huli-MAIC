/**
 * Next.js Middleware — 路由级访问控制
 *
 * 使用 Auth.js 的 Edge-safe 配置检查 JWT session，并在配置 ACCESS_CODE
 * 时启用站点级访问码保护。
 *
 * 策略：
 *   - 公开路径（login / register / open-source / api/auth / api/health）无需登录
 *   - 访问码接口与健康检查不需要 session
 *   - 配置 ACCESS_CODE 后，业务 API 必须先通过访问码 cookie 校验
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

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an HMAC-signed token using Web Crypto API (Edge-compatible) */
async function verifyToken(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const keyData = encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  // Constant-length comparison (not truly constant-time in JS, but sufficient here)
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

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

export default async function middleware(request: NextRequest) {
  const pathname = stripBasePath(request.nextUrl.pathname);

  if (isPublicAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/access-code/') || pathname === '/api/health') {
    return NextResponse.next();
  }

  const accessCode = process.env.ACCESS_CODE;
  if (accessCode) {
    const cookie = request.cookies.get('openmaic_access');
    const hasValidAccess = cookie?.value && (await verifyToken(cookie.value, accessCode));

    if (!hasValidAccess && pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
        { status: 401 },
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Auth.js middleware type mismatch with Next.js 16
  return (auth as any)(request);
}

export const config = {
  matcher: ['/:path*'],
};
