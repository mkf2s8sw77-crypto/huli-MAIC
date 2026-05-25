import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  rewriteAudioRefsToIds,
  actionsToManifest,
  collectGeneratedAgents,
  collectMediaFiles,
} from '@/lib/export/classroom-zip-utils';
import {
  CLASSROOM_ZIP_FORMAT_VERSION,
  type ClassroomManifest,
} from '@/lib/export/classroom-zip-types';
import type { DiscussionAction, SpeechAction, SpotlightAction } from '@/lib/types/action';

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── rewriteAudioRefsToIds ────────────────────────────────────

describe('rewriteAudioRefsToIds', () => {
  test('replaces audioRef with new audioId in speech actions', () => {
    const actions = [
      { id: 'a1', type: 'speech' as const, text: 'Hello', audioRef: 'audio/abc.mp3' },
      { id: 'a2', type: 'spotlight' as const, elementId: 'el1' },
    ];
    const audioRefMap = { 'audio/abc.mp3': 'new-audio-id-1' };
    const result = rewriteAudioRefsToIds(actions, audioRefMap);
    expect(result[0]).toMatchObject({
      type: 'speech',
      text: 'Hello',
      audioId: 'new-audio-id-1',
    });
    expect(result[1]).toMatchObject({ type: 'spotlight', elementId: 'el1' });
  });

  test('skips speech actions without audioRef', () => {
    const actions = [
      { id: 'a1', type: 'speech' as const, text: 'Hello', audioUrl: 'https://example.com/a.mp3' },
    ];
    const result = rewriteAudioRefsToIds(actions, {});
    expect(result[0]).toMatchObject({
      type: 'speech',
      text: 'Hello',
      audioUrl: 'https://example.com/a.mp3',
    });
  });

  test('replaces discussion agentIndex with imported agentId', () => {
    const actions = [{ id: 'a1', type: 'discussion' as const, topic: 'Discuss', agentIndex: 1 }];
    const result = rewriteAudioRefsToIds(actions, {}, { agentIds: ['agent-1', 'agent-2'] });
    expect(result[0]).toMatchObject({
      type: 'discussion',
      topic: 'Discuss',
      agentId: 'agent-2',
    });
    expect(result[0]).not.toHaveProperty('agentIndex');
  });

  test('falls back to a valid imported agent when legacy discussion agentId is stale', () => {
    const actions = [
      { id: 'a1', type: 'discussion' as const, topic: 'Discuss', agentId: 'old-agent-id' },
    ];
    const result = rewriteAudioRefsToIds(
      actions,
      {},
      {
        agentIds: ['teacher-1', 'student-1'],
        fallbackDiscussionAgentIndex: 1,
      },
    );
    expect(result[0]).toMatchObject({
      type: 'discussion',
      topic: 'Discuss',
      agentId: 'student-1',
    });
  });

  test('preserves legacy discussion agentId when imported classroom has no generated agents', () => {
    const actions = [
      { id: 'a1', type: 'discussion' as const, topic: 'Discuss', agentId: 'default-2' },
    ];
    const result = rewriteAudioRefsToIds(actions, {}, { agentIds: [] });
    expect(result[0]).toMatchObject({
      type: 'discussion',
      topic: 'Discuss',
      agentId: 'default-2',
    });
  });
});

// ─── actionsToManifest ────────────────────────────────────────

describe('actionsToManifest', () => {
  test('converts audioId to audioRef for speech actions', () => {
    const actions = [
      {
        id: 'act1',
        type: 'speech' as const,
        text: 'Hello',
        audioId: 'audio-123',
        voice: 'alloy',
        speed: 1,
      } as SpeechAction,
      { id: 'act2', type: 'spotlight' as const, elementId: 'el1' } as SpotlightAction,
    ];
    const audioIdToPath = new Map([['audio-123', 'audio/audio-123.mp3']]);

    const result = actionsToManifest(actions, audioIdToPath);

    expect(result[0]).toMatchObject({
      type: 'speech',
      text: 'Hello',
      audioRef: 'audio/audio-123.mp3',
      voice: 'alloy',
    });
    expect(result[0]).not.toHaveProperty('audioId');
    expect(result[1]).toMatchObject({ type: 'spotlight', elementId: 'el1' });
  });

  test('preserves audioUrl when audioId is absent', () => {
    const actions = [
      {
        id: 'act1',
        type: 'speech' as const,
        text: 'Hi',
        audioUrl: 'https://cdn.example.com/hi.mp3',
      } as SpeechAction,
    ];
    const result = actionsToManifest(actions, new Map());
    expect(result[0]).toMatchObject({
      type: 'speech',
      text: 'Hi',
      audioUrl: 'https://cdn.example.com/hi.mp3',
    });
    expect(result[0]).not.toHaveProperty('audioRef');
  });

  test('converts discussion agentId to agentIndex', () => {
    const actions = [
      {
        id: 'act1',
        type: 'discussion' as const,
        topic: 'What tradeoff would you make?',
        prompt: 'Argue for one compromise.',
        agentId: 'student-2',
      } as DiscussionAction,
    ];
    const result = actionsToManifest(actions, new Map(), new Map([['student-2', 2]]));
    expect(result[0]).toMatchObject({
      type: 'discussion',
      topic: 'What tradeoff would you make?',
      prompt: 'Argue for one compromise.',
      agentIndex: 2,
    });
    expect(result[0]).not.toHaveProperty('agentId');
  });

  test('preserves discussion agentId when no manifest agent index is available', () => {
    const actions = [
      {
        id: 'act1',
        type: 'discussion' as const,
        topic: 'Which viewpoint is stronger?',
        agentId: 'default-2',
      } as DiscussionAction,
    ];
    const result = actionsToManifest(actions, new Map(), new Map());
    expect(result[0]).toMatchObject({
      type: 'discussion',
      topic: 'Which viewpoint is stronger?',
      agentId: 'default-2',
    });
    expect(result[0]).not.toHaveProperty('agentIndex');
  });
});

