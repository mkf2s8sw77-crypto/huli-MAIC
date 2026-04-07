/**
 * GET  /api/stages/:id/chats — 获取课程的聊天会话
 * PUT  /api/stages/:id/chats — 保存课程的聊天会话（全量替换）
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getAuthUserId } from '@/lib/server/api-auth';
import {
  getChatSessionsByStage,
  saveChatSessionsByStage,
} from '@/lib/server/db/chat-repository';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, '未登录');
  const { id } = await params;

  try {
    const sessions = await getChatSessionsByStage(id, userId);
    return apiSuccess({ sessions });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权访问');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '获取聊天失败');
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
    const { sessions } = body;
    if (!Array.isArray(sessions)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, '缺少 sessions');
    }
    await saveChatSessionsByStage(id, userId, sessions);
    return apiSuccess({ saved: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, '无权操作');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '保存聊天失败');
  }
}
