// lib/generation/portrait-template-engine.ts

/**
 * Portrait Template Engine v2
 *
 * 目标：
 * - 稳定的视觉系统：配色由程序控制，不再依赖 AI 给主题色
 * - 卡片内文本真正垂直对齐：优先使用 ShapeElement.text，而不是 shape + text 叠层
 * - 统一的卡片语言：圆角面板、轻描边、柔和底色、清晰层级
 * - 保持 thin fork：只改竖版模板引擎，不碰横版和 quiz UI
 */

import type { GeneratedSlideData } from './pipeline-types';
import type {
  PortraitContentManifest,
  PortraitCard,
  PortraitHeroBlock,
} from './portrait-content-schema';
import type { PPTElementOutline, PPTElementShadow, ShapeTextAlign } from '@/lib/types/slides';

type SlideElement = GeneratedSlideData['elements'][number];

type Palette = {
  headerBg: string;
  headerText: string;
  headerSubText: string;
  heroBg: string;
  heroOutline: string;
  heroLabel: string;
  heroBody: string;
  cardBg: string;
  cardAltBg: string;
  cardOutline: string;
  cardLabel: string;
  cardBody: string;
  accentRail: string;
  accentRailAlt: string;
  footerBg: string;
  footerOutline: string;
  footerText: string;
  badgeBg: string;
  badgeText: string;
  vsBg: string;
  vsText: string;
};

type PanelBlock = {
  markup: string;
  fill: string;
  outlineColor: string;
  naturalH: number;
  minH: number;
  align?: ShapeTextAlign;
  railColor?: string;
  shadow?: PPTElementShadow;
};

interface StackResult {
  elements: SlideElement[];
  truncated: boolean;
}

const PAGE_MARGIN = 52;
const TITLE_TOP = 44;
const TITLE_HEIGHT = 136;
const CONTENT_START = TITLE_TOP + TITLE_HEIGHT + 22;
const CARD_GAP = 18;
const HERO_GAP = 22;
const FOOTER_RESERVE = 176;

const TITLE_FONT = 60;
const TITLE_SUB_FONT = 28;
const HERO_LABEL_FONT = 28;
const HERO_BODY_FONT = 42;
const CARD_LABEL_FONT = 36;
const CARD_BODY_FONT = 32;
const FOOTER_FONT = 30;
const VS_FONT = 26;
const STEP_BADGE_FONT = 26;

const MIN_HERO_HEIGHT = 188;
const MIN_CARD_HEIGHT = 126;
const MIN_COMPARE_HEIGHT = 188;
const MIN_STEP_HEIGHT = 120;

const TEXT_DARK = '#1f2937';
const TEXT_MUTED = '#475569';
const RADIUS = 14;
const RAIL_WIDTH = 10;
const RAIL_INSET = 14;
const PANEL_PAD_X = 34;
const PANEL_PAD_Y = 28;
const HERO_SHADOW: PPTElementShadow = { h: 0, v: 8, blur: 20, color: 'rgba(15,23,42,0.08)' };
const FOOTER_SHADOW: PPTElementShadow = { h: 0, v: 6, blur: 16, color: 'rgba(15,23,42,0.06)' };

