/**
 * Generated Agents Repository — DAL
 *
 * AI 生成 agent CRUD，绑定 stage owner 校验。
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './index';
import { generatedAgents, stages } from './schema';

export interface GeneratedAgentRow {
  id: string;
  stageId: string;
  name: string;
  role: string;
  persona: string;
  avatar: string;
  color: string;
  priority: number;
  voiceConfig?: { providerId: string; voiceId: string } | null;
  createdAt: number;
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

export async function getAgentsByStage(
  stageId: string,
  userId: string,
): Promise<GeneratedAgentRow[]> {
  await assertOwner(stageId, userId);
  const db = getDb();

  const rows = await db
    .select()
    .from(generatedAgents)
    .where(eq(generatedAgents.stageId, stageId));

  return rows.map((r) => ({
    id: r.id,
    stageId: r.stageId,
    name: r.name,
    role: r.role,
    persona: r.persona,
    avatar: r.avatar,
    color: r.color,
    priority: r.priority,
    voiceConfig: r.voiceConfig as GeneratedAgentRow['voiceConfig'],
    createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
  }));
}

export async function saveAgentsByStage(
  stageId: string,
  userId: string,
  agents: Omit<GeneratedAgentRow, 'stageId' | 'createdAt'>[],
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  const now = new Date();

  await db.delete(generatedAgents).where(eq(generatedAgents.stageId, stageId));

  if (agents.length > 0) {
    await db.insert(generatedAgents).values(
      agents.map((a) => ({
        id: a.id,
        stageId,
        name: a.name,
        role: a.role,
        persona: a.persona,
        avatar: a.avatar,
        color: a.color,
        priority: a.priority,
        voiceConfig: a.voiceConfig ?? null,
        createdAt: now,
      })),
    );
  }
}

export async function deleteAgentsByStage(
  stageId: string,
  userId: string,
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  await db.delete(generatedAgents).where(eq(generatedAgents.stageId, stageId));
}
