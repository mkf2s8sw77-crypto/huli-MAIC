/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import {
  DEFAULT_VIEWPORT_SIZE,
  getViewportRatio,
  type ViewportPreset,
} from '@/lib/config/viewport';
import type { GeneratedSlideContent } from '@/lib/types/generation';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLocalFallbackSlideContent(
  outline: SceneOutline,
  stageInfo?: {
    viewportPreset?: ViewportPreset;
    viewportSize?: number;
    viewportRatio?: number;
  },
): GeneratedSlideContent {
  const viewportPreset = stageInfo?.viewportPreset || '16:9';
  const viewportSize = stageInfo?.viewportSize || DEFAULT_VIEWPORT_SIZE;
  const viewportRatio =
    stageInfo?.viewportRatio !== undefined
      ? stageInfo.viewportRatio
      : getViewportRatio(viewportPreset);
  const canvasWidth = viewportSize;
  const isPortrait = viewportRatio > 1;
  const titleBarHeight = isPortrait ? 128 : 96;
  const bodyTop = titleBarHeight + 54;
  const bodyWidth = canvasWidth - 120;
  const description = outline.description?.trim();
  const points = (outline.keyPoints || []).slice(0, isPortrait ? 4 : 5);
  const bulletText = points.map((point) => `• ${point}`).join('</p><p style="font-size: 26px;">');

  return {
    background: { type: 'solid', color: '#ffffff' },
    remark: `${outline.description || ''}${outline.description ? ' ' : ''}[fallback-local-slide]`,
    elements: [
      {
        id: 'shape_title',
        type: 'shape',
        left: 40,
        top: 40,
        width: canvasWidth - 80,
        height: titleBarHeight,
        path: 'M 12 0 H 88 Q 100 0 100 12 V 88 Q 100 100 88 100 H 12 Q 0 100 0 88 V 12 Q 0 0 12 0 Z',
        viewBox: [100, 100],
        fill: '#1E3A8A',
        fixedRatio: false,
      },
      {
        id: 'text_title',
        type: 'text',
        left: 76,
        top: 58,
        width: canvasWidth - 152,
        height: titleBarHeight - 28,
        content: `<p style="font-size: ${isPortrait ? 42 : 34}px; color: #ffffff; font-weight: 700; line-height: 1.2;">${escapeHtml(outline.title)}</p>`,
        defaultFontName: '',
        defaultColor: '#ffffff',
      },
      ...(description
        ? [
            {
              id: 'text_desc',
              type: 'text' as const,
              left: 60,
              top: bodyTop,
              width: bodyWidth,
              height: isPortrait ? 92 : 72,
              content: `<p style="font-size: ${isPortrait ? 28 : 24}px; color: #334155; line-height: 1.35;">${escapeHtml(description)}</p>`,
              defaultFontName: '',
              defaultColor: '#334155',
            },
          ]
        : []),
      {
        id: 'shape_points',
        type: 'shape',
        left: 60,
        top: description ? bodyTop + (isPortrait ? 116 : 86) : bodyTop,
        width: bodyWidth,
        height: isPortrait ? 320 : 220,
        path: 'M 10 0 H 90 Q 100 0 100 10 V 90 Q 100 100 90 100 H 10 Q 0 100 0 90 V 10 Q 0 0 10 0 Z',
        viewBox: [100, 100],
        fill: '#F5F9FF',
        fixedRatio: false,
      },
      {
        id: 'text_points',
        type: 'text',
        left: 84,
        top: description ? bodyTop + (isPortrait ? 136 : 106) : bodyTop + 20,
        width: bodyWidth - 48,
        height: isPortrait ? 280 : 180,
        content: `<p style="font-size: ${isPortrait ? 28 : 26}px; color: #1E3A8A; font-weight: 700;">关键要点</p><p style="font-size: ${isPortrait ? 26 : 24}px; color: #475569; line-height: 1.35; margin-top: 10px;">${bulletText || '• 本页内容由本地兜底生成，请稍后重试以获取完整排版结果'}</p>`,
        defaultFontName: '',
        defaultColor: '#475569',
      },
    ],
  };
}

export async function POST(req: NextRequest) {
  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  try {
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo,
      stageId,
      agents,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        language?: string;
        style?: string;
        viewportPreset?: ViewportPreset;
        viewportSize?: number;
        viewportRatio?: number;
      };
      stageId: string;
      agents?: AgentInfo[];
    };

    // Validate required fields
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    // Ensure outline has language from stageInfo (fallback for older outlines)
    const outline: SceneOutline = {
      ...rawOutline,
      language: rawOutline.language || (stageInfo?.language as 'zh-CN' | 'en-US') || 'zh-CN',
    };

    // ── Model resolution from request headers ──
    const { model: languageModel, modelInfo, modelString } = resolveModelFromHeaders(req);
    outlineTitle = rawOutline?.title;
    resolvedModelString = modelString;

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
          },
          'scene-content',
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'scene-content',
      );
      return result.text;
    };

    // ── Apply fallbacks ──
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    const generatedMediaMapping: ImageMapping = {};

    // ── Generate content ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
    );

    let content: ReturnType<typeof buildLocalFallbackSlideContent> | Awaited<ReturnType<typeof generateSceneContent>> | null = null;
    try {
      content = await generateSceneContent(
        effectiveOutline,
        aiCall,
        assignedImages,
        imageMapping,
        effectiveOutline.type === 'pbl' ? languageModel : undefined,
        hasVision,
        generatedMediaMapping,
        agents,
        {
          viewportPreset: stageInfo?.viewportPreset,
          viewportSize: stageInfo?.viewportSize,
          viewportRatio: stageInfo?.viewportRatio,
        },
      );
    } catch (error) {
      if (effectiveOutline.type === 'slide') {
        log.warn(
          `Scene content model call failed for "${effectiveOutline.title}", using local fallback slide:`,
          error,
        );
        content = buildLocalFallbackSlideContent(effectiveOutline, {
          viewportPreset: stageInfo?.viewportPreset,
          viewportSize: stageInfo?.viewportSize,
          viewportRatio: stageInfo?.viewportRatio,
        });
      } else {
        throw error;
      }
    }

    if (!content) {
      if (effectiveOutline.type === 'slide') {
        log.warn(`Using local fallback slide content for: "${effectiveOutline.title}"`);
        content = buildLocalFallbackSlideContent(effectiveOutline, {
          viewportPreset: stageInfo?.viewportPreset,
          viewportSize: stageInfo?.viewportSize,
          viewportRatio: stageInfo?.viewportRatio,
        });
      } else {
        log.error(`Failed to generate content for: "${effectiveOutline.title}"`);
        return apiError(
          'GENERATION_FAILED',
          500,
          `Failed to generate content: ${effectiveOutline.title}`,
        );
      }
    }

    log.info(`Content generated successfully: "${effectiveOutline.title}"`);

    return apiSuccess({ content, effectiveOutline });
  } catch (error) {
    log.error(
      `Scene content generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
