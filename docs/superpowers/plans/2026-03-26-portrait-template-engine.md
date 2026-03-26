# Portrait Template Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将竖版 slide 生成从"AI 自由排版"升级为"AI 决定内容 + 程序决定几何"的两段式架构，消除文本溢出、下半区空白和版式漂移问题。

**Architecture:** AI 输出 `PortraitContentManifest`（archetype + 内容槽位），TypeScript 模板引擎将 manifest 渲染为精确坐标的元素列表，配合文本 fitting 防溢出。横版路径完全不变；竖版新路径失败时自动降级回旧路径。

**Tech Stack:** TypeScript, Next.js 14+, `@/lib/generation/pipeline-types`, `@/lib/types/generation`, `nanoid`

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `lib/generation/portrait-content-schema.ts` | **新建** | Manifest 类型定义 + 校验函数 |
| `lib/generation/portrait-manifest-prompt.ts` | **新建** | AI 提取 manifest 的 system/user prompt |
| `lib/generation/portrait-template-engine.ts` | **新建** | Manifest → Elements 渲染引擎 + 文本 fitting |
| `lib/generation/portrait-layout-linter.ts` | **修改** | 新增 3 条完成度质检规则 |
| `lib/generation/scene-generator.ts` | **最小修改** | 导入新模块 + 添加 `generatePortraitSlide()` + 一行分流 |

---

## Task 1: Portrait Content Schema

**Files:**
- Create: `lib/generation/portrait-content-schema.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
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
  if (!validArchetypes.includes(m.archetype as PortraitArchetype)) return false;
  if (typeof m.title !== 'string' || m.title.trim() === '') return false;
  if (!m.heroBlock || typeof (m.heroBlock as Record<string, unknown>).body !== 'string') return false;
  if (!Array.isArray(m.supportingCards)) return false;
  return true;
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check 2>&1 | grep "portrait-content-schema" | head -5
```

期望：无报错（或仅有"找不到引用"类型的警告，因为其他文件还未创建）

- [ ] **Step 3: Commit**

```bash
git add lib/generation/portrait-content-schema.ts
git commit -m "feat(portrait): add PortraitContentManifest schema types"
```

---

## Task 2: Portrait Manifest Prompt Builder

**Files:**
- Create: `lib/generation/portrait-manifest-prompt.ts`

- [ ] **Step 1: 创建 prompt 构建函数**

```typescript
// lib/generation/portrait-manifest-prompt.ts

import type { SceneOutline, PdfImage } from '@/lib/types/generation';

/**
 * System prompt: 指导 AI 输出 PortraitContentManifest，而非元素坐标列表。
 * 比旧版 slide-content system prompt 轻量得多（不需要描述坐标系统）。
 */
export function buildPortraitManifestSystemPrompt(): string {
  return `You are an educational slide content designer for mobile/portrait screens.
Your task: analyze the scene outline and output a JSON content manifest.
The program handles all positioning and layout — you only decide CONTENT and STRUCTURE.

## Output Format
Output ONLY a raw JSON object (no markdown fences, no explanation):

{
  "archetype": "lead" | "concept" | "compare" | "steps" | "tip" | "summary",
  "accentColor": "#hex",
  "title": "≤12 Chinese chars or ≤16 English chars",
  "titleSub": "optional subtitle",
  "heroBlock": {
    "label": "optional badge ≤6 chars",
    "body": "main content ≤80 chars"
  },
  "supportingCards": [
    { "label": "optional", "body": "≤60 chars" }
  ],
  "imageId": "img_1 or gen_img_1 or null",
  "imageRole": "hero" | "supporting" | "skip",
  "footerCallout": "optional summary ≤30 chars"
}

## Archetype Selection

| Archetype | Use when |
|-----------|----------|
| lead      | Opening slide, chapter start, topic introduction |
| concept   | Defining a new term or core concept |
| compare   | Comparing two options, before/after, pros/cons |
| steps     | Sequential procedure or how-to (≤3 steps per page) |
| tip       | Warning, critical reminder, key callout |
| summary   | Scene/chapter wrap-up, key takeaways |

## Image Role Rules
- "hero": ONLY for "lead" archetype where image IS the main visual
- "supporting": ONLY for "steps" archetype, placed below a step card
- "skip": Default for all other archetypes (card-only looks cleaner)
- If no imageId available → always "skip"
- compare, summary → always "skip"

