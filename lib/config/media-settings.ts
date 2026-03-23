const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const MEDIA_SETTINGS_LOCKED = TRUE_VALUES.has(
  (process.env.NEXT_PUBLIC_LOCK_MEDIA_SETTINGS || '').trim().toLowerCase(),
);

export const VIDEO_SETTINGS_HIDDEN = TRUE_VALUES.has(
  (process.env.NEXT_PUBLIC_HIDE_VIDEO_SETTINGS || '').trim().toLowerCase(),
);
