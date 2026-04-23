/**
 * Stage 1: Generate scene outlines from user requirements.
 * Also contains outline fallback logic.
 */

import { nanoid } from 'nanoid';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  UserRequirements,
  SceneOutline,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { formatImageDescription, formatImagePlaceholder } from './prompt-formatters';
import { parseJsonResponse } from './json-repair';
import { uniquifyMediaElementIds } from './scene-builder';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { createLogger } from '@/lib/logger';
import { buildLanguageGuardrail, resolveRequirementLanguage } from './language-policy';

const log = createLogger('Generation');

/**
 * Build orientation-aware outline design rules for the outline generation prompt.
 * Portrait (3:4 / 9:16) produces finer-grained, more numerous scenes.
 * Landscape (16:9 / 4:3) keeps the standard overview-friendly pacing.
 */
export function buildOutlineOrientationRules(viewportPreset?: string | null): string {
  const isPortrait = viewportPreset === '3:4' || viewportPreset === '9:16';

  if (isPortrait) {
    return `### Portrait Orientation Outline Design (${viewportPreset})

This course uses a **portrait canvas** (${viewportPreset}). Portrait content is consumed top-to-bottom like a feed or short-form video — apply every rule below WITHOUT EXCEPTION.

**Scene granularity: FINE — one concept per scene**
- If a topic has multiple sub-points, split them into separate scenes, not a single overview scene
- Limit to **1-2 keyPoints per scene** (absolute max: 3). Never put 4+ keyPoints in one scene
- Short, atomic scenes: estimatedDuration 60-90 seconds each (not 2-3 minutes)

**Scene type preferences for portrait**
- Prefer: single-concept explanation, step-by-step breakdown, focused example, one-point summary
- Avoid: overview pages listing 3+ parallel items — break them into individual focused scenes
- Comparison content (A vs B vs C): split into **sequential scenes** (one per item), never a single side-by-side scene

**Pacing: more scenes, less per scene**
- For a 15-minute course, target **20-28 scenes** (vs ~12-18 for landscape)
- At most one intro/overview scene at the start, one wrap-up at the end; avoid mid-course overview dumps
- Each scene covers exactly one teaching action: introduce ONE concept, explain it, give ONE example

**Mandatory splitting rules — apply mechanically**
- You would put 4 keyPoints in one scene → split into 2 scenes of 2 keyPoints each
- Scene title is "Overview of X, Y, Z" → create a brief intro scene + separate "X", "Y", "Z" scenes
- A scene compares 3+ items side-by-side → each item becomes its own dedicated scene
- A scene has "Step 1 / Step 2 / Step 3" → each step is a separate scene

**Portrait Image Policy — images are fully disabled**
- Portrait slides are **text/card-only compositions**. Do NOT plan any image usage.
- \`mediaGenerations\` quota for a portrait course: **0 total**
- Do NOT add \`suggestedImageIds\` to any portrait scene, even if PDF images are available
- Do NOT add \`mediaGenerations\` to any portrait scene, even for opening/cover pages
- If a visual aid seems useful, convert it into text cards or step cards instead of using an image`;
  }

  return `### Landscape Orientation Outline Design (${viewportPreset || '16:9'})

This course uses a **landscape canvas** (${viewportPreset || '16:9'}). Standard presentation pacing applies — do NOT fragment scenes unnecessarily.

- Scenes can contain **3-5 keyPoints each**
- Overview, comparison, and summary slides are appropriate and encouraged for landscape
- Target **1-2 scenes per minute** of course duration
- Side-by-side comparisons and three-column overviews are fine when content warrants them
- Do NOT split scenes just to increase count — concise, well-structured scenes are preferred`;
}

function stripPortraitMediaFromOutline(outline: SceneOutline): SceneOutline {
  return {
    ...outline,
    suggestedImageIds: undefined,
    mediaGenerations: undefined,
  };
}

