/**
 * Portrait Layout Linter & Auto-Repair
 *
 * 竖版版式质检 + 可读性质检 + 自动返修机制，仅对竖版（portrait）slide 生效。
 *
 * 设计原则：
 * - 只在 isPortrait 时激活，横版课程完全不走这条链路
 * - 最多返修 MAX_REPAIR_ATTEMPTS 次，超限后兜底使用当前内容
 * - 返修只改位置/布局/字号，不改教学文字内容
 * - 任何异常都有 try/catch 兜底，不影响主流程
 *
 * 版式质检规则（Phase 3）：
 *   1. low-coverage   — 最低元素底部 < 画布高度 60%
 *   2. upper-heavy    — 上半区内容面积 > 所有内容面积的 78%
 *   3. three-column   — 同一横行有 3+ 个窄元素（宽度 < canvas_width × 42%）
 *
 * 可读性质检规则（Phase 5）：
 *   4. small-font-size  — 文本元素中存在低于竖版可读阈值的字号
 *      - top > 150px（正文区）字号 < 44px（正文最低阈值）
 *      - 任意位置字号 < 32px（绝对最低阈值）
 *   5. dense-text-block — 段落数 × 每行最小高度 > 元素高度，推测渲染时溢出/拥挤
 *
 * 版式质量规则（Phase 6）：
 *   6. flat-hierarchy   — 正文区（top ≥ 200px）≥ 3 个文本块全部居中对齐，且无彩色标题栏
 *                         ShapeElement — "居中堆叠"反模式，页面缺乏视觉层级
 *      返修：允许修改 content HTML 中的 text-align（center→left），并调整第一内容块宽度
 *
 * 完成度质检规则（Phase 7）：
 *   7. hero-too-small       — 内容区最大块高度 < canvasHeight × 12%，hero 视觉分量不足
 *   8. lower-half-empty     — 下半区内容面积 < 15%，下半屏严重空白
 *   9. archetype-incomplete — 无标题栏 ShapeElement 且元素 < 4，模板渲染残缺
 */

import { createLogger } from '@/lib/logger';
import type { AICallFn } from './pipeline-types';
import { parseJsonResponse } from './json-repair';

const log = createLogger('PortraitLinter');

// ── Types ──────────────────────────────────────────────────────────────────

export type LintViolation = {
  rule:
    | 'low-coverage'
    | 'upper-heavy'
    | 'three-column'
    | 'small-font-size'
    | 'dense-text-block'
    | 'flat-hierarchy'
    | 'hero-too-small'
    | 'lower-half-empty'
    | 'archetype-incomplete';
  message: string;
};

export type LintResult = {
  pass: boolean;
  violations: LintViolation[];
};

type ElementBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * 竖版正文可读性阈值（参见 buildSlideOrientationRules 中的 Portrait Typography 表）
 * 画布宽 1000px，手机约 390px，缩放比 ~0.35×
 */
/** 正文/子标题最低字号：< 44px 则手机端约 15px，边界可读 */
const PORTRAIT_FONT_BODY_MIN = 44;
/** 绝对最低字号：< 32px 在竖版手机端约 11px，不可读 */
const PORTRAIT_FONT_ABS_MIN = 32;
/** dense-text-block：每行最小高度预算（保守估计，适用于 32–72px 字号范围） */
const PORTRAIT_MIN_PX_PER_LINE = 55;

// ── Helpers ────────────────────────────────────────────────────────────────

function getBounds(el: Record<string, unknown>): ElementBounds {
  return {
    left: Number(el.left) || 0,
    top: Number(el.top) || 0,
    width: Number(el.width) || 0,
    height: Number(el.height) || 0,
  };
}

/** 跳过充当背景的大形状（面积 > 70%×70% 画布） */
function isBackgroundShapeElement(
  el: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (el.type !== 'shape') return false;
  const { width, height } = getBounds(el);
  return width > canvasWidth * 0.7 && height > canvasHeight * 0.7;
}

/** 从 HTML 内容字符串中提取所有 font-size（px）值 */
function extractFontSizes(html: string): number[] {
  const sizes: number[] = [];
  const re = /font-size:\s*(\d+(?:\.\d+)?)px/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    sizes.push(parseFloat(m[1]));
  }
  return sizes;
}

