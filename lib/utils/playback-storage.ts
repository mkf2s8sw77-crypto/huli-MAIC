/**
 * Playback Storage — 服务端真源
 *
 * Phase 3: 改为调用 /api/stages/:id/playback，不再依赖 IndexedDB。
 * 保持原有 API 签名不变。
 */

import { withBasePath } from '@/lib/utils/base-path';

export interface PlaybackSnapshot {
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  sceneId?: string;
}

export async function savePlaybackState(
  stageId: string,
  snapshot: PlaybackSnapshot,
): Promise<void> {
  try {
    const res = await fetch(withBasePath(`/api/stages/${encodeURIComponent(stageId)}/playback`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) console.warn('[Playback] Failed to persist playback:', res.status);
  } catch {
    // best-effort — playback state is non-critical
  }
}

export async function loadPlaybackState(stageId: string): Promise<PlaybackSnapshot | null> {
  try {
    const res = await fetch(
      withBasePath(`/api/stages/${encodeURIComponent(stageId)}/playback`),
    );
    if (!res.ok) return null;
    const json = await res.json();
    const pb = json.playback;
    if (!pb) return null;

    return {
      sceneIndex: pb.sceneIndex,
      actionIndex: pb.actionIndex,
      consumedDiscussions: pb.consumedDiscussions || [],
      sceneId: pb.sceneId as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function clearPlaybackState(stageId: string): Promise<void> {
  await fetch(withBasePath(`/api/stages/${encodeURIComponent(stageId)}/playback`), {
    method: 'DELETE',
  }).catch(() => {});
}
