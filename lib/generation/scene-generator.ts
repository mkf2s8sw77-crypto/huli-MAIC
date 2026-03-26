/**
 * Stage 2: Scene content and action generation.
 *
 * Generates full scenes (slide/quiz/interactive/pbl with actions)
 * from scene outlines.
 */

import { nanoid } from 'nanoid';
import katex from 'katex';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  ScientificModel,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import type { LanguageModel } from 'ai';
import type { StageStore } from '@/lib/api/stage-api';
import { createStageAPI } from '@/lib/api/stage-api';
import { generatePBLContent } from '@/lib/pbl/generate-pbl';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { postProcessInteractiveHtml } from './interactive-post-processor';
import { parseActionsFromStructuredOutput } from './action-parser';
import { parseJsonResponse } from './json-repair';
import {
  buildCourseContext,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
} from './prompt-formatters';
import type { PPTElement, Slide, SlideBackground, SlideTheme } from '@/lib/types/slides';
import type { QuizQuestion } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type {
  AgentInfo,
  SceneGenerationContext,
  GeneratedSlideData,
  AICallFn,
  GenerationResult,
  GenerationCallbacks,
} from './pipeline-types';
import { createLogger } from '@/lib/logger';
import {
  DEFAULT_VIEWPORT_PRESET,
  DEFAULT_VIEWPORT_SIZE,
  getViewportHeight,
  getViewportRatio,
  type ViewportPreset,
} from '@/lib/config/viewport';
import { lintPortraitLayout, repairPortraitLayout } from './portrait-layout-linter';
import {
  buildPortraitManifestSystemPrompt,
  buildPortraitManifestUserPrompt,
} from './portrait-manifest-prompt';
import { renderPortraitTemplate, type ImageInfo } from './portrait-template-engine';
import { isValidManifest, type PortraitContentManifest } from './portrait-content-schema';
const log = createLogger('Generation');

// ==================== Stage 2: Full Scenes (Two-Step) ====================

/**
 * Stage 3: Generate full scenes (parallel version)
 *
 * Two steps:
 * - Step 3.1: Outline -> Page content (slide/quiz)
 * - Step 3.2: Content + script -> Action list
 *
 * All scenes generated in parallel using Promise.all
 */
export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
): Promise<GenerationResult<string[]>> {
  const api = createStageAPI(store);
  const totalScenes = sceneOutlines.length;
  let completedCount = 0;

  callbacks?.onProgress?.({
    currentStage: 3,
    overallProgress: 66,
    stageProgress: 0,
    statusMessage: `正在并行生成 ${totalScenes} 个场景...`,
    scenesGenerated: 0,
    totalScenes,
  });

  // Generate all scenes in parallel
  const results = await Promise.all(
    sceneOutlines.map(async (outline, index) => {
      try {
        const sceneId = await generateSingleScene(outline, api, aiCall);

        // Update progress (not atomic, but sufficient for UI display)
        completedCount++;
        callbacks?.onProgress?.({
          currentStage: 3,
          overallProgress: 66 + Math.floor((completedCount / totalScenes) * 34),
          stageProgress: Math.floor((completedCount / totalScenes) * 100),
          statusMessage: `已完成 ${completedCount}/${totalScenes} 个场景`,
          scenesGenerated: completedCount,
          totalScenes,
        });

        return { success: true, sceneId, index };
      } catch (error) {
        completedCount++;
        callbacks?.onError?.(`Failed to generate scene ${outline.title}: ${error}`);
        return { success: false, sceneId: null, index };
      }
    }),
  );

  // Collect successful sceneIds in original order
  const sceneIds = results
    .filter(
      (r): r is { success: true; sceneId: string; index: number } =>
        r.success && r.sceneId !== null,
    )
    .sort((a, b) => a.index - b.index)
    .map((r) => r.sceneId);

  return { success: true, data: sceneIds };
}

/**
 * Generate a single scene (two-step process)
 *
 * Step 3.1: Generate content
 * Step 3.2: Generate Actions
 */
async function generateSingleScene(
  outline: SceneOutline,
  api: ReturnType<typeof createStageAPI>,
  aiCall: AICallFn,
): Promise<string | null> {
  // Step 3.1: Generate content
  log.info(`Step 3.1: Generating content for: ${outline.title}`);
  const content = await generateSceneContent(outline, aiCall);
  if (!content) {
    log.error(`Failed to generate content for: ${outline.title}`);
    return null;
  }

  // Step 3.2: Generate Actions
  log.info(`Step 3.2: Generating actions for: ${outline.title}`);
  const actions = await generateSceneActions(outline, content, aiCall);
  log.info(`Generated ${actions.length} actions for: ${outline.title}`);

  // Create complete Scene
  return createSceneWithActions(outline, content, actions, api);
}

/**
 * Step 3.1: Generate content based on outline
 */
export async function generateSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  languageModel?: LanguageModel,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  viewport?: { viewportPreset?: ViewportPreset; viewportSize?: number; viewportRatio?: number },
): Promise<
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent
  | null