## LaTeX / Chart Degradation
If content includes formulas or charts, convert to plain-text description.
Put the key information in heroBlock.body or a supportingCard. Do NOT generate special element types.

## Content Rules
- Title: neutral topic-focused phrase, no teacher name references
- Language: match the scene outline language
- heroBlock.body: the single most important idea on this page
- supportingCards: supporting details, maximum 3 cards
- Keep all text values short — the layout engine cannot shrink text to fit

## accentColor
Use a strong accessible color:
#1e40af (deep blue) | #065f46 (deep green) | #7c3aed (violet) | #b45309 (amber) | #dc2626 (red)
Choose based on the emotional tone of the content.`;
}

/**
 * User prompt: 注入 outline 的标题、描述、要点和可用图片列表。
 */
export function buildPortraitManifestUserPrompt(
  outline: SceneOutline,
  assignedImages?: PdfImage[],
): string {
  const keyPointsList = (outline.keyPoints || [])
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');

  const imageLines =
    assignedImages && assignedImages.length > 0
      ? assignedImages.map((img) => `- ${img.id}${img.description ? `: ${img.description}` : ''}`).join('\n')
      : 'No images available';

  const mediaLines =
    outline.mediaGenerations && outline.mediaGenerations.length > 0
      ? outline.mediaGenerations
          .map((mg) => `- ${mg.elementId}: ${mg.prompt} (${mg.type})`)
          .join('\n')
      : '';

  const mediaSectionText = mediaLines ? `\nAI-Generated Media:\n${mediaLines}` : '';
  const imageSection = `Available Images:\n${imageLines}${mediaSectionText}`;

  return `Scene Title: ${outline.title}
Description: ${outline.description || '(none)'}
Language: ${outline.language || 'zh-CN'}

Key Points:
${keyPointsList || '(none)'}

${imageSection}

Output the JSON manifest for this portrait slide.`;
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check 2>&1 | grep -E "portrait-manifest|error" | head -10
```

期望：无类型错误

- [ ] **Step 3: Commit**

```bash
git add lib/generation/portrait-manifest-prompt.ts
git commit -m "feat(portrait): add portrait manifest prompt builder"
```

---

## Task 3: Portrait Template Engine — Utilities & Title Bar

**Files:**
- Create: `lib/generation/portrait-template-engine.ts` (Part 1)

- [ ] **Step 1: 创建 portrait-template-engine.ts（工具函数 + 标题栏部分）**

```typescript
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
```

- [ ] **Step 2: 编译检查（允许有"未完成"引用，因为后续函数还未添加）**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check 2>&1 | grep "portrait-template-engine" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add lib/generation/portrait-template-engine.ts
git commit -m "feat(portrait): add template engine utilities and title bar renderer"
```

---

## Task 4: Portrait Template Engine — Block Content Helpers

**Files:**
- Modify: `lib/generation/portrait-template-engine.ts` (追加到文件末尾)

- [ ] **Step 1: 追加 Block 内容生成和高度计算 helper 函数**

在文件末尾追加以下内容：

```typescript
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
```

- [ ] **Step 2: 编译检查**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check 2>&1 | grep "portrait-template-engine" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add lib/generation/portrait-template-engine.ts
git commit -m "feat(portrait): add block content helpers and stacking engine"
```

---

## Task 5: Portrait Template Engine — Archetype Body Renderers

**Files:**
- Modify: `lib/generation/portrait-template-engine.ts` (继续追加)

- [ ] **Step 1: 追加所有 archetype 的 body 渲染函数**

在文件末尾追加：

```typescript
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
```

- [ ] **Step 2: 编译检查**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check 2>&1 | grep -E "portrait-template|error TS" | head -15
```

- [ ] **Step 3: Commit**

```bash
git add lib/generation/portrait-template-engine.ts
git commit -m "feat(portrait): add archetype body renderers (generic, compare, steps, lead-with-image)"
```

---

## Task 6: Portrait Template Engine — Main Entry Point

**Files:**
- Modify: `lib/generation/portrait-template-engine.ts` (继续追加 + export)

- [ ] **Step 1: 追加主入口函数 `renderPortraitTemplate`**

在文件末尾追加：

```typescript
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
```

- [ ] **Step 2: 验证编译（这次应该无错误）**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check 2>&1 | grep -E "portrait-template|error TS" | head -15
```

