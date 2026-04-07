/**
 * Media Files Repository — DAL
 *
 * 媒体元数据 CRUD，绑定 stage owner 校验。
 * 实体文件存储由 media-storage.ts 负责。
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './index';
import { mediaFiles, stages } from './schema';

export interface MediaFileRow {
  id: string;
  stageId: string;
  elementId: string;
  type: string;
  mimeType: string;
  size: number;
  storageKey: string | null;
  posterStorageKey: string | null;
  prompt: string;
  params: Record<string, unknown> | null;
  error: string | null;
  errorCode: string | null;
  ossKey: string | null;
  posterOssKey: string | null;
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

export function mediaFileId(stageId: string, elementId: string): string {
  return `${stageId}:${elementId}`;
}

export async function getMediaFilesByStage(
  stageId: string,
  userId: string,
): Promise<MediaFileRow[]> {
  await assertOwner(stageId, userId);
  const db = getDb();

  const rows = await db
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.stageId, stageId));

  return rows.map(dbRowToMediaFile);
}

export async function getMediaFile(
  stageId: string,
  elementId: string,
  userId: string,
): Promise<MediaFileRow | null> {
  await assertOwner(stageId, userId);
  const db = getDb();
  const id = mediaFileId(stageId, elementId);

  const [row] = await db
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.id, id))
    .limit(1);

  return row ? dbRowToMediaFile(row) : null;
}

export async function upsertMediaFile(
  stageId: string,
  userId: string,
  data: Omit<MediaFileRow, 'createdAt'>,
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  const now = new Date();
  const id = mediaFileId(stageId, data.elementId);

  const existing = await db
    .select({ id: mediaFiles.id })
    .from(mediaFiles)
    .where(eq(mediaFiles.id, id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(mediaFiles)
      .set({
        type: data.type,
        mimeType: data.mimeType,
        size: data.size,
        storageKey: data.storageKey,
        posterStorageKey: data.posterStorageKey,
        prompt: data.prompt,
        params: data.params,
        error: data.error,
        errorCode: data.errorCode,
        ossKey: data.ossKey,
        posterOssKey: data.posterOssKey,
      })
      .where(eq(mediaFiles.id, id));
  } else {
    await db.insert(mediaFiles).values({
      id,
      stageId,
      elementId: data.elementId,
      type: data.type,
      mimeType: data.mimeType,
      size: data.size,
      storageKey: data.storageKey,
      posterStorageKey: data.posterStorageKey,
      prompt: data.prompt,
      params: data.params,
      error: data.error,
      errorCode: data.errorCode,
      ossKey: data.ossKey,
      posterOssKey: data.posterOssKey,
      createdAt: now,
    });
  }
}

export async function deleteMediaFileByElement(
  stageId: string,
  elementId: string,
  userId: string,
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  const id = mediaFileId(stageId, elementId);
  await db.delete(mediaFiles).where(eq(mediaFiles.id, id));
}

export async function deleteMediaFilesByStage(
  stageId: string,
  userId: string,
): Promise<void> {
  await assertOwner(stageId, userId);
  const db = getDb();
  await db.delete(mediaFiles).where(eq(mediaFiles.stageId, stageId));
}

type MediaFileDbRow = typeof mediaFiles.$inferSelect;

function dbRowToMediaFile(row: MediaFileDbRow): MediaFileRow {
  return {
    id: row.id,
    stageId: row.stageId,
    elementId: row.elementId,
    type: row.type,
    mimeType: row.mimeType,
    size: row.size,
    storageKey: row.storageKey,
    posterStorageKey: row.posterStorageKey,
    prompt: row.prompt,
    params: row.params as Record<string, unknown> | null,
    error: row.error,
    errorCode: row.errorCode,
    ossKey: row.ossKey,
    posterOssKey: row.posterOssKey,
    createdAt: row.createdAt ? row.createdAt.getTime() : Date.now(),
  };
}