> {
  // If outline is interactive but missing interactiveConfig, fall back to slide
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig, falling back to slide`,
    );
    const fallbackOutline = { ...outline, type: 'slide' as const };
      return generateSlideContent(
        fallbackOutline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        viewport,
      );
  }

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        viewport,
      );
    case 'quiz':
      return generateQuizContent(outline, aiCall);
    case 'interactive':
      return generateInteractiveContent(outline, aiCall, outline.language);
    case 'pbl':
      return generatePBLSceneContent(outline, languageModel);
    default:
      return null;
  }
}

/**
 * Check if a string looks like an image ID (e.g., "img_1", "img_2")
 * rather than a base64 data URL or actual URL
 *
 * This function distinguishes between:
 * - Image IDs: "img_1", "img_2", etc. → returns true
 * - Base64 data URLs: "data:image/..." → returns false
 * - HTTP URLs: "http://...", "https://..." → returns false
 * - Relative paths: "/images/..." → returns false
 */
function isImageIdReference(value: string): boolean {
  if (!value) return false;
  // Exclude real URLs and paths
  if (value.startsWith('data:')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/')) return false; // Relative paths
  // Match image ID format: img_1, img_2, etc.
  return /^img_\d+$/i.test(value);
}

/**
 * Check if a string looks like a generated image/video ID (e.g., "gen_img_1", "gen_img_xK8f2mQ")
 * These are placeholders for AI-generated media, not PDF-extracted images.
 */
function isGeneratedImageId(value: string): boolean {
  if (!value) return false;
  return /^gen_(img|vid)_[\w-]+$/i.test(value);
}

/**
 * Resolve image ID references in src field to actual base64 URLs
 *
 * AI generates: { type: "image", src: "img_1", ... }
 * This function replaces: { type: "image", src: "data:image/png;base64,...", ... }
 *
 * Design rationale (Plan B):
 * - Simpler: AI only needs to know one field (src)
 * - Consistent: Generated JSON structure matches final PPTImageElement
 * - Intuitive: src is the image source, first as ID then as actual URL
 * - Less prompt complexity: No need to explain imageId vs src distinction
 */
function resolveImageIds(
  elements: GeneratedSlideData['elements'],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type === 'image') {
        if (!('src' in el)) {
          log.warn(`Image element missing src, removing element`);
          return null; // Remove invalid image elements
        }
        const src = el.src as string;

        // If src is an image ID reference, replace with actual URL
        if (isImageIdReference(src)) {
          if (!imageMapping || !imageMapping[src]) {
            log.warn(`No mapping for image ID: ${src}, removing element`);
            return null; // Remove invalid image elements
          }
          log.debug(`Resolved image ID "${src}" to base64 URL`);
          return { ...el, src: imageMapping[src] };
        }

        // Generated image reference — keep as placeholder for async backfill
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated image ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
          log.debug(`Keeping generated image placeholder: ${src}`);
          return el;
        }
      }

      if (el.type === 'video') {
        if (!('src' in el)) {
          log.warn(`Video element missing src, removing element`);
          return null;
        }
        const src = el.src as string;
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated video ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
          log.debug(`Keeping generated video placeholder: ${src}`);
          return el;
        }
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

/**
 * Fix elements with missing required fields
 * Adds default values for fields that AI might not have generated correctly
 */
function fixElementDefaults(
  elements: GeneratedSlideData['elements'],
  assignedImages?: PdfImage[],
): GeneratedSlideData['elements'] {
  return elements.map((el) => {
    // Fix line elements
    if (el.type === 'line') {
      const lineEl = el as Record<string, unknown>;

      // Ensure points field exists with default values
      if (!lineEl.points || !Array.isArray(lineEl.points) || lineEl.points.length !== 2) {
        log.warn(`Line element missing points, adding defaults`);
        lineEl.points = ['', ''] as [string, string]; // Default: no markers on either end
      }

      // Ensure start/end exist
      if (!lineEl.start || !Array.isArray(lineEl.start)) {
        lineEl.start = [el.left ?? 0, el.top ?? 0];
      }
      if (!lineEl.end || !Array.isArray(lineEl.end)) {
        lineEl.end = [(el.left ?? 0) + (el.width ?? 100), (el.top ?? 0) + (el.height ?? 0)];
      }

      // Ensure style exists
      if (!lineEl.style) {
        lineEl.style = 'solid';
      }

      // Ensure color exists
      if (!lineEl.color) {
        lineEl.color = '#333333';
      }

      return lineEl as typeof el;
    }

    // Fix text elements
    if (el.type === 'text') {
      const textEl = el as Record<string, unknown>;

      if (!textEl.defaultFontName) {
        textEl.defaultFontName = 'Microsoft YaHei';
      }
      if (!textEl.defaultColor) {
        textEl.defaultColor = '#333333';
      }
      if (!textEl.content) {
        textEl.content = '';
      }

      return textEl as typeof el;
    }

    // Fix image elements
    if (el.type === 'image') {
      const imageEl = el as Record<string, unknown>;

      if (imageEl.fixedRatio === undefined) {
        imageEl.fixedRatio = true;
      }

      // Correct dimensions using known aspect ratio (src is still img_id at this point)
      if (assignedImages && typeof imageEl.src === 'string') {
        const imgMeta = assignedImages.find((img) => img.id === imageEl.src);
        if (imgMeta?.width && imgMeta?.height) {
          const knownRatio = imgMeta.width / imgMeta.height;
          const curW = (el.width || 400) as number;
          const curH = (el.height || 300) as number;
          if (Math.abs(curW / curH - knownRatio) / knownRatio > 0.1) {
            // Keep width, correct height
            const newH = Math.round(curW / knownRatio);
            if (newH > 462) {
              // canvas 562.5 - margins 50×2
              const newW = Math.round(462 * knownRatio);
              imageEl.width = newW;
              imageEl.height = 462;
            } else {
              imageEl.height = newH;
            }
          }
        }
      }

      return imageEl as typeof el;
    }

    // Fix shape elements
    if (el.type === 'shape') {
      const shapeEl = el as Record<string, unknown>;

      if (!shapeEl.viewBox) {
        shapeEl.viewBox = `0 0 ${el.width ?? 100} ${el.height ?? 100}`;
      }
      if (!shapeEl.path) {
        // Default to rectangle
        const w = el.width ?? 100;
        const h = el.height ?? 100;
        shapeEl.path = `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
      }
      if (!shapeEl.fill) {
        shapeEl.fill = '#5b9bd5';
      }
      if (shapeEl.fixedRatio === undefined) {
        shapeEl.fixedRatio = false;
      }

      return shapeEl as typeof el;
    }

    return el;
  });
}