期望：无类型错误

- [ ] **Step 3: Commit**

```bash
git add lib/generation/portrait-template-engine.ts
git commit -m "feat(portrait): complete portrait template engine with all archetypes"
```

---

## Task 7: Enhanced Portrait Linter Rules

**Files:**
- Modify: `lib/generation/portrait-layout-linter.ts`

- [ ] **Step 1: 更新 `LintViolation['rule']` 联合类型**

找到文件第 38-40 行，将 `rule` 类型字段替换：

**旧代码：**
```typescript
export type LintViolation = {
  rule: 'low-coverage' | 'upper-heavy' | 'three-column' | 'small-font-size' | 'dense-text-block' | 'flat-hierarchy';
  message: string;
};
```

**新代码：**
```typescript
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
```

- [ ] **Step 2: 在 `lintPortraitLayout` 函数内，`flat-hierarchy` 检测之后追加 3 条新规则**

找到 `// ── Rule 6: flat-hierarchy` 块的末尾（约第 300 行），在 `return { pass: violations.length === 0, violations };` 之前插入：

```typescript
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
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check 2>&1 | grep -E "portrait-layout-linter|error TS" | head -10
```

- [ ] **Step 4: 更新文件顶部注释，记录新规则**

在文件第 26-27 行（`* 版式质量规则（Phase 6）：` 后），追加：

```
 * 完成度质检规则（Phase 7）：
 *   7. hero-too-small       — 内容区最大块高度 < canvasHeight × 12%，hero 视觉分量不足
 *   8. lower-half-empty     — 下半区内容面积 < 15%，下半屏严重空白
 *   9. archetype-incomplete — 无标题栏 ShapeElement 且元素 < 4，模板渲染残缺
```

- [ ] **Step 5: Commit**

```bash
git add lib/generation/portrait-layout-linter.ts
git commit -m "feat(portrait): add hero-too-small / lower-half-empty / archetype-incomplete lint rules"
```

---

## Task 8: generatePortraitSlide() + scene-generator.ts Integration

**Files:**
- Modify: `lib/generation/scene-generator.ts`

这是修改量最小的任务：在 `scene-generator.ts` 中添加一个新的私有函数 `generatePortraitSlide()`，并在 `generateSlideContent()` 中以最小改动接入。

- [ ] **Step 1: 在 `scene-generator.ts` 顶部 import 区追加新导入**

找到文件中现有的 import 行（约第 29-55 行），在 `import { lintPortraitLayout, repairPortraitLayout } from './portrait-layout-linter';` 这一行**之后**追加：

```typescript
import {
  buildPortraitManifestSystemPrompt,
  buildPortraitManifestUserPrompt,
} from './portrait-manifest-prompt';
import { renderPortraitTemplate, type ImageInfo } from './portrait-template-engine';
import { isValidManifest, type PortraitContentManifest } from './portrait-content-schema';
```

- [ ] **Step 2: 在 `generateSlideContent()` 函数之前（约第 665 行），插入新的 `generatePortraitSlide()` 函数**

找到 `/** \n * Generate slide content\n */\nasync function generateSlideContent(` 这行，在其之前插入以下完整函数：

