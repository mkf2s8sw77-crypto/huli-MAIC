import type { SceneOutline } from '@/lib/types/generation';

export type GenerationLanguage = 'zh-CN' | 'en-US';

const HAN_CHAR_REGEX = /\p{Script=Han}/u;
const EXPLICIT_ENGLISH_OUTPUT_REGEXES = [
  /(?:请|麻烦|务必|需要|希望)[^。；，\n]{0,16}(?:用|以)[^。；，\n]{0,4}英文[^。；，\n]{0,12}(?:输出|回答|讲解|授课|生成|呈现|编写|写)/u,
  /(?:输出|回答|讲解|授课|生成|呈现|编写|写)[^。；，\n]{0,10}(?:请)?[^。；，\n]{0,6}(?:用|以)?[^。；，\n]{0,4}英文/u,
  /(?:respond|reply|write|output|teach|present|explain|generate)\b[\s\S]{0,24}\bin english\b/i,
  /\bin english\b/i,
  /\benglish only\b/i,
];
const EXPLICIT_CHINESE_OUTPUT_REGEXES = [
  /(?:请|麻烦|务必|需要|希望)[^。；，\n]{0,16}(?:用|以)[^。；，\n]{0,4}中文[^。；，\n]{0,12}(?:输出|回答|讲解|授课|生成|呈现|编写|写)/u,
  /(?:输出|回答|讲解|授课|生成|呈现|编写|写)[^。；，\n]{0,10}(?:请)?[^。；，\n]{0,6}(?:用|以)?[^。；，\n]{0,4}中文/u,
  /(?:respond|reply|write|output|teach|present|explain|generate)\b[\s\S]{0,24}\bin chinese\b/i,
  /\bin chinese\b/i,
  /\bchinese only\b/i,
  /简体中文/u,
];

export interface ResolvedGenerationLanguage {
  language: GenerationLanguage;
  source: 'explicit-request' | 'content-signal' | 'requested';
}

export function normalizeGenerationLanguage(language?: string): GenerationLanguage {
  return language === 'en-US' ? 'en-US' : 'zh-CN';
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasHanContent(text: string): boolean {
  return HAN_CHAR_REGEX.test(text);
}

export function resolveRequirementLanguage(
  requirement: string,
  requestedLanguage?: string,
): ResolvedGenerationLanguage {
  const normalizedRequested = normalizeGenerationLanguage(requestedLanguage);
  const text = requirement.trim();

  if (!text) {
    return { language: normalizedRequested, source: 'requested' };
  }

  const explicitEnglish = matchesAny(text, EXPLICIT_ENGLISH_OUTPUT_REGEXES);
  const explicitChinese = matchesAny(text, EXPLICIT_CHINESE_OUTPUT_REGEXES);

  if (explicitEnglish && !explicitChinese) {
    return { language: 'en-US', source: 'explicit-request' };
  }
  if (explicitChinese && !explicitEnglish) {
    return { language: 'zh-CN', source: 'explicit-request' };
  }
  if (hasHanContent(text)) {
    return { language: 'zh-CN', source: 'content-signal' };
  }

  return { language: normalizedRequested, source: 'requested' };
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

export function buildLanguageGuardrail(language: GenerationLanguage): string {
  if (language === 'zh-CN') {
    return [
      'CRITICAL: Use Simplified Chinese for ALL course content.',
      'Titles, descriptions, key points, slide text, quiz questions/options, speech, UI labels, and any visible text must stay in Simplified Chinese.',
      'A course topic written in Chinese should remain Chinese unless the user explicitly asks for English.',
      'Do not drift into English sentences. Keep English only for unavoidable proper nouns, standard acronyms, or official product names.',
    ].join(' ');
  }

  return [
    'CRITICAL: Use English for ALL course content.',
    'Titles, descriptions, key points, slide text, quiz questions/options, speech, UI labels, and any visible text must stay in English.',
    'Do not drift into Chinese unless the user explicitly asks for Chinese.',
  ].join(' ');
}

export function getLanguageLabel(language: GenerationLanguage): string {
  return language === 'zh-CN' ? 'Chinese (Simplified)' : 'English';
}
