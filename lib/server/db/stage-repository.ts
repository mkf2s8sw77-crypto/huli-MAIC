/**
 * Stage Repository — 课程 DAL (Data Access Layer)
 *
 * 所有课程 CRUD 均绑定 userId，服务端强制 owner 校验。
 * 不要从客户端代码引入此文件。
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from './index';
import { stages, scenes } from './schema';
import type { Stage, Scene } from '@/lib/types/stage';

// ─── Type helpers ──────────────────────────────────────────────────

export interface StageListItem {
  id: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  firstSlideCanvas?: Record<string, unknown> | null;
}

// ─── List ──────────────────────────────────────────────────────────

export async function listStagesByUser(userId: string): Promise<StageListItem[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(stages)
    .where(eq(stages.userId, userId))
    .orderBy(desc(stages.updatedAt));

  const result: StageListItem[] = [];
  for (const row of rows) {
    const sceneRows = await db
      .select()
      .from(scenes)
      .where(eq(scenes.stageId, row.id));

    const firstSlide = await db
      .select()
      .from(scenes)
      .where(and(eq(scenes.stageId, row.id), eq(scenes.type, 'slide')))
      .orderBy(scenes.order)
      .limit(1);

    let firstSlideCanvas: Record<string, unknown> | null = null;
    if (firstSlide.length > 0 && firstSlide[0].content) {
      const content = firstSlide[0].content as { type?: string; canvas?: Record<string, unknown> };
      if (content.type === 'slide' && content.canvas) {
        firstSlideCanvas = content.canvas;
      }
    }

    result.push({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      sceneCount: sceneRows.length,
      createdAt: row.createdAt ? row.createdAt.getTime() : Date.now(),
      updatedAt: row.updatedAt ? row.updatedAt.getTime() : Date.now(),
      firstSlideCanvas,
    });
  }

  return result;
}

// ─── Get ───────────────────────────────────────────────────────────

export async function getStageWithScenes(
  stageId: string,
  userId: string,
): Promise<{ stage: Stage; scenes: Scene[] } | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(stages)
    .where(and(eq(stages.id, stageId), eq(stages.userId, userId)))
    .limit(1);

  if (!row) return null;

  const sceneRows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.stageId, stageId))
    .orderBy(scenes.order);

  const stage: Stage = dbRowToStage(row);
  const sceneList: Scene[] = sceneRows.map(dbRowToScene);

  return { stage, scenes: sceneList };
}

// ─── Create / Upsert ──────────────────────────────────────────────

export async function upsertStage(stage: Stage, userId: string): Promise<void> {
  const db = getDb();
  const now = new Date();

  const existing = await db
    .select({ id: stages.id })
    .from(stages)
    .where(eq(stages.id, stage.id))
    .limit(1);

  if (existing.length > 0) {
    const [owner] = await db
      .select({ userId: stages.userId })
      .from(stages)
      .where(eq(stages.id, stage.id))
      .limit(1);

    if (owner && owner.userId !== userId) {
      throw new Error('FORBIDDEN');
    }

    await db
      .update(stages)
      .set({
        name: stage.name || 'Untitled',
        description: stage.description ?? '',
        language: stage.language,
        style: stage.style,
        viewportPreset: stage.viewportPreset,
        viewportSize: stage.viewportSize,
        viewportRatio: stage.viewportRatio,
        agentIds: stage.agentIds ?? null,
        updatedAt: now,
      })
      .where(eq(stages.id, stage.id));
  } else {
    await db.insert(stages).values({
      id: stage.id,
      userId,
      name: stage.name || 'Untitled',
      description: stage.description ?? '',
      language: stage.language,
      style: stage.style,
      viewportPreset: stage.viewportPreset,
      viewportSize: stage.viewportSize,
      viewportRatio: stage.viewportRatio,
      agentIds: stage.agentIds ?? null,
      createdAt: stage.createdAt ? new Date(stage.createdAt) : now,
      updatedAt: now,
    });
  }
}

// ─── Save Scenes (replace all) ─────────────────────────────────────

export async function saveScenes(
  stageId: string,
  userId: string,
  sceneList: Scene[],
  currentSceneId?: string | null,
): Promise<void> {
  const db = getDb();

  const [owner] = await db
    .select({ userId: stages.userId })
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);

  if (!owner) throw new Error('NOT_FOUND');
  if (owner.userId !== userId) throw new Error('FORBIDDEN');

  const now = new Date();

  await db.delete(scenes).where(eq(scenes.stageId, stageId));

  if (sceneList.length > 0) {
    await db.insert(scenes).values(
      sceneList.map((s, idx) => ({
        id: s.id,
        stageId,
        type: s.type,
        title: s.title || '',
        order: s.order ?? idx,
        content: s.content as unknown as Record<string, unknown>,
        actions: (s.actions ?? null) as unknown as unknown[] | null,
        whiteboards: (s.whiteboards ?? null) as unknown as unknown[] | null,
        multiAgent: (s.multiAgent ?? null) as unknown as Record<string, unknown> | null,
        createdAt: s.createdAt ? new Date(s.createdAt) : now,
        updatedAt: s.updatedAt ? new Date(s.updatedAt) : now,
      })),
    );
  }

  await db
    .update(stages)
    .set({ updatedAt: now, currentSceneId: currentSceneId ?? null })
    .where(eq(stages.id, stageId));
}

// ─── Delete ────────────────────────────────────────────────────────

export async function deleteStage(stageId: string, userId: string): Promise<boolean> {
  const db = getDb();

  const [owner] = await db
    .select({ userId: stages.userId })
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);

  if (!owner) return false;
  if (owner.userId !== userId) {
    throw new Error('FORBIDDEN');
  }

  await db.delete(scenes).where(eq(scenes.stageId, stageId));
  await db.delete(stages).where(eq(stages.id, stageId));

  return true;
}

// ─── Owner check ───────────────────────────────────────────────────

export async function isStageOwner(stageId: string, userId: string): Promise<boolean> {
  const db = getDb();

  const [row] = await db
    .select({ userId: stages.userId })
    .from(stages)
    .where(and(eq(stages.id, stageId), eq(stages.userId, userId)))
    .limit(1);

  return !!row;
}

// ─── Row converters ────────────────────────────────────────────────

type StageRow = typeof stages.$inferSelect;
type SceneRow = typeof scenes.$inferSelect;

function dbRowToStage(row: StageRow): Stage & { currentSceneId?: string | null } {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    language: row.language ?? undefined,
    style: row.style ?? undefined,
    viewportPreset: row.viewportPreset as Stage['viewportPreset'],
    viewportSize: row.viewportSize ?? undefined,
    viewportRatio: row.viewportRatio ?? undefined,
    currentSceneId: row.currentSceneId ?? undefined,
    agentIds: row.agentIds ?? undefined,
    createdAt: row.createdAt ? row.createdAt.getTime() : Date.now(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : Date.now(),
  };
}

function dbRowToScene(row: SceneRow): Scene {
  return {
    id: row.id,
    stageId: row.stageId,
    type: row.type as Scene['type'],
    title: row.title,
    order: row.order,
    content: row.content as unknown as Scene['content'],
    actions: (row.actions as unknown as Scene['actions']) ?? undefined,
    whiteboards: (row.whiteboards as unknown as Scene['whiteboards']) ?? undefined,
    multiAgent: (row.multiAgent as unknown as Scene['multiAgent']) ?? undefined,
    createdAt: row.createdAt ? row.createdAt.getTime() : undefined,
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}