```typescript
/**
 * Portrait Slide Generator（Phase 7）
 *
 * 两段式生成：
 * 1. AI 输出 PortraitContentManifest（archetype + 内容槽位）
 * 2. renderPortraitTemplate() 将 manifest 渲染为精确元素列表（程序控制坐标）
 *
 * 失败时返回 null，调用方降级走旧生成路径。
 */
async function generatePortraitSlide(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages: PdfImage[] | undefined,
  imageMapping: ImageMapping | undefined,
  generatedMediaMapping: ImageMapping | undefined,
  canvasWidth: number,
  canvasHeight: number,
): Promise<GeneratedSlideContent | null> {
  try {
    // Step 1: AI → manifest
    const system = buildPortraitManifestSystemPrompt();
    const user = buildPortraitManifestUserPrompt(outline, assignedImages);
    const response = await aiCall(system, user);
    const manifest = parseJsonResponse<PortraitContentManifest>(response);

    if (!manifest || !isValidManifest(manifest)) {
      log.warn(`Portrait manifest invalid for "${outline.title}", falling back to landscape path`);
      return null;
    }

    // Step 2: 解析图片信息（供 lead 图片槽位计算高度）
    let imageInfo: ImageInfo | undefined;
    if (manifest.imageId && manifest.imageRole !== 'skip') {
      if (manifest.imageId.startsWith('gen_')) {
        imageInfo = { id: manifest.imageId, aspectRatio: 16 / 9 };
      } else if (assignedImages) {
        const imgMeta = assignedImages.find((img) => img.id === manifest.imageId);
        if (imgMeta?.width && imgMeta?.height) {
          imageInfo = { id: manifest.imageId, aspectRatio: imgMeta.width / imgMeta.height };
        } else if (imgMeta) {
          imageInfo = { id: manifest.imageId, aspectRatio: 4 / 3 };
        }
      }
    }

    // Step 3: 渲染模板
    const { elements: rawElements, background } = renderPortraitTemplate(
      manifest,
      canvasWidth,
      canvasHeight,
      imageInfo,
    );

    // Step 4: 修复默认值 + 解析图片 ID
    const fixedElements = fixElementDefaults(
      rawElements as GeneratedSlideData['elements'],
      assignedImages,
    );
    const resolvedElements = resolveImageIds(fixedElements, imageMapping, generatedMediaMapping);

    // Step 5: 分配 nanoid + rotate
    const processedElements: PPTElement[] = resolvedElements.map((el) => ({
      ...el,
      id: `${el.type}_${nanoid(8)}`,
      rotate: 0,
    })) as PPTElement[];

    // Step 6: Lint + 最多 1 次 repair
    const rawEls = processedElements as unknown as Record<string, unknown>[];
    const lintResult = lintPortraitLayout(rawEls, canvasWidth, canvasHeight);
    let finalElements = processedElements;

    if (!lintResult.pass) {
      log.info(
        `Portrait template lint failed for "${outline.title}" — violations: ` +
          lintResult.violations.map((v) => v.rule).join(', ') +
          ' — attempting 1 repair',
      );
      try {
        const repairResult = await repairPortraitLayout(
          rawEls,
          canvasWidth,
          canvasHeight,
          aiCall,
        );
        log.info(`Portrait repair done: finalPass=${repairResult.finalPass}`);
        finalElements = repairResult.elements as unknown as PPTElement[];
      } catch (repairErr) {
        log.warn(`Portrait template repair failed:`, repairErr);
      }
    }

    // Step 7: 处理背景（SlideBackground 已在文件顶部 import from '@/lib/types/slides'）
    let slideBackground: SlideBackground | undefined;
    if (background.type === 'solid' && background.color) {
      slideBackground = { type: 'solid', color: background.color };
    }

    return {
      elements: finalElements,
      background: slideBackground,
      remark: outline.description,
    };
  } catch (err) {
    log.warn(`generatePortraitSlide threw for "${outline.title}":`, err);
    return null;
  }
}
```

- [ ] **Step 3: 在 `generateSlideContent()` 中接入 portrait 分支**

找到 `generateSlideContent()` 函数内的这段代码（约第 788-809 行）：

```typescript
  // ── Portrait layout quality check + auto-repair ──────────────────────────
  // 仅对竖版画布触发，横版不进入此链路
  if (isPortrait) {
    const rawEls = generatedData.elements as Record<string, unknown>[];
    const initialLint = lintPortraitLayout(rawEls, canvasWidth, canvasHeight);
    if (!initialLint.pass) {
```

在这段代码**之前**（即 `if (isPortrait) {` 的上面一行），插入以下内容：

```typescript
  // ── Phase 7: Portrait template engine path ───────────────────────────────
  // 新路径：manifest → 模板引擎，AI 不自由排版坐标。横版不走此路径。
  if (isPortrait) {
    const portraitResult = await generatePortraitSlide(
      outline,
      aiCall,
      assignedImages,
      imageMapping,
      generatedMediaMapping,
      canvasWidth,
      canvasHeight,
    );
    if (portraitResult) {
      log.info(`Portrait template engine succeeded for "${outline.title}"`);
      return portraitResult;
    }
    log.warn(`Portrait template engine failed for "${outline.title}", falling back to old path`);
  }
  // ── End Phase 7 ───────────────────────────────────────────────────────────
```

