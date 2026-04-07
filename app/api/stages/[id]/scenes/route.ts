/**
 * PUT /api/stages/:id/scenes — 仅更新 scenes（全量替换），不修改 stage 元信息
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getAuthUserId } from '@/lib/server/api-auth';
import { saveScenes } from '@/lib/server/db/stage-repository';

export const runtime = 'nodejs';

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
    const { scenes: sceneList, currentSceneId } = body;

    if (!Array.isArray(sceneList)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, '缺少 scenes 数组');
    }

    await saveScenes(id, userId, sceneList, currentSceneId);
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
      '保存场景失败',
      error instanceof Error ? error.message : String(error),
    );
  }
}