export function enforcePortraitOutlineMediaPolicy(
  outlines: SceneOutline[],
  viewportPreset?: string | null,
): SceneOutline[] {
  const isPortrait = viewportPreset === '3:4' || viewportPreset === '9:16';
  if (!isPortrait) return outlines;
  return outlines.map(stripPortraitMediaFromOutline);
}

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  pdfText: string | undefined,
  pdfImages: PdfImage[] | undefined,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    visionEnabled?: boolean;
    imageMapping?: ImageMapping;
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    researchContext?: string;
    teacherContext?: string;
  },
): Promise<GenerationResult<{ languageDirective: string; outlines: SceneOutline[] }>> {
  const resolvedLanguage = resolveRequirementLanguage(
    requirements.requirement,
    requirements.language,
  ).language;

  let availableImagesText = resolvedLanguage === 'zh-CN' ? '无可用图片' : 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (pdfImages && pdfImages.length > 0) {
    if (options?.visionEnabled && options?.imageMapping) {
      const allWithSrc = pdfImages.filter((img) => options.imageMapping![img.id]);
      const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = pdfImages.filter((img) => !options.imageMapping![img.id]);

      const visionDescriptions = visionSlice.map((img) =>
        formatImagePlaceholder(img, resolvedLanguage),
      );
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img, resolvedLanguage),
      );
      availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: options.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      availableImagesText = pdfImages
        .map((img) => formatImageDescription(img, resolvedLanguage))
        .join('\n');
    }
  }

  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  const imageEnabled = options?.imageGenerationEnabled ?? false;
  const videoEnabled = options?.videoGenerationEnabled ?? false;
  let mediaGenerationPolicy = '';
  if (!imageEnabled && !videoEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any mediaGenerations in the outlines. Both image and video generation are disabled.**';
  } else if (!imageEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any image mediaGenerations (type: "image") in the outlines. Image generation is disabled. Video generation is allowed.**';
  } else if (!videoEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any video mediaGenerations (type: "video") in the outlines. Video generation is disabled. Image generation is allowed.**';
  }

  const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
    requirement: requirements.requirement,
    language: resolvedLanguage,
    languageGuardrail: buildLanguageGuardrail(resolvedLanguage),
    pdfContent: pdfText
      ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS)
      : resolvedLanguage === 'zh-CN'
        ? '无'
        : 'None',
    availableImages: availableImagesText,
    userProfile: userProfileText,
    mediaGenerationPolicy,
    researchContext:
      options?.researchContext || (resolvedLanguage === 'zh-CN' ? '无' : 'None'),
    teacherContext: options?.teacherContext || '',
    outlineOrientationRules: buildOutlineOrientationRules(requirements.viewportPreset),
  });

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: '正在分析需求，生成场景大纲...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const response = await aiCall(prompts.system, prompts.user, visionImages);
    const parsed = parseJsonResponse<
      { languageDirective: string; outlines: SceneOutline[] } | SceneOutline[]
    >(response);

    let languageDirective: string;
    let rawOutlines: SceneOutline[];

    if (Array.isArray(parsed)) {
      languageDirective =
        resolvedLanguage === 'zh-CN'
          ? '请使用与用户需求一致的语言授课。'
          : 'Teach in the language that matches the user requirement.';
      rawOutlines = parsed;
    } else if (parsed && Array.isArray(parsed.outlines)) {
      languageDirective =
        parsed.languageDirective ||
        (resolvedLanguage === 'zh-CN'
          ? '请使用与用户需求一致的语言授课。'
          : 'Teach in the language that matches the user requirement.');
      rawOutlines = parsed.outlines;
    } else {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    const enriched = rawOutlines.map((outline, index) => ({
      ...outline,
      id: outline.id || nanoid(),
      order: index + 1,
      language: resolvedLanguage,
    }));
    const sanitized = enforcePortraitOutlineMediaPolicy(enriched, requirements.viewportPreset);
    const result = uniquifyMediaElementIds(sanitized);

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return { success: true, data: { languageDirective, outlines: result } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply type fallbacks for outlines that can't be generated as their declared type.
 * - interactive without interactiveConfig OR widgetType+widgetOutline → slide
 * - pbl without pblConfig or languageModel → slide
 */
export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
): SceneOutline {
  // Ultra Mode: interactive scenes with widgetType + widgetOutline are valid
  const hasWidgetConfig = outline.widgetType && outline.widgetOutline;

  if (outline.type === 'interactive' && !outline.interactiveConfig && !hasWidgetConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig and widget config, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    log.warn(
      `PBL outline "${outline.title}" missing pblConfig or languageModel, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  return outline;
}
