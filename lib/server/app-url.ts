/**
 * 统一的应用 URL 解析层（唯一真源）
 *
 * 所有需要推导"应用对外 origin"、"应用入口 base URL"、"应用内绝对 URL"
 * 的服务端逻辑都应走此模块，不再在各自文件中重复实现。
 *
 * 兼容 Edge Runtime（middleware / auth callback）与 Node Runtime（API route）。
 *
 * 优先级：
 *   APP_PUBLIC_ORIGIN > AUTH_URL > NEXTAUTH_URL > 请求头 > requestUrl.origin
 */

import { BASE_PATH, withBasePath } from '@/lib/utils/base-path';

function readConfiguredOrigin(): string | undefined {
  const raw =
    process.env.APP_PUBLIC_ORIGIN?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();

  if (!raw) return undefined;

  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

/**
 * 推导应用的对外 origin（protocol + host，不含 basePath）。
 *
 * @param requestUrl  来自 req.nextUrl 或 NextURL — 仅在无配置时作为 fallback
 * @param headers     来自 req.headers — 用于读取反向代理头（x-forwarded-*）
 */
export function getAppOrigin(requestUrl?: URL, headers?: Headers): string {
  const configured = readConfiguredOrigin();
  if (configured) return configured;

  if (headers) {
    const forwardedHost = headers.get('x-forwarded-host');
    if (forwardedHost) {
      const proto = headers.get('x-forwarded-proto') || 'https';
      return `${proto}://${forwardedHost}`;
    }
  }

  return requestUrl?.origin ?? 'http://localhost:3000';
}

/**
 * 应用对外的入口 base URL（origin + basePath，不带尾部 /）。
 *
 * 典型用途：拼接分享链接、课堂 URL 等面向外部的完整地址。
 *
 * @example
 *   getAppBaseUrl()
 *   // 根部署  → "https://example.com"
 *   // 子路径  → "https://example.com/maic"
 */
export function getAppBaseUrl(requestUrl?: URL, headers?: Headers): string {
  const origin = getAppOrigin(requestUrl, headers);
  return BASE_PATH ? `${origin}${BASE_PATH}` : origin;
}

/**
 * 构造应用内路径的绝对 URL。
 *
 * @param path  basePath 无关的应用路径，如 '/login'、'/classroom/abc'
 * @returns     完整的绝对 URL 对象
 *
 * @example
 *   buildAppUrl('/login')
 *   // 根部署  → new URL("https://example.com/login")
 *   // 子路径  → new URL("https://example.com/maic/login")
 */
export function buildAppUrl(
  path: string,
  requestUrl?: URL,
  headers?: Headers,
): URL {
  return new URL(withBasePath(path), getAppOrigin(requestUrl, headers));
}
