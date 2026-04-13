// lib/generation/portrait-manifest-prompt.ts

import type { SceneOutline, PdfImage } from '@/lib/types/generation';
import {
  buildLanguageGuardrail,
  getLanguageLabel,
  resolveOutlineLanguage,
} from './language-policy';

/**
 * System prompt: 指导 AI 输出 PortraitContentManifest，而非元素坐标列表。
 * 比旧版 slide-content system prompt 轻量得多（不需要描述坐标系统）。
 */
export function buildPortraitManifestSystemPrompt(): string {
  return `You are an educational slide content designer for mobile/portrait screens.
Your task: analyze the scene outline and output a JSON content manifest.
The program handles all positioning and layout — you only decide CONTENT and STRUCTURE.

## Output Format
Output ONLY a raw JSON object (no markdown fences, no explanation):

{
  "archetype": "lead" | "concept" | "compare" | "steps" | "tip" | "summary",
  "accentColor": "#hex",
  "title": "≤12 Chinese chars or ≤16 English chars",
  "titleSub": "optional subtitle",
  "heroBlock": {
    "label": "optional badge ≤6 chars",
    "body": "main content ≤80 chars"
  },
  "supportingCards": [
    { "label": "optional", "body": "≤60 chars" }
  ],
  "imageId": "img_1 or gen_img_1 or null",
  "imageRole": "hero" | "supporting" | "skip",
  "footerCallout": "optional summary ≤30 chars"
}

## Archetype Selection

| Archetype | Use when |
|-----------|----------|
| lead      | Opening slide, chapter start, topic introduction |
| concept   | Defining a new term or core concept |
| compare   | Comparing two options, before/after, pros/cons |
| steps     | Sequential procedure or how-to (≤3 steps per page) |
| tip       | Warning, critical reminder, key callout |
| summary   | Scene/chapter wrap-up, key takeaways |

## Portrait Image Policy (Hard Disabled)

Portrait slides are card + text compositions. Images are fully disabled.

**Hard rules (no exceptions):**
1. imageRole MUST be "skip"
2. imageId MUST be null
3. Ignore all Available Images and AI-Generated Media entries
4. If the content seems to need a visual aid, express it as text cards, comparison cards, or step cards instead

## LaTeX / Chart Degradation
If content includes formulas or charts, convert to plain-text description.
Put the key information in heroBlock.body or a supportingCard. Do NOT generate special element types.

## Content Rules
- Title: neutral topic-focused phrase, no teacher name references
- Language: match the scene outline language
- heroBlock.body: the single most important idea on this page
- supportingCards: supporting details, maximum 3 cards
- Keep all text values short — the layout engine cannot shrink text to fit
- If the scene topic is Chinese, keep the full manifest text in Simplified Chinese unless the user explicitly asked for English

## accentColor
Use a strong accessible color:
#1e40af (deep blue) | #065f46 (deep green) | #7c3aed (violet) | #b45309 (amber) | #dc2626 (red)
Choose based on the emotional tone of the content.`;
}

/**
 * User prompt: 注入 outline 的标题、描述、要点和可用图片列表。
 */
export function buildPortraitManifestUserPrompt(
  outline: SceneOutline,
  assignedImages?: PdfImage[],
): string {
  const language = resolveOutlineLanguage(outline, outline.language).language;
  const keyPointsList = (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n');

  const imageSection =
    assignedImages && assignedImages.length > 0
      ? 'Available Images:\nNone — portrait policy forbids all images on this slide.'
      : 'Available Images:\nNone';

  return `Scene Title: ${outline.title}
Description: ${outline.description || '(none)'}
Language: ${getLanguageLabel(language)}

Language Requirement: ${buildLanguageGuardrail(language)}

Key Points:
${keyPointsList || '(none)'}

${imageSection}

Output the JSON manifest for this portrait slide.`;
}
