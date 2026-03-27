'use client';

/**
 * DesktopShell — 课堂页的桌面端布局壳层。
 *
 * 接收来自 Stage（编排容器）的具名 slot，将它们排列成桌面三栏布局：
 *   [SceneSidebar] [Header + Canvas + Roundtable] [ChatArea]
 *
 * 本组件 **不包含任何业务逻辑**——仅负责定位、尺寸和画布区高度计算。
 *
 * Phase 2 扩展路径：
 *   新增 MobileShell 组件，接受相同的 slot props，实现完全不同的移动端
 *   排列方式（如底部抽屉式聊天、全屏画布、抽屉式侧栏），而无需触碰 Stage。
 */

import type { ReactNode, CSSProperties } from 'react';

/** Header 固定高度（对应 Tailwind h-20 = 80px）*/
export const HEADER_HEIGHT_PX = 80;

/** Roundtable 底栏固定高度（playback 模式下占用）*/
export const ROUNDTABLE_HEIGHT_PX = 192;

interface DesktopShellProps {
  /**
   * 是否展示 Roundtable 底栏。
   * 为 true 时，画布区高度需减去 Roundtable 的高度。
   */
  hasRoundtable: boolean;

  /** 左侧场景导航栏 */
  sidebar: ReactNode;

  /** 顶部 Header 栏 */
  header: ReactNode;

  /** 中央画布区（CanvasArea） */
  canvas: ReactNode;

  /** 底部 Roundtable 栏（不在 playback 模式时传 null） */
  roundtable: ReactNode;

  /** 右侧聊天/讲义区 */
  chat: ReactNode;

  /** 浮层 / Dialog 等覆盖层（不影响布局流） */
  overlay?: ReactNode;
}

export function DesktopShell({
  hasRoundtable,
  sidebar,
  header,
  canvas,
  roundtable,
  chat,
  overlay,
}: DesktopShellProps) {
  // 画布区高度 = 全高 - Header - (Roundtable if playback)
  const canvasAreaStyle: CSSProperties = {
    height: hasRoundtable
      ? `calc(100% - ${HEADER_HEIGHT_PX + ROUNDTABLE_HEIGHT_PX}px)`
      : `calc(100% - ${HEADER_HEIGHT_PX}px)`,
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* 左：场景导航侧栏 */}
      {sidebar}

      {/* 中：Header + 画布 + Roundtable */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {header}

        <div
          className="overflow-hidden relative flex-1 min-h-0 isolate"
          style={canvasAreaStyle}
          suppressHydrationWarning
        >
          {canvas}
        </div>

        {roundtable}
      </div>

      {/* 右：聊天 / 讲义面板 */}
      {chat}

      {/* 浮层（AlertDialog 等） */}
      {overlay}
    </div>
  );
}
