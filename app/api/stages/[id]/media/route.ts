/**
 * GET  /api/stages/:id/media — 获取课程所有媒体元数据
 * POST /api/stages/:id/media — 上传媒体文件（multipart/form-data）或保存元数据
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getAuthUserId } from '@/lib/server/api-auth';
import {
  getMediaFilesByStage,
  upsertMediaFile,
} from '@/lib/server/db/media-repository';
import { isStageOwner } from '@/lib/server/db/stage-repository';
import { deleteMediaFile, saveMediaFile } from '@/lib/server/media-storage';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  const { id } = await params;

  try {
    const files = await getMediaFilesByStage(id, userId);
    return apiSuccess({ files });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权访问');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '获取媒体列表失败');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  const { id: stageId } = await params;
  let uploadedStorageKey: string | null = null;
  let uploadedPosterStorageKey: string | null = null;

  try {
    // Owner check BEFORE any file I/O
    if (!(await isStageOwner(stageId, userId))) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作此课程');
    }

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const posterFile = formData.get('poster') as File | null;
      const elementId = formData.get('elementId') as string;
      const type = (formData.get('type') as string) || 'image';
      const prompt = (formData.get('prompt') as string) || '';
      const paramsStr = (formData.get('params') as string) || '{}';
      const error = formData.get('error') as string | null;
      const errorCode = formData.get('errorCode') as string | null;

      if (!elementId) {
        return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, '缺少 elementId');
      }

      let storageKey: string | null = null;
      let posterStorageKey: string | null = null;
      let mimeType = type === 'image' ? 'image/png' : 'video/mp4';
      let size = 0;

      if (file && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        mimeType = file.type || mimeType;
        size = buffer.length;
        storageKey = saveMediaFile(stageId, elementId, buffer, mimeType);
        uploadedStorageKey = storageKey;
      }

      if (posterFile && posterFile.size > 0) {
        const posterBuffer = Buffer.from(await posterFile.arrayBuffer());
        posterStorageKey = saveMediaFile(
          stageId,
          elementId,
          posterBuffer,
          posterFile.type || 'image/png',
          'poster',
        );
        uploadedPosterStorageKey = posterStorageKey;
      }

      let parsedParams: Record<string, unknown> | null = null;
      try {
        parsedParams = JSON.parse(paramsStr);
      } catch {
        parsedParams = null;
      }

      await upsertMediaFile(stageId, userId, {
        id: `${stageId}:${elementId}`,
        stageId,
        elementId,
        type,
        mimeType,
        size,
        storageKey,
        posterStorageKey,
        prompt,
        params: parsedParams,
        error: error || null,
        errorCode: errorCode || null,
        ossKey: null,
        posterOssKey: null,
      });

      return apiSuccess({ elementId, storageKey, posterStorageKey }, 201);
    }

    // JSON body — metadata-only upsert (for error states, etc.)
    const body = await request.json();
    if (!body.elementId) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, '缺少 elementId');
    }

    await upsertMediaFile(stageId, userId, {
      id: `${stageId}:${body.elementId}`,
      stageId,
      elementId: body.elementId,
      type: body.type || 'image',
      mimeType: body.mimeType || 'image/png',
      size: body.size || 0,
      storageKey: body.storageKey || null,
      posterStorageKey: body.posterStorageKey || null,
      prompt: body.prompt || '',
      params: body.params || null,
      error: body.error || null,
      errorCode: body.errorCode || null,
      ossKey: body.ossKey || null,
      posterOssKey: body.posterOssKey || null,
    });

      return apiSuccess({ elementId: body.elementId }, 201);
  } catch (error) {
    if (uploadedStorageKey) {
      try {
        deleteMediaFile(uploadedStorageKey);
      } catch {
        /* ignore cleanup failure */
      }
    }
    if (uploadedPosterStorageKey) {
      try {
        deleteMediaFile(uploadedPosterStorageKey);
      } catch {
        /* ignore cleanup failure */
      }
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作');
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      '保存媒体失败',
      error instanceof Error ? error.message : String(error),
    );
  }
}
