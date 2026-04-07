/**
 * GET /api/stages/:id/outlines — 获取课程大纲
 * PUT /api/stages/:id/outlines — 保存课程大纲
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getAuthUserId } from '@/lib/server/api-auth';
import {
  getOutlinesByStage,
  saveOutlinesByStage,
} from '@/lib/server/db/outline-repository';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  const { id } = await params;

  try {
    const row = await getOutlinesByStage(id, userId);
    return apiSuccess({ outlines: row?.outlines ?? [], updatedAt: row?.updatedAt ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权访问');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '获取大纲失败');
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
    const { outlines } = body;
    if (!Array.isArray(outlines)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, '缺少 outlines');
    }
    await saveOutlinesByStage(id, userId, outlines);
    return apiSuccess({ saved: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '保存大纲失败');
  }
}