const PALETTE_BY_ARCHETYPE: Record<PortraitContentManifest['archetype'], Palette> = {
  lead: {
    headerBg: '#173B7A',
    headerText: '#ffffff',
    headerSubText: 'rgba(255,255,255,0.84)',
    heroBg: '#EEF4FF',
    heroOutline: '#C9DBFF',
    heroLabel: '#2B5FD1',
    heroBody: '#173B7A',
    cardBg: '#FFFFFF',
    cardAltBg: '#F5F9FF',
    cardOutline: '#D9E6FB',
    cardLabel: '#244AA8',
    cardBody: TEXT_MUTED,
    accentRail: '#2B5FD1',
    accentRailAlt: '#4B7BE5',
    footerBg: '#EEF4FF',
    footerOutline: '#D7E3F8',
    footerText: '#173B7A',
    badgeBg: '#173B7A',
    badgeText: '#ffffff',
    vsBg: '#E9F0FF',
    vsText: '#244AA8',
  },
  concept: {
    headerBg: '#1E4DA8',
    headerText: '#ffffff',
    headerSubText: 'rgba(255,255,255,0.84)',
    heroBg: '#EDF4FF',
    heroOutline: '#CADCFF',
    heroLabel: '#2A63D4',
    heroBody: '#1E3A8A',
    cardBg: '#FFFFFF',
    cardAltBg: '#F6FAFF',
    cardOutline: '#DCE7F8',
    cardLabel: '#2451BA',
    cardBody: TEXT_MUTED,
    accentRail: '#2A63D4',
    accentRailAlt: '#5683E8',
    footerBg: '#EEF4FF',
    footerOutline: '#D8E5F7',
    footerText: '#1E3A8A',
    badgeBg: '#1E4DA8',
    badgeText: '#ffffff',
    vsBg: '#E8F0FF',
    vsText: '#1E4DA8',
  },
  compare: {
    headerBg: '#274690',
    headerText: '#ffffff',
    headerSubText: 'rgba(255,255,255,0.84)',
    heroBg: '#EDF4FF',
    heroOutline: '#D8E5FA',
    heroLabel: '#245BD1',
    heroBody: '#1E3A8A',
    cardBg: '#FFF8EA',
    cardAltBg: '#FFFFFF',
    cardOutline: '#E9E2D5',
    cardLabel: '#A55A05',
    cardBody: TEXT_MUTED,
    accentRail: '#2563EB',
    accentRailAlt: '#D97706',
    footerBg: '#EEF4FF',
    footerOutline: '#DBE3F3',
    footerText: '#274690',
    badgeBg: '#274690',
    badgeText: '#ffffff',
    vsBg: '#EEF2FF',
    vsText: '#274690',
  },
  steps: {
    headerBg: '#0F766E',
    headerText: '#ffffff',
    headerSubText: 'rgba(255,255,255,0.84)',
    heroBg: '#E8FBF6',
    heroOutline: '#CFEDE4',
    heroLabel: '#0F766E',
    heroBody: '#115E59',
    cardBg: '#FFFFFF',
    cardAltBg: '#F2FCF9',
    cardOutline: '#DCEFE8',
    cardLabel: '#0F766E',
    cardBody: TEXT_MUTED,
    accentRail: '#14B8A6',
    accentRailAlt: '#0F766E',
    footerBg: '#ECFDF8',
    footerOutline: '#D7EFE8',
    footerText: '#115E59',
    badgeBg: '#0F766E',
    badgeText: '#ffffff',
    vsBg: '#E7F9F5',
    vsText: '#0F766E',
  },
  tip: {
    headerBg: '#B45309',
    headerText: '#ffffff',
    headerSubText: 'rgba(255,255,255,0.84)',
    heroBg: '#FFF6E7',
    heroOutline: '#F4DFC0',
    heroLabel: '#C26D08',
    heroBody: '#9A3412',
    cardBg: '#FFFFFF',
    cardAltBg: '#FFF9F0',
    cardOutline: '#EEE3D1',
    cardLabel: '#C26D08',
    cardBody: TEXT_MUTED,
    accentRail: '#F59E0B',
    accentRailAlt: '#D97706',
    footerBg: '#FFF4E5',
    footerOutline: '#F2DEC0',
    footerText: '#9A3412',
    badgeBg: '#B45309',
    badgeText: '#ffffff',
    vsBg: '#FFF3DC',
    vsText: '#B45309',
  },
  summary: {
    headerBg: '#5B21B6',
    headerText: '#ffffff',
    headerSubText: 'rgba(255,255,255,0.84)',
    heroBg: '#F5EEFF',
    heroOutline: '#E5D7FF',
    heroLabel: '#7C3AED',
    heroBody: '#5B21B6',
    cardBg: '#FFFFFF',
    cardAltBg: '#FAF6FF',
    cardOutline: '#EADFF8',
    cardLabel: '#6D28D9',
    cardBody: TEXT_MUTED,
    accentRail: '#8B5CF6',
    accentRailAlt: '#7C3AED',
    footerBg: '#F6F0FF',
    footerOutline: '#E4D9F8',
    footerText: '#5B21B6',
    badgeBg: '#5B21B6',
    badgeText: '#ffffff',
    vsBg: '#F3EBFF',
    vsText: '#6D28D9',
  },
};

