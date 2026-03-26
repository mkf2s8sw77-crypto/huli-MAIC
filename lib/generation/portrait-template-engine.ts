// lib/generation/portrait-template-engine.ts

/**
 * Portrait Template Engine
 *
 * 将 PortraitContentManifest 渲染为 PPT 元素列表。
 * 程序完全控制坐标，AI 只提供内容。
 *
 * 渲染原则：
 * - 所有坐标都按 canvasWidth/canvasHeight 的比例计算，不硬编码 1000×1333
 * - 文本 fitting 通过 estimateTextHeight() 动态调整块高度
 * - 下半区填满：若内容不足 84% 画布高度，均匀扩展各块
 * - 防溢出：若内容超出 canvas 底部，截去最后一张卡片
 */

import type { GeneratedSlideData } from './pipeline-types';
import type {
  PortraitContentManifest,
  PortraitCard,
  PortraitHeroBlock,
} from './portrait-content-schema';

// ── Types ────────────────────────────────────────────────────────────────────

type SlideElement = GeneratedSlideData['elements'][number];

/** 图片信息，供模板引擎计算图片槽位高度 */
export interface ImageInfo {
  id: string;
  /** 宽高比 width/height，不知道时传 16/9 */
  aspectRatio: number;
}

// ── Layout Constants ─────────────────────────────────────────────────────────

const LEFT_MARGIN = 60;
const TITLE_TOP = 50;
const TITLE_HEIGHT = 148;
/** 内容区起始 Y 坐标（标题栏底部 + 小间距） */
const CONTENT_START = 222;
const HERO_GAP = 20; // 标题栏与 hero 块之间的间距（CONTENT_START - TITLE_TOP - TITLE_HEIGHT）
const CARD_GAP = 16; // 卡片之间的间距

const TITLE_FONT = 64;
const HERO_FONT = 48;
const HERO_LABEL_FONT = 40;
const CARD_FONT = 44;
const CARD_LABEL_FONT = 40;
const FOOTER_FONT = 40;

const DARK_TEXT = '#1f2937';
const CARD_BG_DEFAULT = '#f8fafc';
const FOOTER_BG = '#f3f4f6';

const MIN_HERO_HEIGHT = 160;
const MIN_CARD_HEIGHT = 120;
const FOOTER_RESERVE = 190; // 底部摘要区预留高度

// ── Utilities ────────────────────────────────────────────────────────────────

/** canvas 内容可用宽度（减去左右 margin） */
function cw(canvasWidth: number): number {
  return canvasWidth - LEFT_MARGIN * 2;
}