/**
 * Process LaTeX elements: render latex string to HTML using KaTeX.
 * Fills in html and fixedRatio fields.
 * Elements that fail conversion are removed.
 */
function processLatexElements(
  elements: GeneratedSlideData['elements'],
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type !== 'latex') return el;

      const latexStr = el.latex as string | undefined;
      if (!latexStr) {
        log.warn('Latex element missing latex string, removing');
        return null;
      }

      try {
        const html = katex.renderToString(latexStr, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
        });

        return {
          ...el,
          html,
          fixedRatio: true,
        };
      } catch (err) {
        log.warn(`Failed to render latex "${latexStr}":`, err);
        return null;
      }
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

/**
 * Build orientation-aware design rules for slide generation prompt.
 * Portrait rules discourage horizontal layouts; landscape rules keep default behavior.
 */
function buildSlideOrientationRules(
  canvasWidth: number,
  canvasHeight: number,
  isPortrait: boolean,
): string {
  if (isPortrait) {
    const singleBlockWidth = canvasWidth - 120;
    const col2Width = Math.floor((canvasWidth - 160) / 2);
    const contentBottom = Math.round(canvasHeight * 0.8);
    const zone75 = Math.round(canvasHeight * 0.75);
    return `### Portrait Canvas Rules (canvas_height ${canvasHeight} > canvas_width ${canvasWidth})

This is a **PORTRAIT** canvas. Apply every rule below WITHOUT EXCEPTION.

**PROHIBITED — never use in portrait:**
1. **Three-column card layout** — three side-by-side cards or blocks are forbidden. MAX 2 elements per row.
2. **Wide tables with 4+ columns** — use ≤ 3-column tables or replace with a vertical list.
3. **Left-right 50/50 split as the default** — use only when explicitly comparing exactly two items.
4. **All content packed into the top 40% of the canvas with large empty space below** — content must reach at least y=${contentBottom}px from the top.
5. **Dominant landscape images (aspect ratio > 1.5:1)** — avoid; if unavoidable, constrain width to ≤ ${Math.round(canvasWidth * 0.55)}px and place as an accent, not the main element.

**REQUIRED — always apply in portrait:**
1. **Vertical stacking**: arrange content blocks top-to-bottom, not side-by-side.
2. **Single wide main block**: one primary block at width ~${singleBlockWidth}px (left=60, right edge at ${canvasWidth - 60}). Then add secondary blocks *below* it.
3. **Zone structure**:
   - Title zone: top=50, height ≈ 128-148px (64-72px font, 1-2 lines)
   - Main content zone: top ≈ 190-210px → must extend downward to at least y=${contentBottom}px
   - Bottom zone (optional callout/summary): starts at y≈${zone75}px
4. **Vertical list for 3+ points**: use a single full-width (${singleBlockWidth}px wide) text block with bullet points — do NOT split into columns.
5. **Downward-flowing sequences**: for processes or steps, stack step-boxes vertically with down-facing arrows (LineElement pointing downward) between them.

**Layout constraints (hard limits):**
| Parameter | Value |
|-----------|-------|
| Max columns per row | **2** |
| Single block recommended width | **${singleBlockWidth}px** (left=60) |
| Two-column block width (each) | **${col2Width}px**, gap 40px |
| Content must reach at least | **y=${contentBottom}px** from top |

**Portrait Typography — MOBILE-FIRST (mandatory font sizes):**

Portrait slides are viewed on phones at ~0.35× scale (1000px canvas → ~350px screen width).
Desktop PPT font sizes (18-20px) render as ~7px on phone — completely unreadable. Use the sizes below WITHOUT EXCEPTION.

| Text role | Font size | Phone rendering |
|-----------|-----------|-----------------|
| Main slide title | **64-72px** | ≈ 22-25px on phone ✓ |
| Section heading / card title | **48-56px** | ≈ 17-20px on phone ✓ |
| Body text / bullet text | **44-52px** | ≈ 15-18px on phone ✓ |
| Labels, tags, callout text | **36-40px** | ≈ 13-14px on phone ✓ |
| Captions, image notes | **32-36px** | ≈ 11-13px on phone (use sparingly) |

> ⚠️  NEVER use font sizes below **32px** in portrait slides. Sizes 18-20px are portrait-prohibited.

**Portrait Text Density (hard limits):**

Larger fonts mean fewer characters per line. Enforce these limits to prevent crowding:

| Parameter | Limit |
|-----------|-------|
| Lines per body text block | **≤ 3 lines** |
| \`<p>\` tags per text element | **≤ 4** |
| Chinese chars per body line | **≤ 16 chars** (at 48px in ${singleBlockWidth}px-wide block) |
| Latin chars per body line | **≤ 22 chars** |
| Bullet points per slide total | **≤ 5 items** |
| Main title length | **≤ 12 Chinese chars / ≤ 16 Latin chars** |

> If content exceeds these limits, **cut content** — do not shrink font size to fit more text.

---

### Portrait Page Archetypes — CHOOSE ONE AND FOLLOW IT STRICTLY

Every portrait slide must match one of these archetypes. Do NOT invent free-form layouts.
Pick the archetype that best fits the scene's educational goal, then follow its exact structure.

**A1 — Cover / Lead-in (封面/导学页)**
*Use for: scene openings, topic introductions, chapter starters*
- Title bar: top=50, height=148, width=${canvasWidth}, LEFT-aligned 64-72px, on a filled colored ShapeElement (behind the text)
- Hook / intro text: top=230, height≈110, width=${singleBlockWidth}, left=60, 44-48px, left-aligned
- Main visual image: top=370, width≈${Math.round(singleBlockWidth * 0.9)}, centered, image serves as visual anchor
- Bottom callout card (optional): top≈${canvasHeight - 220}, height=150, full-width accent card, 40-44px

**A2 — Concept / Definition (概念/定义页)**
*Use for: introducing a new term, explaining a core idea*
- Title bar: top=50, height=128, full-width, 64-72px, LEFT-aligned, on colored ShapeElement
- CORE DEFINITION CARD (dominant element): top=210, height≈${Math.round(canvasHeight * 0.24)}, width=${singleBlockWidth}, left=60, colored bg (#e8f4fd or similar), 48-52px BOLD
- Key point cards: 2-3 stacked below, each full-width, height≈${Math.round(canvasHeight * 0.14)}, 44-48px, with subtle border or bg
- Image: omit UNLESS it directly illustrates the concept — card-based layout is preferred over forced images

**A3 — Comparison (对比页)**
*Use for: two options, before/after, pros/cons, two approaches*
- Title bar: top=50, height=128, full-width, 64-72px, LEFT-aligned, colored bg
- Item A card: top=210, height≈${Math.round(canvasHeight * 0.26)}, full-width, bg #dbeafe, bold label + content (48-52px)
- Separator: height=44, centered "VS" label or divider line, between the two cards
- Item B card: directly below separator, same height as A, full-width, bg #dcfce7, bold label + content
- CRITICAL: NEVER place A and B side-by-side in portrait — always stack A above B vertically

**A4 — Steps / Process (步骤/流程页)**
*Use for: sequential instructions, how-to procedures, numbered steps*
- Title bar: top=50, height=128, full-width, 64-72px, LEFT-aligned, colored bg
- Step cards stacked vertically; each step: numbered badge shape (left=60, 64px number) + card body (48-52px title + 1-line detail 44px)
- Downward LineElement (width=3, solid, arrow at end) between each pair of step cards
- MAX 3 steps per page — if outline has more, cover 3 here and note "continued" at bottom

**A5 — Tip / Callout (提示/要点页)**
*Use for: warnings, critical reminders, key notes, important callouts*
- Title bar: top=50, height=128, full-width, 64-72px, LEFT-aligned
- ACCENT BOX (dominant): top=210, height≈${Math.round(canvasHeight * 0.2)}, full-width, strong accent color (#fff3cd/#f8d7da/#dbeafe), 48-52px BOLD
- Supporting detail cards: 2-3 stacked below, each full-width, height≈${Math.round(canvasHeight * 0.13)}, 44-48px
- Image: optional, only if directly relevant to the tip content

**A6 — Summary / Wrap-up (总结页)**
*Use for: scene conclusions, review slides, key takeaway summaries*
- Title bar: top=50, height=128, full-width, 64-72px, LEFT-aligned
- MAIN CONCLUSION CARD (dominant): top=210, height≈${Math.round(canvasHeight * 0.22)}, full-width, prominent bg (#f0fdf4 or similar), 48-52px BOLD
- Takeaway points: 2-3 stacked below, full-width, 44-48px, LEFT-aligned list items
- NO decorative images — keep this page clean and information-focused

---

### Portrait Visual Hierarchy — Mandatory Design Principles

**ANTI-PATTERN — Never use the "Centered Stack" pattern:**
This is the #1 failure mode for portrait slides — it looks like a PPT transplanted to mobile:
- All text elements centered with text-align:center
- No colored backgrounds or card framing
- Title, subtitle, body, and footnote all have the same visual weight
- Text blocks floating in white space with no structural framing

**REQUIRED — Use these design principles to create real visual hierarchy:**

1. **Title bar = visual anchor (required for ALL archetypes)**
   - Place a ShapeElement (fill with a strong color: #1e40af, #065f46, #7c3aed, #b45309, etc.) as the title background
   - Shape: left=0, top=50, width=${canvasWidth}, height=140-160px
   - Title text sits on top: left=60, same top as shape, LEFT-ALIGNED, white or high-contrast color, 64-72px
   - This creates an immediate, unambiguous visual entry point at the top of every slide

2. **One dominant content element per page**
   - Every slide must have exactly ONE element with the highest visual weight (the "hero" card)
   - Hero card characteristics: full-width, colored background, 48-56px text, placed at top of content zone (~top=210)
   - All other elements below are secondary: lighter colors, slightly smaller font (44-48px)

3. **Left-align body content (not centered)**
   - Body text default: text-align: left (NOT center)
   - Center ONLY: single number/icon badges, very short captions (≤5 chars)
   - Left-aligned content creates natural reading rhythm down the page

4. **Structural framing with shapes**
   - Use ShapeElement with fill colors to create card containers
   - Cards give content areas clear visual boundaries
   - A page with 3 colored cards stacked vertically is far better than 3 bare text blocks

---

### Portrait Media Strategy — Image Usage Rules

Use images only when they serve a clear structural role. Do NOT use images as decoration.

| Structural role | Appropriate page type | Recommended width |
|-----------------|----------------------|-------------------|
| Main visual anchor | Cover/Lead-in (A1) — image IS the main visual | ~${Math.round(singleBlockWidth * 0.9)}px, centered |
| Step illustration | Process (A4) — placed BELOW the relevant step card | ~${Math.round(singleBlockWidth * 0.72)}px |
| Concept diagram | Definition (A2) ONLY if image clarifies better than words | ~${Math.round(singleBlockWidth * 0.8)}px |

**Skip the image entirely when:**
- No image is assigned to this scene, or assigned image is not relevant
- Page archetype is Comparison (A3) or Summary (A6) — card-only layout is cleaner
- Adding the image would reduce the text/card area and make content feel crowded
- The image is decorative, loosely related, or just filling empty space

**Image sizing rules:**
- Landscape images (aspect ratio > 1.5): max width ${Math.round(singleBlockWidth * 0.85)}px; height = width ÷ aspect_ratio
- Square or portrait images (ratio ≤ 1.0): width ${Math.round(singleBlockWidth * 0.5)}–${Math.round(singleBlockWidth * 0.65)}px

**No image available?** Build a card-based layout — it looks more professional than a forced irrelevant image.`;
  } else {
    const singleBlockWidth = canvasWidth - 120;
    const contentBottom = Math.round(canvasHeight * 0.85);
    return `### Landscape Canvas Rules (canvas_width ${canvasWidth} > canvas_height ${canvasHeight})

This is a **LANDSCAPE** canvas. Standard horizontal layout applies.

- Two-column or three-column side-by-side card layouts are appropriate when content warrants it.
- Standard structure: title at top, content body below — keep content within top 85% of canvas height (y ≤ ${contentBottom}px).
- Full-width elements: up to ${singleBlockWidth}px wide (left=60).
- Avoid large empty regions in the lower 20% of the canvas.`;
  }
}

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

    // Step 7: 处理背景
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

