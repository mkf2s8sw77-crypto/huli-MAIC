import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';
import type { ManifestAction } from './classroom-zip-types';
import { db } from '@/lib/utils/database';
import type { AudioFileRecord } from '@/lib/utils/database';
import type { Scene } from '@/lib/types/stage';
import { withBasePath } from '@/lib/utils/base-path';

// ─── Export: Collect Media ─────────────────────────────────────

export interface CollectedAudio {
  zipPath: string;
  record: AudioFileRecord;
}

export interface CollectedMedia {
  zipPath: string;
  record: {
    blob: Blob;
    poster?: Blob;
    mimeType: string;
    size: number;
    prompt?: string;
  };
  elementId: string;
}

export interface ExportAgentRecord {
  id: string;
  name: string;
  role: string;
  persona: string;
  avatar: string;
  color: string;
  priority: number;
}

export async function collectAudioFiles(scenes: Scene[]): Promise<CollectedAudio[]> {
  const audioIds = new Set<string>();
  for (const scene of scenes) {
    for (const action of scene.actions ?? []) {
      if (action.type === 'speech' && (action as SpeechAction).audioId) {
        audioIds.add((action as SpeechAction).audioId!);
      }
    }
  }
  const collected: CollectedAudio[] = [];
  for (const audioId of audioIds) {
    const record = await db.audioFiles.get(audioId);
    if (record) {
      const ext = record.format || 'mp3';
      collected.push({ zipPath: `audio/${audioId}.${ext}`, record });
    }
  }
  return collected;
}

export async function collectMediaFiles(stageId: string): Promise<CollectedMedia[]> {
  const response = await fetch(withBasePath(`/api/stages/${encodeURIComponent(stageId)}/media`));
  if (!response.ok) {
    throw new Error(`Failed to load media metadata: HTTP ${response.status}`);
  }

  const json = await response.json();
  const records = (json.files || []) as Array<{
    elementId: string;
    type: 'image' | 'video';
    mimeType?: string;
    size?: number;
    prompt?: string;
    storageKey?: string | null;
    posterStorageKey?: string | null;
    ossKey?: string | null;
    posterOssKey?: string | null;
    error?: string | null;
  }>;

  const collected: CollectedMedia[] = [];
  for (const record of records) {
    if (record.error) continue;

    const sourceUrl = record.storageKey
      ? withBasePath(`/api/media/${record.storageKey}`)
      : record.ossKey || undefined;
    if (!sourceUrl) continue;

    const blob = await fetchMediaBlob(sourceUrl);
    const posterUrl = record.posterStorageKey
      ? withBasePath(`/api/media/${record.posterStorageKey}`)
      : record.posterOssKey || undefined;
    const poster = posterUrl ? await fetchMediaBlob(posterUrl).catch(() => undefined) : undefined;
    const mimeType =
      record.mimeType || blob.type || (record.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const ext = extensionFromMime(mimeType);

    collected.push({
      zipPath: `media/${record.elementId}.${ext}`,
      record: {
        blob,
        poster,
        mimeType,
        size: record.size || blob.size,
        prompt: record.prompt || '',
      },
      elementId: record.elementId,
    });
  }
  return collected;
}

export async function collectGeneratedAgents(stageId: string): Promise<ExportAgentRecord[]> {
  const response = await fetch(withBasePath(`/api/stages/${encodeURIComponent(stageId)}/agents`));
  if (!response.ok) {
    throw new Error(`Failed to load generated agents: HTTP ${response.status}`);
  }
  const json = await response.json();
  return (json.agents || []) as ExportAgentRecord[];
}

async function fetchMediaBlob(url: string): Promise<Blob> {
  if (url.startsWith('/')) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: HTTP ${response.status}`);
    }
    return response.blob();
  }

  const response = await fetch(withBasePath('/api/proxy-media'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    throw new Error(`Failed to proxy media: HTTP ${response.status}`);
  }
  return response.blob();
}

function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  return map[mimeType] || mimeType.split('/')[1] || 'bin';
}

// ─── Export: Action Serialization ──────────────────────────────

export function actionsToManifest(
  actions: Action[],
  audioIdToPath: Map<string, string>,
  agentIdToIndex: Map<string, number> = new Map(),
): ManifestAction[] {
  return actions.map((action) => {
    if (action.type === 'speech') {
      const speech = action as SpeechAction;
      const { audioId, ...rest } = speech;
      const audioRef = audioId ? audioIdToPath.get(audioId) : undefined;
      return {
        ...rest,
        ...(audioRef ? { audioRef } : {}),
        ...(speech.audioUrl ? { audioUrl: speech.audioUrl } : {}),
      } as ManifestAction;
    }
    if (action.type === 'discussion') {
      const discussion = action as DiscussionAction;
      const { agentId, ...rest } = discussion;
      const agentIndex = agentId ? agentIdToIndex.get(agentId) : undefined;
      return {
        ...rest,
        ...(agentIndex !== undefined ? { agentIndex } : agentId ? { agentId } : {}),
      } as ManifestAction;
    }
    return action as ManifestAction;
  });
}

// ─── Import: Reference Rewriting ───────────────────────────────

interface RewriteManifestActionOptions {
  agentIds?: string[];
  fallbackDiscussionAgentIndex?: number;
}

export function rewriteAudioRefsToIds(
  actions: ManifestAction[],
  audioRefMap: Record<string, string>,
  options: RewriteManifestActionOptions = {},
): Action[] {
  return actions.map((action) => {
    if (action.type === 'speech' && 'audioRef' in action) {
      const { audioRef, ...rest } = action;
      const audioId = audioRef ? audioRefMap[audioRef] : undefined;
      return {
        ...rest,
        ...(audioId ? { audioId } : {}),
      } as Action;
    }
    if (action.type === 'discussion') {
      const {
        agentIndex,
        agentId: legacyAgentId,
        ...rest
      } = action as ManifestAction & { type: 'discussion'; agentIndex?: number; agentId?: string };
      const indexedAgentId =
        typeof agentIndex === 'number' ? options.agentIds?.[agentIndex] : undefined;
      const preservedLegacyAgentId =
        legacyAgentId && (!options.agentIds?.length || options.agentIds.includes(legacyAgentId))
          ? legacyAgentId
          : undefined;
      const fallbackAgentId =
        typeof options.fallbackDiscussionAgentIndex === 'number'
          ? options.agentIds?.[options.fallbackDiscussionAgentIndex]
          : undefined;

      return {
        ...rest,
        ...(indexedAgentId || preservedLegacyAgentId || fallbackAgentId
          ? { agentId: indexedAgentId || preservedLegacyAgentId || fallbackAgentId }
          : {}),
      } as Action;
    }
    return action as Action;
  });
}