function escapeHtml(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 去除 HTML 标签，用于文本高度估算 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

/**
 * 估算文本在给定容器内渲染后的高度。
 *
 * 算法：
 * 1. 去除 HTML 标签取纯文本
 * 2. 中文字符宽 ≈ fontSize × 1.0，英文字符宽 ≈ fontSize × 0.6（混排加权平均）
 * 3. 每行字符数 = floor(usableWidth / avgCharWidth)
 * 4. 行数 = ceil(textLength / charsPerLine)
 * 5. 高度 = lines × fontSize × lineHeightRatio + paddingV × 2
 *
 * 故意保守（略高估），避免真实渲染时溢出。
 */
export function estimateTextHeight(
  textOrHtml: string,
  fontSize: number,
  containerWidth: number,
  lineHeightRatio = 1.45,
  paddingV = 20,
  paddingH = 20,
): number {
  const text = textOrHtml.includes('<') ? stripHtml(textOrHtml) : textOrHtml;
  if (!text) return Math.ceil(fontSize * lineHeightRatio) + paddingV * 2;
  const usableWidth = Math.max(1, containerWidth - paddingH * 2);
  const chCnt = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherCnt = text.length - chCnt;
  const avgCharW = (chCnt * fontSize + otherCnt * fontSize * 0.6) / text.length;
  const charsPerLine = Math.max(1, Math.floor(usableWidth / avgCharW));
  const lines = Math.ceil(text.length / charsPerLine);
  return Math.ceil(lines * fontSize * lineHeightRatio) + paddingV * 2;
}

// ── Element Builders ─────────────────────────────────────────────────────────

function makeShape(
  left: number,
  top: number,
  width: number,
  height: number,
  fill: string,
): SlideElement {
  return {
    type: 'shape',
    left,
    top,
    width,
    height,
    path: 'M 0 0 L 1 0 L 1 1 L 0 1 Z',
    viewBox: [1, 1],
    fill,
    fixedRatio: false,
  };
}

function makeText(
  left: number,
  top: number,
  width: number,
  height: number,
  content: string,
  defaultColor = DARK_TEXT,
): SlideElement {
  return {
    type: 'text',
    left,
    top,
    width,
    height,
    content,
    defaultFontName: '',
    defaultColor,
  };
}

function makeImage(
  left: number,
  top: number,
  width: number,
  height: number,
  src: string,
): SlideElement {
  return { type: 'image', left, top, width, height, src, fixedRatio: true };
}

// ── Title Bar ────────────────────────────────────────────────────────────────

/** 渲染标题栏：accentColor 底色 ShapeElement + 白色标题文字 TextElement */
function renderTitleBar(
  manifest: PortraitContentManifest,
  canvasWidth: number,
): SlideElement[] {
  const w = cw(canvasWidth);
  const parts: string[] = [
    `<p style="font-size: ${TITLE_FONT}px; color: #ffffff; font-weight: bold; text-align: left;">${escapeHtml(manifest.title)}</p>`,
  ];
  if (manifest.titleSub) {
    parts.push(
      `<p style="font-size: 40px; color: rgba(255,255,255,0.85); text-align: left;">${escapeHtml(manifest.titleSub)}</p>`,
    );
  }
  return [
    makeShape(0, TITLE_TOP, canvasWidth, TITLE_HEIGHT, manifest.accentColor),
    makeText(LEFT_MARGIN, TITLE_TOP, w, TITLE_HEIGHT, parts.join(''), '#ffffff'),
  ];
}

// ── Block Content HTML Builders ───────────────────────────────────────────────

function heroHtml(hero: PortraitHeroBlock, accentColor: string): string {
  const parts: string[] = [];
  if (hero.label) {
    parts.push(
      `<p style="font-size: ${HERO_LABEL_FONT}px; color: ${accentColor}; font-weight: bold; text-align: left;">${escapeHtml(hero.label)}</p>`,
    );
  }
  parts.push(
    `<p style="font-size: ${HERO_FONT}px; color: ${DARK_TEXT}; text-align: left;">${escapeHtml(hero.body)}</p>`,
  );
  return parts.join('');
}

function cardHtml(card: PortraitCard, accentColor: string): string {
  const parts: string[] = [];
  if (card.label) {
    parts.push(
      `<p style="font-size: ${CARD_LABEL_FONT}px; color: ${accentColor}; font-weight: bold; text-align: left;">${escapeHtml(card.label)}</p>`,
    );
  }
  parts.push(
    `<p style="font-size: ${CARD_FONT}px; color: ${DARK_TEXT}; text-align: left;">${escapeHtml(card.body)}</p>`,
  );
  return parts.join('');
}

// ── Block Height Calculators ──────────────────────────────────────────────────

function calcHeroHeight(hero: PortraitHeroBlock, width: number, minH: number): number {
  const labelH = hero.label ? estimateTextHeight(hero.label, HERO_LABEL_FONT, width) : 0;
  const bodyH = estimateTextHeight(hero.body, HERO_FONT, width);
  return Math.max(minH, labelH + bodyH);
}

function calcCardHeight(card: PortraitCard, width: number, minH = MIN_CARD_HEIGHT): number {
  const labelH = card.label ? estimateTextHeight(card.label, CARD_LABEL_FONT, width) : 0;
  const bodyH = estimateTextHeight(card.body, CARD_FONT, width);
  return Math.max(minH, labelH + bodyH);
}

// ── Stacking Engine ───────────────────────────────────────────────────────────

interface StackBlock {
  content: string;
  bgColor: string | null; // null = no background shape
  naturalH: number;
  minH: number;
}

/**
 * 将 blocks 从 startTop 开始垂直堆叠，自动扩展以填满画布到 targetFillRatio。
 * 若内容超出 canvas 底部边距，截去最后一块。
 */
function stackBlocks(
  blocks: StackBlock[],
  canvasWidth: number,
  canvasHeight: number,
  startTop: number,
  targetFillRatio: number,
): SlideElement[] {
  if (blocks.length === 0) return [];
  const w = cw(canvasWidth);
  const x = LEFT_MARGIN;

  // Step 1: 应用 max(natural, min)
  let heights = blocks.map((b) => Math.max(b.minH, b.naturalH));

  // Step 2: 计算自然总高度
  const totalGap = (blocks.length - 1) * CARD_GAP;
  const naturalTotal = heights.reduce((s, h) => s + h, 0) + totalGap;

  // Step 3: 若不足 targetFill，均匀扩展
  const targetBottom = Math.round(canvasHeight * targetFillRatio);
  const available = targetBottom - startTop;
  if (naturalTotal < available && blocks.length > 0) {
    const extra = Math.floor((available - naturalTotal) / blocks.length);
    heights = heights.map((h) => h + extra);
  }

  // Step 4: 若溢出（超出 canvas - 60px），截去最后一块
  const maxBottom = canvasHeight - 60;
  let activeBlocks = blocks;
  let activeHeights = heights;
  let totalH = activeHeights.reduce((s, h) => s + h, 0) + (activeBlocks.length - 1) * CARD_GAP;
  while (startTop + totalH > maxBottom && activeBlocks.length > 1) {
    activeBlocks = activeBlocks.slice(0, -1);
    activeHeights = activeHeights.slice(0, -1);
    totalH = activeHeights.reduce((s, h) => s + h, 0) + (activeBlocks.length - 1) * CARD_GAP;
  }

  // Step 5: 渲染
  const elements: SlideElement[] = [];
  let cursor = startTop;
  for (let i = 0; i < activeBlocks.length; i++) {
    const h = activeHeights[i];
    const b = activeBlocks[i];
    if (b.bgColor) {
      elements.push(makeShape(x, cursor, w, h, b.bgColor));
    }
    elements.push(makeText(x, cursor, w, h, b.content));
    cursor += h + CARD_GAP;
  }
  return elements;
}

// ── Archetype Body Renderers ──────────────────────────────────────────────────

/**
 * Generic renderer: lead（无图）/ concept / tip / summary
 * 结构: hero block + 0-3 supporting cards
 */
function renderGenericBody(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
  heroBgColor: string,
  cardBgColor: string,
  heroMinH: number,
): SlideElement[] {
  const w = cw(canvasWidth);
  const cards = manifest.supportingCards.slice(0, 3);

  const blocks: StackBlock[] = [
    {
      content: heroHtml(manifest.heroBlock, manifest.accentColor),
      bgColor: heroBgColor,
      naturalH: calcHeroHeight(manifest.heroBlock, w, heroMinH),
      minH: heroMinH,
    },
    ...cards.map((c) => ({
      content: cardHtml(c, manifest.accentColor),
      bgColor: cardBgColor,
      naturalH: calcCardHeight(c, w),
      minH: MIN_CARD_HEIGHT,
    })),
  ];

  return stackBlocks(blocks, canvasWidth, canvasHeight, CONTENT_START, 0.84);
}

/**
 * lead archetype with image
 * 结构: hero block + image + 0-1 card
 */
function renderLeadWithImage(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
  imageInfo: ImageInfo,
): SlideElement[] {
  const w = cw(canvasWidth);
  const x = LEFT_MARGIN;

  // Hero block
  const heroH = calcHeroHeight(manifest.heroBlock, w, MIN_HERO_HEIGHT);
  const heroElements: SlideElement[] = [
    makeShape(x, CONTENT_START, w, heroH, '#eff6ff'), // 导学页 hero 淡蓝底色
    makeText(x, CONTENT_START, w, heroH, heroHtml(manifest.heroBlock, manifest.accentColor)),
  ];

  // Image slot (below hero)
  const imgTop = CONTENT_START + heroH + HERO_GAP;
  const imgWidth = Math.round(w * 0.82);
  const imgHeight = Math.round(imgWidth / Math.max(0.5, imageInfo.aspectRatio));
  const imgMaxHeight = Math.round(canvasHeight * 0.3);
  const finalImgH = Math.min(imgHeight, imgMaxHeight);
  const finalImgW = Math.round(finalImgH * imageInfo.aspectRatio);
  const finalImgLeft = x + Math.floor((w - finalImgW) / 2);

  const imageElements: SlideElement[] = [
    makeImage(finalImgLeft, imgTop, finalImgW, finalImgH, imageInfo.id),
  ];

  // Optional supporting card below image
  const cardTop = imgTop + finalImgH + HERO_GAP;
  const cardElements: SlideElement[] = [];
  if (manifest.supportingCards.length > 0) {
    const card = manifest.supportingCards[0];
    const cardH = calcCardHeight(card, w);
    cardElements.push(makeShape(x, cardTop, w, cardH, CARD_BG_DEFAULT));
    cardElements.push(makeText(x, cardTop, w, cardH, cardHtml(card, manifest.accentColor)));
  }

  return [...heroElements, ...imageElements, ...cardElements];
}

/**
 * compare archetype
 * 结构: heroBlock (Item A) + VS separator + supportingCards[0] (Item B)
 */
function renderCompareBody(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
): SlideElement[] {
  const w = cw(canvasWidth);
  const x = LEFT_MARGIN;
  const ITEM_MIN_H = 180;
  const VS_HEIGHT = 60;

  // Item A (hero block)
  const itemAH = calcHeroHeight(manifest.heroBlock, w, ITEM_MIN_H);

  // Item B (first supporting card, or placeholder)
  const itemB: PortraitCard = manifest.supportingCards[0] ?? { body: '' };
  const itemBH = calcCardHeight(itemB, w, ITEM_MIN_H);

  // Fill-to-canvas logic: expand both items equally if underfill
  const totalNatural = itemAH + VS_HEIGHT + itemBH + CARD_GAP * 2;
  const targetBottom = Math.round(canvasHeight * 0.84);
  const available = targetBottom - CONTENT_START;
  const expandPer = totalNatural < available ? Math.floor((available - totalNatural) / 2) : 0;

  const finalAH = itemAH + expandPer;
  const finalBH = itemBH + expandPer;

  // Render
  const elements: SlideElement[] = [];
  let cursor = CONTENT_START;

  // Item A
  elements.push(makeShape(x, cursor, w, finalAH, '#dbeafe'));
  elements.push(makeText(x, cursor, w, finalAH, heroHtml(manifest.heroBlock, manifest.accentColor)));
  cursor += finalAH + CARD_GAP;

  // VS separator
  const vsContent = `<p style="font-size: 48px; color: ${manifest.accentColor}; font-weight: bold; text-align: center;">VS</p>`;
  elements.push(makeText(x, cursor, w, VS_HEIGHT, vsContent));
  cursor += VS_HEIGHT + CARD_GAP;

  // Item B
  elements.push(makeShape(x, cursor, w, finalBH, '#dcfce7'));
  elements.push(makeText(x, cursor, w, finalBH, cardHtml(itemB, manifest.accentColor)));

  return elements;
}

/**
 * steps archetype
 * 结构: heroBlock (概述) + 各步骤卡片（带序号徽章指示器）
 */
function renderStepsBody(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
): SlideElement[] {
  const w = cw(canvasWidth);
  const x = LEFT_MARGIN;
  const STEP_INDICATOR_H = 32; // 步骤序号指示器高度
  const STEP_MIN_H = 140;

  // Overview card (heroBlock)
  const overviewH = calcHeroHeight(manifest.heroBlock, w, MIN_HERO_HEIGHT);

  // Step cards (up to 3)
  const steps = manifest.supportingCards.slice(0, 3);

  // Compute step heights
  const stepHs = steps.map((s) => calcCardHeight(s, w, STEP_MIN_H));

  // Fill-to-canvas calculation
  const totalGaps =
    HERO_GAP +
    (steps.length > 0 ? CARD_GAP * steps.length : 0) +
    steps.length * STEP_INDICATOR_H;
  const naturalTotal = overviewH + totalGaps + stepHs.reduce((s, h) => s + h, 0);
  const targetBottom = Math.round(canvasHeight * 0.84);
  const available = targetBottom - CONTENT_START;
  const expandPer =
    naturalTotal < available && steps.length + 1 > 0
      ? Math.floor((available - naturalTotal) / (steps.length + 1))
      : 0;

  const finalOverviewH = overviewH + expandPer;
  const finalStepHs = stepHs.map((h) => h + expandPer);

  const elements: SlideElement[] = [];
  let cursor = CONTENT_START;

  // Overview
  elements.push(makeShape(x, cursor, w, finalOverviewH, CARD_BG_DEFAULT));
  elements.push(makeText(x, cursor, w, finalOverviewH, heroHtml(manifest.heroBlock, manifest.accentColor)));
  cursor += finalOverviewH + HERO_GAP;

  // Step cards
  for (let i = 0; i < steps.length; i++) {
    const h = finalStepHs[i];
    const step = steps[i];

    // Step number indicator (small colored bar above the card)
    const indicatorContent = `<p style="font-size: 28px; color: #ffffff; font-weight: bold; text-align: left;">步骤 ${i + 1}</p>`;
    elements.push(makeShape(x, cursor, 120, STEP_INDICATOR_H, manifest.accentColor));
    elements.push(makeText(x, cursor, 120, STEP_INDICATOR_H, indicatorContent, '#ffffff'));
    cursor += STEP_INDICATOR_H;

    // Step card
    elements.push(makeShape(x, cursor, w, h, CARD_BG_DEFAULT));
    elements.push(makeText(x, cursor, w, h, cardHtml(step, manifest.accentColor)));
    cursor += h + CARD_GAP;
  }

  return elements;
}

// ── Footer Callout ────────────────────────────────────────────────────────────

function renderFooterCallout(
  text: string,
  canvasWidth: number,
  canvasHeight: number,
): SlideElement[] {
  const w = cw(canvasWidth);
  const footerTop = canvasHeight - FOOTER_RESERVE;
  const footerContent = `<p style="font-size: ${FOOTER_FONT}px; color: ${DARK_TEXT}; text-align: left;">${escapeHtml(text)}</p>`;
  const footerH = Math.max(100, estimateTextHeight(text, FOOTER_FONT, w));
  return [
    makeShape(LEFT_MARGIN, footerTop, w, footerH, FOOTER_BG),
    makeText(LEFT_MARGIN, footerTop, w, footerH, footerContent),
  ];
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * 将 PortraitContentManifest 渲染为完整的 slide 元素列表。
 *
 * @param manifest   AI 输出的内容清单
 * @param canvasWidth  画布宽度（如 1000）
 * @param canvasHeight 画布高度（如 1333 for 3:4）
 * @param imageInfo  可选图片信息，供 lead 图片槽位计算高度
 */
export function renderPortraitTemplate(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
  imageInfo?: ImageInfo,
): { elements: SlideElement[]; background: NonNullable<GeneratedSlideData['background']> } {
  const elements: SlideElement[] = [];
  const background: NonNullable<GeneratedSlideData['background']> = {
    type: 'solid',
    color: '#ffffff',
  };

  // 1. Title bar (所有 archetype 共用)
  elements.push(...renderTitleBar(manifest, canvasWidth));

  // 2. Archetype body
  let bodyElements: SlideElement[];

  switch (manifest.archetype) {
    case 'compare':
      bodyElements = renderCompareBody(manifest, canvasWidth, canvasHeight);
      break;

    case 'steps':
      bodyElements = renderStepsBody(manifest, canvasWidth, canvasHeight);
      break;

    case 'lead':
      if (
        manifest.imageRole !== 'skip' &&
        manifest.imageId &&
        imageInfo
      ) {
        bodyElements = renderLeadWithImage(manifest, canvasWidth, canvasHeight, imageInfo);
      } else {
        bodyElements = renderGenericBody(
          manifest, canvasWidth, canvasHeight,
          '#eff6ff', // 导学页 hero 用淡蓝底色
          CARD_BG_DEFAULT,
          MIN_HERO_HEIGHT,
        );
      }
      break;

    case 'concept':
      bodyElements = renderGenericBody(
        manifest, canvasWidth, canvasHeight,
        '#e8f4fd',
        CARD_BG_DEFAULT,
        200,
      );
      break;

    case 'tip':
      bodyElements = renderGenericBody(
        manifest, canvasWidth, canvasHeight,
        '#fff3cd',
        CARD_BG_DEFAULT,
        180,
      );
      break;

    case 'summary':
    default:
      bodyElements = renderGenericBody(
        manifest, canvasWidth, canvasHeight,
        '#f0fdf4',
        CARD_BG_DEFAULT,
        MIN_HERO_HEIGHT,
      );
      break;
  }
  elements.push(...bodyElements);

  // 3. Footer callout (可选)
  if (manifest.footerCallout && manifest.footerCallout.trim()) {
    elements.push(...renderFooterCallout(manifest.footerCallout, canvasWidth, canvasHeight));
  }

  return { elements, background };
}