**注意：** 原有的 `if (isPortrait) { ... repair ... }` 代码块保留不变（作为 fallback 路径的保险）。

- [ ] **Step 4: 验证完整编译**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check 2>&1 | head -40
```

期望：`0 errors`。若有类型错误，根据错误信息修复（常见：`SlideBackground` 的 import 需要正确路径）。

- [ ] **Step 5: Commit**

```bash
git add lib/generation/scene-generator.ts
git commit -m "feat(portrait): integrate portrait template engine into generateSlideContent"
```

---

## Task 9: AGENT.md Update + End-to-End Verification

**Files:**
- Modify: `AGENT.md`

- [ ] **Step 1: 更新 AGENT.md 的竖版优化记录**

找到 `AGENT.md` 中以下段落（约第 175 行，`竖版版式质量专项优化（Phase 6）已完成：` 一节之后），在其后追加：

```markdown
竖版模板排版引擎（Phase 7）已完成，取代"AI 自由排版坐标"路径：
- 新文件：
  - `lib/generation/portrait-content-schema.ts` → PortraitContentManifest 类型 + 校验
  - `lib/generation/portrait-manifest-prompt.ts` → AI 提取 manifest 的 prompt 构建函数
  - `lib/generation/portrait-template-engine.ts` → manifest → elements 渲染引擎 + 文本 fitting
- 修改文件：
  - `lib/generation/portrait-layout-linter.ts` → 新增 hero-too-small / lower-half-empty / archetype-incomplete 3 条规则
  - `lib/generation/scene-generator.ts` → 新增 generatePortraitSlide() + portrait 分流
- AI 决定：archetype 选型、标题文字、hero/card 内容、图片角色
- 程序决定：所有坐标、块高度（文本 fitting）、堆叠节奏
- 失败降级：manifest 解析失败时自动回退旧路径，不影响生成流程
- 横版完全不受影响（分流在 isPortrait 分支内）
```

- [ ] **Step 2: E2E 验证准备（护理主题）**

启动开发服务器（若未运行）：

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm dev
```

在浏览器中创建新课程，主题设置为以下其中之一：
- **护理类：** "疼痛管理——NRS 评分法与临床应用"，比例选 3:4 竖版
- **心理类：** "认知行为疗法的核心原则"，比例选 3:4 竖版

- [ ] **Step 3: 验证竖版页面质量（逐维度检查）**

生成完成后，检查以下维度：

| 维度 | 通过标准 |
|------|---------|
| 文本超框 / 重叠 | 无文字超出卡片边界 |
| 下半区空白 | 内容延伸至画布 80%+ 高度 |
| 版式结构 | 每页有明显标题栏 + hero block + 支撑卡片 |
| 图片合理性 | 仅在 lead 页有图片，概念/总结页为纯卡片 |
| Archetype 多样性 | 不同场景出现不同 archetype |
| 横版对照 | 同主题用 16:9 生成，确认横版无变化 |

- [ ] **Step 4: 查看 server log 确认新路径被触发**

```bash
# 在 pnpm dev 输出中搜索以下关键日志
# 期望看到:
# "[Generation] Portrait template engine succeeded for ..."
# 不应看到:
# "[Generation] Portrait template engine failed for ..."
```

- [ ] **Step 5: Commit all remaining changes**

```bash
git add AGENT.md
git commit -m "docs: update AGENT.md with Phase 7 portrait template engine record"
```

- [ ] **Step 6: 最终验证编译**

```bash
cd /Users/huli-dev/Documents/MAIC && pnpm run check
```

期望：`0 errors`

---

## Appendix: Fallback Behavior

Phase 7 设计了两层降级保护，确保生成不会因新代码失败而中断：

1. **manifest 解析失败** → `generatePortraitSlide()` 返回 `null` → `generateSlideContent()` 继续走旧路径（AI 自由排版 + lintPortraitLayout 修复）
2. **模板 lint 未通过** → `repairPortraitLayout()` 最多 1 次修复（继承自原有机制，但因模板质量高，极少触发）

横版路径在 `generateSlideContent()` 的 `isPortrait` 分流之后，完全不受影响。
