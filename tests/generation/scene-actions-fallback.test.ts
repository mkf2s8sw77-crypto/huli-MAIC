import { describe, expect, it } from 'vitest';
import { generateSceneActions } from '@/lib/generation/scene-generator';
import type { SceneOutline, GeneratedSlideContent } from '@/lib/types/generation';

describe('generateSceneActions fallback', () => {
  it('falls back to default slide actions when aiCall throws', async () => {
    const outline: SceneOutline = {
      id: 'outline-1',
      type: 'slide',
      title: '压疮1期与2期特征',
      description: '介绍压疮 1 期与 2 期的典型表现',
      keyPoints: ['1期：红斑不退', '2期：部分皮层缺损'],
      order: 1,
      language: 'zh-CN',
    };

    const content: GeneratedSlideContent = {
      elements: [
        {
          id: 'text-1',
          type: 'text',
          left: 80,
          top: 120,
          width: 600,
          height: 120,
          rotate: 0,
          defaultFontName: 'Microsoft YaHei',
          defaultColor: '#333333',
          content: '<p>压疮 1 期与 2 期特征</p>',
        },
      ],
    };

    const actions = await generateSceneActions(
      outline,
      content,
      async () => {
        throw new Error('upstream 520');
      },
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]?.type).toBe('spotlight');
    expect(actions[1]?.type).toBe('speech');
    expect((actions[1] as { text?: string }).text).toContain('1期');
  });
});