/**
 * Generate slide content
 */
async function generateSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  viewport?: { viewportPreset?: ViewportPreset; viewportSize?: number; viewportRatio?: number },
): Promise<GeneratedSlideContent | null> {
  const lang = outline.language || 'zh-CN';

  // Build assigned images description for the prompt
  let assignedImagesText = '无可用图片，禁止插入任何 image 元素';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (assignedImages && assignedImages.length > 0) {
    if (visionEnabled && imageMapping) {
      // Vision mode: split into vision images and text-only
      const withSrc = assignedImages.filter((img) => imageMapping[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = assignedImages.filter((img) => !imageMapping[img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img, lang));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img, lang),
      );
      assignedImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: imageMapping[img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      assignedImagesText = assignedImages
        .map((img) => formatImageDescription(img, lang))
        .join('\n');
    }
  }

  // Add generated media placeholders info (images + videos)
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) {
    const genImgDescs = outline.mediaGenerations
      .filter((mg) => mg.type === 'image')
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');
    const genVidDescs = outline.mediaGenerations
      .filter((mg) => mg.type === 'video')
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');

    const mediaParts: string[] = [];
    if (genImgDescs) {
      mediaParts.push(`AI-Generated Images (use these IDs as image element src):\n${genImgDescs}`);
    }
    if (genVidDescs) {
      mediaParts.push(`AI-Generated Videos (use these IDs as video element src):\n${genVidDescs}`);
    }

    if (mediaParts.length > 0) {
      const mediaText = mediaParts.join('\n\n');
      if (assignedImagesText.includes('禁止插入') || assignedImagesText.includes('No images')) {
        assignedImagesText = mediaText;
      } else {
        assignedImagesText += `\n\n${mediaText}`;
      }
    }
  }

  // Canvas dimensions (matching viewportSize and viewportRatio)
  const viewportPreset = viewport?.viewportPreset || DEFAULT_VIEWPORT_PRESET;
  const canvasWidth = viewport?.viewportSize || DEFAULT_VIEWPORT_SIZE;
  const canvasHeight =
    viewport?.viewportRatio !== undefined
      ? canvasWidth * viewport.viewportRatio
      : getViewportHeight(canvasWidth, viewportPreset);

  // Orientation-aware design rules
  const isPortrait = canvasHeight > canvasWidth;
  const canvasOrientation = isPortrait ? 'portrait' : 'landscape';
  const orientationDesignRules = buildSlideOrientationRules(canvasWidth, canvasHeight, isPortrait);

  // ── Phase 7: Portrait template engine path ───────────────────────────────
  // 新路径：manifest → 模板引擎，AI 不自由排版坐标。横版不走此路径。
  // 必须在旧路径 aiCall 之前执行，避免 portrait 成功时浪费一次 AI 调用。
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

  const teacherContext = formatTeacherPersonaForPrompt(agents);

  const prompts = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    elements: '（根据要点自动生成）',
    assignedImages: assignedImagesText,
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    canvas_orientation: canvasOrientation,
    orientation_design_rules: orientationDesignRules,
    teacherContext,
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating slide content for: ${outline.title}`);
  if (assignedImages && assignedImages.length > 0) {
    log.debug(`Assigned images: ${assignedImages.map((img) => img.id).join(', ')}`);
  }
  if (visionImages && visionImages.length > 0) {
    log.debug(`Vision images: ${visionImages.map((img) => img.id).join(', ')}`);
  }

  const response = await aiCall(prompts.system, prompts.user, visionImages);
  const generatedData = parseJsonResponse<GeneratedSlideData>(response);

  if (!generatedData || !generatedData.elements || !Array.isArray(generatedData.elements)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedData.elements.length} elements for: ${outline.title}`);

  // ── Portrait layout quality check + auto-repair ──────────────────────────
  // 仅对竖版画布触发，横版不进入此链路
  if (isPortrait) {
    const rawEls = generatedData.elements as Record<string, unknown>[];
    const initialLint = lintPortraitLayout(rawEls, canvasWidth, canvasHeight);
    if (!initialLint.pass) {
      log.info(
        `Portrait lint failed for "${outline.title}" — violations: ` +
          initialLint.violations.map((v) => v.rule).join(', '),
      );
      try {
        const repairResult = await repairPortraitLayout(rawEls, canvasWidth, canvasHeight, aiCall);
        log.info(
          `Portrait repair done: ${repairResult.repairAttempts} attempt(s), finalPass=${repairResult.finalPass}`,
        );
        generatedData.elements = repairResult.elements as typeof generatedData.elements;
      } catch (repairErr) {
        log.warn(`Portrait repair threw unexpectedly, using original content:`, repairErr);
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Debug: Log image elements before resolution
  const imageElements = generatedData.elements.filter((el) => el.type === 'image');
  if (imageElements.length > 0) {
    log.debug(
      `Image elements before resolution:`,
      imageElements.map((el) => ({
        type: el.type,
        src:
          (el as Record<string, unknown>).src &&
          String((el as Record<string, unknown>).src).substring(0, 50),
      })),
    );
    log.debug(`imageMapping keys:`, imageMapping ? Object.keys(imageMapping).length : '0 keys');
  }

  // Fix elements with missing required fields + aspect ratio correction (while src is still img_id)
  const fixedElements = fixElementDefaults(generatedData.elements, assignedImages);
  log.debug(`After element fixing: ${fixedElements.length} elements`);

  // Process LaTeX elements: render latex string → HTML via KaTeX
  const latexProcessedElements = processLatexElements(fixedElements);
  log.debug(`After LaTeX processing: ${latexProcessedElements.length} elements`);

  // Resolve image_id references to actual URLs
  const resolvedElements = resolveImageIds(
    latexProcessedElements,
    imageMapping,
    generatedMediaMapping,
  );
  log.debug(`After image resolution: ${resolvedElements.length} elements`);

  // Process elements, assign unique IDs
  const processedElements: PPTElement[] = resolvedElements.map((el) => ({
    ...el,
    id: `${el.type}_${nanoid(8)}`,
    rotate: 0,
  })) as PPTElement[];

  // Process background
  let background: SlideBackground | undefined;
  if (generatedData.background) {
    if (generatedData.background.type === 'solid' && generatedData.background.color) {
      background = { type: 'solid', color: generatedData.background.color };
    } else if (generatedData.background.type === 'gradient' && generatedData.background.gradient) {
      background = {
        type: 'gradient',
        gradient: generatedData.background.gradient,
      };
    }
  }

  return {
    elements: processedElements,
    background,
    remark: generatedData.remark || outline.description,
  };
}

/**
 * Generate quiz content
 */
async function generateQuizContent(
  outline: SceneOutline,
  aiCall: AICallFn,
): Promise<GeneratedQuizContent | null> {
  const quizConfig = outline.quizConfig || {
    questionCount: 3,
    difficulty: 'medium',
    questionTypes: ['single'],
  };

  const prompts = buildPrompt(PROMPT_IDS.QUIZ_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    questionCount: quizConfig.questionCount,
    difficulty: quizConfig.difficulty,
    questionTypes: quizConfig.questionTypes.join(', '),
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating quiz content for: ${outline.title}`);
  const response = await aiCall(prompts.system, prompts.user);
  const generatedQuestions = parseJsonResponse<QuizQuestion[]>(response);

  if (!generatedQuestions || !Array.isArray(generatedQuestions)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedQuestions.length} questions for: ${outline.title}`);

  // Ensure each question has an ID and normalize options format
  const questions: QuizQuestion[] = generatedQuestions.map((q) => {
    const isText = q.type === 'short_answer';
    return {
      ...q,
      id: q.id || `q_${nanoid(8)}`,
      options: isText ? undefined : normalizeQuizOptions(q.options),
      answer: isText ? undefined : normalizeQuizAnswer(q as unknown as Record<string, unknown>),
      hasAnswer: isText ? false : true,
    };
  });

  return { questions };
}

/**
 * Normalize quiz options from AI response.
 * AI may generate plain strings ["OptionA", "OptionB"] or QuizOption objects.
 * This normalizes to QuizOption[] format: { value: "A", label: "OptionA" }
 */
function normalizeQuizOptions(
  options: unknown[] | undefined,
): { value: string; label: string }[] | undefined {
  if (!options || !Array.isArray(options)) return undefined;

  return options.map((opt, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C, D...

    if (typeof opt === 'string') {
      return { value: letter, label: opt };
    }

    if (typeof opt === 'object' && opt !== null) {
      const obj = opt as Record<string, unknown>;
      return {
        value: typeof obj.value === 'string' ? obj.value : letter,
        label: typeof obj.label === 'string' ? obj.label : String(obj.value || obj.text || letter),
      };
    }

    return { value: letter, label: String(opt) };
  });
}

/**
 * Normalize quiz answer from AI response.
 * AI may generate correctAnswer as string or string[], under various field names.
 * This normalizes to string[] format matching option values.
 */
function normalizeQuizAnswer(question: Record<string, unknown>): string[] | undefined {
  // AI might use "correctAnswer", "answer", or "correct_answer"
  const raw =
    question.answer ??
    question.correctAnswer ??
    (question as Record<string, unknown>).correct_answer;
  if (!raw) return undefined;

  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  return [String(raw)];
}

/**
 * Generate interactive page content
 * Two AI calls + post-processing:
 * 1. Scientific modeling -> ScientificModel (with fallback)
 * 2. HTML generation with constraints -> post-processed HTML
 */
async function generateInteractiveContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): Promise<GeneratedInteractiveContent | null> {
  const config = outline.interactiveConfig!;

  // Step 1: Scientific modeling (with fallback on failure)
  let scientificModel: ScientificModel | undefined;
  try {
    const modelPrompts = buildPrompt(PROMPT_IDS.INTERACTIVE_SCIENTIFIC_MODEL, {
      subject: config.subject || '',
      conceptName: config.conceptName,
      conceptOverview: config.conceptOverview,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      designIdea: config.designIdea,
    });

    if (modelPrompts) {
      log.info(`Step 1: Scientific modeling for: ${outline.title}`);
      const modelResponse = await aiCall(modelPrompts.system, modelPrompts.user);
      const parsed = parseJsonResponse<ScientificModel>(modelResponse);
      if (parsed && parsed.core_formulas) {
        scientificModel = parsed;
        log.info(
          `Scientific model: ${parsed.core_formulas.length} formulas, ${parsed.constraints?.length || 0} constraints`,
        );
      }
    }
  } catch (error) {
    log.warn(`Scientific modeling failed, continuing without: ${error}`);
  }

  // Format scientific constraints for HTML generation prompt
  let scientificConstraints = 'No specific scientific constraints available.';
  if (scientificModel) {
    const lines: string[] = [];
    if (scientificModel.core_formulas?.length) {
      lines.push(`Core Formulas: ${scientificModel.core_formulas.join('; ')}`);
    }
    if (scientificModel.mechanism?.length) {
      lines.push(`Mechanisms: ${scientificModel.mechanism.join('; ')}`);
    }
    if (scientificModel.constraints?.length) {
      lines.push(`Must Obey: ${scientificModel.constraints.join('; ')}`);
    }
    if (scientificModel.forbidden_errors?.length) {
      lines.push(`Forbidden Errors: ${scientificModel.forbidden_errors.join('; ')}`);
    }
    scientificConstraints = lines.join('\n');
  }

  // Step 2: HTML generation
  const htmlPrompts = buildPrompt(PROMPT_IDS.INTERACTIVE_HTML, {
    conceptName: config.conceptName,
    subject: config.subject || '',
    conceptOverview: config.conceptOverview,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    scientificConstraints,
    designIdea: config.designIdea,
    language,
  });

  if (!htmlPrompts) {
    log.error(`Failed to build HTML prompt for: ${outline.title}`);
    return null;
  }

  log.info(`Step 2: Generating HTML for: ${outline.title}`);
  const htmlResponse = await aiCall(htmlPrompts.system, htmlPrompts.user);
  // Extract HTML from response
  const rawHtml = extractHtml(htmlResponse);
  if (!rawHtml) {
    log.error(`Failed to extract HTML from response for: ${outline.title}`);
    return null;
  }

  // Step 3: Post-process HTML (LaTeX delimiter conversion + KaTeX injection)
  const processedHtml = postProcessInteractiveHtml(rawHtml);
  log.info(`Post-processed HTML (${processedHtml.length} chars) for: ${outline.title}`);

  return {
    html: processedHtml,
    scientificModel,
  };
}

/**
 * Generate PBL project content
 * Uses the agentic loop from lib/pbl/generate-pbl.ts
 */
async function generatePBLSceneContent(
  outline: SceneOutline,
  languageModel?: LanguageModel,
): Promise<GeneratedPBLContent | null> {
  if (!languageModel) {
    log.error('LanguageModel required for PBL generation');
    return null;
  }

  const pblConfig = outline.pblConfig;
  if (!pblConfig) {
    log.error(`PBL outline "${outline.title}" missing pblConfig`);
    return null;
  }

  log.info(`Generating PBL content for: ${outline.title}`);

  try {
    const projectConfig = await generatePBLContent(
      {
        projectTopic: pblConfig.projectTopic,
        projectDescription: pblConfig.projectDescription,
        targetSkills: pblConfig.targetSkills,
        issueCount: pblConfig.issueCount,
        language: pblConfig.language,
      },
      languageModel,
      {
        onProgress: (msg) => log.info(`${msg}`),
      },
    );
    log.info(
      `PBL generated: ${projectConfig.agents.length} agents, ${projectConfig.issueboard.issues.length} issues`,
    );

    return { projectConfig };
  } catch (error) {
    log.error(`Failed:`, error);
    return null;
  }
}

/**
 * Extract HTML document from AI response.
 * Tries to find <!DOCTYPE html>...</html> first, then falls back to code block extraction.
 */
function extractHtml(response: string): string | null {
  // Strategy 1: Find complete HTML document
  const doctypeStart = response.indexOf('<!DOCTYPE html>');
  const htmlTagStart = response.indexOf('<html');
  const start = doctypeStart !== -1 ? doctypeStart : htmlTagStart;

  if (start !== -1) {
    const htmlEnd = response.lastIndexOf('</html>');
    if (htmlEnd !== -1) {
      return response.substring(start, htmlEnd + 7);
    }
  }

  // Strategy 2: Extract from code block
  const codeBlockMatch = response.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return content;
    }
  }

  // Strategy 3: If response itself looks like HTML
  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return trimmed;
  }

  log.error('Could not extract HTML from response');
  log.error('Response preview:', response.substring(0, 200));
  return null;
}

