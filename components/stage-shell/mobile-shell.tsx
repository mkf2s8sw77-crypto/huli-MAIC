'use client';

/**
 * MobileShell — 课堂页的移动端布局壳层。
 *
 * 接收与 DesktopShell 相同的具名 slot，实现单列移动端布局：
 *   Header（顶部）+ Canvas（主区，始终全宽）+ Roundtable（底部紧凑条，可选）
 *
 * SceneSidebar 和 ChatArea 以绝对定位浮层展示，不参与主轴宽度分配。
 * 这样无论侧栏 / 聊天区是否打开，主舞台始终保持稳定可见区域。
 *
 * 布局状态由 useStageLayout() 的移动端分支提供，不共享桌面端 settingsStore。
 *
 * 专注阅读模式（focusMode）：
 *   仅在 playback 模式（hasRoundtable=true）下启用。
 *   进入后 Header 折叠、Roundtable 隐藏，Canvas 占满全高。
 *   通过右上角浮动按钮随时切换。不影响 DesktopShell。
 */

import type { ReactNode, CSSProperties } from 'react';
import { useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { HEADER_HEIGHT_PX, ROUNDTABLE_HEIGHT_PX } from './desktop-shell';

interface MobileShellProps {
  /**
   * 是否展示 Roundtable 底栏（playback 模式）。
   * 为 true 时画布高度需减去 Roundtable 高度。
   */
  hasRoundtable: boolean;

  /** 左侧场景导航栏（以浮层形式展示） */
  sidebar: ReactNode;

  /** 顶部 Header 栏 */
  header: ReactNode;

  /** 中央画布区（CanvasArea） */
  canvas: ReactNode;

  /** 底部 Roundtable 栏（不在 playback 模式时传 null） */
  roundtable: ReactNode;

  /** 右侧聊天/讲义区（以浮层形式展示） */
  chat: ReactNode;

  /** 浮层 / Dialog 等覆盖层（不影响布局流） */
  overlay?: ReactNode;

  /** 侧栏是否打开（= !sidebarCollapsed） */
  sidebarOpen: boolean;
  /** 聊天区是否打开（= !chatAreaCollapsed） */
  chatOpen: boolean;

  /** 关闭侧栏浮层的回调（点击遮罩时调用） */
  onCloseSidebar: () => void;
  /** 关闭聊天区浮层的回调（点击遮罩时调用） */
  onCloseChat: () => void;
}

export function MobileShell({
  hasRoundtable,
  sidebar,
  header,
  canvas,
  roundtable,
  chat,
  overlay,
  sidebarOpen,
  chatOpen,
  onCloseSidebar,
  onCloseChat,
}: MobileShellProps) {
  // 专注阅读模式：仅 playback 模式（hasRoundtable=true）下可激活
  const [focusMode, setFocusMode] = useState(false);
  // 退出 playback 模式时重置，避免残留状态
  const effectiveFocusMode = focusMode && hasRoundtable;

  // 画布区高度计算：
  //   专注模式 → 全高（Header 折叠为 0，Roundtable 不渲染）
  //   正常模式 → 全高 - Header - (Roundtable if playback)
  // 与 DesktopShell 保持一致的计算方式，确保 CanvasArea 内部尺寸逻辑不受影响。
  const canvasStyle: CSSProperties = effectiveFocusMode
    ? { height: '100%' }
    : {
        height: hasRoundtable
          ? `calc(100% - ${HEADER_HEIGHT_PX + ROUNDTABLE_HEIGHT_PX}px)`
          : `calc(100% - ${HEADER_HEIGHT_PX}px)`,
      };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-gray-50 dark:bg-gray-900">
      {/* 顶部 Header — 专注模式下折叠为 0 高度（DOM 保留，避免破坏 hook 状态） */}
      <div
        className="shrink-0 overflow-hidden transition-[height] duration-300 ease-in-out"
        style={{ height: effectiveFocusMode ? 0 : HEADER_HEIGHT_PX }}
        suppressHydrationWarning
      >
        {header}
      </div>

      {/* 主舞台：始终全宽，不受侧栏/聊天区影响 */}
      <div
        className="overflow-hidden relative flex-1 min-h-0 isolate"
        style={canvasStyle}
        suppressHydrationWarning
      >
        {canvas}

        {/* ── 专注阅读模式切换按钮 ──────────────────────────────────────────
            仅在 playback 模式（hasRoundtable=true）下显示。
            位于 canvas 右上角，z-20 低于浮层（z-30），不遮挡侧栏/聊天覆盖层。
            按钮始终可见，无论 slide 背景颜色如何均可读（半透明深色背景）。 */}
        {hasRoundtable && (
          <button
            onClick={() => setFocusMode((v) => !v)}
            className="absolute top-2 right-2 z-20 flex items-center gap-1 pl-2 pr-2.5 py-1 rounded-full
              bg-black/25 hover:bg-black/45 active:bg-black/60
              text-white/85 hover:text-white
              text-xs font-medium backdrop-blur-sm
              transition-colors duration-150 select-none"
            aria-label={effectiveFocusMode ? '退出专注阅读' : '专注阅读'}
          >
            {effectiveFocusMode ? (
              <>
                <Minimize2 className="w-3 h-3" />
                <span>退出专注</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3" />
                <span>专注阅读</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Roundtable 底栏（playback 模式）：固定高度，内容不溢出。
          专注模式下不渲染，释放画布空间。 */}
      {hasRoundtable && !effectiveFocusMode && (
        <div className="shrink-0 overflow-hidden" style={{ height: ROUNDTABLE_HEIGHT_PX }}>
          {roundtable}
        </div>
      )}

      {/* ── 侧栏浮层 ───────────────────────────────────────────────────────── */}
      {/* 仅在打开时渲染，不占主轴空间；遮罩点击关闭 */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-30 flex">
          {/* 遮罩 —— 点击关闭侧栏 */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCloseSidebar}
          />
          {/* 侧栏面板：靠左，最多占 calc(100% - 40px) 宽度，保留右侧遮罩可点击区域 */}
          <div
            className="relative z-10 h-full overflow-hidden"
            style={{ maxWidth: 'calc(100% - 40px)' }}
          >
            {sidebar}
          </div>
        </div>
      )}

      {/* ── 聊天区浮层 ─────────────────────────────────────────────────────── */}
      {/* 靠右展开；左侧保留 40px 遮罩区域供用户点击关闭 */}
      {chatOpen && (
        <div className="absolute inset-0 z-30 flex">
          {/* 遮罩 —— 点击关闭聊天区 */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCloseChat}
          />
          {/* 聊天面板：靠右，最多占 calc(100% - 40px) 宽度 */}
          <div
            className="relative z-10 ml-auto h-full overflow-hidden"
            style={{ maxWidth: 'calc(100% - 40px)' }}
          >
            {chat}
          </div>
        </div>
      )}

      {/* AlertDialog 等覆盖层（最高层级，不受浮层影响） */}
      {overlay}
    </div>
  );
}
