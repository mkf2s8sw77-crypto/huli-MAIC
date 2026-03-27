/**
 * useStageLayout — 集中管理课堂页的布局状态与响应式断点判断。
 *
 * 断点策略：1024px（Tailwind `lg`）。低于此宽度视为移动端。
 * 断点判断 **只在本 hook 内做**，业务组件不直接感知设备类型。
 *
 * Phase 1：桌面端布局状态仍从 settingsStore 读取（持久化到 localStorage）。
 * Phase 2：按 isDesktop 分支——桌面端继续走 settingsStore，
 *           移动端使用组件本地状态，避免设备间状态污染。
 */

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/lib/store/settings';

/** 桌面/移动分界断点（px）*/
export const STAGE_DESKTOP_BREAKPOINT = 1024;

/**
 * 检测当前视口是否为桌面宽度。
 * SSR 阶段默认返回 true（避免布局抖动），客户端 hydrate 后校正。
 */
export function useIsDesktop(): boolean {
  // Lazy initializer: reads matchMedia on first client render (avoids SSR mismatch).
  // Falls back to true on SSR so the desktop shell is assumed until hydration.
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia(`(min-width: ${STAGE_DESKTOP_BREAKPOINT}px)`).matches;
  });

  // Subscribe to viewport changes; setState is only called from the callback, not
  // synchronously in the effect body, which satisfies the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${STAGE_DESKTOP_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export interface StageLayoutState {
  /** 当前视口 >= 1024px */
  isDesktop: boolean;

  // 左侧场景导航栏
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

  // 右侧聊天区
  chatAreaCollapsed: boolean;
  setChatAreaCollapsed: (v: boolean) => void;
  chatAreaWidth: number;
  setChatAreaWidth: (v: number) => void;
}

/**
 * 移动端聊天面板固定宽度。
 * 设为 340px（ChatArea 默认宽度），在 MobileShell 中用 maxWidth CSS 约束实际显示宽度，
 * 确保始终有 40px backdrop 留给用户点击关闭。
 */
const MOBILE_CHAT_WIDTH = 340;

/**
 * 课堂页布局状态 hook。
 *
 * Phase 2 分支策略：
 * - isDesktop = true  → 使用 settingsStore（持久化，恢复桌面偏好）
 * - isDesktop = false → 使用组件本地状态（不持久化，不污染桌面设置）
 *
 * 所有 useState 调用均在顶层（无条件），符合 React Hooks 规则。
 * 条件分支只出现在 return 语句。
 */
export function useStageLayout(): StageLayoutState {
  const isDesktop = useIsDesktop();

  // ── Desktop state: settingsStore（持久化到 localStorage）──────────────────
  const desktopSidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const desktopSetSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const desktopChatAreaCollapsed = useSettingsStore((s) => s.chatAreaCollapsed);
  const desktopSetChatAreaCollapsed = useSettingsStore((s) => s.setChatAreaCollapsed);
  const desktopChatAreaWidth = useSettingsStore((s) => s.chatAreaWidth);
  const desktopSetChatAreaWidth = useSettingsStore((s) => s.setChatAreaWidth);

  // ── Mobile state: 本地临时状态（不持久化，页面刷新重置）─────────────────
  // 始终声明，不能放在 if 分支内（React Hooks 规则）
  const [mobileSidebarCollapsed, setMobileSidebarCollapsed] = useState(true);
  const [mobileChatAreaCollapsed, setMobileChatAreaCollapsed] = useState(true);

  if (isDesktop) {
    return {
      isDesktop: true,
      sidebarCollapsed: desktopSidebarCollapsed,
      setSidebarCollapsed: desktopSetSidebarCollapsed,
      chatAreaCollapsed: desktopChatAreaCollapsed,
      setChatAreaCollapsed: desktopSetChatAreaCollapsed,
      chatAreaWidth: desktopChatAreaWidth,
      setChatAreaWidth: desktopSetChatAreaWidth,
    };
  }

  return {
    isDesktop: false,
    sidebarCollapsed: mobileSidebarCollapsed,
    setSidebarCollapsed: setMobileSidebarCollapsed,
    chatAreaCollapsed: mobileChatAreaCollapsed,
    setChatAreaCollapsed: setMobileChatAreaCollapsed,
    chatAreaWidth: MOBILE_CHAT_WIDTH,
    setChatAreaWidth: () => {
      // no-op on mobile: width is fixed, not user-resizable
    },
  };
}