/**
 * Step 3.2: Generate Actions based on content and script
 */
export async function generateSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  aiCall: AICallFn,
  ctx?: SceneGenerationContext,
  agents?: AgentInfo[],
  userProfile?: string,
): Promise<Action[]> {
  const agentsText = formatAgentsForPrompt(agents);

  if (outline.type === 'slide' && 'elements' in content) {
    // Format element list for AI to select from
    const elementsText = formatElementsForPrompt(content.elements);

    const prompts = buildPrompt(PROMPT_IDS.SLIDE_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      elements: elementsText,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      userProfile: userProfile || '',
    });

    if (!prompts) {
      return generateDefaultSlideActions(outline, content.elements);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      // Validate and fill in Action IDs
      return processActions(actions, content.elements, agents);
    }

    return generateDefaultSlideActions(outline, content.elements);
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    // Format question list for AI reference
    const questionsText = formatQuestionsForPrompt(content.questions);

    const prompts = buildPrompt(PROMPT_IDS.QUIZ_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      questions: questionsText,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
    });

    if (!prompts) {
      return generateDefaultQuizActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultQuizActions(outline);
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const config = outline.interactiveConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.INTERACTIVE_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      conceptName: config?.conceptName || outline.title,
      designIdea: config?.designIdea || '',
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
    });

    if (!prompts) {
      return generateDefaultInteractiveActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultInteractiveActions(outline);
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const pblConfig = outline.pblConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.PBL_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      projectTopic: pblConfig?.projectTopic || outline.title,
      projectDescription: pblConfig?.projectDescription || outline.description,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
    });

    if (!prompts) {
      return generateDefaultPBLActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultPBLActions(outline);
  }

  return [];
}

