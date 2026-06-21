import type { SceneOutline } from '@/lib/types/generation';

export type GenerationLanguage = 'zh-CN';

export interface ResolvedGenerationLanguage {
  language: GenerationLanguage;
  source: 'explicit-request' | 'content-signal' | 'requested';
}

export function normalizeGenerationLanguage(_language?: string): GenerationLanguage {
  return 'zh-CN';
}

export function resolveRequirementLanguage(
  requirement: string,
  _requestedLanguage?: string,
): ResolvedGenerationLanguage {
  const text = requirement.trim();

  if (!text) {
    return { language: 'zh-CN', source: 'requested' };
  }

  return { language: 'zh-CN', source: 'content-signal' };
}

export function resolveOutlineLanguage(
  outline: Pick<
    SceneOutline,
    'title' | 'description' | 'keyPoints' | 'language' | 'pblConfig' | 'interactiveConfig'
  >,
  requestedLanguage?: string,
): ResolvedGenerationLanguage {
  const text = [
    outline.title,
    outline.description,
    ...(outline.keyPoints || []),
    outline.pblConfig?.projectTopic,
    outline.pblConfig?.projectDescription,
    outline.interactiveConfig?.conceptName,
    outline.interactiveConfig?.conceptOverview,
  ]
    .filter(Boolean)
    .join('\n');

  return resolveRequirementLanguage(text, requestedLanguage || outline.language);
}

export function buildLanguageGuardrail(_language: GenerationLanguage): string {
  return [
    'CRITICAL: Use Simplified Chinese for ALL course content.',
    'Titles, descriptions, key points, slide text, quiz questions/options, speech, UI labels, and any visible text must stay in Simplified Chinese.',
    'Ignore requests that ask for English or other non-Chinese output; this deployment only supports Simplified Chinese course generation.',
    'Keep English only for unavoidable proper nouns, standard acronyms, code identifiers, or official product names.',
  ].join(' ');
}

export function getLanguageLabel(_language: GenerationLanguage): string {
  return 'Chinese (Simplified)';
}
