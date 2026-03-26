// lib/generation/portrait-manifest-prompt.ts

import type { SceneOutline, PdfImage } from '@/lib/types/generation';

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

## Image Role Rules
- "hero": ONLY for "lead" archetype where image IS the main visual
- "supporting": ONLY for "steps" archetype, placed below a step card
- "skip": Default for all other archetypes (card-only looks cleaner)
- If no imageId available → always "skip"
- compare, summary → always "skip"

## LaTeX / Chart Degradation
If content includes formulas or charts, convert to plain-text description.
Put the key information in heroBlock.body or a supportingCard. Do NOT generate special element types.

## Content Rules
- Title: neutral topic-focused phrase, no teacher name references
- Language: match the scene outline language
- heroBlock.body: the single most important idea on this page
- supportingCards: supporting details, maximum 3 cards
- Keep all text values short — the layout engine cannot shrink text to fit

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
  const keyPointsList = (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n');

  const imageLines =
    assignedImages && assignedImages.length > 0
      ? assignedImages
          .map((img) => `- ${img.id}${img.description ? `: ${img.description}` : ''}`)
          .join('\n')
      : 'No images available';

  const mediaLines =
    outline.mediaGenerations && outline.mediaGenerations.length > 0
      ? outline.mediaGenerations
          .map((mg) => `- ${mg.elementId}: ${mg.prompt} (${mg.type})`)
          .join('\n')
      : '';

  const mediaSectionText = mediaLines ? `\nAI-Generated Media:\n${mediaLines}` : '';
  const imageSection = `Available Images:\n${imageLines}${mediaSectionText}`;

  return `Scene Title: ${outline.title}
Description: ${outline.description || '(none)'}
Language: ${outline.language || 'zh-CN'}

Key Points:
${keyPointsList || '(none)'}

${imageSection}

Output the JSON manifest for this portrait slide.`;
}
