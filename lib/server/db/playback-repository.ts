/**
 * Playback State Repository — DAL
 *
 * 播放状态 CRUD，绑定 stage owner 校验。
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './index';
import { playbackState, stages } from './schema';

export interface PlaybackStateRow {
  stageId: string;
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  sceneId?: string | null;
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

export async function getPlaybackByStage(
  stageId: string,
  userId: string,
): Promise<PlaybackStateRow | null> {
  await assertOwner(stageId, userId);
  const db = getDb();

  const [row] = await db
    .select()
    .from(playbackState)
    .where(eq(playbackState.stageId, stageId))
    .limit(1);

  if (!row) return null;
  return {
    stageId: row.stageId,
    sceneIndex: row.sceneIndex,
    actionIndex: row.actionIndex,
    consumedDiscussions: (row.consumedDiscussions ?? []) as string[],
    sceneId: row.sceneId,
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : Date.now(),
  };
}

export async function savePlaybackByStage(
  stageId: string,
  userId: string,
  data: Omit<PlaybackStateRow, 'stageId' | 'updatedAt'>,
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  const now = new Date();

  const existing = await db
    .select({ stageId: playbackState.stageId })
    .from(playbackState)
    .where(eq(playbackState.stageId, stageId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(playbackState)
      .set({
        sceneIndex: data.sceneIndex,
        actionIndex: data.actionIndex,
        consumedDiscussions: data.consumedDiscussions,
        sceneId: data.sceneId ?? null,
        updatedAt: now,
      })
      .where(eq(playbackState.stageId, stageId));
  } else {
    await db.insert(playbackState).values({
      stageId,
      sceneIndex: data.sceneIndex,
      actionIndex: data.actionIndex,
      consumedDiscussions: data.consumedDiscussions,
      sceneId: data.sceneId ?? null,
      updatedAt: now,
    });
  }
}

export async function deletePlaybackByStage(
  stageId: string,
  userId: string,
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  await db.delete(playbackState).where(eq(playbackState.stageId, stageId));
}
