// lib/generation/portrait-content-schema.ts

/**
 * Portrait Content Manifest
 *
 * AI 决定内容结构，程序决定几何布局。
 * 这是竖版 slide 生成的中间表示层，介于"AI 理解内容"和"程序排版"之间。
 */

export type PortraitArchetype =
  | 'lead'     // 导学/开场页
  | 'concept'  // 概念/定义页
  | 'compare'  // 对比页（heroBlock = Item A，supportingCards[0] = Item B）
  | 'steps'    // 步骤/流程页（heroBlock = 概述，supportingCards = 各步骤）
  | 'tip'      // 提示/要点页
  | 'summary'; // 总结页

export type ImageRole = 'hero' | 'supporting' | 'skip';

export interface PortraitHeroBlock {
  /** 小标签/徽章，≤ 6 字，例如"核心定义" */
  label?: string;
  /** 主要内容，≤ 80 字 */
  body: string;
  /** 可选背景色，默认由 archetype 决定 */
  bgColor?: string;
}

export interface PortraitCard {
  /** 可选标题/标签，例如"步骤1: 评估" */
  label?: string;
  /** 正文内容，≤ 60 字 */
  body: string;
}

export interface PortraitContentManifest {
  archetype: PortraitArchetype;
  /** 主题色，影响标题栏和 hero 块。推荐: #1e40af / #065f46 / #7c3aed / #b45309 / #dc2626 */
  accentColor: string;
  /** ≤ 12 中文字 / ≤ 16 英文字 */
  title: string;
  /** 可选副标题 */
  titleSub?: string;
  heroBlock: PortraitHeroBlock;
  /** 0-3 张支撑卡片 */
  supportingCards: PortraitCard[];
  /** 图片 ID，例如 "img_1" / "gen_img_1"，或留空 */
  imageId?: string;
  imageRole: ImageRole;
  /** 可选底部摘要文字，≤ 30 字 */
  footerCallout?: string;
}

/**
 * 校验 AI 返回的 manifest 是否合法。
 * 故意宽松：只检查必要字段，允许 AI 产出不完美的 manifest。
 */
export function isValidManifest(obj: unknown): obj is PortraitContentManifest {
  if (!obj || typeof obj !== 'object') return false;
  const m = obj as Record<string, unknown>;
  const validArchetypes: PortraitArchetype[] = [
    'lead', 'concept', 'compare', 'steps', 'tip', 'summary',
  ];
  const validImageRoles: ImageRole[] = ['hero', 'supporting', 'skip'];
  if (!validArchetypes.includes(m.archetype as PortraitArchetype)) return false;
  if (typeof m.title !== 'string' || m.title.trim() === '') return false;
  if (typeof m.accentColor !== 'string' || m.accentColor.trim() === '') return false;
  if (!validImageRoles.includes(m.imageRole as ImageRole)) return false;
  if (!m.heroBlock || typeof (m.heroBlock as Record<string, unknown>).body !== 'string') return false;
  if (!Array.isArray(m.supportingCards)) return false;
  return true;
}
