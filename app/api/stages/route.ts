/**
 * GET  /api/stages — 列出当前用户的所有课程
 * POST /api/stages — 创建/upsert 课程（含 scenes）
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getAuthUserId } from '@/lib/server/api-auth';
import { listStagesByUser, upsertStage, saveScenes } from '@/lib/server/db/stage-repository';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  }

  try {
    const list = await listStagesByUser(userId);
    return apiSuccess({ stages: list });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      '获取课程列表失败',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  }

  try {
    const body = await request.json();
    const { stage, scenes: sceneList, currentSceneId } = body;

    if (!stage || !stage.id) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, '缺少 stage 数据');
    }

    await upsertStage(stage, userId);

    if (Array.isArray(sceneList)) {
      await saveScenes(stage.id, userId, sceneList, currentSceneId);
    }

    return apiSuccess({ id: stage.id }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作此课程');
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      '保存课程失败',
      error instanceof Error ? error.message : String(error),
    );
  }
}