function panelWidth(canvasWidth: number): number {
  return canvasWidth - PAGE_MARGIN * 2;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function roundedRectPath(radius = RADIUS): string {
  const r = Math.max(0, Math.min(50, radius));
  return `M ${r} 0 H ${100 - r} Q 100 0 100 ${r} V ${100 - r} Q 100 100 ${100 - r} 100 H ${r} Q 0 100 0 ${100 - r} V ${r} Q 0 0 ${r} 0 Z`;
}

function calcAvgCharWidth(text: string, fontSize: number): number {
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherCount = text.length - chineseCount;
  return (chineseCount * fontSize + otherCount * fontSize * 0.58) / Math.max(1, text.length);
}

function estimateParagraphHeight(
  text: string,
  fontSize: number,
  usableWidth: number,
  lineHeight = 1.24,
): number {
  if (!text.trim()) return Math.ceil(fontSize * lineHeight);
  const avgCharWidth = calcAvgCharWidth(text, fontSize);
  const charsPerLine = Math.max(1, Math.floor(usableWidth / Math.max(1, avgCharWidth)));
  const lines = Math.ceil(text.length / charsPerLine);
  return Math.ceil(lines * fontSize * lineHeight);
}

function estimateRichBlockHeight(
  parts: Array<{ text: string; fontSize: number; gapAfter?: number; lineHeight?: number }>,
  containerWidth: number,
  paddingX = PANEL_PAD_X,
  paddingY = PANEL_PAD_Y,
): number {
  const usableWidth = Math.max(1, containerWidth - paddingX * 2);
  const textHeight = parts.reduce((sum, part) => {
    if (!part.text.trim()) return sum;
    return (
      sum +
      estimateParagraphHeight(part.text, part.fontSize, usableWidth, part.lineHeight ?? 1.24) +
      (part.gapAfter ?? 0)
    );
  }, 0);
  return Math.ceil(textHeight + paddingY * 2);
}

function chooseVerticalAlign(naturalHeight: number, boxHeight: number): ShapeTextAlign {
  return naturalHeight > boxHeight * 0.78 ? 'top' : 'middle';
}

function buildParagraph(
  text: string,
  {
    size,
    color,
    weight = 400,
    align = 'left',
    lineHeight = 1.24,
    marginTop = 0,
  }: {
    size: number;
    color: string;
    weight?: number;
    align?: 'left' | 'center';
    lineHeight?: number;
    marginTop?: number;
  },
): string {
  return `<p style="margin: ${marginTop}px 0 0 0; font-size: ${size}px; color: ${color}; font-weight: ${weight}; text-align: ${align}; line-height: ${lineHeight};">${escapeHtml(text)}</p>`;
}

function wrapBlock(inner: string, padding = '8px 12px'): string {
  return `<div style="padding: ${padding};">${inner}</div>`;
}

function heroMarkup(hero: PortraitHeroBlock, palette: Palette): string {
  const parts: string[] = [];
  if (hero.label?.trim()) {
    parts.push(
      buildParagraph(hero.label, {
        size: HERO_LABEL_FONT,
        color: palette.heroLabel,
        weight: 700,
        lineHeight: 1.18,
      }),
    );
  }
  if (hero.body.trim()) {
    parts.push(
      buildParagraph(hero.body, {
        size: HERO_BODY_FONT,
        color: palette.heroBody,
        weight: 650,
        lineHeight: 1.2,
        marginTop: parts.length > 0 ? 10 : 0,
      }),
    );
  }
  return wrapBlock(parts.join(''), '10px 14px');
}

function supportMarkup(card: PortraitCard, palette: Palette): string {
  const parts: string[] = [];
  if (card.label?.trim()) {
    parts.push(
      buildParagraph(card.label, {
        size: CARD_LABEL_FONT,
        color: palette.cardLabel,
        weight: 700,
        lineHeight: 1.18,
      }),
    );
  }
  if (card.body.trim()) {
    parts.push(
      buildParagraph(card.body, {
        size: CARD_BODY_FONT,
        color: palette.cardBody,
        weight: 500,
        lineHeight: 1.24,
        marginTop: parts.length > 0 ? 8 : 0,
      }),
    );
  }
  return wrapBlock(parts.join(''), '8px 14px 8px 26px');
}

function footerMarkup(text: string, palette: Palette): string {
  return wrapBlock(
    buildParagraph(text, {
      size: FOOTER_FONT,
      color: palette.footerText,
      weight: 600,
      lineHeight: 1.2,
    }),
    '10px 14px',
  );
}

function makeRoundedPanel({
  left,
  top,
  width,
  height,
  fill,
  outlineColor,
  markup,
  defaultColor = TEXT_DARK,
  align = 'middle',
  shadow,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  outlineColor: string;
  markup: string;
  defaultColor?: string;
  align?: ShapeTextAlign;
  shadow?: PPTElementShadow;
}): SlideElement {
  return {
    type: 'shape',
    left,
    top,
    width,
    height,
    path: roundedRectPath(),
    viewBox: [100, 100],
    fixedRatio: false,
    fill,
    outline: {
      style: 'solid',
      width: 1,
      color: outlineColor,
    } satisfies PPTElementOutline,
    shadow,
    text: {
      content: markup,
      defaultFontName: '',
      defaultColor,
      align,
      lineHeight: 1.24,
      paragraphSpace: 0,
    },
  };
}

function makeRail({
  left,
  top,
  height,
  color,
}: {
  left: number;
  top: number;
  height: number;
  color: string;
}): SlideElement {
  return {
    type: 'shape',
    left,
    top,
    width: RAIL_WIDTH,
    height,
    path: roundedRectPath(50),
    viewBox: [100, 100],
    fixedRatio: false,
    fill: color,
  };
}

function makeBadge({
  left,
  top,
  size,
  fill,
  color,
  text,
}: {
  left: number;
  top: number;
  size: number;
  fill: string;
  color: string;
  text: string;
}): SlideElement {
  return {
    type: 'shape',
    left,
    top,
    width: size,
    height: size,
    path: roundedRectPath(50),
    viewBox: [100, 100],
    fixedRatio: true,
    fill,
    text: {
      content: buildParagraph(text, {
        size: STEP_BADGE_FONT,
        color,
        weight: 700,
        align: 'center',
        lineHeight: 1,
      }),
      defaultFontName: '',
      defaultColor: color,
      align: 'middle',
      lineHeight: 1,
      paragraphSpace: 0,
    },
  };
}

function renderTitleBar(manifest: PortraitContentManifest, canvasWidth: number): SlideElement[] {
  const palette = PALETTE_BY_ARCHETYPE[manifest.archetype];
  const width = panelWidth(canvasWidth);
  const parts = [
    buildParagraph(manifest.title, {
      size: TITLE_FONT,
      color: palette.headerText,
      weight: 750,
      lineHeight: 1.12,
    }),
  ];

  if (manifest.titleSub?.trim()) {
    parts.push(
      buildParagraph(manifest.titleSub, {
        size: TITLE_SUB_FONT,
        color: palette.headerSubText,
        weight: 500,
        lineHeight: 1.18,
        marginTop: 8,
      }),
    );
  }

  return [
    makeRoundedPanel({
      left: PAGE_MARGIN,
      top: TITLE_TOP,
      width,
      height: TITLE_HEIGHT,
      fill: palette.headerBg,
      outlineColor: palette.headerBg,
      markup: wrapBlock(parts.join(''), '10px 16px'),
      defaultColor: palette.headerText,
      align: 'middle',
      shadow: HERO_SHADOW,
    }),
  ];
}

function calcHeroHeight(hero: PortraitHeroBlock, width: number, minH: number): number {
  return Math.max(
    minH,
    estimateRichBlockHeight(
      [
        ...(hero.label?.trim()
          ? [{ text: hero.label, fontSize: HERO_LABEL_FONT, gapAfter: 10, lineHeight: 1.18 }]
          : []),
        { text: hero.body, fontSize: HERO_BODY_FONT, lineHeight: 1.2 },
      ],
      width,
      42,
      34,
    ),
  );
}

function calcCardHeight(card: PortraitCard, width: number, minH = MIN_CARD_HEIGHT): number {
  return Math.max(
    minH,
    estimateRichBlockHeight(
      [
        ...(card.label?.trim()
          ? [{ text: card.label, fontSize: CARD_LABEL_FONT, gapAfter: 8, lineHeight: 1.18 }]
          : []),
        { text: card.body, fontSize: CARD_BODY_FONT, lineHeight: 1.24 },
      ],
      width,
      42,
      30,
    ),
  );
}

function renderPanelBlock(
  block: PanelBlock,
  left: number,
  top: number,
  width: number,
  height: number,
): SlideElement[] {
  const railHeight = Math.max(56, height - RAIL_INSET * 2);
  const align = block.align ?? chooseVerticalAlign(block.naturalH, height);
  const elements: SlideElement[] = [
    makeRoundedPanel({
      left,
      top,
      width,
      height,
      fill: block.fill,
      outlineColor: block.outlineColor,
      markup: block.markup,
      align,
      shadow: block.shadow,
    }),
  ];

  if (block.railColor) {
    elements.push(
      makeRail({
        left: left + 12,
        top: top + Math.max(14, Math.floor((height - railHeight) / 2)),
        height: railHeight,
        color: block.railColor,
      }),
    );
  }

  return elements;
}

function stackBlocks(
  blocks: PanelBlock[],
  canvasWidth: number,
  canvasHeight: number,
  startTop: number,
  targetFillRatio: number,
  maxBottom = canvasHeight - 60,
): StackResult {
  if (blocks.length === 0) return { elements: [], truncated: false };

  const width = panelWidth(canvasWidth);
  const naturalHeights = blocks.map((b) => Math.max(b.minH, b.naturalH));
  const totalGap = (blocks.length - 1) * CARD_GAP;
  const naturalTotal = naturalHeights.reduce((sum, height) => sum + height, 0) + totalGap;

  const targetBottom = Math.min(Math.round(canvasHeight * targetFillRatio), maxBottom);
  const available = targetBottom - startTop;
  let heights = [...naturalHeights];

  if (naturalTotal < available) {
    const extra = Math.floor((available - naturalTotal) / blocks.length);
    heights = heights.map((height) => height + extra);
  }

  const totalHeight = heights.reduce((sum, height) => sum + height, 0) + totalGap;
  if (startTop + totalHeight > maxBottom) {
    return { elements: [], truncated: true };
  }

  const elements: SlideElement[] = [];
  let cursor = startTop;
  for (let i = 0; i < blocks.length; i++) {
    elements.push(...renderPanelBlock(blocks[i], PAGE_MARGIN, cursor, width, heights[i]));
    cursor += heights[i] + CARD_GAP;
  }

  return { elements, truncated: false };
}

function renderGenericBody(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
  palette: Palette,
  heroMinH: number,
  maxBottom = canvasHeight - 60,
): StackResult {
  const width = panelWidth(canvasWidth);
  const cards = manifest.supportingCards.slice(0, 3);

  const blocks: PanelBlock[] = [
    {
      markup: heroMarkup(manifest.heroBlock, palette),
      fill: palette.heroBg,
      outlineColor: palette.heroOutline,
      naturalH: calcHeroHeight(manifest.heroBlock, width, heroMinH),
      minH: heroMinH,
      shadow: HERO_SHADOW,
    },
    ...cards.map((card, index) => ({
      markup: supportMarkup(card, palette),
      fill: index % 2 === 0 ? palette.cardAltBg : palette.cardBg,
      outlineColor: palette.cardOutline,
      naturalH: calcCardHeight(card, width),
      minH: MIN_CARD_HEIGHT,
      railColor: index % 2 === 0 ? palette.accentRail : palette.accentRailAlt,
    })),
  ];

  return stackBlocks(blocks, canvasWidth, canvasHeight, CONTENT_START, 0.86, maxBottom);
}

function renderCompareBody(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
  palette: Palette,
  maxBottom = canvasHeight - 60,
): StackResult {
  const width = panelWidth(canvasWidth);
  const itemB: PortraitCard = manifest.supportingCards[0] ?? { body: '' };
  const firstNatural = calcHeroHeight(manifest.heroBlock, width, MIN_COMPARE_HEIGHT);
  const secondNatural = calcCardHeight(itemB, width, MIN_COMPARE_HEIGHT);
  const badgeHeight = 52;
  const naturalTotal = firstNatural + secondNatural + badgeHeight + CARD_GAP * 2;
  const targetBottom = Math.min(Math.round(canvasHeight * 0.84), maxBottom);
  const available = targetBottom - CONTENT_START;
  const extra = naturalTotal < available ? Math.floor((available - naturalTotal) / 2) : 0;
  const firstHeight = firstNatural + extra;
  const secondHeight = secondNatural + extra;

  if (CONTENT_START + firstHeight + secondHeight + badgeHeight + CARD_GAP * 2 > maxBottom) {
    return { elements: [], truncated: true };
  }

  const elements: SlideElement[] = [];
  let cursor = CONTENT_START;

  elements.push(
    ...renderPanelBlock(
      {
        markup: heroMarkup(manifest.heroBlock, palette),
        fill: palette.heroBg,
        outlineColor: palette.heroOutline,
        naturalH: firstNatural,
        minH: MIN_COMPARE_HEIGHT,
        shadow: HERO_SHADOW,
      },
      PAGE_MARGIN,
      cursor,
      width,
      firstHeight,
    ),
  );

  cursor += firstHeight + CARD_GAP;
  elements.push(
    makeRoundedPanel({
      left: Math.round(canvasWidth / 2) - 52,
      top: cursor,
      width: 104,
      height: badgeHeight,
      fill: palette.vsBg,
      outlineColor: palette.cardOutline,
      markup: wrapBlock(
        buildParagraph('VS', {
          size: VS_FONT,
          color: palette.vsText,
          weight: 750,
          align: 'center',
          lineHeight: 1,
        }),
        '0',
      ),
      defaultColor: palette.vsText,
      align: 'middle',
    }),
  );

  cursor += badgeHeight + CARD_GAP;
  elements.push(
    ...renderPanelBlock(
      {
        markup: supportMarkup(itemB, {
          ...palette,
          cardLabel: palette.accentRailAlt,
        }),
        fill: palette.cardBg,
        outlineColor: palette.cardOutline,
        naturalH: secondNatural,
        minH: MIN_COMPARE_HEIGHT,
        railColor: palette.accentRailAlt,
      },
      PAGE_MARGIN,
      cursor,
      width,
      secondHeight,
    ),
  );

  return { elements, truncated: false };
}

function renderStepsBody(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
  palette: Palette,
  maxBottom = canvasHeight - 60,
): StackResult {
  const width = panelWidth(canvasWidth);
  const overviewNatural = calcHeroHeight(manifest.heroBlock, width, MIN_HERO_HEIGHT);
  const stepCards = manifest.supportingCards.slice(0, 3);
  const badgeSize = 54;
  const badgeGap = 14;
  const rowCardWidth = width - badgeSize - badgeGap;
  const rowNaturals = stepCards.map((card) => calcCardHeight(card, rowCardWidth, MIN_STEP_HEIGHT));
  const totalNatural =
    overviewNatural +
    HERO_GAP +
    rowNaturals.reduce((sum, height) => sum + height, 0) +
    Math.max(0, stepCards.length - 1) * CARD_GAP;
  const targetBottom = Math.min(Math.round(canvasHeight * 0.85), maxBottom);
  const available = targetBottom - CONTENT_START;
  const extraPerRow =
    totalNatural < available && stepCards.length > 0
      ? Math.floor((available - totalNatural) / (stepCards.length + 1))
      : 0;

  const overviewHeight = overviewNatural + extraPerRow;
  const rowHeights = rowNaturals.map((height) => height + extraPerRow);
  const finalTotal =
    overviewHeight +
    HERO_GAP +
    rowHeights.reduce((sum, height) => sum + height, 0) +
    Math.max(0, stepCards.length - 1) * CARD_GAP;

  if (CONTENT_START + finalTotal > maxBottom) {
    return { elements: [], truncated: true };
  }

  const elements: SlideElement[] = [];
  let cursor = CONTENT_START;

  elements.push(
    ...renderPanelBlock(
      {
        markup: heroMarkup(manifest.heroBlock, palette),
        fill: palette.heroBg,
        outlineColor: palette.heroOutline,
        naturalH: overviewNatural,
        minH: MIN_HERO_HEIGHT,
        shadow: HERO_SHADOW,
      },
      PAGE_MARGIN,
      cursor,
      width,
      overviewHeight,
    ),
  );

  cursor += overviewHeight + HERO_GAP;

  stepCards.forEach((card, index) => {
    const rowHeight = rowHeights[index];
    const badgeTop = cursor + Math.max(8, Math.floor((rowHeight - badgeSize) / 2));
    elements.push(
      makeBadge({
        left: PAGE_MARGIN,
        top: badgeTop,
        size: badgeSize,
        fill: palette.badgeBg,
        color: palette.badgeText,
        text: `${index + 1}`,
      }),
    );
    elements.push(
      ...renderPanelBlock(
        {
          markup: supportMarkup(card, palette),
          fill: index % 2 === 0 ? palette.cardAltBg : palette.cardBg,
          outlineColor: palette.cardOutline,
          naturalH: rowNaturals[index],
          minH: MIN_STEP_HEIGHT,
        },
        PAGE_MARGIN + badgeSize + badgeGap,
        cursor,
        rowCardWidth,
        rowHeight,
      ),
    );
    cursor += rowHeight + CARD_GAP;
  });

  return { elements, truncated: false };
}

function renderFooterCallout(
  text: string,
  canvasWidth: number,
  canvasHeight: number,
  palette: Palette,
): SlideElement[] {
  const width = panelWidth(canvasWidth);
  const height = Math.max(
    96,
    estimateRichBlockHeight([{ text, fontSize: FOOTER_FONT, lineHeight: 1.2 }], width, 38, 24),
  );
  const top = canvasHeight - height - 48;
  return [
    makeRoundedPanel({
      left: PAGE_MARGIN,
      top,
      width,
      height,
      fill: palette.footerBg,
      outlineColor: palette.footerOutline,
      markup: footerMarkup(text, palette),
      defaultColor: palette.footerText,
      align: 'middle',
      shadow: FOOTER_SHADOW,
    }),
  ];
}

export function renderPortraitTemplate(
  manifest: PortraitContentManifest,
  canvasWidth: number,
  canvasHeight: number,
): {
  elements: SlideElement[];
  background: NonNullable<GeneratedSlideData['background']>;
  truncated: boolean;
} {
  const palette = PALETTE_BY_ARCHETYPE[manifest.archetype];
  const elements: SlideElement[] = [];
  const background: NonNullable<GeneratedSlideData['background']> = {
    type: 'solid',
    color: '#FCFCFD',
  };
  const footerReservedTop = manifest.footerCallout?.trim()
    ? canvasHeight - FOOTER_RESERVE
    : canvasHeight - 56;

  elements.push(...renderTitleBar(manifest, canvasWidth));

  let bodyElements: SlideElement[] = [];
  let truncated = false;

  switch (manifest.archetype) {
    case 'compare': {
      const result = renderCompareBody(
        manifest,
        canvasWidth,
        canvasHeight,
        palette,
        footerReservedTop,
      );
      bodyElements = result.elements;
      truncated = result.truncated;
      break;
    }
    case 'steps': {
      const result = renderStepsBody(
        manifest,
        canvasWidth,
        canvasHeight,
        palette,
        footerReservedTop,
      );
      bodyElements = result.elements;
      truncated = result.truncated;
      break;
    }
    case 'lead': {
      const result = renderGenericBody(
        manifest,
        canvasWidth,
        canvasHeight,
        palette,
        196,
        footerReservedTop,
      );
      bodyElements = result.elements;
      truncated = result.truncated;
      break;
    }
    case 'concept': {
      const result = renderGenericBody(
        manifest,
        canvasWidth,
        canvasHeight,
        palette,
        188,
        footerReservedTop,
      );
      bodyElements = result.elements;
      truncated = result.truncated;
      break;
    }
    case 'tip': {
      const result = renderGenericBody(
        manifest,
        canvasWidth,
        canvasHeight,
        palette,
        180,
        footerReservedTop,
      );
      bodyElements = result.elements;
      truncated = result.truncated;
      break;
    }
    case 'summary':
    default: {
      const result = renderGenericBody(
        manifest,
        canvasWidth,
        canvasHeight,
        palette,
        184,
        footerReservedTop,
      );
      bodyElements = result.elements;
      truncated = result.truncated;
      break;
    }
  }

  elements.push(...bodyElements);
  const bodyMaxBottom = bodyElements.reduce((max, el) => {
    const bottom = Number(el.top || 0) + Number(el.height || 0);
    return Math.max(max, bottom);
  }, 0);

  if (manifest.footerCallout?.trim()) {
    elements.push(...renderFooterCallout(manifest.footerCallout, canvasWidth, canvasHeight, palette));
  }

  if (bodyMaxBottom > footerReservedTop) {
    truncated = true;
  }

  const maxBottom = elements.reduce((max, el) => {
    const bottom = Number(el.top || 0) + Number(el.height || 0);
    return Math.max(max, bottom);
  }, 0);
  if (maxBottom > canvasHeight - 36) {
    truncated = true;
  }

  return { elements, background, truncated };
}