/** 统计 HTML 内容中 <p> 标签数量 */
function countParagraphs(html: string): number {
  return (html.match(/<p[\s>]/gi) || []).length;
}

/** 检测 HTML 中是否有居中对齐声明 */
function hasCenterAlign(html: string): boolean {
  return /text-align:\s*center/i.test(html);
}

// ── Linter ─────────────────────────────────────────────────────────────────

/**
 * 对竖版 slide 的元素列表进行版式 + 可读性质检。
 *
 * 检测规则（仅在 portrait 下调用）：
 *  1. low-coverage    — 最低元素底部 < 画布高度 60%
 *  2. upper-heavy     — 上半区内容面积 > 所有内容面积的 78%
 *  3. three-column    — 同一横行有 3+ 个窄元素（宽度 < canvas_width × 42%）
 *  4. small-font-size — 文本元素字号低于竖版可读阈值
 *  5. dense-text-block — 文本块段落数超出高度容纳上限
 */
export function lintPortraitLayout(
  elements: Record<string, unknown>[],
  canvasWidth: number,
  canvasHeight: number,
): LintResult {
  const violations: LintViolation[] = [];

  // 过滤：去掉背景形状和零尺寸元素
  const contentEls = elements.filter(
    (el) =>
      !isBackgroundShapeElement(el, canvasWidth, canvasHeight) &&
      Number(el.width) > 10 &&
      Number(el.height) > 10,
  );

  if (contentEls.length === 0) return { pass: true, violations: [] };

  // ── Rule 1: low-coverage ──────────────────────────────────────────────
  // 若最低元素底部 < 画布高 60%，说明内容全堆上半屏
  const coverageThreshold = canvasHeight * 0.6;
  const maxBottom = Math.max(
    ...contentEls.map((el) => {
      const { top, height } = getBounds(el);
      return top + height;
    }),
  );
  if (maxBottom < coverageThreshold) {
    violations.push({
      rule: 'low-coverage',
      message: `内容最低点 ${Math.round(maxBottom)}px 未达到画布 60% 高度 (${Math.round(coverageThreshold)}px)，下半屏大面积空白`,
    });
  }

  // ── Rule 2: upper-heavy ───────────────────────────────────────────────
  // 若上半区（top 50%）内容面积占比 > 78%，说明严重头重脚轻
  const midpoint = canvasHeight / 2;
  let totalArea = 0;
  let upperArea = 0;
  for (const el of contentEls) {
    const { top, width, height } = getBounds(el);
    const bottom = top + height;
    const elArea = width * height;
    totalArea += elArea;
    // 计算该元素落在上半区的面积
    const clampedBottom = Math.min(bottom, midpoint);
    const clampedTop = Math.min(top, midpoint);
    if (clampedBottom > clampedTop) {
      upperArea += width * (clampedBottom - clampedTop);
    }
  }
  if (totalArea > 0 && upperArea / totalArea > 0.78) {
    violations.push({
      rule: 'upper-heavy',
      message: `${Math.round((upperArea / totalArea) * 100)}% 的内容面积集中在画布上半区，疑似横版思维的竖版页`,
    });
  }

  // ── Rule 3: three-column ──────────────────────────────────────────────
  // 若同一横行有 3+ 个元素且每个宽度 < canvas_width × 42%，判定为三栏布局
  const maxColWidth = canvasWidth * 0.42;
  const visited = new Set<number>();

  for (let i = 0; i < contentEls.length; i++) {
    if (visited.has(i)) continue;
    const { top: topI, height: hI } = getBounds(contentEls[i]);
    const group: number[] = [i];
    visited.add(i);

    for (let j = i + 1; j < contentEls.length; j++) {
      if (visited.has(j)) continue;
      const { top: topJ, height: hJ } = getBounds(contentEls[j]);
      // 两元素在竖向上有足够重叠（> 40% of 较矮者高度）视为同行
      const overlapH = Math.min(topI + hI, topJ + hJ) - Math.max(topI, topJ);
      const minH = Math.min(hI, hJ);
      if (overlapH > 0 && minH > 0 && overlapH / minH > 0.4) {
        group.push(j);
        visited.add(j);
      }
    }

    if (group.length >= 3) {
      const narrowCount = group.filter((idx) => getBounds(contentEls[idx]).width < maxColWidth).length;
      if (narrowCount >= 3) {
        violations.push({
          rule: 'three-column',
          message: `检测到 ${group.length} 个元素并列于同一横行（各宽 < ${Math.round(maxColWidth)}px），疑似三栏横版布局`,
        });
        break; // 每条规则最多上报一次
      }
    }
  }

  // ── Rule 4: small-font-size ───────────────────────────────────────────
  // 检测两类字号问题：
  //   a) 绝对过小：任意文本元素存在字号 < PORTRAIT_FONT_ABS_MIN (32px)
  //   b) 正文过小：正文区（top > 150px）文本元素存在字号 < PORTRAIT_FONT_BODY_MIN (44px)
  {
    const fontIssues: string[] = [];

    for (const el of contentEls) {
      if (el.type !== 'text') continue;
      const { top } = getBounds(el);
      const html = String(el.content || '');
      const fontSizes = extractFontSizes(html);

      for (const fs of fontSizes) {
        if (fs < PORTRAIT_FONT_ABS_MIN) {
          fontIssues.push(`[绝对过小] top=${top} 字号${fs}px`);
        } else if (fs < PORTRAIT_FONT_BODY_MIN && top > 150) {
          fontIssues.push(`[正文过小] top=${top} 字号${fs}px`);
        }
      }
    }

    if (fontIssues.length > 0) {
      violations.push({
        rule: 'small-font-size',
        message: `竖版字号不足，手机端将不可读 — ${fontIssues.slice(0, 4).join('；')}${fontIssues.length > 4 ? `…共${fontIssues.length}处` : ''}`,
      });
    }
  }

  // ── Rule 5: dense-text-block ──────────────────────────────────────────
  // 段落数 × 每行最小高度预算 > 元素实际高度 → 推测显示时溢出/拥挤
  // 触发条件：pCount >= 3（避免对单/双行元素误报）
  {
    const denseItems: string[] = [];

    for (const el of contentEls) {
      if (el.type !== 'text') continue;
      const { height, top } = getBounds(el);
      const html = String(el.content || '');
      const pCount = countParagraphs(html);
      const minNeededHeight = pCount * PORTRAIT_MIN_PX_PER_LINE;

      if (pCount >= 3 && height > 0 && minNeededHeight > height) {
        denseItems.push(
          `top=${top} 含${pCount}段/height=${height}px（至少需${minNeededHeight}px）`,
        );
      }
    }

    if (denseItems.length > 0) {
      violations.push({
        rule: 'dense-text-block',
        message: `文本块高度不足以容纳所有段落 — ${denseItems.slice(0, 3).join('；')}${denseItems.length > 3 ? `…` : ''}`,
      });
    }
  }

  // ── Rule 6: flat-hierarchy ────────────────────────────────────────────
  // 检测"全部居中堆叠"反模式：正文区（top ≥ 200px）存在 3+ 个居中文本块
  // 且没有足够宽的 ShapeElement 作为标题栏底色支撑视觉层级
  // 这种布局会让页面缺乏视觉锚点，所有元素等权重，信息层级消失
  {
    const textEls = contentEls.filter((el) => el.type === 'text');
    if (textEls.length >= 4) {
      // 统计正文区（top >= 200px）居中对齐的文本块
      const bodyCenteredEls = textEls.filter((el) => {
        const { top } = getBounds(el);
        return top >= 200 && hasCenterAlign(String(el.content || ''));
      });

      // 检测标题区是否有非白色 ShapeElement 作为视觉锚点
      const hasColoredTitleBar = contentEls.some((el) => {
        if (el.type !== 'shape') return false;
        const { top, width, height } = getBounds(el);
        const fill = String(el.fill || '').toLowerCase();
        const isColoredFill = fill !== '' && fill !== '#ffffff' && fill !== '#fff';
        return top < 250 && width > canvasWidth * 0.6 && height > 60 && isColoredFill;
      });

      if (bodyCenteredEls.length >= 3 && !hasColoredTitleBar) {
        violations.push({
          rule: 'flat-hierarchy',
          message: `${bodyCenteredEls.length} 个正文区文本块全部居中对齐，且无彩色标题栏 ShapeElement — 页面缺乏视觉层级，呈现"居中堆叠"反模式`,
        });
      }
    }
  }

  // ── Rule 7: hero-too-small ─────────────────────────────────────────────
  // 页面核心内容块（非背景形状、非标题栏）中最大的单个元素高度过小
  // 说明 hero block 没有足够的视觉分量
  {
    const heroCandidates = contentEls.filter((el) => {
      const { top, height } = getBounds(el);
      // 内容区（top >= 200px），排除标题栏区域
      return top >= 200 && height > 0;
    });

    if (heroCandidates.length > 0) {
      const maxH = Math.max(...heroCandidates.map((el) => getBounds(el).height));
      const minHeroThreshold = canvasHeight * 0.12;
      if (maxH < minHeroThreshold) {
        violations.push({
          rule: 'hero-too-small',
          message: `内容区最大块高度 ${Math.round(maxH)}px < 画布 12% (${Math.round(minHeroThreshold)}px)，hero block 视觉分量不足`,
        });
      }
    }
  }

  // ── Rule 8: lower-half-empty ───────────────────────────────────────────
  // 画布下半区（> 50% 高度）的内容面积占下半区面积的比例 < 15%
  // 说明页面下半区严重空白
  {
    const lowerStart = canvasHeight * 0.5;
    const lowerArea = (canvasHeight * 0.5) * canvasWidth;
    let lowerContentArea = 0;

    for (const el of contentEls) {
      const { top, width, height } = getBounds(el);
      const bottom = top + height;
      const clampedTop = Math.max(top, lowerStart);
      const clampedBottom = Math.min(bottom, canvasHeight);
      if (clampedBottom > clampedTop) {
        lowerContentArea += width * (clampedBottom - clampedTop);
      }
    }

    const lowerFillRatio = lowerArea > 0 ? lowerContentArea / lowerArea : 0;
    if (lowerFillRatio < 0.15) {
      violations.push({
        rule: 'lower-half-empty',
        message: `画布下半区内容面积仅占 ${Math.round(lowerFillRatio * 100)}%（< 15%），下半屏严重空白`,
      });
    }
  }

  // ── Rule 9: archetype-incomplete ──────────────────────────────────────
  // 检测页面是否缺乏基本结构：无标题栏 ShapeElement 且总内容元素 < 4
  // 说明模板引擎或 AI 输出了空洞/残缺的页面
  {
    const hasTitleBar = contentEls.some((el) => {
      if (el.type !== 'shape') return false;
      const { top, width, height } = getBounds(el);
      // 标题栏特征：top < 200, 宽度 > 80% canvas, 高度 > 60px
      return top < 200 && width > canvasWidth * 0.8 && height > 60;
    });

    if (!hasTitleBar && contentEls.length < 4) {
      violations.push({
        rule: 'archetype-incomplete',
        message: `页面结构残缺：无标题栏 ShapeElement 且内容元素仅 ${contentEls.length} 个（< 4），疑似模板渲染失败`,
      });
    }
  }

  return { pass: violations.length === 0, violations };
}

