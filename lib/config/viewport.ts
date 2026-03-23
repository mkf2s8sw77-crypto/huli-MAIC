export type ViewportPreset = '16:9' | '4:3' | '3:4' | '9:16';

export interface ViewportOption {
  id: ViewportPreset;
  ratio: number; // height / width
  label: string;
  orientation: 'landscape' | 'portrait';
  pptxLayout:
    | { kind: 'builtin'; name: 'LAYOUT_16x9' | 'LAYOUT_4x3' | 'LAYOUT_16x10' }
    | { kind: 'custom'; name: string; width: number; height: number };
}

export const DEFAULT_VIEWPORT_PRESET: ViewportPreset = '3:4';
export const DEFAULT_VIEWPORT_SIZE = 1000;

export const VIEWPORT_OPTIONS: ViewportOption[] = [
  {
    id: '16:9',
    ratio: 9 / 16,
    label: '16:9',
    orientation: 'landscape',
    pptxLayout: { kind: 'builtin', name: 'LAYOUT_16x9' },
  },
  {
    id: '4:3',
    ratio: 3 / 4,
    label: '4:3',
    orientation: 'landscape',
    pptxLayout: { kind: 'builtin', name: 'LAYOUT_4x3' },
  },
  {
    id: '3:4',
    ratio: 4 / 3,
    label: '3:4',
    orientation: 'portrait',
    pptxLayout: { kind: 'custom', name: 'LAYOUT_3X4_PORTRAIT', width: 7.5, height: 10 },
  },
  {
    id: '9:16',
    ratio: 16 / 9,
    label: '9:16',
    orientation: 'portrait',
    pptxLayout: { kind: 'custom', name: 'LAYOUT_9X16_PORTRAIT', width: 5.625, height: 10 },
  },
] as const;

export function getViewportOption(preset?: string | null): ViewportOption {
  return (
    VIEWPORT_OPTIONS.find((option) => option.id === preset) ||
    VIEWPORT_OPTIONS.find((option) => option.id === DEFAULT_VIEWPORT_PRESET)!
  );
}

export function getViewportRatio(preset?: string | null): number {
  return getViewportOption(preset).ratio;
}

export function getViewportPresetByRatio(ratio: number): ViewportPreset {
  const matched = VIEWPORT_OPTIONS.find((option) => Math.abs(option.ratio - ratio) < 0.0001);
  return matched?.id || DEFAULT_VIEWPORT_PRESET;
}

export function getViewportHeight(
  viewportSize: number = DEFAULT_VIEWPORT_SIZE,
  preset?: string | null,
): number {
  return viewportSize * getViewportRatio(preset);
}

export function getAspectRatioCssValue(preset?: string | null): string {
  const option = getViewportOption(preset);
  return `1 / ${option.ratio}`;
}

export function getAspectRatioCssValueByRatio(ratio: number): string {
  return `1 / ${ratio}`;
}