// ─── Server-backed export collectors ──────────────────────────

describe('server-backed export collectors', () => {
  test('collectMediaFiles reads server media metadata and downloads blobs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/stages/stage-1/media') {
        return Response.json({
          success: true,
          files: [
            {
              elementId: 'gen_img_1',
              type: 'image',
              mimeType: 'image/png',
              size: 3,
              prompt: 'draw image',
              storageKey: 'stage-1/gen_img_1.png',
            },
            {
              elementId: 'gen_vid_1',
              type: 'video',
              mimeType: 'video/mp4',
              size: 5,
              prompt: 'make video',
              storageKey: 'stage-1/gen_vid_1.mp4',
              posterStorageKey: 'stage-1/gen_vid_1_poster.jpg',
            },
            {
              elementId: 'gen_img_failed',
              type: 'image',
              error: 'blocked',
            },
          ],
        });
      }
      if (url === '/api/media/stage-1/gen_img_1.png') {
        return new Response(new Blob(['img'], { type: 'image/png' }));
      }
      if (url === '/api/media/stage-1/gen_vid_1.mp4') {
        return new Response(new Blob(['video'], { type: 'video/mp4' }));
      }
      if (url === '/api/media/stage-1/gen_vid_1_poster.jpg') {
        return new Response(new Blob(['poster'], { type: 'image/jpeg' }));
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const files = await collectMediaFiles('stage-1');

    expect(files.map((file) => file.zipPath)).toEqual([
      'media/gen_img_1.png',
      'media/gen_vid_1.mp4',
    ]);
    expect(files[0].record.prompt).toBe('draw image');
    expect(files[1].record.poster).toBeInstanceOf(Blob);
  });

  test('collectGeneratedAgents reads server generated-agent rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          success: true,
          agents: [
            {
              id: 'agent-1',
              name: 'Student',
              role: 'student',
              persona: 'Curious',
              avatar: '/avatars/student.png',
              color: '#f00',
              priority: 1,
            },
          ],
        }),
      ),
    );

    await expect(collectGeneratedAgents('stage-1')).resolves.toMatchObject([
      { id: 'agent-1', role: 'student' },
    ]);
  });
});

// ─── Manifest round-trip ──────────────────────────────────────

describe('manifest round-trip', () => {
  test('manifest structure is valid JSON-serializable', () => {
    const manifest: ClassroomManifest = {
      formatVersion: CLASSROOM_ZIP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: '0.1.0',
      stage: {
        name: 'Test Course',
        description: 'A test',
        language: 'en-US',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      agents: [
        {
          name: 'Prof',
          role: 'lecturer',
          persona: 'Friendly professor',
          avatar: '👨‍🏫',
          color: '#4A90D9',
          priority: 1,
        },
        {
          name: 'Student',
          role: 'student',
          persona: 'Reflective student',
          avatar: '🧑‍🎓',
          color: '#FFB347',
          priority: 2,
        },
      ],
      scenes: [
        {
          type: 'slide',
          title: 'Intro',
          order: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: { type: 'slide', canvas: { id: 's1', elements: [] } } as any,
          actions: [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { id: 'a1', type: 'speech', text: 'Welcome', audioRef: 'audio/a1.mp3' } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { id: 'a2', type: 'discussion', topic: 'Why does this matter?', agentIndex: 1 } as any,
          ],
        },
      ],
      mediaIndex: {
        'audio/a1.mp3': { type: 'audio', format: 'mp3', duration: 5.2 },
      },
    };

    const serialized = JSON.stringify(manifest);
    const deserialized = JSON.parse(serialized) as ClassroomManifest;

    expect(deserialized.formatVersion).toBe(CLASSROOM_ZIP_FORMAT_VERSION);
    expect(deserialized.stage.name).toBe('Test Course');
    expect(deserialized.agents).toHaveLength(2);
    expect(deserialized.scenes).toHaveLength(1);
    expect(deserialized.scenes[0].actions?.[0]).toMatchObject({
      type: 'speech',
      audioRef: 'audio/a1.mp3',
    });
    expect(deserialized.scenes[0].actions?.[1]).toMatchObject({
      type: 'discussion',
      topic: 'Why does this matter?',
      agentIndex: 1,
    });
    expect(deserialized.mediaIndex['audio/a1.mp3']).toMatchObject({
      type: 'audio',
      duration: 5.2,
    });
  });
});
