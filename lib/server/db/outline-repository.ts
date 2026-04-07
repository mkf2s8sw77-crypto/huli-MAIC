/**
 * Stage Outlines Repository — DAL
 *
 * 大纲数据 CRUD，绑定 stage owner 校验。
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './index';
import { stageOutlines, stages } from './schema';

export interface OutlinesRow {
  stageId: string;
  outlines: unknown[];
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

export async function getOutlinesByStage(
  stageId: string,
  userId: string,
): Promise<OutlinesRow | null> {
  await assertOwner(stageId, userId);
  const db = getDb();

  const [row] = await db
    .select()
    .from(stageOutlines)
    .where(eq(stageOutlines.stageId, stageId))
    .limit(1);

  if (!row) return null;
  return {
    stageId: row.stageId,
    outlines: (row.outlines ?? []) as unknown[],
    createdAt: row.createdAt ? row.createdAt.getTime() : Date.now(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : Date.now(),
  };
}

export async function saveOutlinesByStage(
  stageId: string,
  userId: string,
  outlines: unknown[],
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  const now = new Date();

  const existing = await db
    .select({ stageId: stageOutlines.stageId })
    .from(stageOutlines)
    .where(eq(stageOutlines.stageId, stageId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(stageOutlines)
      .set({ outlines: outlines as unknown[], updatedAt: now })
      .where(eq(stageOutlines.stageId, stageId));
  } else {
    await db.insert(stageOutlines).values({
      stageId,
      outlines: outlines as unknown[],
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function deleteOutlinesByStage(
  stageId: string,
  userId: string,
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  await db.delete(stageOutlines).where(eq(stageOutlines.stageId, stageId));
}
