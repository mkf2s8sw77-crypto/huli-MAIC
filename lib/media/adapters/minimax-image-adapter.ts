/**
 * MiniMax Image Generation Adapter
 *
 * Uses MiniMax synchronous image generation API.
 * Endpoint: https://api.minimaxi.com/v1/image_generation
 *
 * Docs:
 * - https://platform.minimaxi.com/docs/guides/image-generation.md
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'image-01';
const DEFAULT_BASE_URL = 'https://api.minimaxi.com';

async function parseError(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => fallback);
  try {
    const data = JSON.parse(text);
    return data?.base_resp?.status_msg || data?.message || text || fallback;
  } catch {
    return text || fallback;
  }
}

export async function testMiniMaxImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  try {
    const response = await fetch(`${baseUrl}/v1/image_generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        prompt: '',
        aspect_ratio: '1:1',
        response_format: 'base64',
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        message: `MiniMax image auth failed (${response.status}): ${await parseError(
          response,
          'Unauthorized',
        )}`,
      };
    }

    return { success: true, message: 'Connected to MiniMax image generation' };
  } catch (err) {
    return { success: false, message: `MiniMax image connectivity error: ${err}` };
  }
}

export async function generateWithMiniMaxImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  const response = await fetch(`${baseUrl}/v1/image_generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      prompt: options.prompt,
      aspect_ratio: options.aspectRatio || '1:1',
      response_format: 'base64',
      ...(options.negativePrompt ? { negative_prompt: options.negativePrompt } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `MiniMax image generation failed (${response.status}): ${await parseError(
        response,
        response.statusText,
      )}`,
    );
  }

  const data = await response.json();
  const base64 = data?.data?.image_base64?.[0];
  if (!base64) {
    throw new Error('MiniMax image response missing image_base64');
  }

  const width =
    options.width ||
    (options.aspectRatio === '16:9'
      ? 1280
      : options.aspectRatio === '9:16'
        ? 720
        : options.aspectRatio === '4:3'
          ? 1024
          : 1024);
  const height =
    options.height ||
    (options.aspectRatio === '16:9'
      ? 720
      : options.aspectRatio === '9:16'
        ? 1280
        : options.aspectRatio === '4:3'
          ? 768
          : 1024);

  return {
    base64,
    width,
    height,
  };
}
