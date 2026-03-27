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
 * - “离开当前流程”应该是确定性的首页跳转，而不是依赖 history
 * - 子路径部署下统一走 getAppHomeHref()，避免 /maic/maic 这类重复拼接
 */
export function navigateToAppHome(): void {
  if (typeof window === 'undefined') return;
  window.location.assign(getAppHomeHref());
}