// ── Repair ─────────────────────────────────────────────────────────────────

/** 最多返修次数，超出后用当前内容兜底 */
const MAX_REPAIR_ATTEMPTS = 2;

function buildRepairSystemPrompt(
  canvasWidth: number,
  canvasHeight: number,
  violations: LintViolation[],
): string {
  const coverageTarget = Math.round(canvasHeight * 0.75);
  const singleBlockWidth = canvasWidth - 120;
  const col2Width = Math.floor((canvasWidth - 160) / 2);
  const violationText = violations.map((v) => `- [${v.rule}] ${v.message}`).join('\n');

  // 是否包含可读性违规——若有，需允许修改 content 中的 font-size
  const hasReadabilityViolations = violations.some(
    (v) => v.rule === 'small-font-size' || v.rule === 'dense-text-block',
  );
  // 是否包含层级违规——若有，需允许修改 content 中的 text-align（改中对齐为左对齐）
  const hasHierarchyViolations = violations.some((v) => v.rule === 'flat-hierarchy');

  let modifyScope: string;
  if (hasReadabilityViolations && hasHierarchyViolations) {
    modifyScope = `You may adjust:
- left, top, width, height (layout positions)
- font-size px values inside the content HTML strings (readability fix)
  - Only change the numeric value (e.g. "18px" → "44px"). Do NOT alter the text words.
  - Portrait mandatory font sizes: Main title 64–72px | Section heading 48–56px | Body 44–52px | Labels 36–40px | Captions 32–36px
  - When you increase font-size, also increase the element's height proportionally.
- text-align values inside body text elements (top ≥ 200px): change "center" → "left" for better reading flow
  - Only change the alignment style value, do NOT change the text words.
Do NOT modify: text content (words), image src, colors, fill, shape points, or any other semantic fields.`;
  } else if (hasReadabilityViolations) {
    modifyScope = `You may adjust:
- left, top, width, height (layout positions)
- font-size px values inside the content HTML strings (readability fix)
  - Only change the numeric value (e.g. "18px" → "44px"). Do NOT alter the text words.
  - Portrait mandatory font sizes: Main title 64–72px | Section heading 48–56px | Body 44–52px | Labels 36–40px | Captions 32–36px
  - When you increase font-size, also increase the element's height proportionally.
Do NOT modify: text content (words), image src, colors, fill, shape points, or any other semantic fields.`;
  } else if (hasHierarchyViolations) {
    modifyScope = `You may adjust:
- left, top, width, height (layout positions — prioritize making first content block full-width)
- text-align values inside body text elements (top ≥ 200px): change "center" → "left" for better reading flow
  - Only change the alignment style value, do NOT change the text words.
Do NOT modify: text content (words), font-size, image src, colors, fill, shape points, or any other semantic fields.`;
  } else {
    modifyScope = `Only adjust: left, top, width, height to fix the layout violations.
Do NOT modify text content, colors, image src, or any semantic fields.`;
  }

  return `You are a portrait slide layout, visual hierarchy, and readability repair specialist. A slide generator produced a portrait-orientation slide with problems. Fix the detected violations AND improve overall visual quality WITHOUT changing any text content (words), image src, or educational information.

## Canvas
- Width: ${canvasWidth}px  Height: ${canvasHeight}px  (PORTRAIT)
- Content must reach at least y=${coverageTarget}px from the top

## Detected Violations
${violationText}

## Portrait Layout Rules (MANDATORY)
1. NO three-column layouts — max 2 elements per row
2. Prefer vertical stacking: arrange content top-to-bottom
3. Single wide block: width ~${singleBlockWidth}px, left=60
4. Two-column allowed: each ~${col2Width}px wide, 40px gap, left=60
5. Content must extend to at least y=${coverageTarget}px
6. Title block: top=50, height≈128-148px
7. Main body: starts at top≈190, expands downward to fill the canvas

## Visual Hierarchy Rules (apply during repair)
8. **Title bar = visual anchor**: the topmost text element should sit on a filled ShapeElement (colored background shape). If no such shape exists, keep layout as-is and focus on spacing.
9. **One dominant element**: the first content block below the title should be the largest/most prominent. If upper-heavy, expand the main content zone downward instead of adding new top elements.
10. **Left-align body text**: if text elements use text-align:center in their content HTML for body text (non-title), prefer redistributing height/width instead of changing alignment (alignment is in content which you may not change — but you CAN reposition and resize to improve flow).
11. **Avoid equal-weight stacking**: if multiple text blocks have identical left/width/height, give the topmost content block more height (it is the dominant card) and reduce gap to the secondary items below.

## Repair Strategy by Violation Type
- **low-coverage**: move lower elements downward; expand heights of content blocks; add spacing between elements to fill canvas
- **upper-heavy**: redistribute — reduce top-zone heights, move elements to lower positions, expand the content zone downward
- **three-column**: merge the 3 narrow elements into 1-2 full-width stacked blocks; reassign positions
- **small-font-size** (if modifyScope permits): increase font-size values in content HTML to mandatory minimums
- **dense-text-block**: increase element height proportionally to accommodate all paragraphs
- **flat-hierarchy** (if modifyScope permits): (1) expand first content block (top≈200) to full width (${singleBlockWidth}px, left=60); (2) give it significantly more height than secondary blocks; (3) change text-align:center → text-align:left in body element content HTML

## What You May Modify
${modifyScope}

## Output Format
Return ONLY a JSON object with this exact structure:
{"elements":[...]}

Each element must include type, left, top, width, height, and ALL its original fields unchanged (content, src, fill, points, etc.).
Output pure JSON — no explanation, no markdown code fences.`;
}