/**
 * Generate default PBL Actions (fallback)
 */
function generateDefaultPBLActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: 'PBL 项目介绍',
      text: '现在让我们开始一个项目式学习活动。请选择你的角色，查看任务看板，开始协作完成项目。',
    },
  ];
}

/**
 * Format element list for AI to select elementId
 */
function formatElementsForPrompt(elements: PPTElement[]): string {
  return elements
    .map((el) => {
      let summary = '';
      if (el.type === 'text' && 'content' in el) {
        // Extract text content summary (strip HTML tags)
        const textContent = ((el.content as string) || '').replace(/<[^>]*>/g, '').substring(0, 50);
        summary = `Content summary: "${textContent}${textContent.length >= 50 ? '...' : ''}"`;
      } else if (el.type === 'chart' && 'chartType' in el) {
        summary = `Chart type: ${el.chartType}`;
      } else if (el.type === 'image') {
        summary = 'Image element';
      } else if (el.type === 'shape' && 'shapeName' in el) {
        summary = `Shape: ${el.shapeName || 'unknown'}`;
      } else if (el.type === 'latex' && 'latex' in el) {
        summary = `Formula: ${((el.latex as string) || '').substring(0, 30)}`;
      } else {
        summary = `${el.type} element`;
      }
      return `- id: "${el.id}", type: "${el.type}", ${summary}`;
    })
    .join('\n');
}

