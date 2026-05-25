'use client';

import { useState, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { db } from '@/lib/utils/database';
import type { AudioFileRecord } from '@/lib/utils/database';
import type { ClassroomManifest, ManifestScene } from '@/lib/export/classroom-zip-types';
import { rewriteAudioRefsToIds } from '@/lib/export/classroom-zip-utils';
import { createLogger } from '@/lib/logger';
import type { Scene, Stage } from '@/lib/types/stage';
import { deleteStageData, saveStageData } from '@/lib/utils/stage-storage';
import { withBasePath } from '@/lib/utils/base-path';
import { saveGeneratedAgents } from '@/lib/orchestration/registry/store';

const log = createLogger('ImportClassroom');

export type ImportPhase =
  | 'idle'
  | 'parsing'
  | 'validating'
  | 'writingMedia'
  | 'writingCourse'
  | 'done';

function getMediaElementId(zipPath: string): string {
  const filename = zipPath.split('/').pop() ?? '';
  return filename.replace(/\.\w+$/, '');
}

function getMediaMimeType(zipPath: string, manifestMimeType?: string): string {
  if (manifestMimeType) return manifestMimeType;
  const ext = zipPath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return (ext && map[ext]) || 'application/octet-stream';
}

async function uploadImportedMedia(input: {
  stageId: string;
  zipPath: string;
  blob: Blob;
  poster?: Blob;
  mimeType: string;
  prompt?: string;
}) {
  const elementId = getMediaElementId(input.zipPath);
  if (!elementId) return;

  const formData = new FormData();
  formData.append('file', input.blob, input.zipPath.split('/').pop() || elementId);
  formData.append('elementId', elementId);
  formData.append('type', input.mimeType.startsWith('video/') ? 'video' : 'image');
  formData.append('prompt', input.prompt || '');
  formData.append('params', '{}');
  if (input.poster) {
    formData.append('poster', input.poster, `${elementId}_poster.jpg`);
  }

  const response = await fetch(
    withBasePath(`/api/stages/${encodeURIComponent(input.stageId)}/media`),
    { method: 'POST', body: formData },
  );
  if (!response.ok) {
    throw new Error(`Failed to upload imported media: HTTP ${response.status}`);
  }
}

export function useImportClassroom(onSuccess?: () => void) {
  const [importing, setImporting] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so same file can be re-selected
      e.target.value = '';

      setImporting(true);
      setPhase('parsing');
      const toastId = toast.loading(t('import.parsing'));

      let createdStageId: string | null = null;
      const importedAudioIds: string[] = [];

      try {
        // 0. Size check — warn for files over 200MB
        const MAX_SAFE_SIZE = 200 * 1024 * 1024;
        if (file.size > MAX_SAFE_SIZE) {
          log.warn(`Large ZIP file: ${(file.size / 1024 / 1024).toFixed(0)}MB`);
        }

        // 1. Parse ZIP
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);

        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) {
          toast.error(t('import.error.invalidManifest'), { id: toastId });
          return;
        }

        // 2. Validate
        setPhase('validating');
        toast.loading(t('import.validating'), { id: toastId });

        const manifestText = await manifestFile.async('text');
        let manifest: ClassroomManifest;
        try {
          manifest = JSON.parse(manifestText);
        } catch {
          toast.error(t('import.error.invalidManifest'), { id: toastId });
          return;
        }

        if (!manifest.stage || !manifest.scenes || !Array.isArray(manifest.scenes)) {
          toast.error(t('import.error.missingData'), { id: toastId });
          return;
        }

        // 3. Generate new IDs
        const newStageId = nanoid();
        const now = Date.now();

        // Agent ID mapping: index → new ID
        const newAgentIds: string[] = (manifest.agents ?? []).map(() => nanoid());
        const studentAgentIndex =
          manifest.agents?.findIndex((agent) => agent.role === 'student') ?? -1;
        const nonTeacherAgentIndex =
          manifest.agents?.findIndex((agent) => agent.role !== 'teacher') ?? -1;
        const fallbackDiscussionAgentIndex =
          studentAgentIndex >= 0
            ? studentAgentIndex
            : nonTeacherAgentIndex >= 0
              ? nonTeacherAgentIndex
              : undefined;

        // Audio ref → new ID mapping
        const audioRefToNewId: Record<string, string> = {};
        for (const [zipPath, entry] of Object.entries(manifest.mediaIndex ?? {})) {
          if (entry.type === 'audio' && !entry.missing) {
            audioRefToNewId[zipPath] = nanoid();
          }
        }

        // 4. Write local audio cache. Audio is still a browser cache by design.
        for (const [zipPath, newId] of Object.entries(audioRefToNewId)) {
          const zipEntry = zip.file(zipPath);
          if (!zipEntry) continue;
          const blob = await zipEntry.async('blob');
          const meta = manifest.mediaIndex[zipPath];
          const record: AudioFileRecord = {
            id: newId,
            blob,
            format: meta.format || 'mp3',
            duration: meta.duration,
            voice: meta.voice,
            createdAt: now,
          };
          await db.audioFiles.put(record);
          importedAudioIds.push(newId);
        }

        // 5. Write course data to the server-side primary store.
        setPhase('writingCourse');
        toast.loading(t('import.writingCourse'), { id: toastId });

        const importedStage: Stage = {
          id: newStageId,
          name: manifest.stage.name || 'Imported Classroom',
          description: manifest.stage.description,
          languageDirective: manifest.stage.language,
          style: manifest.stage.style,
          createdAt: manifest.stage.createdAt || now,
          updatedAt: now,
          agentIds: newAgentIds.length > 0 ? newAgentIds : undefined,
        };

        // Write scenes with rewritten references
        const sceneRecords: Scene[] = manifest.scenes.map(
          (mScene: ManifestScene, index: number) => {
            const newSceneId = nanoid();

            const actions = mScene.actions
              ? rewriteAudioRefsToIds(mScene.actions, audioRefToNewId, {
                  agentIds: newAgentIds,
                  fallbackDiscussionAgentIndex,
                })
              : undefined;

            let multiAgent = undefined;
            if (mScene.multiAgent?.enabled) {
              multiAgent = {
                enabled: true,
                agentIds: (mScene.multiAgent.agentIndices ?? [])
                  .map((idx) => newAgentIds[idx])
                  .filter(Boolean),
                directorPrompt: mScene.multiAgent.directorPrompt,
              };
            }

            return {
              id: newSceneId,
              stageId: newStageId,
              type: mScene.type,
              title: mScene.title,
              order: mScene.order ?? index,
              content: mScene.content,
              actions,
              whiteboards: mScene.whiteboards,
              multiAgent,
              createdAt: now,
              updatedAt: now,
            };
          },
        );

        createdStageId = newStageId;
        await saveStageData(newStageId, {
          stage: importedStage,
          scenes: sceneRecords,
          currentSceneId: sceneRecords[0]?.id || null,
          chats: [],
        });

        if (manifest.agents?.length) {
          await saveGeneratedAgents(
            newStageId,
            manifest.agents.map((agent, index) => ({
              id: newAgentIds[index],
              name: agent.name,
              role: agent.role,
              persona: agent.persona,
              avatar: agent.avatar,
              color: agent.color,
              priority: agent.priority,
              voiceConfig: agent.voiceConfig,
            })),
          );
        }

        // 6. Upload generated media to the server-side primary media store.
        setPhase('writingMedia');
        toast.loading(t('import.writingMedia'), { id: toastId });

        for (const [zipPath, entry] of Object.entries(manifest.mediaIndex ?? {})) {
          if ((entry.type !== 'generated' && entry.type !== 'image') || entry.missing) continue;
          const zipEntry = zip.file(zipPath);
          if (!zipEntry) continue;

          const blob = await zipEntry.async('blob');
          const posterPath = zipPath.replace(/\.\w+$/, '.poster.jpg');
          const posterEntry = zip.file(posterPath);
          const poster = posterEntry ? await posterEntry.async('blob') : undefined;
          const mimeType = getMediaMimeType(zipPath, entry.mimeType);

          await uploadImportedMedia({
            stageId: newStageId,
            zipPath,
            blob,
            poster,
            mimeType,
            prompt: entry.prompt,
          });
        }

        // 7. Done
        setPhase('done');
        toast.success(t('import.success'), { id: toastId });
        onSuccess?.();
      } catch (error) {
        if (createdStageId) {
          await deleteStageData(createdStageId).catch((cleanupError) => {
            log.warn('Failed to roll back imported stage:', cleanupError);
          });
        }
        if (importedAudioIds.length > 0) {
          await db.audioFiles.bulkDelete(importedAudioIds).catch((cleanupError) => {
            log.warn('Failed to roll back imported audio cache:', cleanupError);
          });
        }
        log.error('Classroom ZIP import failed:', error);
        const isQuotaError = error instanceof DOMException && error.name === 'QuotaExceededError';
        toast.error(isQuotaError ? t('import.error.storageFull') : t('import.error.invalidZip'), {
          id: toastId,
        });
      } finally {
        setImporting(false);
        setPhase('idle');
      }
    },
    [t, onSuccess],
  );

  return {
    importing,
    phase,
    fileInputRef,
    triggerFileSelect,
    handleFileChange,
  };
}