function buildRepairUserPrompt(
  elements: Record<string, unknown>[],
  violations: LintViolation[],
  attempt: number,
): string {
  const ruleNames = violations.map((v) => v.rule).join(', ');
  const hasReadabilityViolations = violations.some(
    (v) => v.rule === 'small-font-size' || v.rule === 'dense-text-block',
  );
  const hasHierarchyViolations = violations.some((v) => v.rule === 'flat-hierarchy');

  const notes: string[] = [];
  if (hasReadabilityViolations) {
    notes.push(
      'For font-size fixes — update ONLY the px number in style attributes. Keep all text words unchanged.',
    );
  }
  if (hasHierarchyViolations) {
    notes.push(
      'For flat-hierarchy fix — (1) make the first content block (top≈200) full-width and give it the most height; (2) change text-align:center → text-align:left for body elements (top ≥ 200px) in their content HTML style attributes; do NOT change the actual text words.',
    );
  }
  const noteText = notes.length > 0 ? '\nIMPORTANT: ' + notes.join(' | ') : '';

  const allowedFields = [
    'left/top/width/height',
    ...(hasReadabilityViolations ? ['font-size in content HTML'] : []),
    ...(hasHierarchyViolations ? ['text-align in content HTML (body elements only)'] : []),
  ].join(', ');

  return `Repair attempt ${attempt}: fix violations [${ruleNames}]${noteText}

Current elements (adjust ${allowedFields}):
${JSON.stringify(elements, null, 2)}`;
}