/**
 * Format question list for AI reference
 */
function formatQuestionsForPrompt(questions: QuizQuestion[]): string {
  return questions
    .map((q, i) => {
      const optionsText = q.options ? `Options: ${q.options.join(', ')}` : '';
      return `Q${i + 1} (${q.type}): ${q.question}\n${optionsText}`;
    })
    .join('\n\n');
}

/**
 * Process and validate Actions
 */
function processActions(actions: Action[], elements: PPTElement[], agents?: AgentInfo[]): Action[] {
  const elementIds = new Set(elements.map((el) => el.id));
  const agentIds = new Set(agents?.map((a) => a.id) || []);
  const studentAgents = agents?.filter((a) => a.role === 'student') || [];
  const nonTeacherAgents = agents?.filter((a) => a.role !== 'teacher') || [];

  return actions.map((action) => {
    // Ensure each action has an ID
    const processedAction: Action = {
      ...action,
      id: action.id || `action_${nanoid(8)}`,
    };

    // Validate spotlight elementId
    if (processedAction.type === 'spotlight') {
      const spotlightAction = processedAction;
      if (!spotlightAction.elementId || !elementIds.has(spotlightAction.elementId)) {
        // If elementId is invalid, try selecting the first element
        if (elements.length > 0) {
          spotlightAction.elementId = elements[0].id;
          log.warn(
            `Invalid elementId, falling back to first element: ${spotlightAction.elementId}`,
          );
        }
      }
    }

    // Validate/fill discussion agentId
    if (processedAction.type === 'discussion' && agents && agents.length > 0) {
      if (processedAction.agentId && agentIds.has(processedAction.agentId)) {
        // agentId valid — keep it
      } else {
        // agentId missing or invalid — pick a random student, or non-teacher, or skip
        const pool = studentAgents.length > 0 ? studentAgents : nonTeacherAgents;
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          log.warn(
            `Discussion agentId "${processedAction.agentId || '(none)'}" invalid, assigned: ${picked.id} (${picked.name})`,
          );
          processedAction.agentId = picked.id;
        }
      }
    }

    return processedAction;
  });
}

