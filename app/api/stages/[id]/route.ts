/**
 * GET    /api/stages/:id — 获取课程及 scenes（owner 校验）
 * PUT    /api/stages/:id — 更新课程及 scenes（全量替换 scenes）
 * DELETE /api/stages/:id — 删除课程（owner 校验）
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getAuthUserId } from '@/lib/server/api-auth';
import {
  getStageWithScenes,
  upsertStage,
  saveScenes,
  deleteStage,
} from '@/lib/server/db/stage-repository';
import { deleteMediaFilesForStage } from '@/lib/server/media-storage';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  }

  const { id } = await params;

  try {
    const result = await getStageWithScenes(id, userId);
    if (!result) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, '课程不存在或无权访问');
    }
    return apiSuccess({ stage: result.stage, scenes: result.scenes });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      '获取课程失败',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { stage, scenes: sceneList, currentSceneId } = body;

    if (stage) {
      await upsertStage({ ...stage, id }, userId);
    }

    if (Array.isArray(sceneList)) {
      await saveScenes(id, userId, sceneList, currentSceneId);
    }

    return apiSuccess({ id });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作此课程');
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, '课程不存在');
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      '更新课程失败',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  }

  const { id } = await params;

  try {
    const deleted = await deleteStage(id, userId);
    if (!deleted) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, '课程不存在');
    }
    // Clean up media files on disk (best-effort)
    try { deleteMediaFilesForStage(id); } catch { /* ignore */ }
    return apiSuccess({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权删除此课程');
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      '删除课程失败',
      error instanceof Error ? error.message : String(error),
    );
  }
}
