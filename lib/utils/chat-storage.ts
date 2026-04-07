/**
 * Chat Storage — 服务端真源
 *
 * Phase 3: 改为调用 /api/stages/:id/chats，不再依赖 IndexedDB。
 * 保持原有 API 签名不变。
 */

import type { ChatSession, ChatMessageMetadata, SessionStatus } from '@/lib/types/chat';
import type { UIMessage } from 'ai';
import { withBasePath } from '@/lib/utils/base-path';

const MAX_MESSAGES_PER_SESSION = 200;

export async function saveChatSessions(stageId: string, sessions: ChatSession[]): Promise<void> {
  const records = sessions.map((session) => ({
    id: session.id,
    stageId,
    type: session.type,
    title: session.title,
    status: (session.status === 'active' ? 'interrupted' : session.status) as SessionStatus,
    messages: session.messages.slice(-MAX_MESSAGES_PER_SESSION),
    config: session.config,
    toolCalls: session.toolCalls,
    sceneId: session.sceneId,
    lastActionIndex: session.lastActionIndex,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }));

  const res = await fetch(withBasePath(`/api/stages/${encodeURIComponent(stageId)}/chats`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions: records }),
  });
  if (!res.ok) console.warn('[ChatStorage] Failed to persist chats:', res.status);
}

export async function loadChatSessions(stageId: string): Promise<ChatSession[]> {
  try {
    const res = await fetch(
      withBasePath(`/api/stages/${encodeURIComponent(stageId)}/chats`),
    );
    if (!res.ok) return [];
    const json = await res.json();
    const sessions = json.sessions || [];

    return sessions.map((record: Record<string, unknown>) => ({
      id: record.id as string,
      type: record.type as string,
      title: record.title as string,
      status: record.status as string,
      messages: (record.messages || []) as UIMessage<ChatMessageMetadata>[],
      config: record.config as ChatSession['config'],
      toolCalls: (record.toolCalls || []) as ChatSession['toolCalls'],
      pendingToolCalls: [],
      createdAt: record.createdAt as number,
      updatedAt: record.updatedAt as number,
      sceneId: record.sceneId as string | undefined,
      lastActionIndex: record.lastActionIndex as number | undefined,
    }));
  } catch {
    return [];
  }
}

export async function deleteChatSessions(stageId: string): Promise<void> {
  await fetch(withBasePath(`/api/stages/${encodeURIComponent(stageId)}/chats`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions: [] }),
  }).catch(() => {});
}