/**
 * Generate default slide Actions (fallback)
 */
function generateDefaultSlideActions(outline: SceneOutline, elements: PPTElement[]): Action[] {
  const actions: Action[] = [];

  // Add spotlight for text elements
  const textElements = elements.filter((el) => el.type === 'text');
  if (textElements.length > 0) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: '聚焦重点',
      elementId: textElements[0].id,
    });
  }

  // Add opening speech based on key points
  const speechText = outline.keyPoints?.length
    ? outline.keyPoints.join('。') + '。'
    : outline.description || outline.title;
  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: '场景讲解',
    text: speechText,
  });

  return actions;
}

/**
 * Generate default quiz Actions (fallback)
 */
function generateDefaultQuizActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: '测验引导',
      text: '现在让我们来做一个小测验，检验一下学习成果。',
    },
  ];
}

/**
 * Generate default interactive Actions (fallback)
 */
function generateDefaultInteractiveActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: '交互引导',
      text: '现在让我们通过交互式可视化来探索这个概念。请尝试操作页面中的元素，观察变化。',
    },
  ];
}

/**
 * Create a complete scene with Actions
 */
export function createSceneWithActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  actions: Action[],
  api: ReturnType<typeof createStageAPI>,
  viewport?: { viewportPreset?: ViewportPreset; viewportSize?: number; viewportRatio?: number },
): string | null {
  const viewportPreset = viewport?.viewportPreset || DEFAULT_VIEWPORT_PRESET;
  const viewportSize = viewport?.viewportSize || DEFAULT_VIEWPORT_SIZE;
  const viewportRatio = viewport?.viewportRatio || getViewportRatio(viewportPreset);
  if (outline.type === 'slide' && 'elements' in content) {
    // Build complete Slide object
    const defaultTheme: SlideTheme = {
      backgroundColor: '#ffffff',
      themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
      fontColor: '#333333',
      fontName: 'Microsoft YaHei',
      outline: { color: '#d14424', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    };

    const slide: Slide = {
      id: nanoid(),
      viewportSize,
      viewportRatio,
      theme: defaultTheme,
      elements: content.elements,
      background: content.background,
    };

    const sceneResult = api.scene.create({
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'slide',
        canvas: slide,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const sceneResult = api.scene.create({
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const sceneResult = api.scene.create({
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: content.html,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const sceneResult = api.scene.create({
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  return null;
}
