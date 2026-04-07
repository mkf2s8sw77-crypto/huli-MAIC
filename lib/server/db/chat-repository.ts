/**
 * Chat Session Repository — DAL
 *
 * 聊天会话 CRUD，绑定 stage owner 校验。
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './index';
import { chatSessions, stages } from './schema';

export interface ChatSessionRow {
  id: string;
  stageId: string;
  type: string;
  title: string;
  status: string;
  messages: unknown[];
  config: Record<string, unknown>;
  toolCalls: unknown[];
  sceneId?: string | null;
  lastActionIndex?: number | null;
  createdAt: number;
  updatedAt: number;
}

async function assertOwner(stageId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ userId: stages.userId })
    .from(stages)
    .where(and(eq(stages.id, stageId), eq(stages.userId, userId)))
    .limit(1);
  if (!row) throw new Error('FORBIDDEN');
}

export async function getChatSessionsByStage(
  stageId: string,
  userId: string,
): Promise<ChatSessionRow[]> {
  await assertOwner(stageId, userId);
  const db = getDb();

  const rows = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.stageId, stageId))
    .orderBy(chatSessions.createdAt);

  return rows.map((r) => ({
    id: r.id,
    stageId: r.stageId,
    type: r.type,
    title: r.title,
    status: r.status,
    messages: (r.messages ?? []) as unknown[],
    config: (r.config ?? {}) as Record<string, unknown>,
    toolCalls: (r.toolCalls ?? []) as unknown[],
    sceneId: r.sceneId,
    lastActionIndex: r.lastActionIndex,
    createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
    updatedAt: r.updatedAt ? r.updatedAt.getTime() : Date.now(),
  }));
}

export async function saveChatSessionsByStage(
  stageId: string,
  userId: string,
  sessions: ChatSessionRow[],
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  const now = new Date();

  await db.delete(chatSessions).where(eq(chatSessions.stageId, stageId));

  if (sessions.length > 0) {
    await db.insert(chatSessions).values(
      sessions.map((s) => ({
        id: s.id,
        stageId,
        type: s.type,
        title: s.title,
        status: s.status,
        messages: s.messages as unknown[],
        config: s.config as Record<string, unknown>,
        toolCalls: s.toolCalls as unknown[],
        sceneId: s.sceneId ?? null,
        lastActionIndex: s.lastActionIndex ?? null,
        createdAt: s.createdAt ? new Date(s.createdAt) : now,
        updatedAt: s.updatedAt ? new Date(s.updatedAt) : now,
      })),
    );
  }
}

export async function deleteChatSessionsByStage(
  stageId: string,
  userId: string,
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  await db.delete(chatSessions).where(eq(chatSessions.stageId, stageId));
}
