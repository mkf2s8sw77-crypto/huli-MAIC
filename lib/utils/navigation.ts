import { withBasePath } from '@/lib/utils/base-path';

/**
 * 应用首页入口。
 * 统一封装，避免在子路径部署下手写 "/" 导致 basePath 被重复拼接。
 */
export function getAppHomeHref(): string {
  return withBasePath('/');
}

/**
 * 跳转到应用首页。
 *
 * 这里故意使用浏览器级导航，而不是 next/navigation 的 router.push：
 * - 课堂页 / 生成页都可能从深链、刷新页、外部入口进入
 * - "离开当前流程"应该是确定性的首页跳转，而不是依赖 history
 * - 子路径部署下统一走 getAppHomeHref()，避免 /maic/maic 这类重复拼接
 */
export function navigateToAppHome(): void {
  if (typeof window === 'undefined') return;
  window.location.assign(getAppHomeHref());
}

/**
 * 从当前页面 URL 的 ?callbackUrl= 参数中安全地解析回跳目标。
 *
 * 安全规则：
 *   - 只接受同源 URL（阻止 open redirect）
 *   - 解析失败或跨域时统一回退到首页
 *   - SSR 阶段直接返回首页
 */
export function resolveCallbackUrl(): string {
  if (typeof window === 'undefined') {
    return getAppHomeHref();
  }

  const raw = new URLSearchParams(window.location.search).get('callbackUrl');
  if (!raw) {
    return getAppHomeHref();
  }

  try {
    const target = new URL(raw, window.location.origin);
    if (target.origin !== window.location.origin) {
      return getAppHomeHref();
    }
    return `${target.pathname}${target.search}${target.hash}` || getAppHomeHref();
  } catch {
    return getAppHomeHref();
  }
}