export type RepairResult = {
  elements: Record<string, unknown>[];
  /** 实际触发了几次 AI 返修调用 */
  repairAttempts: number;
  /** 返修后是否通过了质检 */
  finalPass: boolean;
};

/**
 * 对竖版 slide 的元素列表进行有限次自动返修。
 *
 * - 若初始检查已通过，直接返回（不调用 AI）
 * - 最多调用 AI MAX_REPAIR_ATTEMPTS 次
 * - 每次返修后重新质检；通过则提前退出
 * - 超限后返回当前最新元素（可能仍有违规，但不死循环）
 * - 任何解析/AI 异常都有兜底，不抛出
 *
 * 返修范围：
 * - 版式违规（low-coverage/upper-heavy/three-column）：只调整 left/top/width/height
 * - 可读性违规（small-font-size/dense-text-block）：额外允许调整 content 中的 font-size px 值
 */
export async function repairPortraitLayout(
  elements: Record<string, unknown>[],
  canvasWidth: number,
  canvasHeight: number,
  aiCall: AICallFn,
): Promise<RepairResult> {
  let currentElements = elements;
  let repairAttempts = 0;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    const lint = lintPortraitLayout(currentElements, canvasWidth, canvasHeight);
    if (lint.pass) {
      log.info(`Portrait layout passed lint before attempt ${attempt}`);
      return { elements: currentElements, repairAttempts, finalPass: true };
    }

    log.info(
      `Portrait layout repair attempt ${attempt}/${MAX_REPAIR_ATTEMPTS} — violations: ` +
        lint.violations.map((v) => v.rule).join(', '),
    );

    const systemPrompt = buildRepairSystemPrompt(canvasWidth, canvasHeight, lint.violations);
    const userPrompt = buildRepairUserPrompt(currentElements, lint.violations, attempt);

    try {
      const response = await aiCall(systemPrompt, userPrompt);
      const parsed = parseJsonResponse<{ elements: Record<string, unknown>[] }>(response);

      if (parsed?.elements && Array.isArray(parsed.elements) && parsed.elements.length > 0) {
        currentElements = parsed.elements;
        repairAttempts++;
      } else {
        log.warn(`Portrait repair attempt ${attempt}: AI returned invalid elements, stopping`);
        break;
      }
    } catch (err) {
      log.warn(`Portrait repair attempt ${attempt} threw error:`, err);
      break;
    }
  }

  // 最终质检（可能仍有违规，但已达最大次数）
  const finalLint = lintPortraitLayout(currentElements, canvasWidth, canvasHeight);
  if (!finalLint.pass) {
    log.warn(
      `Portrait layout repair exhausted (${repairAttempts} attempts), remaining violations: ` +
        finalLint.violations.map((v) => v.rule).join(', ') +
        ' — falling back to current best-effort content',
    );
  }

  return { elements: currentElements, repairAttempts, finalPass: finalLint.pass };
}
