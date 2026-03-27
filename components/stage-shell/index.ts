/**
 * stage-shell — 课堂页壳层模块
 *
 * 导出布局壳层组件和布局 hook。
 * Stage（编排容器）通过这些导出来组装课堂页。
 *
 * 壳层选择策略：
 * - isDesktop = true  → DesktopShell（三栏式布局）
 * - isDesktop = false → MobileShell（单列 + 浮层覆盖）
 */

export { DesktopShell } from './desktop-shell';
export { HEADER_HEIGHT_PX, ROUNDTABLE_HEIGHT_PX } from './desktop-shell';
export { MobileShell } from './mobile-shell';
export { useStageLayout, useIsDesktop, STAGE_DESKTOP_BREAKPOINT } from './use-stage-layout';
export type { StageLayoutState } from './use-stage-layout';
