/**
 * GET    /api/stages/:id/playback — 获取播放状态
 * PUT    /api/stages/:id/playback — 保存播放状态
 * DELETE /api/stages/:id/playback — 清除播放状态
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getAuthUserId } from '@/lib/server/api-auth';
import {
  getPlaybackByStage,
  savePlaybackByStage,
  deletePlaybackByStage,
} from '@/lib/server/db/playback-repository';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  const { id } = await params;

  try {
    const state = await getPlaybackByStage(id, userId);
    return apiSuccess({ playback: state });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权访问');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '获取播放状态失败');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  const { id } = await params;

  try {
    const body = await request.json();
    await savePlaybackByStage(id, userId, {
      sceneIndex: body.sceneIndex ?? 0,
      actionIndex: body.actionIndex ?? 0,
      consumedDiscussions: body.consumedDiscussions ?? [],
      sceneId: body.sceneId,
    });
    return apiSuccess({ saved: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '保存播放状态失败');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  const { id } = await params;

  try {
    await deletePlaybackByStage(id, userId);
    return apiSuccess({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '删除播放状态失败');
  }
}
