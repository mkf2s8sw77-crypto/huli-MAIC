/**
 * GET /api/stages/:id/agents — 获取课程的 generated agents
 * PUT /api/stages/:id/agents — 保存课程的 generated agents（全量替换）
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getAuthUserId } from '@/lib/server/api-auth';
import {
  getAgentsByStage,
  saveAgentsByStage,
} from '@/lib/server/db/agent-repository';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  const { id } = await params;

  try {
    const agents = await getAgentsByStage(id, userId);
    return apiSuccess({ agents });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权访问');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '获取 agents 失败');
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
    const { agents } = body;
    if (!Array.isArray(agents)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, '缺少 agents');
    }
    await saveAgentsByStage(id, userId, agents);
    return apiSuccess({ saved: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '保存 agents 失败');
  }
}
